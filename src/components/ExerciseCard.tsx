import React, { useMemo, useState } from "react";
import ExerciseRunner from "./ExerciseRunner";
import type { Exercise } from "../data/exercises";

type ExerciseCardProps = { exercise: Exercise };

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [start, setStart] = useState(false);

  const gifSrc: string | null = useMemo(() => {
    const raw =
      ((exercise as any).gif as string | undefined) ??
      ((exercise as any).demoGif as string | undefined) ??
      null;
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const cleaned = raw.replace(/^public\//, "");
    return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  }, [exercise]);

  // عند البدء: نعرض الـRunner فل-بليد بدون أي كارد إضافي
  if (start && exercise.coachType === "squat") {
    return (
      <div className="mt-3">
        <ExerciseRunner
          title={exercise.name}
          gif={gifSrc}
          variant="flat"            // ← هنا السحر
          onClose={() => setStart(false)}
        />
      </div>
    );
  }

  // الكارد الخفيف قبل البدء
  return (
    <div className="p-0 bg-transparent border-none shadow-none">
      <div className="flex gap-4 items-start">
        {gifSrc && (
          <img
            src={gifSrc}
            alt={exercise.name || "demo"}
            className="w-36 rounded-xl object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-2xl shadow hover:bg-blue-700"
            >
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
