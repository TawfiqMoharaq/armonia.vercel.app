// src/components/ChatBox.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { sendChat, type ChatPayload, type ChatResponse, type MuscleContext } from "../lib/api";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  youtube?: string;
  error?: boolean;
}

interface ChatBoxProps {
  musclesContext?: MuscleContext[];
  autoStartAdvice?: boolean;
  autoStartPrompt?: string;
  sessionKey?: string;
  /** يُستدعى عندما يذكر الرد اسم تمرين */
  onSuggestedExercise?: (name: string) => void;
}

/* ===================== نصوص ثابتة ===================== */
const SESSION_STORAGE_KEY = "chat_sid";
const AUTOSTART_PROMPT = "أعطني نصائح وتمارين مختصرة للعضلات المحددة.";

const HEADER_TITLE = "دردشة المدرب الذكي";
const HEADER_SUBTITLE = "اسأل عن التمارين أو اطلب نصائح إضافية، والمدرب يرد عليك بنفس الجلسة.";

const YOUTUBE_LABEL = "فيديو مقترح على يوتيوب";
const TYPING_LABEL = "...يكتب";
const EMPTY_STATE_TEXT = "ابدأ الحوار بسؤال عن تمارين العضلة أو اطلب خطة سريعة، والمدرب بيجاوبك.";
const INPUT_PLACEHOLDER = "اكتب سؤالك هنا...";
const SEND_LABEL = "إرسال";

const ERROR_MESSAGE_GENERIC = "تعذر الاتصال بالخدمة الآن. هذا فيديو مقترح حسب العضلة المختارة:";
const ERROR_MESSAGE_TIMEOUT = "انتهت مهلة الانتظار للرد. هذا فيديو مقترح حسب العضلة المختارة:";

/* ===================== مساعدات ===================== */
const LINK_EMOJI = "🔗";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// بناء استعلام يوتيوب من العضلات
const buildYoutubeQuery = (muscles?: MuscleContext[]): string => {
  if (!muscles || muscles.length === 0) return "exercise mobility rehab pain relief";
  const sorted = [...muscles].sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0)).slice(0, 3);
  const en = sorted.map((m) => m.muscle_en).filter(Boolean);
  const ar = sorted.map((m) => m.muscle_ar).filter(Boolean);
  const parts: string[] = [];
  if (en.length) parts.push(en.join(" "));
  if (ar.length) parts.push(ar.join(" "));
  parts.push("exercise rehab strengthening mobility تمارين علاجية تقوية إطالة");
  return parts.join(" ");
};
const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const buildYoutube = (muscles?: MuscleContext[]) => youtubeSearchUrl(buildYoutubeQuery(muscles));

// تحويل الروابط داخل النص
const linkifyText = (text: string): ReactNode[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  text.replace(urlRegex, (match, _p1, offset) => {
    if (offset > lastIndex) nodes.push(text.slice(lastIndex, offset));
    nodes.push(
      <a
        key={`link-${offset}`}
        href={match}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal-700 underline decoration-dotted underline-offset-4 hover:text-teal-800"
      >
        {match}
      </a>
    );
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

// تنسيق الفقرات والقوائم + الروابط
const renderWithLinks = (content: string) => {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flush = () => {
    if (!bulletBuffer.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pr-5 text-right">
        {bulletBuffer.map((item, idx) => {
          const cleaned = item.replace(/^[•\-\s]+/, "");
          const colonIndex = cleaned.indexOf(":");
          const title = colonIndex >= 0 ? cleaned.slice(0, colonIndex) : cleaned;
          const body = colonIndex >= 0 ? cleaned.slice(colonIndex + 1).trim() : "";
          return (
            <li key={`li-${idx}`} className="text-[15px] leading-7 text-slate-800">
              <span className="font-semibold text-teal-700">{title}</span>
              {body ? <span className="ml-1">{linkifyText(body)}</span> : null}
            </li>
          );
        })}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((line) => {
    if (/^[•\-]/.test(line)) {
      bulletBuffer.push(line);
      return;
    }
    flush();
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      const heading = line.slice(0, colonIndex).trim();
      const rest = line.slice(colonIndex + 1).trim();
      blocks.push(
        <p key={`h-${blocks.length}`} className="leading-7 text-slate-800 text-[15px]">
          <span className="font-semibold text-teal-700">{heading}:</span>{" "}
          <span>{linkifyText(rest)}</span>
        </p>
      );
      return;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-7 text-slate-800 text-[15px]">
        {linkifyText(line)}
      </p>
    );
  });

  flush();
  return blocks;
};

// طلب مع مهلة وإعادة محاولة
async function sendChatWithTimeout(payload: ChatPayload, timeoutMs = 12000, retries = 1): Promise<ChatResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await sendChat(payload);
      clearTimeout(t);
      return res;
    } catch (err: any) {
      clearTimeout(t);
      const isLast = attempt === retries;
      const isAbort = err?.name === "AbortError";
      if (isLast) throw isAbort ? new Error("timeout") : err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error("unknown");
}

/* ===================== استخراج اسم تمرين ===================== */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\u0600-\u06FF\w\s\-_:()]/g, "")
    .replace(/ى|ي/g, "ي")
    .replace(/ة/g, "ه")
    .trim();

const EXERCISE_HINTS = [
  "سكوات",
  "squat",
  "bodyweight squat",
  "lunge",
  "لانجز",
  "glute bridge",
  "جسر المؤخره",
  "leg extension",
  "hamstring curl",
];

function extractSuggestedExercise(reply: string): string | null {
  if (!reply) return null;

  // 1) JSON داخل كود فينس
  const codeJsonMatch = reply.match(/```json([\s\S]*?)```/i);
  const rawJson = codeJsonMatch ? codeJsonMatch[1] : null;

  const tryParse = (txt?: string) => {
    if (!txt) return null;
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  };

  const parsed = tryParse(rawJson) || tryParse(reply);
  if (parsed) {
    if (typeof parsed.exercise === "string" && parsed.exercise.trim()) return parsed.exercise.trim();
    if (Array.isArray(parsed.tags)) {
      const tag = parsed.tags.find((t: string) => /^exercise:/i.test(t));
      if (tag) return String(tag).split(":").slice(1).join(":").trim();
    }
  }

  // 2) سطر يبدأ بـ تمرين:
  const line = reply
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^(\*|\-|\u2022)?\s*(تمرين|exercise)\s*[:：]/i.test(l));
  if (line) {
    const name = line.split(/[:：]/).slice(1).join(":").trim();
    if (name) return name;
  }

  // 3) كلمات مفتاحية
  const textN = norm(reply);
  const hit = EXERCISE_HINTS.find((k) => textN.includes(norm(k)));
  return hit || null;
}

/* ===================== المكوّن ===================== */
export default function ChatBox({
  musclesContext,
  autoStartAdvice,
  autoStartPrompt,
  sessionKey,
  onSuggestedExercise,
}: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const hasAutoStarted = useRef(false);

  // مفاتيح التخزين لكل سياق مختلف
  const storageKey = useMemo(
    () => (sessionKey ? `${SESSION_STORAGE_KEY}::${sessionKey}` : SESSION_STORAGE_KEY),
    [sessionKey]
  );

  // بصمة تغيّر السياق لتصفير الشات
  const contextFingerprint = useMemo(
    () => JSON.stringify({ musclesContext: musclesContext ?? [], autoStartPrompt, storageKey }),
    [musclesContext, autoStartPrompt, storageKey]
  );

  // استرجاع session_id السابق
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setSessionId(stored);
  }, [storageKey]);

  // تصفير الجلسة عند تغيّر السياق (مع وجود عضلات)
  useEffect(() => {
    if (!musclesContext || musclesContext.length === 0) return;
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(storageKey);
    hasAutoStarted.current = false;
  }, [contextFingerprint, musclesContext, storageKey]);

  // إرسال رسالة
  const handleSend = useCallback(
    async (preset?: string) => {
      const text = (preset ?? input).trim();
      if (!text || isTyping) return;

      const userMessage: ChatMessage = { id: createId(), role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsTyping(true);

      const payload: ChatPayload = {
        session_id: sessionId ?? undefined,
        user_message: text,
        context: { muscles: musclesContext ?? [] },
        language: "ar",
      };

      const yt = buildYoutube(musclesContext);

      try {
        const response: ChatResponse = await sendChatWithTimeout(payload, 12000, 1);

        // حفظ الجلسة
        setSessionId(response.session_id);
        localStorage.setItem(storageKey, response.session_id);

        const youtubeLink = response.youtube && response.youtube.startsWith("http") ? response.youtube : yt;
        const replyText = response.reply ?? "";

        // ✅ استخدم النص الخام لاستخراج اسم التمرين (قبل أي تنظيف)
        const suggested = extractSuggestedExercise(replyText);
        if (suggested && onSuggestedExercise) onSuggestedExercise(suggested);

        // خزّن الرد الخام كما هو (سوف ننظّفه فقط وقت العرض)
        setMessages((prev) => [
          ...prev,
          { id: createId(), role: "assistant", content: replyText, youtube: youtubeLink },
        ]);
      } catch (error: any) {
        const errMsg = error?.message === "timeout" ? ERROR_MESSAGE_TIMEOUT : ERROR_MESSAGE_GENERIC;
        setMessages((prev) => [
          ...prev,
          { id: createId(), role: "assistant", content: errMsg, youtube: yt, error: true },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [input, isTyping, musclesContext, sessionId, storageKey, onSuggestedExercise]
  );

  // تشغيل تلقائي — فقط عند تفعيلك له
  useEffect(() => {
    if (!autoStartAdvice || !musclesContext || musclesContext.length === 0 || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    void handleSend(autoStartPrompt ?? AUTOSTART_PROMPT);
  }, [autoStartAdvice, autoStartPrompt, handleSend, musclesContext]);

  /* ===================== تنظيف للعرض فقط ===================== */
  // يخفي بلوكات JSON وأي سطر "exercise": "..."
  const stripJsonForDisplay = (t: string) =>
    (t ?? "")
      .replace(/```json[\s\S]*?```/gi, "")
      .replace(/"exercise"\s*:\s*".*?"/gi, "")
      .replace(/^\s*json\s*$/gim, ""); // لو كلمة json لحالها

  // نخفي أول رسالة user (برومبت التشغيل الذكي) في الواجهة فقط
  const visibleMessages = useMemo(() => {
    let skippedFirstUser = false;
    return messages.filter((m) => {
      if (!skippedFirstUser && m.role === "user") {
        skippedFirstUser = true;
        return false; // اخفاء البرومبت الأول
      }
      return true;
    });
  }, [messages]);

  return (
    <section className="bg-white/90 backdrop-blur border border-slate-200 rounded-2xl shadow-md px-6 py-6 space-y-5">
      <header>
        <h2 className="text-xl font-semibold text-[#0A6D8B]" dir="rtl">
          {HEADER_TITLE}
        </h2>
        <p className="text-sm text-slate-500 mt-1" dir="rtl">
          {HEADER_SUBTITLE}
        </p>
      </header>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 flex flex-col scroll-smooth" dir="rtl">
        {visibleMessages.map((message) => {
          // تنظيف العرض فقط للمساعد
          const display =
            message.role === "assistant" ? stripJsonForDisplay(message.content).trim() : message.content;

          return (
            <div
              key={message.id}
              className={`rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-sm ${
                message.role === "user"
                  ? "bg-teal-50 text-teal-900 self-end text-right border border-teal-100"
                  : "bg-slate-50 text-slate-800 border border-slate-100"
              }`}
            >
              {renderWithLinks(display)}
              {message.youtube && (
                <div className="mt-2">
                  <a
                    href={message.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-teal-700 font-medium hover:text-teal-800"
                  >
                    <span role="img" aria-label="youtube link">
                      {LINK_EMOJI}
                    </span>
                    {YOUTUBE_LABEL}
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {isTyping && <div className="text-sm text-gray-500">{TYPING_LABEL}</div>}
        {!visibleMessages.length && !isTyping && (
          <div className="text-sm text-gray-500">{EMPTY_STATE_TEXT}</div>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          dir="rtl"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={INPUT_PLACEHOLDER}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/60"
        />
        <button
          type="submit"
          className="rounded-xl px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium transition disabled:opacity-60"
          disabled={!input.trim() || isTyping}
        >
          {SEND_LABEL}
        </button>
      </form>
    </section>
  );
}
