// src/components/ExerciseRunner.tsx
import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

type Props = {
  title?: string;
  gif?: string | null;
  onClose?: () => void;
};

/* ===== إعدادات تشغيل بسيطة ===== */
const MIRROR = true;
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";
const MODEL_CANDIDATES = ["/models/pose_landmarker_lite.task"];

const explainGetUserMediaError = (err: any) => {
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
      return "هذه الصفحة ليست آمنة (HTTPS مطلوب). استخدم https أو localhost.";
    default:
      return `تعذر تشغيل الكاميرا: ${n || "خطأ غير متوقع"}`;
  }
};

export default function ExerciseRunner({ title, gif, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // تحميل مكتبة/نموذج MediaPipe
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;

        let lastErr: any;
        for (const delegate of ["GPU", "CPU"] as const) {
          for (const url of MODEL_CANDIDATES) {
            try {
              landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, {
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
        throw lastErr ?? new Error("تعذر تحميل PoseLandmarker.");
      } catch (e: any) {
        // النموذج اختياري لعرض الفيديو فقط — ما نوقف الواجهة بسببه
        console.warn("PoseLandmarker init warning:", e?.message || e);
        setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startCamera() {
    try {
      setCameraError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("المتصفح لا يدعم getUserMedia.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = (videoRef.current ||= document.createElement("video"));
      video.srcObject = stream;
      try {
        await video.play();
      } catch {}

      // مهم: ضبط الأبعاد الداخلية للكانفس بما يساوي أبعاد الفيديو
      const syncCanvas = () => {
        const canvas = canvasRef.current!;
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
      video.addEventListener("loadedmetadata", syncCanvas as any, { passive: true } as any);
      video.addEventListener("resize", syncCanvas as any, { passive: true } as any);
      syncCanvas();

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
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (MIRROR) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // الأهم: ارسم الفيديو على الكانفس — يمنع الشاشة السوداء
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // (اختياري) اكتشاف الوضعية والرسم فوق الفيديو لاحقًا إذا رغبت
    // const lm = landmarkerRef.current;
    // if (lm) {
    //   const now = performance.now();
    //   const result = lm.detectForVideo(video, now);
    //   // ... draw skeleton if needed
    // }

    ctx.restore();
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
    };
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-4">
      {/* العنوان + زر إغلاق */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xl font-semibold text-sky-800">
          {title || "Bodyweight Squat"}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white"
          >
            إغلاق
          </button>
        )}
      </div>

      {/* الشبكة: الكاميرا يسار (420px ثابت) و الـGIF يمين تتمدّد */}
      <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] gap-6 items-start">
        {/* الكاميرا يسار */}
        <div className="relative">
          <button
            onClick={running ? stopCamera : startCamera}
            disabled={!isReady && !running}
            className="absolute z-10 top-3 left-3 px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "إيقاف الكاميرا" : "تشغيل الكاميرا 🎥"}
          </button>

          <div className="rounded-2xl overflow-hidden border border-black/10 bg-black">
            {/* ملاحظة: width/height هنا للتحكم البصري فقط.
               أبعاد الرسم تتزامن مع الفيديو داخل startCamera */}
            <canvas
              ref={canvasRef}
              style={{ display: "block", width: 420, height: 315 }}
            />
          </div>

          {cameraError && (
            <div className="mt-2 text-sm text-white bg-red-600/90 rounded-xl px-3 py-2">
              {cameraError}
            </div>
          )}
        </div>

        {/* الـGIF يمين */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {gif ? (
            <img
              src={gif}
              alt={title || "exercise"}
              className="w-full h-auto object-contain rounded-xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="text-slate-500">لا توجد معاينة متحركة لهذا التمرين.</div>
          )}

          {/* نقاط سريعة (اختياري) */}
          <ul className="list-disc ms-6 mt-3 text-sm leading-7">
            <li>ثبّت الكعبين.</li>
            <li>ادفع الوركين للخلف.</li>
            <li>انزل ببطء واصعد بتحكم.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
