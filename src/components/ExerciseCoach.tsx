// ExerciseCoach.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ===== مسارات (عدّلها لو مجلداتك مختلفة) =====
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";
// لو ما عندك full بدّل للسطر التالي: "/models/pose_landmarker_lite.task"
const MODEL_PATH = "/models/pose_landmarker_full.task";

// ===== ثوابت =====
const MIN_VISIBILITY = 0.3;
const MIN_LEG_SPAN_RATIO = 0.28;
const CENTRAL_ROI_MARGIN_X = 0.08;

const KNEE_UP_THRESHOLD = 155;
const KNEE_DOWN_ENTER_MAX = 110;
const KNEE_DOWN_EXIT_MIN = 130;
const BACK_SAFE_THRESHOLD = 145;

const MIN_REP_INTERVAL_MS = 900;
const SMOOTHING_WINDOW = 5;
const UI_INTERVAL_MS = 100;

const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;
type PoseSide = "left" | "right";

// ===== مساعدات =====
const visOK = (l?: NormalizedLandmark | null, min = MIN_VISIBILITY) =>
  !!l && (l.visibility ?? 0) >= min;

function angleAt(b: NormalizedLandmark, a: NormalizedLandmark, c: NormalizedLandmark) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return 180;
  let cos = dot / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
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
  if (R && !L) return "right";
  if (L && R) {
    const dist = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);
    const lSpan = dist(lms[LM.LEFT_HIP], lms[LM.LEFT_ANKLE]);
    const rSpan = dist(lms[LM.RIGHT_HIP], lms[LM.RIGHT_ANKLE]);
    return lSpan >= rSpan ? "left" : "right";
  }
  return null;
}

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
  if (ankle.y <= hip.y) return false;

  return true;
}

// ===== المكوّن =====
const ExerciseCoach: React.FC = () => {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  const [kneeAngle, setKneeAngle] = useState(0);
  const [backAngle, setBackAngle] = useState(0);
  const [reps, setReps] = useState(0);
  const [cue, setCue] = useState("");

  // سلاسل للتنعيم
  const kneeSeries = useRef<number[]>([]);
  const backSeries = useRef<number[]>([]);

  // العد
  const inDown = useRef(false);
  const lastRepTs = useRef(0);
  const uiTs = useRef(0);

  // تشخيص
  const firstFrames = useRef(0);
  const loggedNoLandmarks = useRef(false);

  // تحميل mediapipe مرّة واحدة
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
          minPoseDetectionConfidence: 0.2,
          minPosePresenceConfidence: 0.2,
          minTrackingConfidence: 0.2,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setReady(true);
        console.log("✅ PoseLandmarker initialized");
      } catch (e) {
        console.error("❌ Failed to init PoseLandmarker/WASM. Check paths:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // بدّل إلى "environment" لو تبغى الكاميرا الخلفية
          width: { ideal: 640 }, height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;

      // مهم جدًا: ابدأ اللوب فقط بعد onloadedmetadata
      video.onloadedmetadata = async () => {
        await video.play();
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const canvas = canvasRef.current!;
        canvas.width = vw; canvas.height = vh;

        setRunning(true);
        detectLoop();
      };
    } catch (e) {
      console.error("❌ Camera error:", e);
      setCue("تعذّر الوصول للكاميرا. فعّل الأذونات.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { stopCamera(); landmarkerRef.current?.close(); };
  }, [stopCamera]);

  const drawAndCount = useCallback((lms?: NormalizedLandmark[]) => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!lms || !lms.length) {
      setCue("خلّ الركبة والكاحل يظهران بوضوح داخل الإطار.");
      return;
    }

    const side = pickSide(lms);
    if (!side) { setCue("وجّه الكاميرا نحو الساق (ورك/ركبة/كاحل)."); return; }
    if (!relaxedInFrame(lms, side)) {
      setCue("حرّك الكاميرا قليلًا حتى تكون الساق داخل الإطار وبعيدة عن الحواف.");
      return;
    }

    const shoulder = lms[side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];
    const hip      = lms[side === "left" ? LM.LEFT_HIP      : LM.RIGHT_HIP];
    const knee     = lms[side === "left" ? LM.LEFT_KNEE     : LM.RIGHT_KNEE];
    const ankle    = lms[side === "left" ? LM.LEFT_ANKLE    : LM.RIGHT_ANKLE];

    const util = new DrawingUtils(ctx as unknown as CanvasRenderingContext2D);
    util.drawLandmarks([hip, knee, ankle].filter(Boolean) as any, { radius: 2 });

    const kneeDeg = angleAt(knee, hip, ankle);
    let backDeg: number | undefined;
    if (visOK(shoulder)) backDeg = angleAt(hip, shoulder, knee);

    kneeSeries.current.push(kneeDeg);
    if (kneeSeries.current.length > 60) kneeSeries.current.shift();
    const kneeSm = movingAverage(kneeSeries.current);

    if (backDeg !== undefined) {
      backSeries.current.push(backDeg);
      if (backSeries.current.length > 60) backSeries.current.shift();
    }

    const now = performance.now();
    if (now - uiTs.current >= UI_INTERVAL_MS) {
      uiTs.current = now;
      setKneeAngle(Math.round(kneeSm));
      if (backDeg !== undefined) setBackAngle(Math.round(movingAverage(backSeries.current)));
      const backOK = backDeg === undefined || movingAverage(backSeries.current) >= BACK_SAFE_THRESHOLD;
      setCue(backOK ? "" : "حافظ على استقامة ظهرك!");
    }

    if (!inDown.current && kneeSm <= KNEE_DOWN_ENTER_MAX) inDown.current = true;
    const backOK = backDeg === undefined || movingAverage(backSeries.current) >= BACK_SAFE_THRESHOLD;
    if (inDown.current && kneeSm >= KNEE_DOWN_EXIT_MIN && kneeSm >= KNEE_UP_THRESHOLD && backOK) {
      if (now - lastRepTs.current >= MIN_REP_INTERVAL_MS) {
        setReps(r => r + 1);
        lastRepTs.current = now;
      }
      inDown.current = false;
    }
  }, []);

  // لوب كشف المتزامن (المجرّب)
  const detectLoop = useCallback(() => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    const step = () => {
      if (!running) return;

      try {
        const res = landmarker.detectForVideo(video, performance.now());
        const lms = res?.landmarks?.[0];

        // تشخيص مبدئي: أول 30 فريم لو ما فيه لاندماركس سجّل سبب محتمل
        if (firstFrames.current < 30) {
          firstFrames.current++;
          if (!lms && !loggedNoLandmarks.current) {
            loggedNoLandmarks.current = true;
            console.warn(
              "⚠️ لا توجد لاندماركس. أسباب شائعة:\n" +
              "- مسار MODEL_PATH أو WASM_BASE_URL خطأ.\n" +
              "- ملف .task مفقود (full أو lite).\n" +
              "- الفيديو أبعاده صفر (ابدأ بعد onloadedmetadata).\n" +
              "- الإطار لا يظهر الورك+الركبة+الكاحل بوضوح."
            );
          }
        }

        if (lms) drawAndCount(lms);
      } catch (e) {
        // نتجاهل الأخطاء العابرة
      }

      if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        (video as any).requestVideoFrameCallback(() => step());
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    step();
  }, [drawAndCount, running]);

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <div className="relative rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-full object-cover opacity-70" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {ready ? (
            running ? (
              <button onClick={stopCamera} className="px-4 py-2 rounded-xl bg-gray-800/80 text-white font-bold">إيقاف</button>
            ) : (
              <button onClick={startCamera} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">بدء</button>
            )
          ) : (
            <div className="px-4 py-2 rounded-xl bg-gray-700 text-white">جارِ التحميل…</div>
          )}
        </div>
        {cue && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-red-600 text-white text-lg font-semibold shadow-lg">
            {cue}
          </div>
        )}
      </div>

      <div className="p-2 md:p-4">
        <h2 className="text-2xl font-bold mb-3">Bodyweight Squat</h2>
        <div className="space-y-2 text-lg">
          <div><span className="font-semibold">Reps:</span> {reps}</div>
          <div><span className="font-semibold">Knee angle:</span> {kneeAngle}°</div>
          <div><span className="font-semibold">Back angle:</span> {backAngle}°</div>
          <ul className="mt-4 list-disc ms-5 text-base text-gray-700">
            <li>يكفي ظهور الساق (ورك–ركبة–كاحل) داخل الإطار وبعيد عن الحواف.</li>
            <li>لو الزوايا 0°: تأكّد أن ملف الموديل موجود وأن المسارات صحيحة.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ExerciseCoach;
