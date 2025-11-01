import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ✅ نحاول عدة نماذج تلقائياً (لتجنب 404 أو عدم دعم float16)
const MODEL_CANDIDATES = [
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float32/latest/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float32/latest/pose_landmarker_full.task",
];

// ✅ إصدار ثابت للـ WASM (لا تستخدم rc)
// بدّل الـCDN
const WASM_BASE_URL =
  "https://unpkg.com/@mediapipe/tasks-vision@0.10.22/wasm";

// ثبّت مسارات الموديلات لنسخة محددة (1) بدل latest
const MODEL_CANDIDATES = [
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float32/1/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float32/1/pose_landmarker_full.task",
];
const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

type AngleSample = { knee: number; back: number };

function toDeg(r: number) { return (r * 180) / Math.PI; }
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

// ====== كاميرا: محاولات مرنة + رسائل واضحة ======
async function getCameraStream(): Promise<MediaStream> {
  const trials: MediaStreamConstraints[] = [
    { video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } } },
    { video: { width: { ideal: 960 }, height: { ideal: 720 } } },
    { video: true },
  ];
  let lastErr: any;
  for (const c of trials) {
    try { return await navigator.mediaDevices.getUserMedia(c); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}
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
    case "SecurityError": return "الوصول للكاميرا يتطلب اتصالاً آمناً (HTTPS).";
    case "AbortError": return "تعذر بدء تشغيل الكاميرا بسبب خطأ داخلي.";
    default: return `تعذر تشغيل الكاميرا: ${n || "خطأ غير متوقع"}`;
  }
}

export default function ExerciseCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const wasDownRef = useRef(false);
  const lastSampleRef = useRef<AngleSample>({ knee: -1, back: -1 });

  const [initializing, setInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);
  const [backWarning, setBackWarning] = useState(false);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();

    // ✅ جرّب GPU ثم CPU + كل الموديلات بالترتيب
    async function createLandmarker(fileset: any) {
      let lastErr: any;
      for (const delegate of ["GPU", "CPU"] as const) {
        for (const url of MODEL_CANDIDATES) {
          try {
            const lm = await PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: url },
              delegate,
              runningMode: "VIDEO",
              numPoses: 1,
            });
            console.info("[PoseLandmarker] loaded:", delegate, url);
            return lm;
          } catch (e) {
            lastErr = e;
            console.warn("[PoseLandmarker] failed:", delegate, url, e);
          }
        }
      }
      throw lastErr ?? new Error("Failed to load any PoseLandmarker model.");
    }

    const initialize = async () => {
      try {
        // ✅ فحص السياق الآمن ودعم الكاميرا قبل أي طلب
        if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
          setCameraError("المتصفح لا يدعم getUserMedia. حدّث المتصفح أو جرّب Chrome/Edge.");
          setInitializing(false);
          return;
        }
        if (!window.isSecureContext) {
          setCameraError("هذه الصفحة ليست آمنة (HTTPS مطلوب). استخدم https أو localhost.");
          setInitializing(false);
          return;
        }

        // WASM ثم الموديل
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (!active) return;

        poseRef.current = await createLandmarker(fileset);
        if (!active) return;

        // الكاميرا مع محاولات fallback
        let stream: MediaStream;
        try { stream = await getCameraStream(); }
        catch (e) {
          setCameraError(explainGetUserMediaError(e));
          setInitializing(false);
          return;
        }
        if (!active) { stream.getTracks().forEach(t=>t.stop()); return; }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          stream.getTracks().forEach((t)=>t.stop());
          setCameraError("تعذر تهيئة مكونات العرض. أعد تحميل الصفحة.");
          return;
        }

        video.srcObject = stream;
        try { await video.play(); } catch { /* بعض المتصفحات تمنع autoplay */ }

        const ctx = canvas.getContext("2d");
        if (!ctx) { setCameraError("Canvas context غير متاح."); return; }

        const drawingUtils = new DrawingUtils(ctx);

        const syncCanvasSize = () => {
          if (!video.videoWidth || !video.videoHeight) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        };
        syncCanvasSize();
        video.addEventListener("loadedmetadata", syncCanvasSize, { signal: abortController.signal });
        video.addEventListener("resize", syncCanvasSize, { signal: abortController.signal });

        setInitializing(false);

        const processAngles = (kneeValue: number | null, backValue: number | null) => {
          if (kneeValue != null) {
            const r = clampInt(kneeValue);
            if (r != null) {
              const prev = lastSampleRef.current.knee;
              if (Math.abs(prev - r) >= 1) setKneeAngle(r);
              lastSampleRef.current.knee = r;
            }
            if (kneeValue >= KNEE_DOWN_MIN && kneeValue <= KNEE_DOWN_MAX) wasDownRef.current = true;
            if (kneeValue >= KNEE_UP_THRESHOLD && wasDownRef.current) {
              wasDownRef.current = false;
              setRepCount((c) => c + 1);
            }
          }
          if (backValue != null) {
            const r = clampInt(backValue);
            if (r != null) {
              const prev = lastSampleRef.current.back;
              if (Math.abs(prev - r) >= 1) setBackAngle(r);
              lastSampleRef.current.back = r;
            }
            setBackWarning(backValue < BACK_SAFE_THRESHOLD);
          } else {
            setBackWarning(false);
          }
        };

        const renderLoop = () => {
          if (!poseRef.current || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(renderLoop);
            return;
          }
          const nowInMs = performance.now();
          const result = poseRef.current.detectForVideo(videoRef.current, nowInMs);

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (result.landmarks.length) {
            const [landmarks] = result.landmarks;
            drawingUtils.drawLandmarks(landmarks, {
              radius: 4,
              visibilityMin: 0.65,
              fillColor: "#18A4B8",
            });

            const leg = pickLeg(landmarks);
            const hip = landmarks[leg.hip];
            const knee = landmarks[leg.knee];
            const ankle = landmarks[leg.ankle];
            const shoulder = landmarks[leg.shoulder];

            let k: number | null = null;
            let b: number | null = null;
            if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
            if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);

            processAngles(k, b);
          }

          ctx.restore();
          rafRef.current = requestAnimationFrame(renderLoop);
        };

        renderLoop();
      } catch (error: any) {
        console.error("[ExerciseCoach] initialize() failed:", error);
        setCameraError(error?.message ?? "تعذر بدء تشغيل المدرب.");
        setInitializing(false);
      }
    };

    initialize();

    return () => {
      active = false;
      abortController.abort();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      poseRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/20 bg-black shadow">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

      <div className="absolute top-4 left-4 space-y-2 text-white text-sm">
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

      {(initializing || cameraError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6">
          <p className="text-sm leading-relaxed" dir="rtl">
            {cameraError ?? "جاري تشغيل الكاميرا ومدرب الوضعيات...\nاسمح بإذن الكاميرا وابقَ ثابتاً."}
          </p>
        </div>
      )}

      {backWarning && !cameraError && !initializing && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-red-600/85 text-white font-semibold shadow-lg">
          Keep your chest up and maintain a neutral spine!
        </div>
      )}
    </div>
  );
}
