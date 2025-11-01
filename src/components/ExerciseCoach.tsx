// src/components/ExerciseCoach.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

/* ---------------------------------- Config --------------------------------- */
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

const MODEL_CANDIDATES = ["/models/pose_landmarker_lite.task"];
const WASM_BASE_URL = "/vendor/mediapipe/0.10.22/wasm";
const MIRROR = true;

// حدود السكوات
const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

// فلترة/جودة
const V_TORSO_MIN = 0.45;
const V_LEG_MIN = 0.60;
const REQUIRED_KEYPOINTS = [11,12,23,24,27,28];
const MIN_PRESENT_RATIO = 0.75;
const EMA_ALPHA = 0.35;
const BOTTOM_DWELL_FRAMES = 4;

/* --------------------------------- Helpers --------------------------------- */
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
const clampInt = (v: number | null) => (v==null||Number.isNaN(v)?null:Math.round(v));

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

function smoothLandmarks(
  prev: NormalizedLandmark[] | null,
  next: NormalizedLandmark[],
  alpha = EMA_ALPHA
): NormalizedLandmark[] {
  if (!prev || prev.length !== next.length) return next.map(p => ({...p}));
  return next.map((p, i) => {
    const q = prev[i];
    const a = (p.visibility ?? 0) > 0.2 && (q.visibility ?? 0) > 0.2 ? alpha : 1.0;
    return {
      x: a * p.x + (1 - a) * q.x,
      y: a * p.y + (1 - a) * q.y,
      z: a * p.z + (1 - a) * q.z,
      visibility: Math.max(p.visibility ?? 0, q.visibility ?? 0),
    };
  });
}

function isPoseQualityGood(lms: NormalizedLandmark[]): boolean {
  const present = REQUIRED_KEYPOINTS.filter(i => (lms[i]?.visibility ?? 0) > 0.2).length;
  if (present / REQUIRED_KEYPOINTS.length < MIN_PRESENT_RATIO) return false;

  const torsoIdx = [11,12,23,24];
  const torsoV = torsoIdx.reduce((s,i)=>s+(lms[i]?.visibility ?? 0),0)/torsoIdx.length;
  if (torsoV < V_TORSO_MIN) return false;

  const leg = pickLeg(lms);
  const vLeg = [leg.hip, leg.knee, leg.ankle].reduce((s,i)=>s+(lms[i]?.visibility ?? 0),0)/3;
  if (vLeg < V_LEG_MIN) return false;

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

  const smoothRef = useRef<NormalizedLandmark[] | null>(null);
  const phaseRef = useRef<"UP" | "GOING_DOWN" | "BOTTOM_HOLD" | "GOING_UP">("UP");
  const bottomHoldFramesRef = useRef(0);
  const lastSampleRef = useRef<AngleSample>({ knee: -1, back: -1 });

  const [isReady, setIsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);

  /* ------------------------------ Init models ------------------------------ */
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
      phaseRef.current = "UP";
      bottomHoldFramesRef.current = 0;
      smoothRef.current = null;

      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("المتصفح لا يدعم getUserMedia.");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
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
      video.addEventListener("loadedmetadata", syncCanvas as any, { passive: true } as any);
      video.addEventListener("resize", syncCanvas as any, { passive: true } as any);

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
    const detection = landmarker.detectForVideo(video, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (MIRROR) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (detection.landmarks.length) {
      const raw = detection.landmarks[0];
      const smooth = smoothLandmarks(smoothRef.current, raw, EMA_ALPHA);
      smoothRef.current = smooth;

      const qualityOK = isPoseQualityGood(smooth);

      const drawer = new DrawingUtils(ctx as any);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = "white";
      ctx.fillStyle = "white";
      drawer.drawConnectors(smooth, POSE_CONNECTIONS);
      drawer.drawLandmarks(smooth, { radius: 3.2, visibilityMin: 0.65, fillColor: "white" });

      if (qualityOK) {
        const leg = pickLeg(smooth);
        const hip = smooth[leg.hip], knee = smooth[leg.knee], ankle = smooth[leg.ankle];
        const shoulder = smooth[leg.shoulder];

        let k: number | null = null;
        if (hip && knee && ankle) k = vectorAngle(hip, knee, ankle);
        if (k != null) { const r = clampInt(k); if (r != null) setKneeAngle((p)=>p===r?p:r); }
        else setKneeAngle(null);

        let b: number | null = null;
        if (shoulder && hip && knee) b = vectorAngle(shoulder, hip, knee);
        if (b != null) { const r = clampInt(b); if (r != null) setBackAngle((p)=>p===r?p:r); }
        else setBackAngle(null);

        if (k != null) {
          const angle = k;
          switch (phaseRef.current) {
            case "UP":
              if (angle <= KNEE_DOWN_MAX) { phaseRef.current = "GOING_DOWN"; bottomHoldFramesRef.current = 0; }
              break;
            case "GOING_DOWN":
              if (angle >= KNEE_DOWN_MIN && angle <= KNEE_DOWN_MAX) {
                bottomHoldFramesRef.current++;
                if (bottomHoldFramesRef.current >= BOTTOM_DWELL_FRAMES) phaseRef.current = "BOTTOM_HOLD";
              } else if (angle > KNEE_DOWN_MAX + 10) {
                phaseRef.current = "UP"; bottomHoldFramesRef.current = 0;
              }
              break;
            case "BOTTOM_HOLD":
              if (angle >= KNEE_DOWN_MAX + 15) phaseRef.current = "GOING_UP";
              break;
            case "GOING_UP":
              if (angle >= KNEE_UP_THRESHOLD) {
                setRepCount((c)=>c+1);
                phaseRef.current = "UP"; bottomHoldFramesRef.current = 0;
              }
              break;
          }
        } else { phaseRef.current = "UP"; bottomHoldFramesRef.current = 0; }
      } else {
        setKneeAngle(null);
        setBackAngle(null);
        phaseRef.current = "UP"; bottomHoldFramesRef.current = 0;
      }
    }

    ctx.restore();
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => { stopCamera(); poseRef.current?.close(); }, []);

  /* ------------------------------ UI computed ------------------------------ */
  const depthOk = kneeAngle != null && kneeAngle <= KNEE_DOWN_MAX;
  const depthAlmost = kneeAngle != null && kneeAngle > KNEE_DOWN_MAX && kneeAngle <= 120;
  const backOk = backAngle != null && backAngle >= BACK_SAFE_THRESHOLD;
  const atBottom = phaseRef.current === "BOTTOM_HOLD";

  const TipChip = ({label}: {label:string}) => (
    <span className="px-2 py-1 rounded-lg text-xs bg-black/60 text-white border border-white/10">
      {label}
    </span>
  );

  /* ======================== كاميرا فقط — بدون سايدبار ======================== */
  return (
    <div className="w-full">
      <div
        className="
          relative mx-auto max-w-[780px]
          rounded-2xl overflow-hidden border border-white/15 bg-black shadow-lg
          aspect-video
        "
      >
        {/* زر تشغيل/إيقاف */}
        <button
          onClick={running ? stopCamera : startCamera}
          disabled={!isReady && !running}
          className="absolute top-3 left-3 z-20 px-4 py-2 rounded-xl text-white shadow bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "إيقاف" : "تشغيل الكاميرا 🎥"}
        </button>

        {/* الفيديو مخفي — نرسم على الكانفس */}
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {/* عداد وزوايا */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
          <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur text-white text-sm flex items-center gap-2">
            <span className="font-semibold text-lg">{repCount}</span><span>Reps</span>
          </div>
          <div className="hidden md:flex gap-2">
            <TipChip label={`Knee ${kneeAngle ?? "—"}°`} />
            <TipChip label={`Back ${backAngle ?? "—"}°`} />
          </div>
        </div>

        {/* شرائح مساعدة فوق الفيديو */}
        {!cameraError && (
          <div className="absolute left-3 bottom-3 z-20 flex flex-wrap gap-2 max-w-[80%]">
            <TipChip label={depthOk ? "عمق ممتاز ✅" : depthAlmost ? "قرب للقاع" : "انزل أكثر"} />
            <TipChip label={atBottom ? "ثبت ثانية بالقاع" : "ثبّت ثانية بالقاع"} />
            <TipChip label={backOk ? "ظهر مستقيم ✅" : "وضع الظهر (اختياري)"} />
          </div>
        )}

        {/* خطأ الكاميرا */}
        {cameraError && (
          <div className="absolute inset-x-3 bottom-3 px-4 py-3 rounded-xl bg-red-600/90 text-white text-sm z-20">
            {cameraError}
          </div>
        )}
      </div>
    </div>
  );
}
