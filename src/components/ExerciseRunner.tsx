import React from "react";
import ExerciseCoach from "./ExerciseCoach"; // ← هذا هو ملف MoveNet اللي فوق

type ExerciseRunnerProps = {
  gif: string;
  title: string;
  coachType?: "squat" | "none";
  onClose?: () => void;
};

export default function ExerciseRunner({ gif, title, coachType = "squat", onClose }: ExerciseRunnerProps) {
  return (
    <div className="w-full">
      <div className="flex justify-between mb-3">
        <h3 className="text-xl font-bold">{title}</h3>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 border rounded-xl">
            إغلاق
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExerciseCoach coachType={coachType} />
        <div className="rounded-3xl shadow bg-white/5 border flex items-center justify-center">
          <img src={gif} alt="demo" className="w-full h-full object-contain" />
        </div>
      </div>
    </div>
  );
}
