import React from "react";
import ExerciseCoach from "./ExerciseCoach";

type Props = {
  title: string;
  gif: string;            // لازم نمرر هذا من ExerciseCard (تم بالفعل)
  onClose: () => void;
};

export default function ExerciseRunner({ title, gif, onClose }: Props) {
  // لو جاء gif فاضي/خطأ نستخدم نسخة public
  const src = gif && gif.startsWith("/") ? gif : (gif || "/gifs/squat.gif");

  return (
    <div className="p-4 border rounded-3xl shadow bg-white">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-xl border text-gray-700 hover:bg-gray-50"
        >
          إغلاق
        </button>
        <h2 className="text-2xl font-bold text-[#0A6D8B]">{title}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* لوحة الـGIF (يسار) */}
        <div className="relative w-full rounded-3xl overflow-hidden border bg-white">
          <img
            src={src}
            alt={title || "exercise demo"}
            className="w-full h-full object-contain select-none"
            draggable={false}
            loading="eager"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (!img.src.endsWith("/gifs/squat.gif")) {
                img.src = "/gifs/squat.gif"; // fallback مضمون من public
              }
            }}
          />
        </div>

        {/* لوحة المدرب (يمين) */}
        <div className="relative">
          <ExerciseCoach />
        </div>
      </div>
    </div>
  );
}
