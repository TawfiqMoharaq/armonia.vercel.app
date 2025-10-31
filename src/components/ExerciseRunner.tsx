import React from "react";
import ExerciseCoach from "./ExerciseCoach";

type ExerciseRunnerProps = {
  gif?: string | null;   // اختياري
  title: string;
  onClose?: () => void;
};

export default function ExerciseRunner({ gif, title, onClose }: ExerciseRunnerProps) {
  const hasGif = !!gif && typeof gif === "string";

  return (
    <div className="w-full">
      {/* العنوان + إغلاق */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-bold text-[#0A6D8B]">{title}</h3>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 border rounded-xl">
            إغلاق
          </button>
        )}
      </div>

      {/* تخطيط: يسار (كاميرا مصغّرة) | يمين (GIF) */}
      <div
        className={
          hasGif
            ? // md+: عمودان، يسار 380px ثابت للكاميرا، يمين بقية العرض للـ GIF
              "grid gap-4 md:grid-cols-[380px_minmax(0,1fr)] md:items-start"
            : // بدون GIF: عنصر واحد
              "grid gap-4"
        }
      >
        {/* يسار: الكاميرا مصغّرة */}
        <div className="w-full md:w-[380px]">
          {/* نمرّر compact لتصغير إطار الكاميرا داخليًا */}
          <ExerciseCoach compact />
        </div>

        {/* يمين: GIF (إن وُجد) */}
        {hasGif && (
          <div className="rounded-3xl shadow border bg-white/90 flex items-center justify-center p-2">
            <img
              src={gif!}
              alt="exercise demo"
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
