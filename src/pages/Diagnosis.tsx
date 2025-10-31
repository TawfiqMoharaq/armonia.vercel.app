import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ChatBox from "../components/ChatBox";
import type { MuscleContext } from "../lib/api";
import { analyzeSelection } from "../lib/api";
import { BODY_MAPS, type BodySideKey } from "../data/bodyMaps";

// ✅ إضافات: مرجع التمارين + بطاقة العرض
import ExerciseCard from "../components/ExerciseCard";
import {
  getExercisesByMuscle,
  findExerciseByName,
  type Exercise,
} from "../data/exercises";

interface CircleSelection {
  cx: number;
  cy: number;
  radius: number; // [0..1] كنسبة من أقصر بُعد للصورة
}

const HEADLINE = "حدّد موضع الإزعاج بدقّة";
const INTRO_TEXT =
  "اختر الجهة الأمامية أو الخلفية ثم اضغط على الصورة لتحديد مكان الإزعاج. غيّر حجم الدائرة إذا احتجت، وسيحاول النظام اقتراح العضلات الأقرب لتقديم نصائح وتمارين مناسبة.";
const RESULTS_TITLE = "أقرب العضلات المتأثرة";
const ERROR_MESSAGE =
  "تعذّر تحديد العضلة بدقّة، جرّب مرة أخرى أو صغّر الدائرة.";
const RADIUS_LABEL = "قطر الدائرة (% من الصورة):";
const RADIUS_HINT =
  "اضغط على الصورة لتحديد المركز، ثم استخدم شريط التمرير لتكبير/تصغير نصف القطر. إن كانت النتائج غير دقيقة، حرّك الدائرة أو صغّر نصف القطر لإعادة التحليل.";
const LOADING_LABEL = "يتم التحليل";
const EMPTY_HINT =
  "اضغط على الصورة لاختيار الموضع، ثم عدّل نصف القطر إن لزم — ستظهر هنا العضلات المحتملة.";

const SIDE_LABELS: Record<BodySideKey, string> = {
  front: "الجزء الأمامي",
  back: "الجزء الخلفي",
};

const BADGE_CLASSES = ["border-[#0A6D8B]", "border-[#18A4B8]", "border-[#7C3AED]"];

const PAIN_LEVELS = [
  { value: "none", label: "لا يوجد" },
  { value: "mild", label: "بسيط" },
  { value: "moderate", label: "متوسط" },
  { value: "severe", label: "قوي" },
] as const;

const INTENSITY_LEVELS = [
  { value: "light", label: "خفيف" },
  { value: "moderate", label: "متوسط" },
  { value: "intense", label: "قوي" },
] as const;

// 👇 بدل الدائرة الافتراضية: سنبدأ "بدون أي دائرة/تحليل"
const INITIAL_RADIUS = 0.07; // قيمة أولية تُستخدم عند أول نقرة

export default function Diagnosis() {
  const [side, setSide] = useState<BodySideKey>("front");

  // ✅ لا نضع دائرة عند البداية: null
  const [circle, setCircle] = useState<CircleSelection | null>(null);
  const [radius, setRadius] = useState(INITIAL_RADIUS); // نخزن نصف القطر بشكل منفصل لعرض السلايدر قبل رسم الدائرة

  const [results, setResults] = useState<MuscleContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [painLevel, setPainLevel] = useState<(typeof PAIN_LEVELS)[number]["value"]>("moderate");
  const [intensityLevel, setIntensityLevel] = useState<(typeof INTENSITY_LEVELS)[number]["value"]>("moderate");

  // 🧠 التفاعل البشري: لا تحليل إلا بعده
  const [userInteracted, setUserInteracted] = useState(false);

  const computeFallbackResults = (sideKey: BodySideKey, selection: CircleSelection): MuscleContext[] => {
    const mapData = BODY_MAPS[sideKey];
    if (!mapData) return [];
    const entries = mapData.items.map((item) => {
      const [x1, y1, x2, y2] = item.box_norm;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const dist = Math.hypot(centerX - selection.cx, centerY - selection.cy);
      return { item, dist };
    });
    entries.sort((a, b) => a.dist - b.dist);
    const top = entries.slice(0, 5);
    if (!top.length) return [];
    const weightSum = top.reduce((sum, current) => sum + 1 / (current.dist + 1e-6), 0);
    return top.map(({ item, dist }) => ({
      muscle_ar: item.name_ar,
      muscle_en: item.name_en,
      region: item.region,
      prob: Number(((1 / (dist + 1e-6)) / weightSum).toFixed(4)),
    }));
  };

  // 🔒 ما نحلل إلا إذا: فيه دائرة && فيه تفاعل مستخدم
  useEffect(() => {
    if (!userInteracted || !circle) return;

    const selection = { cx: circle.cx, cy: circle.cy, radius: circle.radius };
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await analyzeSelection({ side, circle: selection });
        if (!cancelled) {
          if (response.results?.length) {
            setResults(response.results);
          } else {
            const fallback = computeFallbackResults(side, selection);
            setResults(fallback);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Selection analysis failed", err);
          const fallback = computeFallbackResults(side, selection);
          if (fallback.length) {
            setResults(fallback);
            setError(null);
          } else {
            setResults([]);
            setError(ERROR_MESSAGE);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [userInteracted, side, circle?.cx, circle?.cy, circle?.radius]);

  const map = BODY_MAPS[side];

  const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = (event.clientX - rect.left) / rect.width;
    const cy = (event.clientY - rect.top) / rect.height;
    setCircle({
      cx: Math.min(Math.max(cx, 0), 1),
      cy: Math.min(Math.max(cy, 0), 1),
      radius, // نستخدم القيمة الحالية للسلايدر
    });
    setUserInteracted(true);
  };

  const handleRadiusChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    setRadius(next);
    // لو فيه دائرة مرسومة، نحدث نصف قطرها ونعتبره تفاعلًا
    setCircle((prev) => (prev ? { ...prev, radius: next } : prev));
    if (circle) setUserInteracted(true);
  };

  const circleStyle = circle
    ? {
        width: `${Math.min(circle.radius * 2, 1) * 100}%`,
        height: `${Math.min(circle.radius * 2, 1) * 100}%`,
        left: `${Math.max(circle.cx - circle.radius, 0) * 100}%`,
        top: `${Math.max(circle.cy - circle.radius, 0) * 100}%`,
      }
    : undefined;

  const rankedResults = useMemo(() => results.slice(0, 2), [results]);

  const resultWithMeta = useMemo(
    () =>
      rankedResults.map((item) => ({
        data: item,
        meta: map.items.find((candidate) => candidate.name_en === item.muscle_en),
      })),
    [rankedResults, map.items]
  );

  const painLabel = useMemo(
    () => PAIN_LEVELS.find((level) => level.value === painLevel)?.label ?? "",
    [painLevel]
  );
  const intensityLabel = useMemo(
    () => INTENSITY_LEVELS.find((level) => level.value === intensityLevel)?.label ?? "",
    [intensityLevel]
  );

  const autoStartPrompt = useMemo(() => {
    const muscleSnippet = rankedResults.length
      ? `العضلات المحددة: ${rankedResults.slice(0, 3).map((m) => m.muscle_ar).join("، ")}. `
      : "";
    return `مستوى الألم: ${painLabel}. مستوى شدة التمرين المطلوب: ${intensityLabel}. ${muscleSnippet}أعطني نصائح وتمارين مختصرة تراعي هذه المعطيات وتأكد من تذكيري بالسلامة. إذا رشّحت تمرينًا فاكتب اسمه داخل JSON بالحقل "exercise".`;
  }, [painLabel, intensityLabel, rankedResults]);

  // ===== تلقائي: نختار تمرين الفخذ إذا كانت ضمن أعلى العضلات =====
  const isThighsLikely = useMemo(
    () => rankedResults.some((r) => (r.muscle_en ?? "").toLowerCase().includes("thigh")),
    [rankedResults]
  );
  const defaultExercise: Exercise | null = useMemo(() => {
    if (!isThighsLikely) return null;
    const list = getExercisesByMuscle("thighs");
    return list.length ? list[0] : null; // Bodyweight Squat عادة
  }, [isThighsLikely]);

  // التمرين الذي سنعرضه تحت الشات (افتراضي أو من الشات)
  const [recommended, setRecommended] = useState<Exercise | null>(null);
  useEffect(() => {
    // كل ما تغيّرت نتائج المجسّم نرجّع الافتراضي (لو ما فيه اقتراح من الشات)
    if (!recommended) setRecommended(defaultExercise);
  }, [defaultExercise, recommended]);

  // عند تغيير الجهة: صفّر كل شيء
  const switchSide = (option: BodySideKey) => {
    setSide(option);
    setCircle(null);
    setRadius(INITIAL_RADIUS);
    setResults([]);
    setError(null);
    setLoading(false);
    setUserInteracted(false);
    setRecommended(null);
  };

  return (
    <div className="bg-[#F7FAFC] min-h-screen flex flex-col justify-between">
      <Navbar />

      <section className="max-w-5xl mx-auto p-6 space-y-8" dir="rtl">
        <header className="text-center space-y-3">
          <h1 className="text-2xl font-semibold text-[#0A6D8B]">{HEADLINE}</h1>
          <p className="text-gray-600 text-sm md:text-base">{INTRO_TEXT}</p>
        </header>

        <div className="flex justify-center gap-4 flex-wrap">
          {(Object.keys(SIDE_LABELS) as BodySideKey[]).map((option) => (
            <button
              key={option}
              onClick={() => switchSide(option)}
              className={`px-5 py-2 rounded-full border font-medium transition ${
                side === option ? "bg-[#0A6D8B] text-white" : "bg-white text-gray-700"
              }`}
              style={{ borderColor: side === option ? "#0A6D8B" : "#CBD5F5" }}
            >
              {SIDE_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* المجسّم */}
          <div className="bg-white border rounded-2xl shadow px-6 py-6">
            <h2 className="text-lg font-semibold text-[#0A6D8B] mb-4">حدد موضع الدائرة</h2>
            <div className="space-y-4">
              <div className="relative w-full max-w-[420px] mx-auto" style={{ aspectRatio: "2 / 3" }}>
                <img
                  src={BODY_MAPS[side].image}
                  alt={SIDE_LABELS[side]}
                  className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
                />

                <div
                  className="absolute inset-0 cursor-crosshair"
                  onClick={handleBodyClick}
                  role="presentation"
                >
                  {/* الدائرة تظهر فقط بعد أول نقرة */}
                  {circle && (
                    <div
                      className="absolute rounded-full border-2 border-dashed border-[#0A6D8B]/80 bg-[#0A6D8B]/10 transition-all"
                      style={circleStyle}
                    />
                  )}

                  {/* إبراز العضلات الأعلى فقط بعد التحليل */}
                  {circle &&
                    resultWithMeta.map(({ data, meta }, index) => {
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
                          style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, height: `${size}%` }}
                        />
                      );
                    })}

                  {/* تلميح عند عدم وجود دائرة */}
                  {!circle && (
                    <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
                      اضغط على الموضع المصاب لبدء التحديد
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor="radius" className="text-sm text-gray-600">
                  {RADIUS_LABEL}
                </label>
                <input
                  id="radius"
                  type="range"
                  min={2}
                  max={16}
                  value={Math.round((circle?.radius ?? radius) * 100)}
                  onChange={handleRadiusChange}
                  className="flex-1"
                  disabled={!circle} // 🔒 لا يتحكم قبل رسم الدائرة
                />
                <span className="font-medium text-[#0A6D8B] text-sm w-12 text-left">
                  {Math.round((circle?.radius ?? radius) * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{RADIUS_HINT}</p>
            </div>
          </div>

          {/* لوحة التحكم اليمنى */}
          <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[#0A6D8B] mb-3">مستوى الألم الحالي</h2>
              <div className="flex flex-wrap gap-3">
                {PAIN_LEVELS.map((level) => (
                  <label
                    key={level.value}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition ${
                      painLevel === level.value ? "bg-[#0A6D8B] text-white border-[#0A6D8B]" : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pain-level"
                      value={level.value}
                      checked={painLevel === level.value}
                      onChange={() => setPainLevel(level.value)}
                      className="hidden"
                    />
                    {level.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0A6D8B] mb-3">مستوى شدة التمرين المرغوب</h2>
              <div className="flex flex-wrap gap-3">
                {INTENSITY_LEVELS.map((level) => (
                  <label
                    key={level.value}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition ${
                      intensityLevel === level.value ? "bg-[#00767a] text-white border-[#00767a]" : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="intensity-level"
                      value={level.value}
                      checked={intensityLevel === level.value}
                      onChange={() => setIntensityLevel(level.value)}
                      className="hidden"
                    />
                    {level.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* قائمة أقرب العضلات */}
          <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0A6D8B]">{RESULTS_TITLE}</h2>
              {loading && <span className="text-xs text-[#0A6D8B]">{LOADING_LABEL}</span>}
            </div>

            {error && (
              <div className="rounded-lg border border-[#F87171] bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">
                {error}
              </div>
            )}

            {!error && !loading && rankedResults.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 text-center">
                {EMPTY_HINT}
              </div>
            )}

            <ul className="space-y-3 text-sm text-gray-700">
              {resultWithMeta.map(({ data }, index) => (
                <li
                  key={data.muscle_en}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-[#0A6D8B]">{data.muscle_ar}</p>
                    <p className="text-xs text-gray-500">{data.muscle_en}</p>
                    <p className="text-xs text-gray-400 mt-1">{"المنطقة: "} {data.region}</p>
                  </div>
                  <span className="text-[#18A4B8] font-semibold">
                    {Math.round((data.prob ?? 0) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ✅ كرت الشات + التمرين المدمج تحته تلقائيًا */}
        <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4">
          <ChatBox
            musclesContext={rankedResults}
            autoStartAdvice={false}                 // 🔒 لا يبدأ تلقائيًا
            autoStartPrompt={autoStartPrompt}
            sessionKey={`${painLevel}-${intensityLevel}`}
            onSuggestedExercise={(name) => {
              const hit = findExerciseByName(name) || defaultExercise || null;
              setRecommended(hit);
            }}
          />

          {recommended && (
            <>
              <hr className="border-gray-200" />
              <h3 className="text-base md:text-lg font-semibold text-[#0A6D8B]">
                تمرين مقترح بناءً على اختيارك:
              </h3>
            </>
          )}
          {recommended && <ExerciseCard exercise={recommended} />}
        </div>
      </section>

      <Footer />
    </div>
  );
}
