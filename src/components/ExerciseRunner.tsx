import React from "react";
import ExerciseCoach from "./ExerciseCoach";

type ExerciseRunnerProps = {
  gif?: string | null;   // ← صار اختياري
  title: string;
  onClose?: () => void;
};

export default function ExerciseRunner({ gif, title, onClose }: ExerciseRunnerProps) {
  const hasGif = !!gif && typeof gif === "string";

  return (
    <div className="w-full">
      <div className="flex justify-between mb-3">
        <h3 className="text-xl font-bold text-[#0A6D8B]">{title}</h3>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 border rounded-xl">إغلاق</button>
        )}
      </div>

      <div className={`grid gap-4 ${hasGif ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {/* GIF يسار (شرطي) */}
        {hasGif && (
          <div className="rounded-3xl shadow border bg-white flex items-center justify-center">
            <img
              src={gif!}
              alt="exercise demo"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* المدرب */}
        <div className="w-full">
          <ExerciseCoach />
        </div>
      </div>
    </div>
  );
}
