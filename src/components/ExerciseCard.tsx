import React, { useState } from "react";
import ExerciseRunner from "./ExerciseRunner";
import type { Exercise } from "../data/exercises";

type ExerciseCardProps = { exercise: Exercise; };

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [start, setStart] = useState(false);
  const canCoach = (exercise.coachType ?? "none") !== "none";

  if (start && canCoach) {
    return (
      <ExerciseRunner
        title={exercise.name}
        gif={exercise.gif}
        coachType={exercise.coachType}
        onClose={() => setStart(false)}
      />
    );
  }

  return (
    <div className="p-4 border rounded-3xl shadow bg-white/5">
      <div className="flex gap-4">
        <img src={exercise.gif} alt="" className="w-36 h-36 object-contain rounded-xl bg-white" />
        <div className="flex-1">
          <h3 className="text-lg font-bold">{exercise.name}</h3>
          <ul className="list-disc ms-5 mt-2 text-sm">
            {exercise.tips.map((tip, index) => (<li key={index}>{tip}</li>))}
          </ul>

          {canCoach && (
            <button
              onClick={() => setStart(true)}
              className="mt-3 px-4 py-2 bg-black text-white rounded-2xl shadow"
            >
              ابدأ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
