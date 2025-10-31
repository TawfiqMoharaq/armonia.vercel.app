// src/components/ExerciseCoach.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

/* ---------------------------------- Config --------------------------------- */

// وصلات الهيكل (BlazePose 33 نقطة)
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

// نماذج/WASM محلية
const MODEL_CANDIDATES = ["/models/pose_landmarker_lite.task"];
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";

// ضبط المرآة (كاميرا أمامية)
const MIRROR = true;

// حدود العدّ (سكوات)
const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

// فلترة وتتبع
const V_TORSO_MIN = 0.55;           // حد أدنى لمتوسط وضوح الجذع (كتفين + وركين)
const V_LEG_MIN = 0.60;             // حد أدنى لوضوح نقاط الرجل المختارة
const REQUIRED_KEYPOINTS = [11,12,23,24,27,28]; // كتفين + وركين + كاحلين
const MIN_PRESENT_RATIO = 0.75;      // يجب توفر 75% من النقاط المطلوبة
const EMA_ALPHA = 0.35;             // تتبع ناعم للعلامات (0..1)
const BOTTOM_DWELL_FRAMES = 4;      // لازم يبقى بالقاع عدة فريمات لمنع العدّ الوهمي

/* ----------------------------- Helpers & Types ------------------------------ */

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

// تتبّع ناعم (EMA) لمجموعة landmarks
function smoothLandmarks(
  prev: NormalizedLandmark[] | null,
  next: NormalizedLandmark[],
  alpha = EMA_ALPHA
): NormalizedLandmark[] {
  if (!prev || prev.length !== next.length) return next.map(p => ({...p}));
  return next.map((p, i) => {
    const q = prev[i];
    // ادمج فقط إذا كلاهما لهما visibility معقولة لتفادي السحب من لا شيء
    const a = (p.visibility ?? 0) > 0.2 && (q.visibility ?? 0) > 0.2 ? alpha : 1.0;
    return {
      x: a * p.x + (1 - a) * q.x,
      y: a * p.y + (1 - a) * q.y,
      z: a * p.z + (1 - a) * q.z,
      visibility: Math.max(p.visibility ?? 0, q.visibility ?? 0),
    };
  });
}

// تحقّق جودة التتبّع لمنع العدّ الوهمي
function isPoseQualityGood(lms: NormalizedLandmark[]): boolean {
  // 1) توفّر نقاط أساسية
  const present = REQUIRED_KEYPOINTS.filter(i => (lms[i]?.visibility ?? 0) > 0.2).length;
  if (present / REQUIRED_KEYPOINTS.length < MIN_PRESENT_RATIO) return false;

  // 2) وضوح الجذع (كتفين + وركين)
  const torsoIdx = [11,12,23,24];
  const torsoV = torsoIdx.reduce((s,i)=>s+(lms[i]?.visibility ?? 0),0)/torsoIdx.length;
  if (torsoV < V_TORSO_MIN) return false;

  // 3) وضوح الرجل المختارة
  const leg = pickLeg(lms);
  const vLeg = [leg.hip, leg.knee, leg.ankle].reduce((s,i)=>s+(lms[i]?.visibility ?? 0),0)/3;
  if (vLeg < V_LEG_MIN) return false;

  // 4) ترتيب منطقي: الكاحل أسفل الركبة، الركبة أسفل/بمحاذاة الورك
  const hipY = lms[leg.hip].y, kneeY = lms[leg.knee].y, ankleY = lms[leg.ankle].y;
  if (!(ankleY > kneeY && kneeY >= hipY - 0.1)) return false;

  return true;
}

/* -------------------------------- Component -------------------------------- */

export default function ExerciseCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  // smoothing buffer
  const smoothRef = useRef<NormalizedLandmark[] | null>(null);

  // state for counting
  const phaseRef = useRef<"UP" | "GOING_DOWN" | "BOTTOM_HOLD" | "GOING_UP">("UP");
  const bottomHoldFramesRef = useRef(0);

  const lastSampleRef = useRef<AngleSample>({ knee: -1, back: -1 });

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
      setRepCount(0);
      setKneeAngle(null);
      setBackAngle(null);
      setBackWarning(false);
      phaseRef.current = "UP";
      bottomHoldFramesRef.current = 0;
      smoothRef.current = null;

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

  // منطق العدّ الاحترافي مع المرآة + فلترة/تنعيم
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
    const detection = landmarker.detectForVideo(video, now);

    // امسح
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (MIRROR) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // ارسم الفيديو
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ارسم الهيكل + احسب الزوايا والعدّ
    if (detection.landmarks.length) {
      // ناعم
      const raw = detection.landmarks[0];
      const smooth = smoothLandmarks(smoothRef.current, raw, EMA_ALPHA);
      smoothRef.current = smooth;

      // جودة التتبّع (تمنع العدّ عند وجود وجه فقط أو ضوضاء)
      const qualityOK = isPoseQualityGood(smooth);

      // رسم الهيكل لو الجودة جيدة (أو دائماً لو تبغى)
      ctx.lineWidth = 3;
      ctx.strokeStyle = "white";
      ctx.fillStyle = "white";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 6;

      const drawer = new DrawingUtils(ctx);
      drawer.drawConnectors(smooth, POSE_CONNECTIONS);
      drawer.drawLandmarks(smooth, {
        radius: 4,
        visibilityMin: 0.65,
        fillColor: "white",
      });

      // حساب الزوايا والعدّ (فقط عند جودة جيدة)
      if (qualityOK) {
        const leg = pickLeg(smooth);
        const hip = smooth[leg.hip];
        const knee = smooth[leg.knee];
        const ankle = smooth[leg.ankle];
        const shoulder = smooth[leg.shoulder];

        let k: number | null = null;
        let b: number | null = null;
        if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
        if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);

        // تحديث الـ UI للزوايا
        if (k != null) {
          const r = clampInt(k);
          if (r != null) {
            if (Math.abs((lastSampleRef.current.knee) - r) >= 1) setKneeAngle(r);
            lastSampleRef.current.knee = r;
          }
        } else {
          setKneeAngle(null);
        }

        if (b != null) {
          const r = clampInt(b);
          if (r != null) {
            if (Math.abs((lastSampleRef.current.back) - r) >= 1) setBackAngle(r);
            lastSampleRef.current.back = r;
          }
          setBackWarning(b < BACK_SAFE_THRESHOLD);
        } else {
          setBackAngle(null);
          setBackWarning(false);
        }

        // --------- State Machine للسكوات ----------
        if (k != null) {
          const angle = k;

          switch (phaseRef.current) {
            case "UP": {
              // نازل للأسفل
              if (angle <= KNEE_DOWN_MAX) {
                phaseRef.current = "GOING_DOWN";
                bottomHoldFramesRef.current = 0;
              }
              break;
            }
            case "GOING_DOWN": {
              // وصل إلى القاع (ضمن النطاق) => ابدأ العدّ التثبيتي
              if (angle >= KNEE_DOWN_MIN && angle <= KNEE_DOWN_MAX) {
                bottomHoldFramesRef.current++;
                if (bottomHoldFramesRef.current >= BOTTOM_DWELL_FRAMES) {
                  phaseRef.current = "BOTTOM_HOLD";
                }
              } else if (angle > KNEE_DOWN_MAX + 10) {
                // خرج فجأة قبل التثبيت
                phaseRef.current = "UP";
                bottomHoldFramesRef.current = 0;
              }
              break;
            }
            case "BOTTOM_HOLD": {
              // يبدأ يطلع
              if (angle >= KNEE_DOWN_MAX + 15) {
                phaseRef.current = "GOING_UP";
              }
              break;
            }
            case "GOING_UP": {
              // تم الصعود الكامل
              if (angle >= KNEE_UP_THRESHOLD) {
                setRepCount((c) => c + 1);
                phaseRef.current = "UP";
                bottomHoldFramesRef.current = 0;
              }
              break;
            }
          }
        } else {
          // فقدنا الركبة — أعد الضبط
          phaseRef.current = "UP";
          bottomHoldFramesRef.current = 0;
        }
      } else {
        // الجودة غير كافية: لا عدّ ولا زوايا
        setKneeAngle(null);
        setBackAngle(null);
        setBackWarning(false);
        phaseRef.current = "UP";
        bottomHoldFramesRef.current = 0;
      }
    }

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
            {cameraError ?? "جاري تجهيز MediaPipe (WASM + Model)...\nبعد اكتمال التحميل اضغط تشغيل الكاميرا."}
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
