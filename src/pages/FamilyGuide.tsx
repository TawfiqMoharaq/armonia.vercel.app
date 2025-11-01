// src/pages/FamilyGuide.tsx
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { sendChat } from "../lib/api";

/* ============================== النماذج والخيارات ============================== */
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

const INITIAL_STATE: SurveyState = { sound: "", touch: "", light: "", activities: "" };

/* ===================== أدوات صغيرة للتنظيف والتنميط ===================== */
const stripBold = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").trim();

/* ========================= عرض الرد برابط يوتيوب واحد فقط ========================= */
const renderChatReply = (text: string, fallbackKeywords?: string): ReactNode => {
  // احذف أي روابط من النص
  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  const stripUrls = (s: string) => s.replace(URL_RE, "").replace(/\s{2,}/g, " ").trim();

  // حافظ على **العناصر الغامقة** فقط واحذف الروابط
  const renderInlineNoLinks = (s: string) => {
    const out: ReactNode[] = [];
    let rest = stripUrls(s);
    while (rest.length) {
      const m = /\*\*(.+?)\*\*/.exec(rest);
      if (!m) {
        out.push(rest);
        break;
      }
      if (m.index > 0) out.push(rest.slice(0, m.index));
      out.push(
        <span key={`b-${out.length}`} className="font-semibold text-[#0A6D8B]">
          {m[1]}
        </span>
      );
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  };

  type Section = { title: string; paras: string[]; items: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const isHeading = (s: string) => {
    const clean = stripBold(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    return (
      /^صباح/.test(clean) || /^مساء/.test(clean) || /^تهدئة/.test(clean) ||
      /^في المواقف/.test(clean) || /^إذا/.test(clean) ||
      /Power\s*Up/i.test(clean) || /Cooldown/i.test(clean)
    );
  };

  const normalizeTitle = (t: string) => {
    const x = stripBold(t.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    if (/Power\s*Up/i.test(x) || /^صباح/.test(x)) return "صباحًا (Power Up)";
    if (/Cooldown/i.test(x) || /^تهدئة/.test(x) || /^مساء/.test(x)) return "مساءً (تهدئة)";
    if (/^في المواقف/.test(x) || /^إذا/.test(x)) return "في المواقف الصعبة";
    return x || "توصيات";
  };

  const push = () => { if (current) sections.push(current); current = null; };

  lines.forEach((line) => {
    if (isHeading(line)) {
      push();
      current = { title: normalizeTitle(line), paras: [], items: [] };
      return;
    }
    if (/^([•\-–—]|\d+[.)\-،]|[\u0660-\u0669]+[.)\-،])\s*/.test(line)) {
      current ??= { title: "توصيات", paras: [], items: [] };
      current.items.push(stripUrls(line.replace(/^([•\-–—]|\d+[.)\-،]|[\u0660-\u0669]+[.)\-،])\s*/, "")));
      return;
    }
    current ??= { title: "توصيات", paras: [], items: [] };
    current.paras.push(stripUrls(line));
  });
  push();

  // رندر الأقسام بدون أي روابط داخلية
  return (
    <div className="space-y-5">
      {sections.map((sec, i) => {
        // ألوان العناوين لكل قسم
        let titleCls = "text-[#0A6D8B]";
        if (/^صباح/.test(sec.title)) titleCls = "text-[#00A6A6]";
        else if (/^مساء|تهدئة/.test(sec.title)) titleCls = "text-[#7E60BF]";
        else if (/^في المواقف|^إذا/.test(sec.title)) titleCls = "text-[#E07A3F]";

        return (
          <div key={`sec-${i}`} className="space-y-2">
            <h3 className={`text-lg md:text-xl font-semibold ${titleCls}`}>{sec.title}</h3>

            {sec.paras.map((p, idx) => {
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
                    {body ? renderInlineNoLinks(body) : null}
                  </p>
                );
              }
              return (
                <p key={`p-${idx}`} className="text-[#4A5568] leading-relaxed">
                  {renderInlineNoLinks(p)}
                </p>
              );
            })}

            {sec.items.length > 0 && (
              <ul className="list-disc pr-5 space-y-1 text-[#4A5568]">
                {sec.items.map((it, j) => (
                  <li key={`li-${j}`}>{renderInlineNoLinks(it)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* زر يوتيوب واحد فقط في الأسفل */}
      <div className="pt-2 border-t border-[#E2E8F0] mt-2">
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
            (fallbackKeywords && fallbackKeywords.trim()) || "تمارين تنفس للاسترخاء"
          )}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block px-4 py-2 rounded-lg border border-[#0A6D8B] text-[#0A6D8B] hover:bg-[#E6F4F7]"
        >
          🎧 اقتراح: بحث يوتيوب مناسب
        </a>
      </div>
    </div>
  );
};
/* ======================= نهاية: رابط يوتيوب واحد ======================= */

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
    const labelFor = (opts: Option[], val: string) => opts.find((o) => o.value === val)?.label || "غير محدد";

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
      // لاحظ: ما نطلب إدراج روابط داخلية — بنضيف زر واحد لاحقًا من الواجهة
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
      setError("تعذّر إتمام الطلب، جرّب مرة ثانية.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoreTips = async () => {
    if (!sessionId) return handleAnalyze();
    setLoading(true);
    setError(null);
    try {
      const reply = await sendChat({
        session_id: sessionId,
        user_message:
          "أعطني أفكار إضافية بنفس تقسيم صباحًا/مساءً/مواقف صعبة وبنفس اللهجة، بدون روابط داخل النص.",
        context: { muscles: [] },
        language: "ar",
      });
      setAnalysis((prev) => `${prev}\n\n${reply.reply.trim()}`.trim());
    } catch (err) {
      console.error("Family guide extra tips failed", err);
      setError("تعذّر جلب أفكار إضافية.");
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
    <div className="min-h-screen bg-gradient-to-b from-[#F0F8FA] to-[#FFFFFF] text-gray-800 flex flex-col items-center py-12" dir="rtl">
      <header className="absolute top-0 left-0 right-0 flex justify-between items-center px-12 py-6">
        <button onClick={() => navigate("/")} className="text-lg font-semibold text-[#0A6D8B] hover:text-[#18A4B8] transition ml-auto">
          الرئيسية
        </button>
        <button onClick={() => navigate("/")} className="text-2xl font-bold text-[#0A6D8B] hover:text-[#18A4B8] transition mr-auto">
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
              {SOUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
              {TOUCH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
              {LIGHT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
          <h2 className="text-2xl font-semibold text-[#0A6D8B] text-center">توصيات سريعة لعائلتكم</h2>

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
