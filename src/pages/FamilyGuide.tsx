// src/pages/FamilyGuide.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendChat } from "../lib/api";
import {
  parseReply,
  renderInline,
  stripBoldMarkers,
  toYoutubeSearchLink,
} from "../lib/chatFormat";

interface SurveyState {
  sound: string;
  touch: string;
  light: string;
  activities: string;
}

interface Option {
  value: string;
  label: string;
}

const SOUND_OPTIONS: Option[] = [
  { value: "sound-sensitive", label: "يتوتر من الأصوات العالية ويبحث عن زاوية هادية" },
  { value: "sound-prep", label: "يتقبل الأصوات إذا نبهناه قبلها وكان الصوت متوسط" },
  { value: "sound-seeker", label: "يستمتع بالأصوات والحركة وما يمانع الازدحام" },
];

const TOUCH_OPTIONS: Option[] = [
  { value: "touch-loving", label: "يحب اللمس والضغط الخفيف ويطمنه الحضن" },
  { value: "touch-avoid", label: "يتضايق من اللمس المفاجئ ويفضل مساحته الخاصة" },
  { value: "touch-selective", label: "يرتاح للمس إذا كان من الأشخاص المقرّبين فقط" },
];

const LIGHT_OPTIONS: Option[] = [
  { value: "light-sensitive", label: "يتعب من الإضاءة القوية أو الألوان الفاقعة" },
  { value: "light-neutral", label: "مرتاح غالبًا، إلا إذا المكان مظلم مرّة" },
  { value: "light-happy", label: "يستمتع بالألوان والإضاءة القوية" },
];

const INITIAL_STATE: SurveyState = {
  sound: "",
  touch: "",
  light: "",
  activities: "",
};

const FamilyGuide = () => {
  const navigate = useNavigate();
  const [responses, setResponses] = useState<SurveyState>(INITIAL_STATE);
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setResponses((prev) => ({ ...prev, [name]: value }));
  };

  /* ===================== برمبت موجّه للأسرة باللهجة السعودية ===================== */
  const buildPrompt = () => {
    const { sound, touch, light, activities } = responses;

    const labelFor = (options: Option[], value: string) =>
      options.find((option) => option.value === value)?.label || "غير محدد";

    const lines = [
      "ملخص عن تفضيلات الطفل الحسية (للاستخدام العائلي فقط):",
      `- الأصوات: ${labelFor(SOUND_OPTIONS, sound)}`,
      `- اللمس: ${labelFor(TOUCH_OPTIONS, touch)}`,
      `- الإضاءة/الألوان: ${labelFor(LIGHT_OPTIONS, light)}`,
      `- الأنشطة المفضلة: ${activities.trim() || "غير محدد"}`,
      "",
      "أعطني توصيات عملية موجّهة للأسرة باللهجة السعودية، بدون تشخيص طبي، وبأسلوب واضح جدًا.",
      "كل الجُمل موجّهة للأهل: (ساعدوا طفلكم… وفّروا… جرّبوا… لاحظوا…). لا توجه الكلام للطفل.",
      "",
      "قسّم الرد إلى ثلاث أقسام واضحة:",
      "1) صباحًا (Power Up): كيف نساعد الطفل يبدأ يومه بنشاط بدون إرهاق حسي.",
      "2) مساءً (تهدئة): خطوات تساعد الطفل يخفّف التوتر قبل النوم.",
      "3) في المواقف الصعبة: ماذا يفعل الأهل إذا توتر الطفل (مثل تغطية الأذنين/الزحمة/الإضاءة القوية).",
      "",
      "قواعد الكتابة:",
      "- نقاط قصيرة وعملية (3–5 نقاط لكل قسم).",
      "- أمثلة واقعية داخل البيت وخارجه.",
      "- لا تضع أي روابط داخل النص. لا تكرر العناوين.",
      "- لا تستخدم الإنجليزية داخل المتن.",
    ];

    return lines.join("\n");
  };

  /* ============================= استدعاء الـ API ============================= */
  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const reply = await sendChat({
        session_id: sessionId,
        user_message: buildPrompt(),
        context: { muscles: [] },
        language: "ar",
      });
      setSessionId(reply.session_id);
      setAnalysis(reply.reply.trim());
      setShowResult(true);
    } catch (err) {
      console.error("Family guide chat failed", err);
      setError("تعذّر إكمال الطلب، جرّب مرة ثانية بعد لحظات.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoreTips = async () => {
    if (!sessionId) {
      await handleAnalyze();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reply = await sendChat({
        session_id: sessionId,
        user_message:
          "أعطني أفكار إضافية للأهل بنفس التقسيم (صباحًا/مساءً/مواقف صعبة) وبنفس اللهجة، بدون روابط داخل النص.",
        context: { muscles: [] },
        language: "ar",
      });
      setAnalysis((prev) => `${prev}\n\n${reply.reply.trim()}`.trim());
    } catch (err) {
      console.error("Family guide extra tips failed", err);
      setError("تعذّر جلب أفكار إضافية، حاول بعد قليل.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResponses(INITIAL_STATE);
    setShowResult(false);
    setAnalysis("");
    setSessionId(null);
    setError(null);
  };

  const hasInput = useMemo(
    () =>
      responses.sound.trim().length > 0 &&
      responses.touch.trim().length > 0 &&
      responses.light.trim().length > 0,
    [responses.light, responses.sound, responses.touch],
  );

  /* ======================== رندر النتيجة + زر يوتيوب واحد ======================== */
  const sections = useMemo(() => parseReply(analysis), [analysis]);
  const youtubeSearch = useMemo(
    () => toYoutubeSearchLink(responses.activities || "روتين حسي مريح للأسرة"),
    [responses.activities],
  );

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#F0F8FA] to-[#FFFFFF] text-gray-800 flex flex-col items-center py-12"
      dir="rtl"
    >
      <header className="absolute top-0 left-0 right-0 flex justify-between items-center px-12 py-6">
        <button
          onClick={() => navigate("/")}
          className="text-lg font-semibold text-[#0A6D8B] hover:text-[#18A4B8] transition ml-auto"
        >
          الرئيسية
        </button>
        <button
          onClick={() => navigate("/")}
          className="text-2xl font-bold text-[#0A6D8B] hover:text-[#18A4B8] transition mr-auto"
        >
          Armonia
        </button>
      </header>

      <h1 className="text-3xl font-bold text-[#0A6D8B] mb-2">دليل الأسرة الذكي</h1>
      <p className="text-sm text-[#4A5568] mb-6">
        ✨ دليل عملي يساعدكم تفهمون احتياجات طفلكم الحسية وتتعامَلون معها براحة.
      </p>

      {!showResult ? (
        <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-lg space-y-6">
          <p className="text-lg text-[#4A5568] text-center mb-4">
            عبّوا البيانات التالية عشان نجهّز توصيات تناسب روتين أسرتكم:
          </p>

          <label className="block text-sm font-medium text-[#2D3748]">
            كيف يتفاعل مع الأصوات؟
            <select
              name="sound"
              value={responses.sound}
              onChange={handleChange}
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {SOUND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-[#2D3748]">
            هل يحب اللمس أم يتجنبه؟
            <select
              name="touch"
              value={responses.touch}
              onChange={handleChange}
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {TOUCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-[#2D3748]">
            هل يتضايق من الضوء أو الألوان؟
            <select
              name="light"
              value={responses.light}
              onChange={handleChange}
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {LIGHT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <textarea
            name="activities"
            value={responses.activities}
            onChange={handleChange}
            placeholder="ما الأنشطة التي يفضلها الطفل؟ (ألعاب، حركات، موسيقى...)"
            className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
            rows={3}
          />

          {error && (
            <div className="rounded-lg border border-[#F87171] bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!hasInput || loading}
            className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-8 py-3 rounded-lg hover:opacity-90 w-full font-semibold disabled:opacity-50"
          >
            {loading ? "نجهّز التوصيات للأسرة..." : "طلّع التوصيات"}
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-lg space-y-6">
          <h2 className="text-2xl font-semibold text-[#0A6D8B] text-center">
            توصيات سريعة لعائلتكم
          </h2>

          {error && (
            <div className="rounded-lg border border-[#F87171] bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C] text-center">
              {error}
            </div>
          )}

          <div className="bg-[#F7FAFC] border border-[#E2E8F0] rounded-lg p-5 space-y-5 text-right text-sm md:text-base">
            {/* الأقسام بدون أيقونات، ألوان بحسب العنوان */}
            {sections.map((sec, i) => (
              <div key={`sec-${i}`} className="space-y-2">
                <h3
                  className={`text-lg md:text-xl font-semibold ${
                    /^صباح/.test(sec.title)
                      ? "text-[#0A6D8B]"
                      : /^مساء|تهدئة/.test(sec.title)
                      ? "text-purple-600"
                      : /^في المواقف|إذا/.test(sec.title)
                      ? "text-orange-600"
                      : "text-[#0A6D8B]"
                  }`}
                >
                  {stripBoldMarkers(sec.title)}
                </h3>

                {sec.paras.map((p, idx) => (
                  <p key={`p-${idx}`} className="text-[#4A5568] leading-relaxed">
                    {renderInline(p)}
                  </p>
                ))}

                {sec.items.length > 0 && (
                  <ul className="list-disc pr-5 space-y-1 text-[#4A5568]">
                    {sec.items.map((it, j) => (
                      <li key={`li-${j}`}>{renderInline(it)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {/* زر يوتيوب واحد فقط في الأسفل */}
            <div className="pt-2 text-center">
              <a
                href={youtubeSearch}
                target="_blank"
                rel="noreferrer"
                className="inline-block px-4 py-2 rounded-lg border border-[#0A6D8B] text-[#0A6D8B] hover:bg-[#E6F4F7]"
              >
                🎧 اقتراح: بحث يوتيوب مناسب
              </a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={handleMoreTips}
              disabled={loading}
              className="bg-[#0A6D8B] text-white px-6 py-2 rounded-lg hover:bg-[#085A73] disabled:opacity-50"
            >
              {loading ? "نحدّث الأفكار..." : "أفكار إضافية للأهل"}
            </button>
            <button
              onClick={handleReset}
              className="bg-white border border-[#0A6D8B] text-[#0A6D8B] px-6 py-2 rounded-lg hover:bg-[#E6F4F7]"
            >
              تعديل البيانات
            </button>
          </div>
        </div>
      )}

      <footer className="mt-10 text-sm text-[#4A5568]">
        لأي استفسار تواصلوا معنا على{" "}
        <a href="mailto:ai.armonia.sa@gmail.com" className="text-[#0A6D8B] font-medium">
          ai.armonia.sa@gmail.com
        </a>
      </footer>
    </div>
  );
};

export default FamilyGuide;
