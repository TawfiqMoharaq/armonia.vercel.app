// src/components/ExerciseCoach.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
  POSE_CONNECTIONS, // ⬅️ لرسـم الوصلات
} from "@mediapipe/tasks-vision";

// ✅ تحميل النماذج محلياً من public
const MODEL_CANDIDATES = [
  "/models/pose_landmarker_lite.task",
];

// ✅ تحميل WASM محلياً أيضاً
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";

// ⛳️ خيار المرآة (سيلفي): إن تبغاه فعّل true
const MIRROR = true;

// عتبات العدّ والتنبيه
const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

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

export default function ExerciseCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  const wasDownRef = useRef(false);
  const lastSampleRef = useRef<AngleSample>({ knee: -1, back: -1 });

  const [isReady, setIsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);
  const [backWarning, setBackWarning] = useState(false);

  // ====== تهيئة Mediapipe (WASM + Model) ======
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

  // ====== تشغيل/إيقاف الكاميرا ======
  async function startCamera() {
    try {
      setCameraError(null);
      setRepCount(0);
      setKneeAngle(null);
      setBackAngle(null);
      setBackWarning(false);
      wasDownRef.current = false;

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

  // ====== حلقة الرسم والكشف ======
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

    // الكانفس شفاف — فقط لمسح رسومات الإطار السابق
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks.length) {
      const landmarks = result.landmarks[0];
      const drawer = new DrawingUtils(ctx);

      // إن كنت مفعل المرآة على DOM, ما تحتاج تعكس هنا. فقط ارسم.
      drawer.drawConnectors(landmarks, POSE_CONNECTIONS, { lineWidth: 3 });
      drawer.drawLandmarks(landmarks, { radius: 4, visibilityMin: 0.65, fillColor: "#18A4B8" });

      const leg = pickLeg(landmarks);
      const hip = landmarks[leg.hip];
      const knee = landmarks[leg.knee];
      const ankle = landmarks[leg.ankle];
      const shoulder = landmarks[leg.shoulder];

      let k: number | null = null;
      let b: number | null = null;
      if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
      if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);

      if (k != null) {
        const r = clampInt(k);
        if (r != null) {
          if (Math.abs(lastSampleRef.current.knee - r) >= 1) setKneeAngle(r);
          lastSampleRef.current.knee = r;
        }
        if (k >= KNEE_DOWN_MIN && k <= KNEE_DOWN_MAX) wasDownRef.current = true;
        if (k >= KNEE_UP_THRESHOLD && wasDownRef.current) {
          wasDownRef.current = false;
          setRepCount((c) => c + 1);
        }
      }

      if (b != null) {
        const r = clampInt(b);
        if (r != null) {
          if (Math.abs(lastSampleRef.current.back - r) >= 1) setBackAngle(r);
          lastSampleRef.current.back = r;
        }
        setBackWarning(b < BACK_SAFE_THRESHOLD);
      } else {
        setBackWarning(false);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // تنظيف
  useEffect(() => {
    return () => {
      stopCamera();
      poseRef.current?.close();
    };
  }, []);

  // ====== واجهة العرض ======
  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/20 bg-black shadow">

      {/* أزرار التحكم */}
      {!running && (
        <button
          onClick={startCamera}
          disabled={!isReady}
          className="absolute top-4 left-4 z-20 px-4 py-2 rounded-xl text-white shadow disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
        >
          تشغيل الكاميرا 🎥
        </button>
      )}
      {running && (
        <button
          onClick={stopCamera}
          className="absolute top-4 left-4 z-20 px-4 py-2 rounded-xl text-white shadow bg-gray-700 hover:bg-gray-800"
        >
          إيقاف
        </button>
      )}

      {/* الفيديو ظاهر في الخلفية */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          transform: MIRROR ? "scaleX(-1)" : undefined,
          filter: "brightness(1.1) contrast(1.05)", // تحسين بسيط لو الإضاءة قليلة
        }}
      />

      {/* الكانفس فوقه فقط للرسومات */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform: MIRROR ? "scaleX(-1)" : undefined }}
      />

      {/* HUD يمين فوق */}
      <div className="absolute top-4 right-4 space-y-2 text-white text-sm z-20">
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

      {/* ستاتس التحميل/الأخطاء */}
      {(!isReady || cameraError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6 z-30">
          <p className="text-sm leading-relaxed" dir="rtl">
            {cameraError ??
              "جاري تجهيز MediaPipe (WASM + Model)...\nبعد اكتمال التحميل اضغط تشغيل الكاميرا."}
          </p>
        </div>
      )}

      {/* تحذير الظهر */}
      {backWarning && running && !cameraError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-red-600/85 text-white font-semibold shadow-lg z-20">
          حافظ على استقامة ظهرك!
        </div>
      )}
    </div>
  );
}
