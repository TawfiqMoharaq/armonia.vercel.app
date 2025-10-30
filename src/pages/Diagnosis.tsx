import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ChatBox from "../components/ChatBox";
import ExerciseCard from "../components/ExerciseCard";
import type { MuscleContext } from "../lib/api";
import { analyzeSelection } from "../lib/api";
import { BODY_MAPS, type BodyMapItem, type BodySideKey } from "../data/bodyMaps";
import { getExercisesByMuscle } from "../data/exercises";

interface CircleSelection {
  cx: number;
  cy: number;
  radius: number;
}

const HEADLINE = "حدّد موضع الإزعاج بدقّة";
const INTRO_TEXT =
  "اختر الجهة الأمامية أو الخلفية ثم اضغط على الصورة لتحديد مكان الإزعاج. غيّر حجم الدائرة إذا احتجت، وسيحاول النظام اقتراح العضلات الأقرب لتقديم نصائح وتمارين مناسبة.";
const RESULTS_TITLE = "أقرب العضلات المتأثرة";
const ERROR_MESSAGE =
  "تعذّر تحديد العضلة بدقّة، جرّب مرة أخرى أو صغّر الدائرة.";
const RADIUS_LABEL = "قطر الدائرة (% من الصورة):";
const RADIUS_HINT =
  "اضغط على الصورة لتغيير مركز الدائرة. إن كانت النتائج غير دقيقة، حرّك الدائرة أو صغّر نصف القطر لإعادة التحليل.";
const LOADING_LABEL = "يتم التحليل";
const EMPTY_HINT =
  "حرّك الدائرة لتحديد موضع أوضح، ثم ستظهر العضلات المحتملة هنا.";

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

const DEFAULT_CIRCLE: CircleSelection = {
  cx: 0.5,
  cy: 0.45,
  radius: 0.07,
};

export default function Diagnosis() {
  const [side, setSide] = useState<BodySideKey>("front");
  const [circle, setCircle] = useState<CircleSelection>(DEFAULT_CIRCLE);
  const [results, setResults] = useState<MuscleContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [painLevel, setPainLevel] = useState<(typeof PAIN_LEVELS)[number]["value"]>("moderate");
  const [intensityLevel, setIntensityLevel] = useState<(typeof INTENSITY_LEVELS)[number]["value"]>("moderate");
  const [selectedMuscle, setSelectedMuscle] = useState<string>("");

  const computeFallbackResults = (sideKey: BodySideKey, selection: CircleSelection): MuscleContext[] => {
    const mapData = BODY_MAPS[sideKey];
    if (!mapData) {
      return [];
    }
    const entries = mapData.items.map((item) => {
      const [x1, y1, x2, y2] = item.box_norm;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const dist = Math.hypot(centerX - selection.cx, centerY - selection.cy);
      return { item, dist };
    });
    entries.sort((a, b) => a.dist - b.dist);
    const top = entries.slice(0, 5);
    if (!top.length) {
      return [];
    }
    const weightSum = top.reduce((sum, current) => sum + 1 / (current.dist + 1e-6), 0);
    return top.map(({ item, dist }) => ({
      muscle_ar: item.name_ar,
      muscle_en: item.name_en,
      region: item.region,
      prob: Number(((1 / (dist + 1e-6)) / weightSum).toFixed(4)),
    }));
  };

  useEffect(() => {
    const selection = { cx: circle.cx, cy: circle.cy, radius: circle.radius };
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await analyzeSelection({
          side,
          circle: selection,
        });
        if (!cancelled) {
          if (response.results.length) {
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [side, circle.cx, circle.cy, circle.radius]);

  const map = BODY_MAPS[side];

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

  const rankedResults = useMemo(() => results.slice(0, 2), [results]);

  useEffect(() => {
    if (selectedMuscle) {
      return;
    }
    const hasThigh = rankedResults.some((item) =>
      (item.muscle_en ?? "").toLowerCase().includes("thigh")
    );
    if (hasThigh) {
      setSelectedMuscle("thighs");
    }
  }, [rankedResults, selectedMuscle]);

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
      ? `العضلات المحددة: ${rankedResults
          .slice(0, 3)
          .map((muscle) => muscle.muscle_ar)
          .join("، ")}. `
      : "";

    return `مستوى الألم: ${painLabel}. مستوى شدة التمرين المطلوب: ${intensityLabel}. ${muscleSnippet}أعطني نصائح وتمارين مختصرة تراعي هذه المعطيات وتأكد من تذكيري بالسلامة.`;
  }, [painLabel, intensityLabel, rankedResults]);

  const showThighExercises = selectedMuscle.toLowerCase() === "thighs";
  const thighExercises = useMemo(
    () => (showThighExercises ? getExercisesByMuscle("thighs") : []),
    [showThighExercises]
  );

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
              onClick={() => setSide(option)}
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
          <div className="bg-white border rounded-2xl shadow px-6 py-6">
            <h2 className="text-lg font-semibold text-[#0A6D8B] mb-4">
              {"حدد موضع الدائرة"}
            </h2>
            <div className="space-y-4">
              <div className="relative w-full max-w-[420px] mx-auto" style={{ aspectRatio: "2 / 3" }}>
                <img
                  src={map.image}
                  alt={SIDE_LABELS[side]}
                  className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
                />
                <div className="absolute inset-0 cursor-crosshair" onClick={handleBodyClick} role="presentation">
                  <div
                    className="absolute rounded-full border-2 border-dashed border-[#0A6D8B]/80 bg-[#0A6D8B]/10 transition-all"
                    style={circleStyle}
                  />
                  {resultWithMeta.map(({ data, meta }, index) => {
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
                      ></div>
                    );
                  })}
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
                  value={Math.round(circle.radius * 100)}
                  onChange={handleRadiusChange}
                  className="flex-1"
                />
                <span className="font-medium text-[#0A6D8B] text-sm w-12 text-left">
                  {Math.round(circle.radius * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{RADIUS_HINT}</p>
            </div>
          </div>

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
                  <span className="text-[#18A4B8] font-semibold">{Math.round(data.prob * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-white border rounded-2xl shadow px-6 py-6">
          <ChatBox
            musclesContext={rankedResults}
            autoStartAdvice
            autoStartPrompt={autoStartPrompt}
            sessionKey={`${painLevel}-${intensityLevel}`}
          />
        </div>

        <div className="bg-white border rounded-2xl shadow px-6 py-6 space-y-4" dir="rtl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">حدد العضلة</label>
            <select
              value={selectedMuscle}
              onChange={(event) => setSelectedMuscle(event.target.value)}
              className="border px-3 py-2 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
            >
              <option value="">— اختر —</option>
              <option value="thighs">الفخذ</option>
            </select>
          </div>

          {showThighExercises && (
            <>
              <div className="p-4 border rounded-3xl bg-[#F8FAFC]">
                <h2 className="text-xl font-bold mb-2 text-[#0A6D8B]">نصائح للفخذ</h2>
                <ul className="list-disc ms-5 text-sm text-gray-700 space-y-1">
                  <li>ابدأ بإحماء خفيف</li>
                  <li>لا تتجاهل الألم الحاد</li>
                  <li>حافظ على استقامة الظهر</li>
                </ul>
              </div>

              <div className="space-y-4">
                {thighExercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
