import React from "react";
import ExerciseCoach from "./ExerciseCoach";

type ExerciseRunnerProps = {
  gif: string;
  title: string;
  onClose?: () => void;
};

export default function ExerciseRunner({ gif, title, onClose }: ExerciseRunnerProps) {
  // نضمن مسار صحيح دائمًا
  const gifSrc = gif?.startsWith("/") ? gif : (gif || "/gifs/squat.gif");

  return (
    <div className="w-full">
      <div className="flex justify-between mb-3">
        <h3 className="text-xl font-bold text-[#0A6D8B]">{title}</h3>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 border rounded-xl">
            إغلاق
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_0.7fr] gap-4">

        {/* ✅ GIF يسار */}
        <div className="rounded-3xl shadow border bg-white flex items-center justify-center">
          <img
            src={gifSrc}
            alt="exercise demo"
            className="w-full h-full object-contain"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (!img.src.endsWith("/gifs/squat.gif")) {
                img.src = "/gifs/squat.gif"; // ✅ fallback
              }
            }}
          />
        </div>

        {/* ✅ المدرب يمين */}
        <div className="w-full">
          <ExerciseCoach />
        </div>
      </div>
    </div>
  );
}
