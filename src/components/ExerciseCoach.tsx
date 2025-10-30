import React, { useEffect, useRef, useState } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import type { Keypoint } from "@tensorflow-models/pose-detection";

type CoachKind = "squat" | "none";

/** حدود السكوات (تقدر تعدّلها لاحقًا لكل تمرين) */
const KNEE_UP_THRESHOLD = 160;   // الوقوف
const KNEE_DOWN_MIN = 70;        // قاع السكوات
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150; // وضع الظهر الآمن

function toDeg(a: number) { return (a * 180) / Math.PI; }
function angle(a: Keypoint, c: Keypoint, b: Keypoint) {
  const v1 = [a.x - c.x, a.y - c.y];
  const v2 = [b.x - c.x, b.y - c.y];
  const dot = v1[0]*v2[0] + v1[1]*v2[1];
  const m1 = Math.hypot(v1[0], v1[1]);
  const m2 = Math.hypot(v2[0], v2[1]);
  if (!m1 || !m2) return null;
  const cos = Math.min(Math.max(dot / (m1 * m2), -1), 1);
  return toDeg(Math.acos(cos));
}
function byName(kps: Keypoint[], n: string) {
  return kps.find(k => k.name === n) as Keypoint;
}
function pickLeg(kps: Keypoint[]) {
  const L = { shoulder: byName(kps,"left_shoulder"), hip: byName(kps,"left_hip"), knee: byName(kps,"left_knee"), ankle: byName(kps,"left_ankle") };
  const R = { shoulder: byName(kps,"right_shoulder"), hip: byName(kps,"right_hip"), knee: byName(kps,"right_knee"), ankle: byName(kps,"right_ankle") };
  const v = (p?: Keypoint) => (p?.score ?? 0);
  const lScore = v(L.hip)+v(L.knee)+v(L.ankle);
  const rScore = v(R.hip)+v(R.knee)+v(R.ankle);
  return lScore >= rScore ? L : R;
}

type Props = {
  /** نوع المصحّح المطلوب: "squat" أو "none" */
  coachType?: CoachKind;
};

export default function ExerciseCoach({ coachType = "squat" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [repCount, setRepCount] = useState(0);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [backAngle, setBackAngle] = useState<number | null>(null);
  const [backWarning, setBackWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasDownRef = useRef(false);
  const rafRef = useRef<number>();
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        // TF.js يستخدم WebGL — ما يحتاج WASM/CDN
        await poseDetection
          .createDetector(poseDetection.SupportedModels.MoveNet, { modelType: "Lightning" })
          .then((d) => (detectorRef.current = d));

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });

        const video = videoRef.current!;
        const canvas = canvasRef.current!;
        video.srcObject = stream;
        await video.play();

        const ctx = canvas.getContext("2d")!;
        const sync = () => { canvas.width = video.videoWidth; canvas.height = video.videoHeight; };
        sync();
        video.addEventListener("loadedmetadata", sync);
        video.addEventListener("resize", sync);

        const loop = async () => {
          if (!active) return;
          if (!detectorRef.current) { rafRef.current = requestAnimationFrame(loop); return; }

          const poses = await detectorRef.current.estimatePoses(video, { flipHorizontal: true });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (poses[0]?.keypoints) {
            const kps = poses[0].keypoints;

            // رسم نقاط بسيط
            ctx.fillStyle = "#18A4B8";
            for (const k of kps) if ((k.score ?? 0) > 0.5) ctx.fillRect(k.x-2, k.y-2, 4, 4);

            if (coachType === "squat") {
              const leg = pickLeg(kps); // اختَر الطرف الأكثر وضوحًا
              const kAng = angle(leg.hip, leg.knee, leg.ankle);
              const bAng = angle(leg.shoulder, leg.hip, leg.knee);

              if (kAng != null) {
                const r = Math.round(kAng);
                setKneeAngle(r);
                if (r >= KNEE_DOWN_MIN && r <= KNEE_DOWN_MAX) wasDownRef.current = true;
                if (r >= KNEE_UP_THRESHOLD && wasDownRef.current) {
                  wasDownRef.current = false;
                  setRepCount((c) => c + 1);
                }
              }
              if (bAng != null) {
                const r = Math.round(bAng);
                setBackAngle(r);
                setBackWarning(r < BACK_SAFE_THRESHOLD);
              } else {
                setBackWarning(false);
              }
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e: any) {
        const n = e?.name || "";
        if (n === "NotAllowedError") setError("يرجى السماح بإذن الكاميرا من رمز القفل بجانب العنوان.");
        else setError(e?.message ?? "تعذر تشغيل الكاميرا/النموذج.");
      }
    }

    init();
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      if (v?.srcObject) (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    };
  }, [coachType]);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/20 bg-black shadow">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

      {coachType === "squat" && (
        <div className="absolute top-4 left-4 space-y-2 text-white text-sm">
          <div className="px-3 py-2 rounded-2xl bg-black/60 backdrop-blur flex items-center gap-3">
            <span className="font-semibold text-lg">{repCount}</span><span>Reps</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">Knee angle: {kneeAngle ?? "—"}°</span>
            <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">Back angle: {backAngle ?? "—"}°</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6">
          <p className="text-sm leading-relaxed" dir="rtl">{error}</p>
        </div>
      )}
      {backWarning && !error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-red-600/85 text-white font-semibold shadow-lg">
          حافظ على صدر مرفوع وظهر محايد
        </div>
      )}
    </div>
  );
}
