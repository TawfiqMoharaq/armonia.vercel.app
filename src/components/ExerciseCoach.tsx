// ExerciseCoach.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ====================== إعدادات ومسارات ======================
const DEBUG = false;
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";
const MODEL_PATH     = "/models/pose_landmarker_lite.task";

// —— حساسية/شروط رؤية —— //
const MIN_VISIBILITY       = 0.30;   // كان 0.6 — الآن أخف
const MIN_LEG_SPAN_RATIO   = 0.28;   // مدى رأسي (ورك→كاحل) كنسبة من الصورة
const CENTRAL_ROI_MARGIN_X = 0.08;   // هامش جانبي 8%

// —— عتبات السكوات مع هستيرسِس —— //
const KNEE_UP_THRESHOLD     = 155;   // صعود
const KNEE_DOWN_ENTER_MAX   = 110;   // دخول القاع
const KNEE_DOWN_EXIT_MIN    = 130;   // خروج من القاع
const BACK_SAFE_THRESHOLD   = 145;   // تنبيه الظهر
const MIN_REP_INTERVAL_MS   = 900;   // مهلة بين العدّات
const SMOOTHING_WINDOW      = 5;     // تنعيم القراءات
const UI_INTERVAL_MS        = 100;   // تقليل ضغط التحديث على React

// —— فهارس معالم Mediapipe —— //
const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;

type PoseSide = "left" | "right";

// ====================== دوال مساعدة ======================
function visOK(l?: NormalizedLandmark | null, min = MIN_VISIBILITY) {
  return !!l && (l.visibility ?? 0) >= min;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

// زاوية عند B بين BA و BC
function angleAt(b: NormalizedLandmark, a: NormalizedLandmark, c: NormalizedLandmark) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return 180;
  let cos = dot / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return toDeg(Math.acos(cos));
}

function movingAverage(arr: number[], window = SMOOTHING_WINDOW) {
  const n = Math.min(arr.length, window);
  if (!n) return 0;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

function legVisible(lms: NormalizedLandmark[], side: PoseSide) {
  const hip   = lms[side === "left" ? LM.LEFT_HIP   : LM.RIGHT_HIP];
  const knee  = lms[side === "left" ? LM.LEFT_KNEE  : LM.RIGHT_KNEE];
  const ankle = lms[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
  return visOK(hip) && visOK(knee) && visOK(ankle);
}

function pickSide(lms: NormalizedLandmark[]): PoseSide | null {
  const L = legVisible(lms, "left");
  const R = legVisible(lms, "right");
  if (L && !R) return "left";
  if (!L && R) return "right";
  if (L && R) {
    const dist = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);
    const lSpan = dist(lms[LM.LEFT_HIP], lms[LM.LEFT_ANKLE]);
    const rSpan = dist(lms[LM.RIGHT_HIP], lms[LM.RIGHT_ANKLE]);
    return lSpan >= rSpan ? "left" : "right";
  }
  return null;
}

// يكفي أن ساق واحدة داخل الإطار ومتمركزة تقريبًا
function relaxedInFrame(lms: NormalizedLandmark[], side: PoseSide) {
  const hip   = lms[side === "left" ? LM.LEFT_HIP   : LM.RIGHT_HIP];
  const knee  = lms[side === "left" ? LM.LEFT_KNEE  : LM.RIGHT_KNEE];
  const ankle = lms[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
  if (!(visOK(hip) && visOK(knee) && visOK(ankle))) return false;

  const xs = [hip.x, knee.x, ankle.x];
  const ys = [hip.y, knee.y, ankle.y];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const spanY = maxY - minY;
  if (spanY < MIN_LEG_SPAN_RATIO) return false;

  if (minX < CENTRAL_ROI_MARGIN_X || maxX > 1 - CENTRAL_ROI_MARGIN_X) return false;

  // وضع واقف طبيعي: الكاحل أسفل الورك
  if (ankle.y <= hip.y) return false;

  return true;
}

// ====================== المكوّن ======================
const ExerciseCoach: React.FC = () => {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);

  // حالات عامة
  const [ready, setReady]     = useState(false);
  const [running, setRunning] = useState(false);

  // قراءات
  const [kneeAngle, setKneeAngle] = useState(0);
  const [backAngle, setBackAngle] = useState(0);
  const [reps, setReps]           = useState(0);
  const [cue, setCue]             = useState("");

  // سلاسل للتنعيم
  const kneeSeries = useRef<number[]>([]);
  const backSeries = useRef<number[]>([]);

  // حالة العد
  const inDownPhase = useRef(false);
  const lastRepTs   = useRef(0);
  const uiLastTsRef = useRef(0);

  // —— تحميل مرّة واحدة —— //
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
        DEBUG && console.log("✅ PoseLandmarker ready");
      } catch (e) {
        console.error("❌ Failed to load model/WASM:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // —— تشغيل الكاميرا —— //
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",           // "environment" للخلفية
          width: { ideal: 640 },
          height:{ ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // مقاسات الكانفاس
      const vw = videoRef.current.videoWidth  || 640;
      const vh = videoRef.current.videoHeight || 480;
      const canvas = canvasRef.current!;
      canvas.width  = vw;
      canvas.height = vh;

      setRunning(true);
      detectLoop();
    } catch (e) {
      console.error("❌ Camera error:", e);
      setCue("تعذّر الوصول للكاميرا. فعّل الأذونات.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    setRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
    };
  }, [stopCamera]);

  // —— رسم + حساب + عد —— //
  const drawAndCount = useCallback((lms?: NormalizedLandmark[]) => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!lms || !lms.length) {
      setCue("حرّك قليلًا حتى يتعرّف عليك.");
      return;
    }

    // اختر جهة قابلة للقياس
    const side = pickSide(lms);
    if (!side) {
      setCue("وجّه الكاميرا نحو رجليك (ورك/ركبة/كاحل).");
      return;
    }

    // يكفي إطار مريح — لا نطلب الجسم كامل
    if (!relaxedInFrame(lms, side)) {
      setCue("اقترب/ابتعد قليلًا حتى تظهر ساقك داخل الإطار.");
      return;
    }

    // نقاط الجهة
    const shoulder = lms[side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];
    const hip      = lms[side === "left" ? LM.LEFT_HIP      : LM.RIGHT_HIP];
    const knee     = lms[side === "left" ? LM.LEFT_KNEE     : LM.RIGHT_KNEE];
    const ankle    = lms[side === "left" ? LM.LEFT_ANKLE    : LM.RIGHT_ANKLE];

    // رسم مساعد صغير
    const util = new DrawingUtils(ctx as unknown as CanvasRenderingContext2D);
    util.drawLandmarks([hip, knee, ankle].filter(Boolean) as any, { radius: 2 });

    // زاوية الركبة
    const kneeDeg = angleAt(knee, hip, ankle);

    // زاوية الظهر (لو توفر كتف)
    let backDeg: number | undefined;
    if (visOK(shoulder)) backDeg = angleAt(hip, shoulder, knee);

    // تنعيم
    kneeSeries.current.push(kneeDeg);
    if (kneeSeries.current.length > 60) kneeSeries.current.shift();
    const kneeSm = movingAverage(kneeSeries.current);

    if (backDeg !== undefined) {
      backSeries.current.push(backDeg);
      if (backSeries.current.length > 60) backSeries.current.shift();
    }

    // Throttle UI
    const now = performance.now();
    const shouldUITick = now - uiLastTsRef.current >= UI_INTERVAL_MS;
    if (shouldUITick) {
      uiLastTsRef.current = now;
      setKneeAngle(Math.round(kneeSm));
      if (backDeg !== undefined) {
        setBackAngle(Math.round(movingAverage(backSeries.current)));
      }
      const backOK = backDeg === undefined || movingAverage(backSeries.current) >= BACK_SAFE_THRESHOLD;
      setCue(backOK ? "" : "حافظ على استقامة ظهرك!");
    }

    // منطق العد بهستِريسِس
    if (!inDownPhase.current && kneeSm <= KNEE_DOWN_ENTER_MAX) {
      inDownPhase.current = true; // دخل القاع
    }

    const backOK = backDeg === undefined || movingAverage(backSeries.current) >= BACK_SAFE_THRESHOLD;

    if (inDownPhase.current && kneeSm >= KNEE_DOWN_EXIT_MIN && kneeSm >= KNEE_UP_THRESHOLD && backOK) {
      if (now - lastRepTs.current >= MIN_REP_INTERVAL_MS) {
        setReps(r => r + 1);
        lastRepTs.current = now;
      }
      inDownPhase.current = false;
    }
  }, []);

  // —— حل التزامن: requestVideoFrameCallback إن وُجد —— //
  const detectLoop = useCallback(() => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    const step = (now?: number) => {
      if (!running) return;
      const ts = typeof now === "number" ? now : performance.now();
      try {
        const res = landmarker.detectForVideo(video, ts);
        const lms = res?.landmarks?.[0];
        if (lms) drawAndCount(lms);
      } catch (e) {
        DEBUG && console.warn("detectForVideo error", e);
      }

      if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        (video as any).requestVideoFrameCallback(step);
      } else {
        rafRef.current = requestAnimationFrame(() => step());
      }
    };

    step();
  }, [drawAndCount, running]);

  // ====================== واجهة المستخدم ======================
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      {/* الكاميرا + الرسم */}
      <div className="relative rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover opacity-70"
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

        {cue && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-red-600 text-white text-lg font-semibold shadow-lg">
            {cue}
          </div>
        )}
      </div>

      {/* اللوحة الجانبية */}
      <div className="p-2 md:p-4">
        <h2 className="text-2xl font-bold mb-3">Bodyweight Squat</h2>
        <div className="space-y-2 text-lg">
          <div><span className="font-semibold">Reps:</span> {reps}</div>
          <div><span className="font-semibold">Knee angle:</span> {kneeAngle}°</div>
          <div><span className="font-semibold">Back angle:</span> {backAngle}°</div>
          <ul className="mt-4 list-disc ms-5 text-base text-gray-700">
            <li>يكفي أن تظهر ساق واحدة داخل الإطار (ورك-ركبة-كاحل).</li>
            <li>حاول تبعد الركبة عن حواف الصورة قليلًا لقراءة أدق.</li>
            <li>إنارة متوسطة تكفي، والعدّ محمي من الاهتزاز.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ExerciseCoach;
