import React, { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// بعد: استخدم latest أو 1
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const KNEE_UP_THRESHOLD = 160;
const KNEE_DOWN_MIN = 70;
const KNEE_DOWN_MAX = 100;
const BACK_SAFE_THRESHOLD = 150;

type AngleSample = {
  knee: number;
  back: number;
};

function toDegrees(angleRad: number) {
  return (angleRad * 180) / Math.PI;
}

function vectorAngle(a: NormalizedLandmark, center: NormalizedLandmark, b: NormalizedLandmark) {
  const v1 = [a.x - center.x, a.y - center.y, a.z - center.z];
  const v2 = [b.x - center.x, b.y - center.y, b.z - center.z];

  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const mag1 = Math.hypot(v1[0], v1[1], v1[2]);
  const mag2 = Math.hypot(v2[0], v2[1], v2[2]);

  if (!mag1 || !mag2) {
    return null;
  }

  const cosine = Math.min(Math.max(dot / (mag1 * mag2), -1), 1);
  return toDegrees(Math.acos(cosine));
}

function pickLeg(landmarks: NormalizedLandmark[]) {
  const LEFT = { shoulder: 11, hip: 23, knee: 25, ankle: 27 };
  const RIGHT = { shoulder: 12, hip: 24, knee: 26, ankle: 28 };

  const sideScore = (side: typeof LEFT) => {
    const points = [side.hip, side.knee, side.ankle];
    return points.reduce((score, index) => score + (landmarks[index]?.visibility ?? 0), 0);
  };

  return sideScore(LEFT) >= sideScore(RIGHT) ? LEFT : RIGHT;
}

function clampToInt(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value);
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

    const initialize = async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (!active) {
          return;
        }

        poseRef.current = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_URL },
          delegate: "GPU",
          runningMode: "VIDEO",
          numPoses: 1,
        });

        if (!active) {
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          stream.getTracks().forEach((track) => track.stop());
          setCameraError("Unable to initialize camera resources. Please refresh and try again.");
          return;
        }

        video.srcObject = stream;
        await video.play();

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCameraError("Canvas drawing context is not available in this browser.");
          return;
        }

        const drawingUtils = new DrawingUtils(ctx);

        const syncCanvasSize = () => {
          if (!video.videoWidth || !video.videoHeight) {
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        };

        syncCanvasSize();
        video.addEventListener("loadedmetadata", syncCanvasSize, { signal: abortController.signal });
        video.addEventListener("resize", syncCanvasSize, { signal: abortController.signal });

        setInitializing(false);

        const renderLoop = () => {
          if (!poseRef.current || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(renderLoop);
            return;
          }

          const videoElement = videoRef.current;
          const nowInMs = performance.now();
          const result = poseRef.current.detectForVideo(videoElement, nowInMs);

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

            let currentKneeAngle: number | null = null;
            let currentBackAngle: number | null = null;

            if (hip && knee && ankle) {
              currentKneeAngle = vectorAngle(hip, knee, ankle);
            }

            if (shoulder && hip && knee) {
              currentBackAngle = vectorAngle(shoulder, hip, knee);
            }

            processAngles(currentKneeAngle, currentBackAngle);
          }

          ctx.restore();
          rafRef.current = requestAnimationFrame(renderLoop);
        };

        const processAngles = (kneeValue: number | null, backValue: number | null) => {
          if (kneeValue != null) {
            updateAngleState(kneeValue, "knee");
            if (kneeValue >= KNEE_DOWN_MIN && kneeValue <= KNEE_DOWN_MAX) {
              wasDownRef.current = true;
            }
            if (kneeValue >= KNEE_UP_THRESHOLD && wasDownRef.current) {
              wasDownRef.current = false;
              setRepCount((count) => count + 1);
            }
          }

          if (backValue != null) {
            updateAngleState(backValue, "back");
            setBackWarning(backValue < BACK_SAFE_THRESHOLD);
          } else {
            setBackWarning(false);
          }
        };

        const updateAngleState = (value: number, key: keyof AngleSample) => {
          const rounded = clampToInt(value);
          if (rounded == null) {
            return;
          }
          const previous = lastSampleRef.current[key];
          if (Math.abs(previous - rounded) >= 1) {
            if (key === "knee") {
              setKneeAngle(rounded);
            } else {
              setBackAngle(rounded);
            }
          }
          lastSampleRef.current[key] = rounded;
        };

        renderLoop();
      } catch (error) {
        if (error instanceof Error) {
          setCameraError(error.message);
        } else {
          setCameraError("Unexpected error while starting the camera feed.");
        }
        setInitializing(false);
      }
    };

    initialize();

    return () => {
      active = false;
      abortController.abort();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      const video = videoRef.current;
      if (video?.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
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
          <p className="text-sm leading-relaxed">
            {cameraError ?? "Starting camera and pose coach...\nGrant camera access and hold steady."}
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
