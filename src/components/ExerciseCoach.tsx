// src/components/ExerciseCoach.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ——— وصلات الهيكل (BlazePose 33 نقطة) ———
const POSE_CONNECTIONS: Array<[number, number]> = [
  [0,1],[1,2],[2,3],[3,7],
  [0,4],[4,5],[5,6],[6,8],
  [9,10],[11,12],
  [11,13],[13,15],[15,17],[15,19],[15,21],
  [12,14],[14,16],[16,18],[16,20],[16,22],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[27,29],[27,31],
  [24,26],[26,28],[28,30],[28,32],
];

// ——— نماذج/WASM محلية ———
const MODEL_CANDIDATES = ["/models/pose_landmarker_lite.task"];
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";

// ——— إعدادات السكوات ———
const KNEE_UP_THRESHOLD = 160;   // أعلى
const KNEE_DOWN_MIN     = 70;    // أسفل (مدى)
const KNEE_DOWN_MAX     = 100;
const BACK_SAFE_THRESHOLD = 150; // تنبيه الظهر

// ——— إعدادات فلترة/عدّ ———
const MIRROR = true;                // عكس أفقي للكاميرا الأمامية
const VIS_MIN = 0.60;               // حد أدنى لظهور المفصل
const MEAN_VIS_MIN = 0.60;          // متوسط ظهور المفاصل المطلوبة
const MIN_BBOX_H_RATIO = 0.45;      // ارتفاع البوكس كنسبة من الكانفس (لتجنب الوجه فقط)
const KNEE_RANGE: [number, number] = [40, 180];
const BACK_RANGE: [number, number] = [90, 200];

const EMA_ALPHA = 0.25;             // تنعيم زوايا (EMA)
const DOWN_MIN_FRAMES = 4;          // أقل عدد إطارات متتالية لتثبيت وضع DOWN
const UP_MIN_FRAMES   = 4;          // أقل عدد إطارات متتالية لتثبيت وضع UP
const COOLDOWN_MS     = 600;        // مدة تبريد بين العدّات

type AngleSample = { knee: number; back: number };
const toDeg = (r: number) => (r * 180) / Math.PI;

function vectorAngle(a: NormalizedLandmark, c: NormalizedLandmark, b: NormalizedLandmark) {
  const v1 = [a.x - c.x, a.y - c.y, a.z - c.z];
  const v2 = [b.x - c.x, b.y - c.y, b.z - c.z];
  const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]);
  const m2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (!m1 || !m2) return null;
  const cos = Math.min(Math.max(dot / (m1 * m2), -1), 1);
  return toDeg(Math.acos(cos));
}
function pickLeg(lms: NormalizedLandmark[]) {
  const L = { shoulder: 11, hip: 23, knee: 25, ankle: 27 };
  const R = { shoulder: 12, hip: 24, knee: 26, ankle: 28 };
  const score = (s: typeof L) => [s.hip, s.knee, s.ankle].reduce((t,i)=>t+(lms[i]?.visibility??0),0);
  return score(L) >= score(R) ? L : R;
}
function clampInt(v: number | null) { return v==null||Number.isNaN(v)?null:Math.round(v); }

function explainGetUserMediaError(err: any): string {
  const n = err?.name || "";
  switch (n) {
    case "NotAllowedError":
    case "PermissionDeniedError": return "تم رفض إذن الكاميرا. اسمح بالوصول من شريط العنوان ثم أعد المحاولة.";
    case "NotFoundError":
    case "DevicesNotFoundError": return "لم يتم العثور على كاميرا. تأكد من توصيل الكاميرا أو اختيار الجهاز الصحيح.";
    case "NotReadableError":
    case "TrackStartError": return "لا يمكن فتح الكاميرا (قد تكون مستخدمة من تطبيق آخر). أغلق التطبيقات الأخرى ثم جرّب.";
    case "OverconstrainedError": return "إعدادات الكاميرا غير مدعومة على هذا الجهاز. تم تقليل المتطلبات، حدّث الصفحة.";
    case "SecurityError": return "هذه الصفحة ليست آمنة (HTTPS مطلوب). استخدم https أو localhost.";
    default: return `تعذر تشغيل الكاميرا: ${n || "خطأ غير متوقع"}`;
  }
}

// ——— أدوات فلترة إضافية ———
function bboxFromLandmarks(lms: NormalizedLandmark[]) {
  let minX=1, minY=1, maxX=0, maxY=0;
  for (const p of lms) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
function meanVisibility(points: (NormalizedLandmark|undefined)[]) {
  const vals = points.map(p => p?.visibility ?? 0);
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}
function inRange(v: number|null, r: [number, number]) {
  return v!=null && v>=r[0] && v<=r[1];
}
function ema(prev: number|null, next: number|null, alpha=EMA_ALPHA) {
  if (next==null) return prev;
  if (prev==null) return next;
  return prev*(1-alpha) + next*alpha;
}

export default function ExerciseCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  // عدّاد الحالة
  const stateRef = useRef<"UP" | "DOWN" | "UNKNOWN">("UNKNOWN");
  const downFramesRef = useRef(0);
  const upFramesRef   = useRef(0);
  const lastRepAtRef  = useRef(0);

  // عينات/تنعيم
  const emaKneeRef = useRef<number|null>(null);
  const emaBackRef = useRef<number|null>(null);

  const [isReady, setIsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);
  const [backWarning, setBackWarning] = useState(false);

  // تهيئة WASM + الموديل
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
            } catch (e) { lastErr = e; }
          }
        }
        throw lastErr ?? new Error("تعذر تحميل أي نموذج PoseLandmarker.");
      } catch (e: any) {
        setCameraError(e?.message ?? "تعذر تهيئة نماذج MediaPipe.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function startCamera() {
    try {
      setCameraError(null);
      resetCounters();

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
      try { await video.play(); } catch {}

      const syncCanvas = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
      syncCanvas();
      video.addEventListener("loadedmetadata", syncCanvas, { passive: true });
      video.addEventListener("resize", syncCanvas, { passive: true });

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

  function resetCounters() {
    setRepCount(0);
    setKneeAngle(null);
    setBackAngle(null);
    setBackWarning(false);
    stateRef.current = "UNKNOWN";
    downFramesRef.current = 0;
    upFramesRef.current   = 0;
    lastRepAtRef.current  = 0;
    emaKneeRef.current = null;
    emaBackRef.current = null;
  }

  function validPose(landmarks: NormalizedLandmark[], canvasH: number) {
    // 1) تحقق ظهور مفاصل أساسية
    const leg = pickLeg(landmarks);
    const reqJoints = [
      landmarks[leg.hip],
      landmarks[leg.knee],
      landmarks[leg.ankle],
      landmarks[leg.shoulder],
    ];
    const visOK = reqJoints.every(p => (p?.visibility ?? 0) >= VIS_MIN);
    if (!visOK) return false;

    // 2) متوسط الظهور
    if (meanVisibility(reqJoints) < MEAN_VIS_MIN) return false;

    // 3) بُعد/حجم الجسم (تجنّب الوجه فقط)
    const bb = bboxFromLandmarks(landmarks);
    const bboxHpx = bb.h * canvasH; // لأن y normalized
    if (bboxHpx < canvasH * MIN_BBOX_H_RATIO) return false;

    return true;
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

    // 1) خلفية الفيديو
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (MIRROR) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (result.landmarks.length) {
      const landmarks = result.landmarks[0];

      if (validPose(landmarks, canvas.height)) {
        // 2) رسم الهيكل
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "white";
        ctx.fillStyle = "white";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 6;
        const drawer = new DrawingUtils(ctx);
        drawer.drawConnectors(landmarks, POSE_CONNECTIONS);
        drawer.drawLandmarks(landmarks, { radius: 4, visibilityMin: 0.65, fillColor: "white" });
        ctx.restore();

        // 3) حساب الزوايا
        const leg = pickLeg(landmarks);
        const hip = landmarks[leg.hip];
        const knee = landmarks[leg.knee];
        const ankle = landmarks[leg.ankle];
        const shoulder = landmarks[leg.shoulder];

        let k: number | null = null;
        let b: number | null = null;
        if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
        if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);

        // 4) فلترة المدى المنطقي
        if (!inRange(k, KNEE_RANGE)) k = null;
        if (!inRange(b, BACK_RANGE)) b = null;

        // 5) تنعيم EMA + عرض
        emaKneeRef.current = ema(emaKneeRef.current, k);
        emaBackRef.current = ema(emaBackRef.current, b);
        const kneeSmoothed = clampInt(emaKneeRef.current ?? null);
        const backSmoothed = clampInt(emaBackRef.current ?? null);
        setKneeAngle(kneeSmoothed);
        setBackAngle(backSmoothed);
        setBackWarning((backSmoothed ?? 999) < BACK_SAFE_THRESHOLD);

        // 6) عدّاد بحالة وهسترة وإطارات أدنى + وقت تبريد
        if (kneeSmoothed != null) {
          const isDown = kneeSmoothed >= KNEE_DOWN_MIN && kneeSmoothed <= KNEE_DOWN_MAX;
          const isUp   = kneeSmoothed >= KNEE_UP_THRESHOLD;

          if (isDown) {
            downFramesRef.current++;
            upFramesRef.current = 0;
            if (downFramesRef.current >= DOWN_MIN_FRAMES) {
              stateRef.current = "DOWN";
            }
          } else if (isUp) {
            upFramesRef.current++;
            downFramesRef.current = 0;
            if (upFramesRef.current >= UP_MIN_FRAMES) {
              // نعدّ فقط عند انتقال DOWN → UP + تبريد
              if (stateRef.current === "DOWN") {
                const t = performance.now();
                if (t - lastRepAtRef.current >= COOLDOWN_MS) {
                  setRepCount(c => c + 1);
                  lastRepAtRef.current = t;
                }
              }
              stateRef.current = "UP";
            }
          } else {
            // منطقة وسطية — لا نغير الحالة إلا إذا ثبتنا DOWN/UP
            upFramesRef.current = 0;
            downFramesRef.current = 0;
          }
        }
      }
      // إن لم يكن الوضع صالحًا: لا نحسب ولا نرسم شيء إضافي
    }

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

      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

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
