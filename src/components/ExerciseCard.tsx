import React, { useMemo, useState } from "react";
import ExerciseRunner from "./ExerciseRunner";
import type { Exercise } from "../data/exercises";

type ExerciseCardProps = { exercise: Exercise };

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [start, setStart] = useState(false);

  // 🔧 تطبيع مسار الـGIF:
  const gifSrc: string | null = useMemo(() => {
    const raw =
      ((exercise as any).gif as string | undefined) ??
      ((exercise as any).demoGif as string | undefined) ??
      null;

    if (!raw) return null;

    // خارجي؟ اتركه كما هو
    if (/^https?:\/\//i.test(raw)) return raw;

    // شل كلمة public/ إن وجدت، وتأكّد من القوس الأمامي
    const cleaned = raw.replace(/^public\//, "");
    return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  }, [exercise]);

  if (start && exercise.coachType === "squat") {
    return (
      <ExerciseRunner
        title={exercise.name}
        gif={gifSrc} // ← قد تكون null: Runner سيعرض المدرب فقط
        onClose={() => setStart(false)}
      />
    );
  }

  return (
    <div className="p-4 border rounded-3xl shadow bg-white/5">
      <div className="flex gap-4">
        {/* لا نعرض صورة المعاينة إلا إذا فيه GIF فعلاً */}
        {gifSrc && (
          <img
            src={gifSrc}
            alt={exercise.name || "demo"}
            className="w-36 rounded-xl object-contain"
            // إن تعطّل الرابط نخفي الصورة بدل فallback:
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        <div className="flex-1">
          <h3 className="text-lg font-bold">{exercise.name}</h3>

          {Array.isArray(exercise.tips) && exercise.tips.length > 0 && (
            <ul className="list-disc ms-5 mt-2 text-sm">
              {exercise.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
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
