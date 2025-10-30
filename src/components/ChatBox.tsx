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

  /** ✅ جديد: يُستدعى عندما نكتشف أن الردّ يقترح تمرينًا بالاسم */
  onSuggestedExercise?: (name: string) => void;
}

// ===================== النصوص =====================
const SESSION_STORAGE_KEY = "chat_sid";

const AUTOSTART_PROMPT =
  "أعطني نصائح وتمارين مختصرة للعضلات المحددة.";

const HEADER_TITLE = "دردشة المدرب الذكي";
const HEADER_SUBTITLE =
  "اسأل عن التمارين أو اطلب نصائح إضافية، والمدرب يرد عليك بنفس الجلسة.";

const YOUTUBE_LABEL = "فيديو مقترح على يوتيوب";
const TYPING_LABEL = "...يكتب";
const EMPTY_STATE_TEXT =
  "ابدأ الحوار بسؤال عن تمارين العضلة أو اطلب خطة سريعة، والمدرب بيجاوبك.";
const INPUT_PLACEHOLDER = "اكتب سؤالك هنا...";
const SEND_LABEL = "إرسال";
const LINK_EMOJI = "🔗";

// رسائل الخطأ/النسخ الاحتياطي
const ERROR_MESSAGE_GENERIC =
  "تعذر الاتصال بالخدمة الآن. هذا فيديو مقترح حسب العضلة المختارة:";
const ERROR_MESSAGE_TIMEOUT =
  "انتهت مهلة الانتظار للرد. هذا فيديو مقترح حسب العضلة المختارة:";
const ERROR_MESSAGE_FALLBACK =
  "الخدمة معلّقة مؤقتًا. هذا فيديو مقترح حسب العضلة المختارة:";

// ===================== أدوات مساعدة =====================
const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * نبني استعلام يوتيوب ذكي اعتماداً على أعلى عضلة (أو أكثر) بالـcontext.
 * - يدمج عربي + إنجليزي لزيادة دقة النتائج.
 * - لو ما فيه عضلات، يرجع رابط بحث عام.
 */
const buildYoutubeQuery = (muscles?: MuscleContext[]): string => {
  if (!muscles || muscles.length === 0) {
    return "exercise mobility rehab pain relief";
  }
  // رتب حسب prob تنازلي وخذ أول 2–3 بالحد الأقصى
  const sorted = [...muscles].sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0)).slice(0, 3);

  // ابني مفردات البحث عربي + إنجليزي
  const parts: string[] = [];
  const en = sorted.map((m) => m.muscle_en).filter(Boolean);
  const ar = sorted.map((m) => m.muscle_ar).filter(Boolean);

  if (en.length) parts.push(en.join(" "));
  if (ar.length) parts.push(ar.join(" "));
  parts.push("exercise rehab strengthening mobility تمارين علاجية تقوية إطالة");

  return parts.join(" ");
};

const youtubeSearchUrl = (query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

/**
 * يبني رابط يوتيوب مباشر حسب الـmusclesContext
 */
const buildYoutube = (muscles?: MuscleContext[]): string => {
  const query = buildYoutubeQuery(muscles);
  return youtubeSearchUrl(query);
};

/**
 * يطبع النص كرابط إن وجد
 */
const linkifyText = (text: string): ReactNode[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  text.replace(urlRegex, (match, _p1, offset) => {
    if (offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset));
    }
    nodes.push(
      <a
        key={`link-${offset}`}
        href={match}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#0A6D8B] underline decoration-dotted underline-offset-4"
      >
        {match}
      </a>
    );
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

const renderWithLinks = (content: string) => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pr-5 text-right">
        {bulletBuffer.map((item, idx) => {
          const cleaned = item.replace(/^[•\-\s]+/, "");
          const colonIndex = cleaned.indexOf(":");
          const title = colonIndex >= 0 ? cleaned.slice(0, colonIndex) : cleaned;
          const body = colonIndex >= 0 ? cleaned.slice(colonIndex + 1).trim() : "";
          return (
            <li key={`list-item-${idx}`} className="text-sm leading-relaxed text-gray-800">
              <span className="font-semibold text-[#0A6D8B]">{title}</span>
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
    flushBullets();

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      const heading = line.slice(0, colonIndex).trim();
      const rest = line.slice(colonIndex + 1).trim();
      blocks.push(
        <p key={`heading-${blocks.length}`} className="leading-relaxed text-gray-800 text-sm">
          <span className="font-semibold text-[#0A6D8B]">{heading}:</span>{" "}
          <span>{linkifyText(rest)}</span>
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="leading-relaxed text-gray-800 text-sm">
        {linkifyText(line)}
      </p>
    );
  });

  flushBullets();
  return blocks;
};

/**
 * Timeout + Retry لنداء sendChat حتى ما يعلق وتطلع رسالة “الخدمة معلّقة”.
 */
async function sendChatWithTimeout(
  payload: ChatPayload,
  timeoutMs = 12000,
  retries = 1
): Promise<ChatResponse> {
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
      if (isLast) {
        throw isAbort ? new Error("timeout") : err;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error("unknown");
}

/** ===================== استخراج اسم التمرين من ردّ الشات ===================== */
/** توحيد خفيف للنص العربي/الإنجليزي */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\u0600-\u06FF\w\s\-_:()]/g, "") // إزالة رموز مزعجة
    .replace(/ى|ي/g, "ي")
    .replace(/ة/g, "ه")
    .trim();

/** مرشّحات سريعة لأسماء شائعة – تقدر تزودها لاحقًا */
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

/**
 * يحاول استخراج اسم تمرين من نص الرد بطرق متعددة:
 * 1) JSON: {"exercise":"Bodyweight Squat"} أو {"tags":["EXERCISE:..."]}
 * 2) سطر يبدأ بـ "تمرين:" أو "Exercise:"
 * 3) بأي مكان يظهر فيه مصطلح من EXERCISE_HINTS
 */
function extractSuggestedExercise(reply: string): string | null {
  if (!reply) return null;

  // 1) محاولة JSON مباشرة
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
    // شكل 1: { exercise: "..." }
    if (typeof parsed.exercise === "string" && parsed.exercise.trim()) {
      return parsed.exercise.trim();
    }
    // شكل 2: { tags: ["EXERCISE:Bodyweight Squat", ...] }
    if (Array.isArray(parsed.tags)) {
      const tag = parsed.tags.find((t: string) => /^exercise:/i.test(t));
      if (tag) return String(tag).split(":").slice(1).join(":").trim();
    }
  }

  // 2) عناوين صريحة
  const line = reply
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^(\*|\-|\u2022)?\s*(تمرين|exercise)\s*[:：]/i.test(l));
  if (line) {
    // "تمرين: سكوات" أو "Exercise: Bodyweight Squat"
    const name = line.split(/[:：]/).slice(1).join(":").trim();
    if (name) return name;
  }

  // 3) بحث عام عن كلمات مفتاحية
  const textN = norm(reply);
  const hit = EXERCISE_HINTS.find((k) => textN.includes(norm(k)));
  if (hit) return hit;

  return null;
}

// ===================== المكوّن =====================
export default function ChatBox({
  musclesContext,
  autoStartAdvice,
  autoStartPrompt,
  sessionKey,
  onSuggestedExercise, // ✅ جديد
}: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const hasAutoStarted = useRef(false);

  const storageKey = useMemo(
    () => (sessionKey ? `${SESSION_STORAGE_KEY}::${sessionKey}` : SESSION_STORAGE_KEY),
    [sessionKey]
  );

  // نستخدم fingerprint لتصفير الشات عند تغير العضلات/المعطيات
  const contextFingerprint = useMemo(
    () => JSON.stringify({ musclesContext: musclesContext ?? [], autoStartPrompt, storageKey }),
    [musclesContext, autoStartPrompt, storageKey]
  );

  // استرجاع session_id القديم
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setSessionId(stored);
  }, [storageKey]);

  // تصفير الجلسة عند تغير العضلات
  useEffect(() => {
    if (!musclesContext || musclesContext.length === 0) return;
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(storageKey);
    hasAutoStarted.current = false;
  }, [contextFingerprint, musclesContext, storageKey]);

  const handleSend = useCallback(
    async (preset?: string) => {
      const text = (preset ?? input).trim();
      if (!text || isTyping) return;

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsTyping(true);

      const payload: ChatPayload = {
        session_id: sessionId ?? undefined,
        user_message: text,
        context: { muscles: musclesContext ?? [] },
        language: "ar",
      };

      // نجهّز رابط يوتيوب مسبقاً (نستخدمه عند الفشل أو لو الـAPI ما رجّع يوتيوب)
      const yt = buildYoutube(musclesContext);

      try {
        // Timeout + Retry
        const response: ChatResponse = await sendChatWithTimeout(payload, 12000, 1);

        // حفظ session id
        setSessionId(response.session_id);
        localStorage.setItem(storageKey, response.session_id);

        // لو الـAPI ما أعطى يوتيوب، استخدم اللي بنيناه
        const youtubeLink =
          response.youtube && response.youtube.startsWith("http") ? response.youtube : yt;

        const replyText = response.reply ?? "";

        // ✅ التقاط اسم تمرين من الرد (بأي من الصيغ المدعومة) وإبلاغ الصفحة
        const suggested = extractSuggestedExercise(replyText);
        if (suggested && onSuggestedExercise) {
          onSuggestedExercise(suggested);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: replyText,
            youtube: youtubeLink,
          },
        ]);
      } catch (error: any) {
        console.error("Chat request failed", error);

        // اختَر رسالة خطأ مناسبة
        let errMsg = ERROR_MESSAGE_GENERIC;
        if (error?.message === "timeout") errMsg = ERROR_MESSAGE_TIMEOUT;

        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: errMsg,
            youtube: yt,
            error: true,
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [input, isTyping, musclesContext, sessionId, storageKey, onSuggestedExercise]
  );

  // تشغيل تلقائي عند وجود عضلات
  useEffect(() => {
    if (!autoStartAdvice || !musclesContext || musclesContext.length === 0 || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    void handleSend(autoStartPrompt ?? AUTOSTART_PROMPT);
  }, [autoStartAdvice, autoStartPrompt, handleSend, musclesContext]);

  return (
    <section className="bg-white border rounded-xl shadow px-5 py-6 space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-[#0A6D8B]" dir="rtl">
          {HEADER_TITLE}
        </h2>
        <p className="text-sm text-gray-500 mt-1" dir="rtl">
          {HEADER_SUBTITLE}
        </p>
      </header>

      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 flex flex-col" dir="rtl">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
              message.role === "user"
                ? "bg-[#E8F5F9] text-[#0A6D8B] self-end text-right"
                : "bg-[#F8FAFC] text-gray-800"
            }`}
          >
            {renderWithLinks(message.content)}
            {message.youtube && (
              <div className="mt-2">
                <a
                  href={message.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-[#0A6D8B] font-medium"
                >
                  <span role="img" aria-label="youtube link">{LINK_EMOJI}</span>
                  {YOUTUBE_LABEL}
                </a>
              </div>
            )}
          </div>
        ))}
        {isTyping && <div className="text-sm text-gray-500">{TYPING_LABEL}</div>}
        {!messages.length && <div className="text-sm text-gray-500">{EMPTY_STATE_TEXT}</div>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <input
          dir="rtl"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={INPUT_PLACEHOLDER}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
        />
        <button
          type="submit"
          className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-5 py-2 rounded-lg disabled:opacity-60"
          disabled={!input.trim() || isTyping}
        >
          {SEND_LABEL}
        </button>
      </form>
    </section>
  );
}
