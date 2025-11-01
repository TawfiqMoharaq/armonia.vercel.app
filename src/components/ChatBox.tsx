import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { sendChat, type ChatPayload, type ChatResponse, type MuscleContext } from "../lib/api";
import ChatMessageView from "./ChatMessageView";
import { cleanModelText } from "../utils/formatChat";

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
  onSuggestedExercise?: (name: string) => void;
}

/* ===================== النصوص ===================== */
const SESSION_STORAGE_KEY = "chat_sid";
const AUTOSTART_PROMPT = "أعطني نصائح وتمارين مختصرة للعضلات المحددة.";
const HEADER_TITLE = "دردشة المدرب الذكي";
const HEADER_SUBTITLE = "اسأل عن التمارين أو اطلب نصائح إضافية، والمدرب يرد عليك بنفس الجلسة.";
const YOUTUBE_LABEL = "فيديو مقترح على يوتيوب";
const TYPING_LABEL = "...يكتب";
const EMPTY_STATE_TEXT = "ابدأ الحوار بسؤال عن تمارين العضلة أو اطلب خطة سريعة، والمدرب بيجاوبك.";
const INPUT_PLACEHOLDER = "اكتب سؤالك هنا...";
const SEND_LABEL = "إرسال";
const LINK_EMOJI = "🔗";

/* ===================== أدوات مساعدة ===================== */
const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildYoutubeQuery = (muscles?: MuscleContext[]): string => {
  if (!muscles || muscles.length === 0) {
    return "exercise mobility rehab pain relief";
  }
  const sorted = [...muscles].sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0)).slice(0, 3);
  const parts: string[] = [];
  const en = sorted.map((m) => m.muscle_en).filter(Boolean);
  const ar = sorted.map((m) => m.muscle_ar).filter(Boolean);
  if (en.length) parts.push(en.join(" "));
  if (ar.length) parts.push(ar.join(" "));
  parts.push("exercise rehab strengthening mobility تمارين علاجية تقوية إطالة");
  return parts.join(" ");
};
const youtubeSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
const buildYoutube = (muscles?: MuscleContext[]): string => youtubeSearchUrl(buildYoutubeQuery(muscles));

/** ====== استخراج اسم تمرين من ردّ الشات ====== */
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

  const codeJsonMatch = reply.match(/```json([\s\S]*?)```/i);
  const rawJson = codeJsonMatch ? codeJsonMatch[1] : null;
  const tryParse = (txt?: string) => {
    if (!txt) return null;
    try { return JSON.parse(txt); } catch { return null; }
  };

  const parsed = tryParse(rawJson) || tryParse(reply);
  if (parsed) {
    if (typeof parsed.exercise === "string" && parsed.exercise.trim()) return parsed.exercise.trim();
    if (Array.isArray(parsed.tags)) {
      const tag = parsed.tags.find((t: string) => /^exercise:/i.test(t));
      if (tag) return String(tag).split(":").slice(1).join(":").trim();
    }
  }

  const line = reply
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^(\*|\-|\u2022)?\s*(تمرين|exercise)\s*[:：]/i.test(l));
  if (line) {
    const name = line.split(/[:：]/).slice(1).join(":").trim();
    if (name) return name;
  }

  const textN = norm(reply);
  const hit = EXERCISE_HINTS.find((k) => textN.includes(norm(k)));
  return hit ?? null;
}

/* ============== كتابة لحظية (typewriter) ============== */
type TWMsg = { role: "assistant" | "user"; fullText: string; youtube?: string; speedMs?: number };

async function typewriterAppend(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  { role, fullText, youtube, speedMs = 12 }: TWMsg
) {
  const id = createId();
  setMessages((prev) => [...prev, { id, role, content: "", youtube }]);
  const pretty = cleanModelText(fullText);
  let i = 0;
  while (i < pretty.length) {
    const chunk = pretty.slice(i, i + 3);
    i += chunk.length;
    await new Promise((r) => setTimeout(r, speedMs));
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: (m.content || "") + chunk } : m))
    );
  }
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

  const storageKey = useMemo(
    () => (sessionKey ? `${SESSION_STORAGE_KEY}::${sessionKey}` : SESSION_STORAGE_KEY),
    [sessionKey]
  );

  const contextFingerprint = useMemo(
    () => JSON.stringify({ musclesContext: musclesContext ?? [], autoStartPrompt, storageKey }),
    [musclesContext, autoStartPrompt, storageKey]
  );

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setSessionId(stored);
  }, [storageKey]);

  useEffect(() => {
    if (!musclesContext || musclesContext.length === 0) return;
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(storageKey);
    hasAutoStarted.current = false;
  }, [contextFingerprint, musclesContext, storageKey]);

  const sendChatWithTimeout = async (
    payload: ChatPayload,
    timeoutMs = 12000,
    retries = 1
  ): Promise<ChatResponse> => {
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
  };

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

        setSessionId(response.session_id);
        localStorage.setItem(storageKey, response.session_id);

        const youtubeLink =
          response.youtube && response.youtube.startsWith("http") ? response.youtube : yt;

        const replyText = response.reply ?? "";

        const suggested = extractSuggestedExercise(replyText);
        if (suggested && onSuggestedExercise) onSuggestedExercise(suggested);

        // ← كتابة لحظية بدل الإضافة الفورية
        await typewriterAppend(setMessages, {
          role: "assistant",
          fullText: replyText,
          youtube: youtubeLink,
          speedMs: 10,
        });
      } catch (error: any) {
        const errMsg =
          error?.message === "timeout"
            ? "انتهت مهلة الانتظار للرد. هذا فيديو مقترح حسب العضلة المختارة:"
            : "تعذر الاتصال بالخدمة الآن. هذا فيديو مقترح حسب العضلة المختارة:";
        await typewriterAppend(setMessages, {
          role: "assistant",
          fullText: errMsg,
          youtube: yt,
          speedMs: 10,
        });
      } finally {
        setIsTyping(false);
      }
    },
    [input, isTyping, musclesContext, sessionId, storageKey, onSuggestedExercise]
  );

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

      {/* الرسائل */}
      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 flex flex-col" dir="rtl">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "self-end max-w-[90%]" : "self-start max-w-[90%]"}>
            {m.role === "user" ? (
              <div className="rounded-2xl px-4 py-3 bg-[#E8F5F9] text-[#0A6D8B]">
                {m.content}
              </div>
            ) : (
              <ChatMessageView text={m.content} youtube={m.youtube} />
            )}
          </div>
        ))}
        {isTyping && <div className="text-sm text-gray-500">{TYPING_LABEL}</div>}
        {!messages.length && <div className="text-sm text-gray-500">{EMPTY_STATE_TEXT}</div>}
      </div>

      {/* الإدخال */}
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
