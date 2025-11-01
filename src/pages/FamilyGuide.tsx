import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { sendChat } from "../lib/api";
// src/pages/FamilyGuide.tsx
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { sendChat } from "../lib/api";

/* ============================== النماذج والخيارات ============================== */
interface SurveyState {
  sound: string;
  touch: string;
@@ -33,271 +34,143 @@ const LIGHT_OPTIONS: Option[] = [
  { value: "light-happy", label: "يستمتع بالألوان والإضاءة القوية" },
];

const INITIAL_STATE: SurveyState = {
  sound: "",
  touch: "",
  light: "",
  activities: "",
};

const stripBoldMarkers = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
const INITIAL_STATE: SurveyState = { sound: "", touch: "", light: "", activities: "" };

/* تحسين البحث في يوتيوب بكلمات عربية مناسبة */
const toYoutubeSearchLink = (keywords?: string) => {
  const base = (keywords && keywords.trim())
    ? `${keywords} تمارين روتين عائلي عربي بدون معدات`
    : "روتين عائلي تمارين خفيفة عربي بدون معدات";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(base)}`;
};

const normalizeYoutubeLink = (url: string, fallbackKeywords?: string) => {
  const lower = url.toLowerCase();
  const isYoutube = lower.includes("youtube.com") || lower.includes("youtu.be");
  if (!isYoutube) return url;

  // روابط تجريبية/ناقصة → نحولها لبحث
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
/* ===================== أدوات صغيرة للتنظيف والتنميط ===================== */
const stripBold = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").trim();

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
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < segment.length) {
      nodes.push(segment.slice(lastIndex));
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
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

/* ========================= تنسيق عرض رد الشات ========================= */
const renderChatReply = (text: string, fallbackKeywords?: string): ReactNode => {
  // 1) تجهيز السطور
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  type Section = { title: string; items: string[]; paras: string[] };
  type Section = { title: string; paras: string[]; items: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;

  // 2) كشف العناوين الشائعة (عربي/إنجليزي + Markdown)
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const isHeading = (s: string) => {
    const clean = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    const clean = stripBold(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    return (
      /^صباح/.test(clean) || /^مساء/.test(clean) ||
      /^صباح/.test(clean) || /^مساء/.test(clean) || /^تهدئة/.test(clean) ||
      /^في المواقف/.test(clean) || /^إذا/.test(clean) ||
      /^نصائح/.test(clean) || /^روابط/.test(clean) ||
      /^(Power\s*Up|Cooldown|Routine)/i.test(clean) ||
      /^###\s*/.test(s) || /^\*\*(.+)\*\*$/.test(s)
      /Power\s*Up/i.test(clean) || /Cooldown/i.test(clean)
    );
  };

  const normalizeTitle = (s: string) => {
    const t = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    if (/Power\s*Up/i.test(t)) return "صباحًا (Power Up)";
    if (/Cooldown/i.test(t) || /^تهدئة/.test(t) || /^مساء/.test(t)) return "مساءً (تهدئة)";
    return t;
  const normalizeTitle = (t: string) => {
    const x = stripBold(t.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
    if (/Power\s*Up/i.test(x) || /^صباح/.test(x)) return "صباحًا (Power Up)";
    if (/Cooldown/i.test(x) || /^تهدئة/.test(x) || /^مساء/.test(x)) return "مساءً (تهدئة)";
    if (/^في المواقف/.test(x) || /^إذا/.test(x)) return "في المواقف الصعبة";
    return x || "توصيات";
  };

  const pushSection = () => {
    if (current) sections.push(current);
    current = null;
  };
  const push = () => { if (current) sections.push(current); current = null; };

  // 3) بناء الأقسام: عناوين / نقاط / فقرات
  lines.forEach((line) => {
    if (isHeading(line)) {
      pushSection();
      current = { title: normalizeTitle(line), items: [], paras: [] };
      push();
      current = { title: normalizeTitle(line), paras: [], items: [] };
      return;
    }
    if (/^[•\-]/.test(line)) {
      current ??= { title: "توصيات", items: [], paras: [] };
      current.items.push(stripBoldMarkers(line.replace(/^[•\-\s]+/, "")));
    if (/^([•\-–—]|\d+[.)\-،]|[\u0660-\u0669]+[.)\-،])\s*/.test(line)) {
      current ??= { title: "توصيات", paras: [], items: [] };
      current.items.push(stripUrls(line.replace(/^([•\-–—]|\d+[.)\-،]|[\u0660-\u0669]+[.)\-،])\s*/, "")));
      return;
    }
    current ??= { title: "توصيات", items: [], paras: [] };
    current.paras.push(stripBoldMarkers(line));
    current ??= { title: "توصيات", paras: [], items: [] };
    current.paras.push(stripUrls(line));
  });
  pushSection();
  push();

  // 4) الرندر — بدون أي إيموجي
  // رندر الأقسام بدون أي روابط داخلية
  return (
    <div className="space-y-5">
      {sections.map((sec, i) => (
        <div key={`sec-${i}`} className="space-y-2">
          {/* عنوان القسم — بلا رموز */}
          <h3 className="text-lg md:text-xl font-semibold text-[#0A6D8B]">
            {sec.title}
          </h3>

          {/* فقرات */}
          {sec.paras.map((p, idx) => {
            // "عنوان: نص"
            const colon = p.indexOf(":");
            if (colon > 0 && colon < p.length - 1) {
              const head = p.slice(0, colon).trim();
              const body = p.slice(colon + 1).trim();
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
                  <span className="font-semibold text-[#0A6D8B]">
                    {head}
                    {body ? ":" : ""}
                  </span>{" "}
                  {body ? renderInline(body, fallbackKeywords) : null}
                  {renderInlineNoLinks(p)}
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
                    فتح رابط يوتيوب
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
                  اقتراح: بحث يوتيوب مناسب
                </a>
              </div>
            })}

            {sec.items.length > 0 && (
              <ul className="list-disc pr-5 space-y-1 text-[#4A5568]">
                {sec.items.map((it, j) => (
                  <li key={`li-${j}`}>{renderInlineNoLinks(it)}</li>
                ))}
              </ul>
            )}
        </div>
      ))}
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
/* ======================= نهاية تنسيق ردود الشات ======================= */
/* ======================= نهاية: رابط يوتيوب واحد ======================= */

const FamilyGuide = () => {
  const navigate = useNavigate();
@@ -315,9 +188,7 @@ const FamilyGuide = () => {

  const buildPrompt = () => {
    const { sound, touch, light, activities } = responses;

    const labelFor = (options: Option[], value: string) =>
      options.find((option) => option.value === value)?.label || "غير محدد";
    const labelFor = (opts: Option[], val: string) => opts.find((o) => o.value === val)?.label || "غير محدد";

    const lines = [
      "ملخص استبيان الأسرة:",
@@ -331,10 +202,9 @@ const FamilyGuide = () => {
      "• صباحًا (Power Up): نشاط أو نشاطين يرفعون الطاقة مع فكرة حسية مناسبة.",
      "• مساءً (تهدئة): روتين يخفف التوتر قبل النوم.",
      "• في المواقف الصعبة: مثال واضح مثل إذا غطى أذانه في السوق، وش نسوي خطوة بخطوة.",
      "أدخل رابط يوتيوب واحد على الأقل بصيغة بحث (https://www.youtube.com/results?search_query=...) بكلمات مفتاحية واضحة، وتجنب روابط تجريبية أو example.",
      // لاحظ: ما نطلب إدراج روابط داخلية — بنضيف زر واحد لاحقًا من الواجهة
      "خل كل قسم ما يتعدى خمس أسطر، ولا تعيد كتابة نص الأسئلة.",
    ];

    return lines.join("\n");
  };

@@ -353,31 +223,28 @@ const FamilyGuide = () => {
      setShowResult(true);
    } catch (err) {
      console.error("Family guide chat failed", err);
      setError("تعذّر إكمال الطلب، جرّب مرة ثانية بعد لحظات.");
      setError("تعذّر إتمام الطلب، جرّب مرة ثانية.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoreTips = async () => {
    if (!sessionId) {
      await handleAnalyze();
      return;
    }
    if (!sessionId) return handleAnalyze();
    setLoading(true);
    setError(null);
    try {
      const reply = await sendChat({
        session_id: sessionId,
        user_message:
          "أعطني أفكار إضافية بنفس تقسيم صباحًا/مساءً/مواقف صعبة وبنفس اللهجة، ويفضل تضيف روابط يوتيوب إضافية إذا لقيت شيء مناسب.",
          "أعطني أفكار إضافية بنفس تقسيم صباحًا/مساءً/مواقف صعبة وبنفس اللهجة، بدون روابط داخل النص.",
        context: { muscles: [] },
        language: "ar",
      });
      setAnalysis((prev) => `${prev}\n\n${reply.reply.trim()}`.trim());
    } catch (err) {
      console.error("Family guide extra tips failed", err);
      setError("تعذّر جلب أفكار إضافية، حاول بعد قليل.");
      setError("تعذّر جلب أفكار إضافية.");
    } finally {
      setLoading(false);
    }
@@ -400,24 +267,12 @@ const FamilyGuide = () => {
  );

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#F0F8FA] to-[#FFFFFF] text-gray-800 flex flex-col items-center py-12"
      dir="rtl"
    >
    <div className="min-h-screen bg-gradient-to-b from-[#F0F8FA] to-[#FFFFFF] text-gray-800 flex flex-col items-center py-12" dir="rtl">
      <header className="absolute top-0 left-0 right-0 flex justify-between items-center px-12 py-6">
        {/* زر الرئيسية على اليمين */}
        <button
          onClick={() => navigate("/")}
          className="text-lg font-semibold text-[#0A6D8B] hover:text-[#18A4B8] transition ml-auto"
        >
        <button onClick={() => navigate("/")} className="text-lg font-semibold text-[#0A6D8B] hover:text-[#18A4B8] transition ml-auto">
          الرئيسية
        </button>

        {/* شعار Armonia على اليسار */}
        <button
          onClick={() => navigate("/")}
          className="text-2xl font-bold text-[#0A6D8B] hover:text-[#18A4B8] transition mr-auto"
        >
        <button onClick={() => navigate("/")} className="text-2xl font-bold text-[#0A6D8B] hover:text-[#18A4B8] transition mr-auto">
          Armonia
        </button>
      </header>
@@ -439,10 +294,8 @@ const FamilyGuide = () => {
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {SOUND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              {SOUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
@@ -456,10 +309,8 @@ const FamilyGuide = () => {
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {TOUCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              {TOUCH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
@@ -473,10 +324,8 @@ const FamilyGuide = () => {
              className="mt-2 w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B] bg-white"
            >
              <option value="">اختر الخيار الأنسب</option>
              {LIGHT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              {LIGHT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
@@ -506,9 +355,7 @@ const FamilyGuide = () => {
        </div>
      ) : (
        <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-lg space-y-6">
          <h2 className="text-2xl font-semibold text-[#0A6D8B] text-center">
            توصيات سريعة لعائلتكم
          </h2>
          <h2 className="text-2xl font-semibold text-[#0A6D8B] text-center">توصيات سريعة لعائلتكم</h2>

          {error && (
            <div className="rounded-lg border border-[#F87171] bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C] text-center">
