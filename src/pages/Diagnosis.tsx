import React, { useEffect, useMemo, useState } from "react";
import ChatBox from "../components/ChatBox";
import ExerciseCard from "../components/ExerciseCard";
import {
  getExercisesByMuscle,
  findExerciseByName,
  type Exercise,
} from "../data/exercises";

export default function DiagnosisPage() {
  const [muscle, setMuscle] = useState<string>("");
  const isThighs = muscle.toLowerCase() === "thighs";

  // قائمة التمارين حسب العضلة المختارة
  const muscleExercises = useMemo<Exercise[]>(
    () => (isThighs ? getExercisesByMuscle("thighs") : []),
    [isThighs]
  );

  // تمرين افتراضي (أول عنصر)
  const defaultExercise = useMemo<Exercise | null>(
    () => (muscleExercises.length ? muscleExercises[0] : null),
    [muscleExercises]
  );

  // التمرين الذي سنعرضه تحت الشات (يُستبدل عند اقتراح الشات)
  const [recommended, setRecommended] = useState<Exercise | null>(null);

  // في كل مرة تتغير العضلة المختارة نرجّع الافتراضي
  useEffect(() => {
    if (!muscle) {
      setRecommended(null);
      return;
    }
    setRecommended(defaultExercise);
  }, [muscle, defaultExercise]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* شات المدرب + التمرين المقترح تحته */}
      <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4">
        <ChatBox
          // لو API الشات ذكر تمرين بالاسم، نلتقطه هنا
          onSuggestedExercise={(name) => {
            // نحاول نطابق الاسم مع قاعدة البيانات
            const hit =
              findExerciseByName(name) ||
              // إن ما وجدنا اسمًا مطابقًا، خذ الافتراضي حسب العضلة الحالية
              defaultExercise ||
              null;
            setRecommended(hit);
          }}
        />

        {/* اختيار العضلة (يبقى فوق النصائح والتمرين) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            حدّد العضلة
          </label>
          <select
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            className="border px-3 py-2 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          >
            <option value="">— اختر —</option>
            <option value="thighs">الفخذ</option>
          </select>
        </div>

        {/* نصائح مختصرة حسب العضلة المختارة (تظهر فوق التمرين) */}
        {isThighs && (
          <div className="p-4 border rounded-3xl bg-[#F8FAFC]">
            <h2 className="text-xl font-bold mb-2 text-[#0A6D8B]">
              نصائح للفخذ
            </h2>
            <ul className="list-disc ms-5 text-sm text-gray-700 space-y-1">
              <li>ابدأ بإحماء خفيف 3–5 دقائق.</li>
              <li>لا تتجاهل الألم الحاد — توقف فورًا عند زيادته.</li>
              <li>حافظ على استقامة الظهر أثناء السكوات.</li>
            </ul>
          </div>
        )}

        {/* بطاقة التمرين المقترح (GIF + زر Start يفتح الكاميرا مع المصحّح) */}
        {recommended && (
          <>
            <h3 className="text-base md:text-lg font-semibold text-[#0A6D8B]">
              تمرين مقترح بناءً على اختيارك:
            </h3>
            <ExerciseCard exercise={recommended} />
          </>
        )}
      </div>
    </div>
  );
}
