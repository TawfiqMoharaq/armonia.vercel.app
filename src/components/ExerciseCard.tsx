import React, { useState } from "react";
import ExerciseRunner from "./ExerciseRunner";
import type { Exercise } from "../data/exercises";

type ExerciseCardProps = { exercise: Exercise };

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [start, setStart] = useState(false);

  // لا نضيف أي Fallback هنا — فقط القيمة الموجودة فعلاً في البيانات
  const gifSrc: string | null =
    ((exercise as any).gif as string | undefined) ??
    ((exercise as any).demoGif as string | undefined) ??
    null;

  if (start && exercise.coachType === "squat") {
    return (
      <ExerciseRunner
        title={exercise.name}
        gif={gifSrc}               // ← يمرر null لو ما فيه
        onClose={() => setStart(false)}
      />
    );
  }

  return (
    <div className="p-4 border rounded-3xl shadow bg-white/5">
      <div className="flex gap-4">
        {/* صورة المعاينة تُعرض فقط إذا فيه GIF */}
        {gifSrc && (
          <img
            src={gifSrc}
            alt={exercise.name || "demo"}
            className="w-36 rounded-xl object-contain"
          />
        )}

        <div className="flex-1">
          <h3 className="text-lg font-bold">{exercise.name}</h3>

          {Array.isArray(exercise.tips) && exercise.tips.length > 0 && (
            <ul className="list-disc ms-5 mt-2 text-sm">
              {exercise.tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ul>
          )}

          {exercise.coachType === "squat" && (
            <button
              onClick={() => setStart(true)}
              className="mt-3 px-4 py-2 bg-black text-white rounded-2xl shadow"
            >
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
