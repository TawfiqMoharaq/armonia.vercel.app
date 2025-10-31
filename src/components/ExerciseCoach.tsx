// src/components/ExerciseCoach.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ===== مسارات محلية (ضع الملفات كما رتّبناها سابقًا) =====
const MODEL_CANDIDATES = ["/models/pose_landmarker_lite.task"];
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";

// ===== خيارات العرض/الفلاتر =====
const MIRROR = true;

// فلترة صلاحية الوضعية (عشان ما يمسك وجه فقط)
const VIS_MIN = 0.50;          // أقل رؤية مسموحة لكل نقطة
const MEAN_VIS_MIN = 0.55;     // متوسط الرؤية الكلي
const MIN_BBOX_H_RATIO = 0.35; // أقل نسبة ارتفاع الجسم داخل الإطار (0.35 = 35% من ارتفاع الكانفس)

// مجال الزوايا المقبول (رفض القيم الشاذة)
const KNEE_RANGE: [number, number] = [35, 185];
const BACK_RANGE: [number, number] = [80, 205];

// تنعيم (EMA)
const EMA_ALPHA = 0.20;

// ثبات الحالات (لتجنب الرجفان)
const DOWN_MIN_FRAMES = 3;
const UP_MIN_FRAMES = 3;
const COOLDOWN_MS = 400;

// عتبات السكوات (يمكن تبسيطها أكثر عند الحاجة)
const KNEE_UP_THRESHOLD_BASE = 155; // قبل المعايرة الذاتية
const KNEE_DOWN_MIN = 60;
const KNEE_DOWN_MAX = 110;

const BACK_SAFE_THRESHOLD = 145;

// ===== مساعدات رياضية =====
const toDeg = (r: number) => (r * 180) / Math.PI;
const clampInt = (v: number | null) => (v == null || Number.isNaN(v) ? null : Math.round(v));
const inRange = (x: number | null, [a, b]: [number, number]) => x != null && x >= a && x <= b;

function ema(prev: number | null, next: number, alpha = EMA_ALPHA) {
  if (prev == null) return next;
  return prev * (1 - alpha) + next * alpha;
}

function vectorAngle(a: NormalizedLandmark, c: NormalizedLandmark, b: NormalizedLandmark) {
  const v1 = [a.x - c.x, a.y - c.y, a.z - c.z];
  const v2 = [b.x - c.x, b.y - c.y, b.z - c.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]);
  const m2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (!m1 || !m2) return null;
  const cos = Math.min(Math.max(dot / (m1 * m2), -1), 1);
  return toDeg(Math.acos(cos));
}

function pickLeg(lms: NormalizedLandmark[]) {
  const L = { shoulder: 11, hip: 23, knee: 25, ankle: 27 };
  const R = { shoulder: 12, hip: 24, knee: 26, ankle: 28 };
  const score = (s: typeof L) =>
    [s.hip, s.knee, s.ankle].reduce((t, i) => t + (lms[i]?.visibility ?? 0), 0);
  return score(L) >= score(R) ? L : R;
}

// تأكد أن الوضعية فعلاً "جسم كامل نسبيًا" وليست وجه فقط
function validPose(lms: NormalizedLandmark[], canvasH: number) {
  const vis = lms.map((p) => p.visibility ?? 0);
  const meanVis = vis.reduce((a, b) => a + b, 0) / vis.length;
  if (meanVis < MEAN_VIS_MIN) return false;
  // احسب أعلى وأدنى y للصندوق التقريبي للجسم
  let minY = +Infinity,
    maxY = -Infinity;
  for (const p of lms) {
    if (p.visibility != null && p.visibility >= VIS_MIN) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!isFinite(minY) || !isFinite(maxY)) return false;
  const bboxH = (maxY - minY) * canvasH; // بوحدة البكسل
  const ok = bboxH >= MIN_BBOX_H_RATIO * canvasH;
  return ok;
}

// ====== المتغيّرات العامة (خارج React state) ======
let debugReason = "";           // سبب عدم العدّ (يوضح على الشاشة)
let autoUpRef: number | null = null;   // عتبة UP ذاتية
let calibratingUntil = 0;
let maxStandingKnee = 0;

// ====== المكوّن ======
export default function ExerciseCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  // state
  const [isReady, setIsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);
  const [backWarning, setBackWarning] = useState(false);

  // العدّ — حالة صغيرة
  const kneeEmaRef = useRef<number | null>(null);
  const backEmaRef = useRef<number | null>(null);
  const downFramesRef = useRef(0);
  const upFramesRef = useRef(0);
  const stateRef = useRef<"idle" | "down" | "up">("idle");
  const lastRepAtRef = useRef(0);

  // تحميل WASM والموديل
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setCameraError("هذه الصفحة ليست آمنة (HTTPS مطلوب). استخدم https أو localhost.");
          return;
        }
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;

        let lastErr: any;
        for (const delegate of ["GPU", "CPU"] as const) {
          for (const url of MODEL_CANDIDATES) {
            try {
              poseRef.current = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: url },
                delegate,
                runningMode: "VIDEO",
                numPoses: 1,
              });
              setIsReady(true);
              return;
            } catch (e) {
              lastErr = e;
            }
          }
        }
        throw lastErr ?? new Error("تعذر تحميل أي نموذج PoseLandmarker.");
      } catch (e: any) {
        setCameraError(e?.message ?? "تعذر تهيئة نماذج MediaPipe.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCamera() {
    try {
      setCameraError(null);
      setRepCount(0);
      setKneeAngle(null);
      setBackAngle(null);
      setBackWarning(false);

      // صفّر مسجلات العدّ
      kneeEmaRef.current = null;
      backEmaRef.current = null;
      downFramesRef.current = 0;
      upFramesRef.current = 0;
      stateRef.current = "idle";
      lastRepAtRef.current = 0;

      // معايرة ذاتية في أول 1.2 ثانية
      autoUpRef = null;
      maxStandingKnee = 0;
      calibratingUntil = performance.now() + 1200;

      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("المتصفح لا يدعم getUserMedia.");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      const canvas = canvasRef.current!;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {}

      const syncCanvas = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
      syncCanvas();
      video.addEventListener("loadedmetadata", syncCanvas, { passive: true } as any);
      video.addEventListener("resize", syncCanvas, { passive: true } as any);

      setRunning(true);
      loop();
    } catch (e: any) {
      setCameraError(explainGetUserMediaError(e));
      stopCamera();
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setRunning(false);
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = poseRef.current;
    if (!video || !canvas || !landmarker) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);

    // خلفية سوداء خفيفة
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    debugReason = "no landmarks";

    if (result.landmarks.length) {
      const landmarks = result.landmarks[0];

      // صلاحية الوضعية
      if (!validPose(landmarks, canvas.height)) {
        debugReason = "pose not valid (visibility/size)";
      } else {
        // اختيار الرجل الأفضل للحساب
        const leg = pickLeg(landmarks);
        const hip = landmarks[leg.hip];
        const knee = landmarks[leg.knee];
        const ankle = landmarks[leg.ankle];
        const shoulder = landmarks[leg.shoulder];

        let k: number | null = null;
        let b: number | null = null;
        if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
        if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);

        // رفض القيم الشاذة
        if (!inRange(k, KNEE_RANGE)) k = null;
        if (!inRange(b, BACK_RANGE)) b = null;

        // تنعيم
        if (k != null) kneeEmaRef.current = ema(kneeEmaRef.current, k);
        if (b != null) backEmaRef.current = ema(backEmaRef.current, b);
        const kneeSmoothed = kneeEmaRef.current ?? null;
        const backSmoothed = backEmaRef.current ?? null;

        // تحديث واجهة الأرقام
        const kShow = clampInt(kneeSmoothed);
        const bShow = clampInt(backSmoothed);
        if (kShow != null) setKneeAngle(kShow);
        if (bShow != null) setBackAngle(bShow ?? null);

        setBackWarning(backSmoothed != null && backSmoothed < BACK_SAFE_THRESHOLD);

        // معايرة ذاتية (أول 1.2 ثانية)
        if (kneeSmoothed != null) {
          if (now < calibratingUntil) {
            maxStandingKnee = Math.max(maxStandingKnee, kneeSmoothed);
            debugReason = `calibrating... up≈${Math.round(maxStandingKnee)}`;
          } else if (autoUpRef == null && maxStandingKnee > 0) {
            autoUpRef = Math.max(145, maxStandingKnee - 8); // خصم بسيط
          }
        }

        // حساب العدّ
        const upThreshold = (autoUpRef ?? KNEE_UP_THRESHOLD_BASE);
        if (kneeSmoothed != null) {
          const isDown = kneeSmoothed >= KNEE_DOWN_MIN && kneeSmoothed <= KNEE_DOWN_MAX;
          const isUp = kneeSmoothed >= upThreshold;

          if (isDown) {
            downFramesRef.current++;
            upFramesRef.current = 0;
            debugReason = "DOWN hold";
            if (downFramesRef.current >= DOWN_MIN_FRAMES) {
              stateRef.current = "down";
            }
          } else if (isUp) {
            upFramesRef.current++;
            debugReason = "UP hold";
            if (upFramesRef.current >= UP_MIN_FRAMES && stateRef.current === "down") {
              // تبريد بسيط لمنع العد المزدوج السريع
              if (now - lastRepAtRef.current >= COOLDOWN_MS) {
                setRepCount((c) => c + 1);
                lastRepAtRef.current = now;
                stateRef.current = "up";
              }
            }
            // إعادة ضبط عدّ الـDOWN بعد الوصول لـUP
            downFramesRef.current = 0;
          } else {
            debugReason = "tracking";
            // خارج DOWN/UP — حافظ على الحالة
            downFramesRef.current = 0;
            upFramesRef.current = 0;
          }
        }

        // رسم النقاط
        const drawer = new DrawingUtils(ctx);
        ctx.save();
        if (MIRROR) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        drawer.drawLandmarks(landmarks, {
          radius: 4,
          visibilityMin: VIS_MIN,
          fillColor: "#18A4B8",
        });
        ctx.restore();
      }
    }

    // لوحة debug صغيرة
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, canvas.height - 32, 280, 24);
    ctx.fillStyle = "white";
    ctx.font = "14px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(`debug: ${debugReason}`, 16, canvas.height - 15);
    ctx.restore();

    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => {
      stopCamera();
      poseRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/20 bg-black shadow">
      {!running && (
        <button
          onClick={startCamera}
          disabled={!isReady}
          className="absolute top-4 left-4 z-10 px-4 py-2 rounded-xl text-white shadow disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
        >
          تشغيل الكاميرا 🎥
        </button>
      )}
      {running && (
        <button
          onClick={stopCamera}
          className="absolute top-4 left-4 z-10 px-4 py-2 rounded-xl text-white shadow bg-gray-700 hover:bg-gray-800"
        >
          إيقاف
        </button>
      )}

      {/* نخلي الفيديو مخفيًا — نرسم فوقه فقط */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

      {/* عدّاد + زوايا */}
      <div className="absolute top-4 right-4 space-y-2 text-white text-sm z-10">
        <div className="px-3 py-2 rounded-2xl bg-black/60 backdrop-blur flex items-center gap-3">
          <span className="font-semibold text-lg">{repCount}</span>
          <span>Reps</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">
            Knee angle: {kneeAngle ?? "—"}°
          </span>
          <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">
            Back angle: {backAngle ?? "—"}°
          </span>
        </div>
      </div>

      {/* طبقة خطأ/تحميل */}
      {(!isReady || cameraError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6">
          <p className="text-sm leading-relaxed" dir="rtl">
            {cameraError ??
              "جاري تجهيز MediaPipe (WASM + Model)...\nبعد اكتمال التحميل اضغط تشغيل الكاميرا."}
          </p>
        </div>
      )}

      {backWarning && running && !cameraError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-red-600/85 text-white font-semibold shadow-lg">
          حافظ على استقامة ظهرك!
        </div>
      )}
    </div>
  );
}


// ======= أخطاء getUserMedia الشائعة (نفس دالة سابقة) =======
function explainGetUserMediaError(err: any): string {
  const n = err?.name || "";
  switch (n) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "تم رفض إذن الكاميرا. اسمح بالوصول من شريط العنوان ثم أعد المحاولة.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "لم يتم العثور على كاميرا. تأكد من توصيل الكاميرا أو اختيار الجهاز الصحيح.";
    case "NotReadableError":
    case "TrackStartError":
      return "لا يمكن فتح الكاميرا (قد تكون مستخدمة من تطبيق آخر). أغلق التطبيقات الأخرى ثم جرّب.";
    case "OverconstrainedError":
      return "إعدادات الكاميرا غير مدعومة على هذا الجهاز. تم تقليل المتطلبات، حدّث الصفحة.";
    case "SecurityError":
      return "الوصول للكاميرا يتطلب اتصالاً آمناً (HTTPS).";
    case "AbortError":
      return "تعذر بدء تشغيل الكاميرا بسبب خطأ داخلي.";
    default:
      return `تعذر تشغيل الكاميرا: ${n || "خطأ غير متوقع"}`;
  }
}
