// ExerciseCoach.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ====================== الإعدادات العامة ======================
const DEBUG = false;

// ✳️ عدّل المسارات هنا لو مجلداتك مختلفة
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";
const MODEL_PATH = "/models/pose_landmarker_lite.task";

// عتبات العد (سكوات)
const KNEE_UP_THRESHOLD = 160;   // الركبة ممدودة
const KNEE_DOWN_MIN = 70;        // الركبة في القاع (زاوية صغيرة)
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150; // الظهر شبه مستقيم (زاوية الورك)

// التصفية
const MIN_VISIBILITY = 0.6;      // حد ظهور النقاط المقبول
const ROI_MIN_HEIGHT_RATIO = 0.45;  // لازم يكون الشخص شاغل ~ نصف الإطار عموديًا (كتف↔كاحل)
const SMOOTHING_WINDOW = 5;      // عدد العينات للمُعدّل المتحرك
const MIN_REP_INTERVAL_MS = 900; // أقل زمن بين العدّات (حماية من الاهتزاز)

// فهارس معالم Mediapipe
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

type PoseSide = "left" | "right";

// ====================== دوال مساعدة ======================
function visOK(l?: NormalizedLandmark | null, min = MIN_VISIBILITY) {
  return !!l && (l.visibility ?? 0) >= min;
}

function deg(v: number) {
  return (v * 180) / Math.PI;
}

function angleAt(b: NormalizedLandmark, a: NormalizedLandmark, c: NormalizedLandmark) {
  // زاوية عند B من القطعتين BA و BC
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180;
  let cos = dot / (m1 * m2);
  cos = Math.min(1, Math.max(-1, cos));
  return deg(Math.acos(cos));
}

function movingAverage(arr: number[], window = SMOOTHING_WINDOW) {
  const n = Math.min(arr.length, window);
  if (n === 0) return 0;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

// يختار الجهة ذات الظهور الأفضل (يمين/يسار)
function pickBestSide(landmarks: NormalizedLandmark[]): PoseSide | null {
  const leftScore = [
    landmarks[LM.LEFT_SHOULDER],
    landmarks[LM.LEFT_HIP],
    landmarks[LM.LEFT_KNEE],
    landmarks[LM.LEFT_ANKLE],
  ].filter((l) => visOK(l)).length;

  const rightScore = [
    landmarks[LM.RIGHT_SHOULDER],
    landmarks[LM.RIGHT_HIP],
    landmarks[LM.RIGHT_KNEE],
    landmarks[LM.RIGHT_ANKLE],
  ].filter((l) => visOK(l)).length;

  if (leftScore >= 3 && leftScore >= rightScore) return "left";
  if (rightScore >= 3 && rightScore >= leftScore) return "right";
  return null;
}

// يتحقق أن الجسم داخل الإطار (من الكتف للكاحل عموديًا) لتفادي عد الوجه فقط
function bodyInFrame(landmarks: NormalizedLandmark[], videoH: number) {
  const shoulders = [landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]].filter(visOK);
  const ankles = [landmarks[LM.LEFT_ANKLE], landmarks[LM.RIGHT_ANKLE]].filter(visOK);
  if (!shoulders.length || !ankles.length) return false;
  const minShoulderY = Math.min(...shoulders.map((s) => s.y));
  const maxAnkleY = Math.max(...ankles.map((a) => a.y));
  // y من 0 أعلى إلى 1 أسفل — الفرق النسبي *ارتفاع الفيديو
  const relHeight = (maxAnkleY - minShoulderY);
  return relHeight >= ROI_MIN_HEIGHT_RATIO; // نسبة من ارتفاع الإطار
}

// ====================== المكوّن ======================
const ExerciseCoach: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // عرض/تشغيل
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  // قراءات
  const [kneeAngle, setKneeAngle] = useState(0);
  const [backAngle, setBackAngle] = useState(0);
  const [reps, setReps] = useState(0);
  const [cue, setCue] = useState<string>("");

  // سلاسل للتنعيم
  const kneeSeries = useRef<number[]>([]);
  const backSeries = useRef<number[]>([]);

  // حالة العد (قاع/قمة)
  const inDownPhase = useRef(false);
  const lastRepTs = useRef(0);

  // ======== التحميل الأول: WASM + Model + صلاحية الكاميرا (لا تبدأ التتبع هنا) ========
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) return;

        landmarkerRef.current = landmarker;
        setReady(true);
        DEBUG && console.log("✅ PoseLandmarker جاهز");
      } catch (e) {
        console.error("❌ فشل تحميل النماذج/WASM:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ======== بدء/إيقاف الكاميرا + حل الشاشة السوداء ========
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      // اطلب صلاحية الكاميرا
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      // ضبط أبعاد اللوحة
      const vw = videoRef.current.videoWidth || 640;
      const vh = videoRef.current.videoHeight || 480;
      const canvas = canvasRef.current!;
      canvas.width = vw;
      canvas.height = vh;

      setRunning(true);
      detectLoop(); // ابدأ التتبع
    } catch (e) {
      console.error("❌ تعذر تشغيل الكاميرا:", e);
      setCue("تعذر الوصول للكاميرا. تحقق من الأذونات.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    setRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
    };
  }, [stopCamera]);

  // ======== الرسم + الحساب + العد ========
  const drawAndCount = useCallback(
    (landmarks: NormalizedLandmark[] | undefined) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // رسم نقاط للمساعدة (اختياري)
      if (landmarks && landmarks.length) {
        const utils = new DrawingUtils(ctx as unknown as CanvasRenderingContext2D);
        utils.drawLandmarks(landmarks, { radius: 1.8 });
      }

      // لا نعد إلا إذا الجسم في الإطار
      if (!landmarks || !bodyInFrame(landmarks, video.videoHeight)) {
        setCue("ابتعد خطوة للخلف حتى يظهر جسمك كاملًا");
        return;
      }

      // اختر أفضل جهة
      const side = pickBestSide(landmarks);
      if (!side) {
        setCue("قرّب الكاميرا لتظهر الركبة والورك والكاحل بوضوح");
        return;
      }

      const shoulder = landmarks[side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];
      const hip = landmarks[side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP];
      const knee = landmarks[side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE];
      const ankle = landmarks[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];

      if (![shoulder, hip, knee, ankle].every((l) => visOK(l))) {
        setCue("ثبّت الكاميرا وتأكد من إضاءة كافية");
        return;
      }

      // زاوية الركبة: (Hip - Knee - Ankle)
      const kneeDeg = angleAt(knee, hip, ankle);
      kneeSeries.current.push(kneeDeg);
      if (kneeSeries.current.length > 60) kneeSeries.current.shift();
      const kneeSmoothed = movingAverage(kneeSeries.current);

      // زاوية الظهر (زاوية الورك): (Shoulder - Hip - Knee)
      const backDeg = angleAt(hip, shoulder, knee);
      backSeries.current.push(backDeg);
      if (backSeries.current.length > 60) backSeries.current.shift();
      const backSmoothed = movingAverage(backSeries.current);

      setKneeAngle(Math.round(kneeSmoothed));
      setBackAngle(Math.round(backSmoothed));

      // تنبيهات سلامة الظهر
      if (backSmoothed < BACK_SAFE_THRESHOLD) {
        setCue("حافظ على استقامة ظهرك!");
      } else {
        setCue("");
      }

      // منطق العد: نزول ثم صعود (مع مهلة زمنية بين العدّات)
      const now = performance.now();

      // دخول مرحلة القاع
      if (
        !inDownPhase.current &&
        kneeSmoothed >= KNEE_DOWN_MIN &&
        kneeSmoothed <= KNEE_DOWN_MAX
      ) {
        inDownPhase.current = true;
      }

      // صعود مكتمل + ظهر آمن + مهلة زمنية كافية
      const upReached = kneeSmoothed >= KNEE_UP_THRESHOLD;
      const safeBack = backSmoothed >= BACK_SAFE_THRESHOLD;
      if (inDownPhase.current && upReached && safeBack) {
        if (now - lastRepTs.current >= MIN_REP_INTERVAL_MS) {
          setReps((r) => r + 1);
          lastRepTs.current = now;
        }
        inDownPhase.current = false;
      }
    },
    []
  );

  // ======== حل شاشة سوداء: استخدام performance.now() للتوقيت ========
  const detectLoop = useCallback(() => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    const step = () => {
      if (!running) return;
      const ts = performance.now();
      try {
        const res = landmarker.detectForVideo(video, ts);
        const lms = res?.landmarks?.[0];
        if (lms) drawAndCount(lms);
      } catch (e) {
        // أحيانًا ترجع detectForVideo خطأ لو التأطير تغيّر – نتجاهله ونكمل
        DEBUG && console.warn("detectForVideo error", e);
      }
      rafRef.current = requestAnimationFrame(step);
    };

    step();
  }, [drawAndCount, running]);

  // ======== واجهة المستخدم ========
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <div className="relative rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover opacity-60"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {ready ? (
            running ? (
              <button
                onClick={stopCamera}
                className="px-4 py-2 rounded-xl bg-gray-800/80 text-white font-bold"
              >
                إيقاف
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
              >
                بدء
              </button>
            )
          ) : (
            <div className="px-4 py-2 rounded-xl bg-gray-700 text-white">
              جارِ التحميل…
            </div>
          )}
        </div>

        {/* شريط التنبيه */}
        {cue && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-red-600 text-white text-lg font-semibold shadow-lg">
            {cue}
          </div>
        )}
      </div>

      <div className="p-4">
        <h2 className="text-2xl font-bold mb-3">Bodyweight Squat</h2>
        <div className="space-y-2 text-lg">
          <div>
            <span className="font-semibold">Reps:</span> {reps}
          </div>
          <div>
            <span className="font-semibold">Knee angle:</span> {kneeAngle}°
          </div>
          <div>
            <span className="font-semibold">Back angle:</span> {backAngle}°
          </div>
          <ul className="mt-4 list-disc ms-5 text-base text-gray-700">
            <li>تأكد من إضاءة جيدة وابتعد خطوة للخلف إن لزم.</li>
            <li>حافظ على الركبتين باتجاه أصابع القدمين.</li>
            <li>سيتجاهل العداد الحركة إن لم يظهر جسدك كاملًا.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ExerciseCoach;
