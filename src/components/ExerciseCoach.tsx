import React, { useEffect, useRef, useState } from "react";
import * as posedetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import * as tf from "@tensorflow/tfjs-core";
import type { Keypoint } from "@tensorflow-models/pose-detection";

type CoachKind = "squat" | "none";

const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function angle(a?: Keypoint, c?: Keypoint, b?: Keypoint) {
  if (!a || !b || !c) return null;
  const v1 = [a.x - c.x, a.y - c.y];
  const v2 = [b.x - c.x, b.y - c.y];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const m1 = Math.hypot(v1[0], v1[1]);
  const m2 = Math.hypot(v2[0], v2[1]);
  if (!m1 || !m2) return null;
  const cosine = Math.min(Math.max(dot / (m1 * m2), -1), 1);
  return toDeg(Math.acos(cosine));
}

function byName(keypoints: Keypoint[], name: string) {
  return keypoints.find((k) => (k as any).name === name);
}

function pickLeg(keypoints: Keypoint[]) {
  const left = {
    shoulder: byName(keypoints, "left_shoulder"),
    hip: byName(keypoints, "left_hip"),
    knee: byName(keypoints, "left_knee"),
    ankle: byName(keypoints, "left_ankle"),
  };
  const right = {
    shoulder: byName(keypoints, "right_shoulder"),
    hip: byName(keypoints, "right_hip"),
    knee: byName(keypoints, "right_knee"),
    ankle: byName(keypoints, "right_ankle"),
  };
  const score = (p?: Keypoint) => p?.score ?? 0;
  const leftScore = score(left.hip) + score(left.knee) + score(left.ankle);
  const rightScore = score(right.hip) + score(right.knee) + score(right.ankle);
  return leftScore >= rightScore ? left : right;
}

type Props = {
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
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<posedetection.PoseDetector | null>(null);

  useEffect(() => {
    let active = true;
    let syncHandler: (() => void) | null = null;

    const init = async () => {
      try {
        setError(null);
        setRepCount(0);
        setKneeAngle(null);
        setBackAngle(null);
        setBackWarning(false);

        // TF backend
        if (tf.getBackend() !== "webgl") {
          await tf.setBackend("webgl");
        }
        await tf.ready();

        // ✅ MoveNet with correct enum (no "Lightning" string)
        const detector = await posedetection.createDetector(
          posedetection.SupportedModels.MoveNet,
          {
            modelType: posedetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true,
          }
        );
        detectorRef.current = detector;

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("متصفحك لا يدعم الوصول إلى الكاميرا.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          throw new Error("تعذر العثور على عناصر الفيديو أو اللوحة.");
        }

        video.srcObject = stream;
        await video.play();

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("تعذر الحصول على سياق الرسم الثنائية الأبعاد.");

        const sync = () => {
          if (!video) return;
          canvas.width = video.videoWidth || canvas.width;
          canvas.height = video.videoHeight || canvas.height;
        };
        syncHandler = sync;
        sync();
        video.addEventListener("loadedmetadata", sync);
        video.addEventListener("resize", sync);

        const loop = async () => {
          if (!active) return;
          const currentDetector = detectorRef.current;
          if (!currentDetector) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }

          const poses = await currentDetector.estimatePoses(video, {
            flipHorizontal: true, // للكاميرا الأمامية
          });

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (poses[0]?.keypoints?.length) {
            const kps = poses[0].keypoints as Keypoint[];

            // نقاط مفصلية
            ctx.fillStyle = "#18A4B8";
            for (const kp of kps) {
              if ((kp.score ?? 0) > 0.5) {
                ctx.fillRect(kp.x - 2, kp.y - 2, 4, 4);
              }
            }

            if (coachType === "squat") {
              const leg = pickLeg(kps);
              const kAng = angle(leg.hip, leg.knee, leg.ankle);
              const bAng = angle(leg.shoulder, leg.hip, leg.knee);

              if (kAng != null) {
                const rounded = Math.round(kAng);
                setKneeAngle(rounded);
                if (rounded >= KNEE_DOWN_MIN && rounded <= KNEE_DOWN_MAX) {
                  wasDownRef.current = true;
                }
                if (rounded >= KNEE_UP_THRESHOLD && wasDownRef.current) {
                  wasDownRef.current = false;
                  setRepCount((c) => c + 1);
                }
              }

              if (bAng != null) {
                const rounded = Math.round(bAng);
                setBackAngle(rounded);
                setBackWarning(rounded < BACK_SAFE_THRESHOLD);
              } else {
                setBackWarning(false);
              }
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        loop();
      } catch (e: any) {
        const name = e?.name ?? "";
        if (name === "NotAllowedError") {
          setError("تم رفض صلاحية الكاميرا. يرجى السماح بالوصول من إعدادات المتصفح.");
        } else if (e?.message) {
          setError(e.message);
        } else {
          setError("حدث خطأ أثناء تهيئة مدرب التمرين.");
        }
      }
    };

    init();

    return () => {
      active = false;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const video = videoRef.current;
      if (video) {
        if (syncHandler) {
          video.removeEventListener("loadedmetadata", syncHandler);
          video.removeEventListener("resize", syncHandler);
        }
        const mediaStream = video.srcObject as MediaStream | null;
        if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
        video.pause();
        video.srcObject = null;
      }

      detectorRef.current?.dispose?.();
      detectorRef.current = null;
    };
  }, [coachType]);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/20 bg-black shadow">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

      {coachType === "squat" && (
        <div className="absolute top-4 left-4 space-y-2 text-white text-sm">
          <div className="px-3 py-2 rounded-2xl bg-black/60 backdrop-blur flex items-center gap-3">
            <span className="font-semibold text-lg">{repCount}</span>
            <span>تكرارات</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">
              زاوية الركبة: {kneeAngle ?? "--"} درجة
            </span>
            <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur">
              زاوية الظهر: {backAngle ?? "--"} درجة
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6">
          <p className="text-sm leading-relaxed" dir="rtl">
            {error}
          </p>
        </div>
      )}
      {backWarning && !error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-red-600/85 text-white font-semibold shadow-lg">
          حافظ على استقامة ظهرك!
        </div>
      )}
    </div>
  );
}
