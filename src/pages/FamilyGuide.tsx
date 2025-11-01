import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { sendChat } from "../lib/api";
import { useNavigate } from "react-router-dom";
import ChatReply from "../components/ChatReply";

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

const stripBoldMarkers = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").trim();

const toYoutubeSearchLink = (keywords?: string) => {
  const base = keywords?.trim() || "family sensory routine tips";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(base)}`;
};

const normalizeYoutubeLink = (url: string, fallbackKeywords?: string) => {
  const lower = url.toLowerCase();
  const isYoutube = lower.includes("youtube.com") || lower.includes("youtu.be");
  if (!isYoutube) return url;

  if (
    lower.includes("example") ||
    lower.endsWith("watch?v=") ||
    lower.includes("watch?v=example") ||
    lower.endsWith("results?search_query=")
  ) {
    return toYoutubeSearchLink(fallbackKeywords);
  }

  return url;
};

const renderInline = (text: string, fallbackKeywords?: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let remaining = text;

  const pushPlain = (segment: string) => {
    if (!segment) return;
    const urlPattern = /(https?:\/\/[^\s\)]+)/g;
    let lastIndex = 0;
    segment.replace(urlPattern, (match, _p1, offset) => {
      const url = normalizeYoutubeLink(match, fallbackKeywords);
      if (offset > lastIndex) nodes.push(segment.slice(lastIndex, offset));
      nodes.push(
        <a
          key={`url-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4"
        >
          {url}
        </a>,
      );
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < segment.length) {
      nodes.push(segment.slice(lastIndex));
    }
  };

  while (remaining.length) {
    const markdownMatch = /\[([^\]]+)\]\s*\((https?:\/\/[^\s)]+)\)/.exec(remaining);
    const boldMatch = /\*\*(.+?)\*\*/.exec(remaining);
    const urlMatch = /(https?:\/\/[^\s\)]+)/.exec(remaining);

    const matches = [
      markdownMatch ? { type: "markdown" as const, match: markdownMatch } : null,
      boldMatch ? { type: "bold" as const, match: boldMatch } : null,
      urlMatch ? { type: "url" as const, match: urlMatch } : null,
    ].filter(Boolean) as Array<{ type: "markdown" | "bold" | "url"; match: RegExpExecArray }>;

    if (!matches.length) {
      pushPlain(remaining);
      break;
    }

    const earliest = matches.reduce((prev, current) =>
      current!.match.index < prev!.match.index ? current! : prev!,
    )!;

    if (earliest.match.index > 0) {
      pushPlain(remaining.slice(0, earliest.match.index));
    }

    const [full, first, second] = earliest.match;

    if (earliest.type === "markdown") {
      const url = normalizeYoutubeLink(second, fallbackKeywords);
      nodes.push(
        <a
          key={`markdown-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4 font-medium"
        >
          {first}
        </a>,
      );
    } else if (earliest.type === "bold") {
      nodes.push(
        <span key={`bold-${nodes.length}`} className="font-semibold text-[#0A6D8B]">
          {stripBoldMarkers(first)}
        </span>,
      );
    } else {
      const url = normalizeYoutubeLink(full, fallbackKeywords);
      nodes.push(
        <a
          key={`raw-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4"
        >
          {url}
        </a>,
      );
    }

    remaining = remaining.slice(earliest.match.index + full.length);
  }

  return nodes.filter((node) => !(typeof node === "string" && node.length === 0));
};

/* ========================= الدالة الجديدة لعرض رد الشات ========================= */
const renderChatReply = (text: string, fallbackKeywords?: string): ReactNode => {
  // 1) جهّز السطور
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  type Section = { title: string; items: string[]; paras: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;

  // 2) كشف العناوين الشائعة (عربي/إنجليزي + Markdown)
  const isHeading = (s: string) => {
    const clean = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    return (
      /^صباح/.test(clean) || /^مساء/.test(clean) ||
      /^في المواقف/.test(clean) || /^إذا/.test(clean) ||
      /^نصائح/.test(clean) || /^روابط/.test(clean) ||
      /^(Power\s*Up|Cooldown|Routine)/i.test(clean) ||
      /^###\s*/.test(s) || /^\*\*(.+)\*\*$/.test(s)
    );
  };

  const normalizeTitle = (s: string) => {
    const t = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    if (/Power\s*Up/i.test(t)) return "صباحًا (Power Up)";
    if (/Cooldown/i.test(t) || /^تهدئة/.test(t) || /^مساء/.test(t)) return "مساءً (تهدئة)";
    return t;
  };

  const iconClass = (title: string) => {
    if (/^صباح/.test(title)) return { icon: "🚀", cls: "text-blue-600" };
    if (/^مساء/.test(title)) return { icon: "🌙", cls: "text-purple-600" };
    if (/^في المواقف/.test(title) || /^إذا/.test(title)) return { icon: "😣", cls: "text-orange-600" };
    return { icon: "✨", cls: "text-[#0A6D8B]" };
  };

  const pushSection = () => {
    if (current) sections.push(current);
    current = null;
  };

  // 3) بناء الأقسام: عناوين / نقاط / فقرات
  lines.forEach((line) => {
    if (isHeading(line)) {
      pushSection();
      current = { title: normalizeTitle(line), items: [], paras: [] };
      return;
    }
    if (/^[•\-]/.test(line)) {
      current ??= { title: "توصيات", items: [], paras: [] };
      current.items.push(stripBoldMarkers(line.replace(/^[•\-\s]+/, "")));
      return;
    }
    current ??= { title: "توصيات", items: [], paras: [] };
    current.paras.push(stripBoldMarkers(line));
  });
  pushSection();

  // 4) رندر منسّق
  return (
    <div className="space-y-5">
      {sections.map((sec, i) => {
        const { icon, cls } = iconClass(sec.title);
        return (
          <div key={`sec-${i}`} className="space-y-2">
            {/* عنوان القسم */}
            <h3 className={`text-lg md:text-xl font-semibold ${cls}`}>
              {icon} {sec.title}
            </h3>

            {/* فقرات */}
            {sec.paras.map((p, idx) => {
              // "عنوان: نص"
              const colon = p.indexOf(":");
              if (colon > 0 && colon < p.length - 1) {
                const head = p.slice(0, colon).trim();
                const body = p.slice(colon + 1).trim();
                return (
                  <p key={`p-${idx}`} className="text-[#4A5568] leading-relaxed">
                    <span className="font-semibold text-[#0A6D8B]">
                      {head}
                      {body ? ":" : ""}
                    </span>{" "}
                    {body ? renderInline(body, fallbackKeywords) : null}
                  </p>
                );
              }

              // رابط يوتيوب خام → زر
              if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(p)) {
                return (
                  <div key={`yt-${idx}`}>
                    <a
                      href={normalizeYoutubeLink(p, fallbackKeywords)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-4 py-2 rounded-lg border border-[#0A6D8B] text-[#0A6D8B] hover:bg-[#E6F4F7]"
                    >
                      🎧 فتح رابط يوتيوب
                    </a>
                  </div>
                );
              }

              // نص حر
              return (
                <p key={`p-${idx}`} className="text-[#4A5568] leading-relaxed">
                  {renderInline(p, fallbackKeywords)}
                </p>
              );
            })}

            {/* نقاط */}
            {sec.items.length > 0 && (
              <ul className="list-disc pr-5 space-y-1 text-[#4A5568]">
                {sec.items.map((it, j) => (
                  <li key={`li-${j}`}>{renderInline(it, fallbackKeywords)}</li>
                ))}
              </ul>
            )}

            {/* زر بحث يوتيوب تلقائي إذا ما فيه روابط */}
            {!sec.paras.some((p) => /https?:\/\//.test(p)) &&
              !sec.items.some((it) => /https?:\/\//.test(it)) && (
                <div className="pt-1">
                  <a
                    href={toYoutubeSearchLink(fallbackKeywords || "موسيقى مريحة")}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-4 py-2 rounded-lg border border-[#0A6D8B] text-[#0A6D8B] hover:bg-[#E6F4F7]"
                  >
                    🎧 اقتراح: بحث يوتيوب مناسب
                  </a>
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
};
/* ======================= نهاية تعديل تنسيق ردود الشات ======================= */

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

  const buildPrompt = () => {
    const { sound, touch, light, activities } = responses;

    const labelFor = (options: Option[], value: string) =>
      options.find((option) => option.value === value)?.label || "غير محدد";

    const lines = [
      "ملخص استبيان الأسرة:",
      `- التفاعل مع الأصوات: ${labelFor(SOUND_OPTIONS, sound)}`,
      `- تفضيلات اللمس: ${labelFor(TOUCH_OPTIONS, touch)}`,
      `- الحساسية للضوء أو الألوان: ${labelFor(LIGHT_OPTIONS, light)}`,
      `- الأنشطة اللي يميل لها: ${activities.trim() || "غير محدد"}`,
      "",
      "أبي توصيات سريعة باللهجة السعودية، واضحة جدًا ومختصرة.",
      "قسّم الرد إلى الأقسام التالية:",
      "• صباحًا (Power Up): نشاط أو نشاطين يرفعون الطاقة مع فكرة حسية مناسبة.",
      "• مساءً (تهدئة): روتين يخفف التوتر قبل النوم.",
      "• في المواقف الصعبة: مثال واضح مثل إذا غطى أذانه في السوق، وش نسوي خطوة بخطوة.",
      "أدخل رابط يوتيوب واحد على الأقل بصيغة بحث (https://www.youtube.com/results?search_query=...) بكلمات مفتاحية واضحة، وتجنب روابط تجريبية أو example.",
      "خل كل قسم ما يتعدى خمس أسطر، ولا تعيد كتابة نص الأسئلة.",
    ];

    return lines.join("\n");
  };

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
          "أعطني أفكار إضافية بنفس تقسيم صباحًا/مساءً/مواقف صعبة وبنفس اللهجة، ويفضل تضيف روابط يوتيوب إضافية إذا لقيت شيء مناسب.",
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

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#F0F8FA] to-[#FFFFFF] text-gray-800 flex flex-col items-center py-12"
      dir="rtl"
    >

    <header className="absolute top-0 left-0 right-0 flex justify-between items-center px-12 py-6">
      {/* زر الرئيسية على اليمين */}
        <button
          onClick={() => navigate("/")}
          className="text-lg font-semibold text-[#0A6D8B] hover:text-[#18A4B8] transition ml-auto"
        >
          الرئيسية
        </button>

        {/* شعار Armonia على اليسار */}
        <button
          onClick={() => navigate("/")}
          className="text-2xl font-bold text-[#0A6D8B] hover:text-[#18A4B8] transition mr-auto"
        >
          Armonia
        </button>
      </header>

      <h1 className="text-3xl font-bold text-[#0A6D8B] mb-6">دليل الأسرة الذكي</h1>

      {!showResult ? (
        <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-lg space-y-6">
          <p className="text-lg text-[#4A5568] text-center mb-4">
            عبّوا البيانات التالية عشان يجهز المساعد توصيات تناسب الروتين اليومي لأسرتكم:
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
            placeholder="ما الأنشطة التي يفضلها؟ اذكر ألعاب أو حركات يحبها."
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
            {loading ? "قاعدين نجهز التوصيات..." : "طلّع التوصيات"}
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

          <div className="bg-[#F7FAFC] border border-[#E2E8F0] rounded-lg p-5 space-y-2 text-right text-sm md:text-base">
            {renderChatReply(analysis, responses.activities)}
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={handleMoreTips}
              disabled={loading}
              className="bg-[#0A6D8B] text-white px-6 py-2 rounded-lg hover:bg-[#085A73] disabled:opacity-50"
            >
              {loading ? "نحدّث الأفكار..." : "نبي أفكار زيادة"}
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
