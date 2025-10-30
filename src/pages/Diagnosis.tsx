import React, { useEffect, useMemo, useState } from "react";
import ChatBox from "../components/ChatBox";
import ExerciseCard from "../components/ExerciseCard";
import {
  getExercisesByMuscle,
  findExerciseByName,
  type Exercise,
} from "../data/exercises";

import { BODY_MAPS, type BodySideKey } from "../data/bodyMaps";

// ======= أنواع وواجهات بسيطة =======
type MuscleContext = {
  muscle_ar: string;
  muscle_en: string;
  region?: string;
  prob?: number;
};

interface CircleSelection {
  cx: number; // 0..1 كنسبة عرض الصورة
  cy: number; // 0..1 كنسبة ارتفاع الصورة
  radius: number; // نصف القطر كنسبة من العرض
}

// ======= ثوابت واجهة المستخدم =======
const SIDE_LABELS: Record<BodySideKey, string> = {
  front: "الجزء الأمامي",
  back: "الجزء الخلفي",
};

const DEFAULT_CIRCLE: CircleSelection = {
  cx: 0.5,
  cy: 0.45,
  radius: 0.07,
};

const BADGE_CLASSES = ["border-[#0A6D8B]", "border-[#18A4B8]", "border-[#7C3AED]"];

// ======= أداة مساعدة: أقرب العضلات لمركز الدائرة =======
function rankMuscles(side: BodySideKey, selection: CircleSelection): MuscleContext[] {
  const mapData = BODY_MAPS[side];
  if (!mapData) return [];
  const entries = mapData.items.map((item) => {
    const [x1, y1, x2, y2] = item.box_norm;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const dist = Math.hypot(centerX - selection.cx, centerY - selection.cy);
    return { item, dist };
  });
  entries.sort((a, b) => a.dist - b.dist);
  const top = entries.slice(0, 3);
  if (!top.length) return [];
  const sum = top.reduce((acc, t) => acc + 1 / (t.dist + 1e-6), 0);
  return top.map(({ item, dist }) => ({
    muscle_ar: item.name_ar,
    muscle_en: item.name_en,
    region: item.region,
    prob: Number(((1 / (dist + 1e-6)) / sum).toFixed(4)),
  }));
}

export default function DiagnosisPage() {
  // ======= حالة المجسّم وتحديد المكان =======
  const [side, setSide] = useState<BodySideKey>("front");
  const [circle, setCircle] = useState<CircleSelection>(DEFAULT_CIRCLE);
  const map = BODY_MAPS[side];

  // أقرب العضلات (Top-3)
  const rankedResults = useMemo(() => rankMuscles(side, circle), [side, circle]);

  // ======= اختيار العضلة (يُستخدم لعرض التمرين الافتراضي إن ما جاء اقتراح من الشات) =======
  const [muscle, setMuscle] = useState<string>("");
  // تلقائيًا: إذا كان ضمن النتائج كلمة thigh نختار الفخذ
  useEffect(() => {
    const hasThigh = rankedResults.some((r) =>
      (r.muscle_en ?? "").toLowerCase().includes("thigh")
    );
    if (hasThigh) setMuscle("thighs");
  }, [rankedResults]);

  const isThighs = muscle.toLowerCase() === "thighs";
  const muscleExercises = useMemo<Exercise[]>(
    () => (isThighs ? getExercisesByMuscle("thighs") : []),
    [isThighs]
  );
  const defaultExercise = useMemo<Exercise | null>(
    () => (muscleExercises.length ? muscleExercises[0] : null),
    [muscleExercises]
  );

  // ======= تمرين مقترح أسفل الشات =======
  const [recommended, setRecommended] = useState<Exercise | null>(null);
  useEffect(() => {
    // عند تغيّر العضلة، رجّع الافتراضي
    if (!muscle) {
      setRecommended(null);
      return;
    }
    setRecommended(defaultExercise);
  }, [muscle, defaultExercise]);

  // ======= تفاعلات واجهة المجسّم =======
  const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = (event.clientX - rect.left) / rect.width;
    const cy = (event.clientY - rect.top) / rect.height;
    setCircle((prev) => ({
      ...prev,
      cx: Math.min(Math.max(cx, 0), 1),
      cy: Math.min(Math.max(cy, 0), 1),
    }));
  };

  const handleRadiusChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    setCircle((prev) => ({ ...prev, radius: next }));
  };

  const circleStyle = {
    width: `${Math.min(circle.radius * 2, 1) * 100}%`,
    height: `${Math.min(circle.radius * 2, 1) * 100}%`,
    left: `${Math.max(circle.cx - circle.radius, 0) * 100}%`,
    top: `${Math.max(circle.cy - circle.radius, 0) * 100}%`,
  };

  // ======= واجهة الصفحة =======
  return (
    <div className="p-6 space-y-8" dir="rtl">
      {/* شريط اختيار الجهة */}
      <div className="flex justify-center gap-3 flex-wrap">
        {(Object.keys(SIDE_LABELS) as BodySideKey[]).map((opt) => (
          <button
            key={opt}
            onClick={() => setSide(opt)}
            className={`px-5 py-2 rounded-full border font-medium transition ${
              side === opt ? "bg-[#0A6D8B] text-white" : "bg-white text-gray-700"
            }`}
            style={{ borderColor: side === opt ? "#0A6D8B" : "#CBD5F5" }}
          >
            {SIDE_LABELS[opt]}
          </button>
        ))}
      </div>

      {/* المجسّم + الدائرة + إبراز أقرب العضلات */}
      <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4">
        <h2 className="text-lg font-semibold text-[#0A6D8B]">حدّد موضع الإزعاج</h2>

        <div className="relative w-full max-w-[460px] mx-auto" style={{ aspectRatio: "2 / 3" }}>
          <img
            src={map.image}
            alt={SIDE_LABELS[side]}
            className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
          />
          <div className="absolute inset-0 cursor-crosshair" onClick={handleBodyClick} role="presentation">
            {/* دائرة المستخدم */}
            <div
              className="absolute rounded-full border-2 border-dashed border-[#0A6D8B]/80 bg-[#0A6D8B]/10 transition-all"
              style={circleStyle}
            />
            {/* إبراز أقرب 3 عضلات */}
            {rankedResults.map((data, index) => {
              const meta = map.items.find((m) => m.name_en === data.muscle_en);
              if (!meta) return null;
              const [x1, y1, x2, y2] = meta.box_norm;
              const centerX = ((x1 + x2) / 2) * 100;
              const centerY = ((y1 + y2) / 2) * 100;
              const diameter = Math.max(x2 - x1, y2 - y1) * 100 * 0.9;
              const size = Math.max(diameter, 4);
              const left = Math.min(Math.max(centerX - size / 2, 0), 100 - size);
              const top = Math.min(Math.max(centerY - size / 2, 0), 100 - size);
              const badgeCls = BADGE_CLASSES[index] ?? "border-[#14B8A6]";
              return (
                <div
                  key={data.muscle_en}
                  className={`absolute border-2 ${badgeCls} rounded-full pointer-events-none bg-[#0A6D8B]/10`}
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${size}%`,
                    height: `${size}%`,
                  }}
                  title={`${data.muscle_ar} — ${Math.round((data.prob ?? 0) * 100)}%`}
                />
              );
            })}
          </div>
        </div>

        {/* شريط تحكم نصف القطر */}
        <div className="flex items-center gap-3">
          <label htmlFor="radius" className="text-sm text-gray-600">
            قطر الدائرة (% من الصورة):
          </label>
          <input
            id="radius"
            type="range"
            min={2}
            max={16}
            value={Math.round(circle.radius * 100)}
            onChange={handleRadiusChange}
            className="flex-1"
          />
          <span className="font-medium text-[#0A6D8B] text-sm w-12 text-left">
            {Math.round(circle.radius * 100)}%
          </span>
        </div>
      </div>

      {/* كرت الشات + الدمج أسفله */}
      <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4">
        <ChatBox
          // نمرّر أقرب عضلات كـ context للشات
          musclesContext={rankedResults}
          autoStartAdvice
          autoStartPrompt={`مستوى الألم: متوسط. هذه أقرب العضلات: ${rankedResults
            .map((m) => m.muscle_ar)
            .join("، ")}. أعطني نصائح وتمارين مختصرة تراعي السلامة. إذا رشّحت تمرينًا فاكتب اسمه في حقل exercise داخل JSON.`}
          // لما الشات يذكر تمرين بالاسم، نعرضه فورًا تحت الشات
          onSuggestedExercise={(name) => {
            const hit =
              findExerciseByName(name) ||
              // لو ما تعرّفنا عليه، رجّع الافتراضي للعضلة الحالية (مثل سكوات للفخذ)
              (isThighs ? defaultExercise : null);
            setRecommended(hit);
          }}
        />

        {/* اختيار العضلة (لضبط الافتراض إذا الشات ما اقترح) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">حدّد العضلة</label>
          <select
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            className="border px-3 py-2 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          >
            <option value="">— اختر —</option>
            <option value="thighs">الفخذ</option>
          </select>
        </div>

        {/* نصائح مختصرة للفخذ تظهر إذا كانت العضلة = فخذ */}
        {isThighs && (
          <div className="p-4 border rounded-3xl bg-[#F8FAFC]">
            <h2 className="text-xl font-bold mb-2 text-[#0A6D8B]">نصائح للفخذ</h2>
            <ul className="list-disc ms-5 text-sm text-gray-700 space-y-1">
              <li>ابدأ بإحماء خفيف 3–5 دقائق.</li>
              <li>لا تتجاهل الألم الحاد — توقف فورًا عند زيادته.</li>
              <li>حافظ على استقامة الظهر أثناء السكوات.</li>
            </ul>
          </div>
        )}

        {/* بطاقة التمرين الموصى به تحت الشات مباشرة */}
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
