import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendChat, type ChatPayload, type ChatResponse, type MuscleContext } from "../lib/api";
import ChatMessageView from "./ChatMessageView";
// 👇 إضافة دالة تنظيف روابط يوتيوب
import { stripAllYoutubeLinks } from "../lib/chatFormat";

type ChatRole = "user" | "assistant";
interface ChatMessage { id: string; role: ChatRole; content: string; youtube?: string; error?: boolean; }

interface ChatBoxProps {
  musclesContext?: MuscleContext[];
  autoStartAdvice?: boolean;
  autoStartPrompt?: string;
  sessionKey?: string;
  onSuggestedExercise?: (name: string) => void;
}

/* ===================== نصوص ===================== */
const SESSION_STORAGE_KEY = "chat_sid";
const AUTOSTART_PROMPT = "أعطني نصائح وتمارين مختصرة للعضلات المحددة.";
const HEADER_TITLE = "دردشة المدرب الذكي";
const HEADER_SUBTITLE = "اسأل عن التمارين أو اطلب نصائح إضافية، والمدرب يرد عليك بنفس الجلسة.";
const TYPING_LABEL = "...يكتب";
const EMPTY_STATE_TEXT = "ابدأ الحوار بسؤال عن تمارين العضلة أو اطلب خطة سريعة، والمدرب بيجاوبك.";
const INPUT_PLACEHOLDER = "اكتب سؤالك هنا...";
const SEND_LABEL = "إرسال";
const ERROR_MESSAGE_GENERIC = "تعذر الاتصال بالخدمة الآن. هذا فيديو مقترح حسب العضلة المختارة:";
const ERROR_MESSAGE_TIMEOUT = "انتهت مهلة الانتظار للرد. هذا فيديو مقترح حسب العضلة المختارة:";

/* ===================== أدوات ===================== */
const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  s.toLowerCase().replace(/\s+/g, " ").replace(/[^\u0600-\u06FF\w\s\-_:()]/g, "").replace(/ى|ي/g, "ي").replace(/ة/g, "ه").trim();

const EXERCISE_HINTS = ["سكوات","squat","bodyweight squat","lunge","لانجز","glute bridge","جسر المؤخره","leg extension","hamstring curl"];

function extractSuggestedExercise(reply: string): string | null {
  if (!reply) return null;

  // JSON داخل كود فينس
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

  const line = reply.split(/\r?\n/).map((l) => l.trim()).find((l) => /^(\*|\-|\u2022)?\s*(تمرين|exercise)\s*[:：]/i.test(l));
  if (line) {
    const name = line.split(/[:：]/).slice(1).join(":").trim();
    if (name) return name;
  }

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

  // تصفير الجلسة عند تغير نتائج المجسّم (مع عضلات)
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

        const youtubeLink = response.youtube && response.youtube.startsWith("http") ? response.youtube : yt;
        const replyTextRaw = response.reply ?? "";

        const suggested = extractSuggestedExercise(replyTextRaw);
        if (suggested && onSuggestedExercise) onSuggestedExercise(suggested);

        // 👇 نظّف كل روابط يوتيوب من نص المساعد (نخلي رابط واحد فقط خارجياً)
        const replyText = stripAllYoutubeLinks(replyTextRaw);

        setMessages((prev) => [...prev, { id: createId(), role: "assistant", content: replyText, youtube: youtubeLink }]);
      } catch (error: any) {
        const errMsg = error?.message === "timeout" ? ERROR_MESSAGE_TIMEOUT : ERROR_MESSAGE_GENERIC;
        setMessages((prev) => [...prev, { id: createId(), role: "assistant", content: errMsg, youtube: yt, error: true }]);
      } finally {
        setIsTyping(false);
      }
    },
    [input, isTyping, musclesContext, sessionId, storageKey, onSuggestedExercise]
  );

  // التشغيل التلقائي — لا يعمل إلا إذا فعّلته (autoStartAdvice)
  useEffect(() => {
    if (!autoStartAdvice || !musclesContext || musclesContext.length === 0 || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    void handleSend(autoStartPrompt ?? AUTOSTART_PROMPT);
  }, [autoStartAdvice, autoStartPrompt, handleSend, musclesContext]);

  // إخفاء أول رسالة user (البرومبت التلقائي) في العرض فقط
  const visibleMessages = useMemo(() => {
    let skipped = false;
    return messages.filter((m) => {
      if (!skipped && m.role === "user") {
        skipped = true;
        return false;
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

      <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1 flex flex-col scroll-smooth" dir="rtl">
        {visibleMessages.map((m) =>
          m.role === "assistant" ? (
            <ChatMessageView key={m.id} text={m.content} youtube={m.youtube} />
          ) : (
            <div
              key={m.id}
              className="rounded-2xl px-4 py-3 bg-[#E8F5F9] text-[#0A6D8B] self-end text-right border border-teal-100 shadow-sm"
            >
              <p className="text-[15px] leading-7">{m.content}</p>
            </div>
          )
        )}

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
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]/50"
        />
        <button
          type="submit"
          className="rounded-xl px-5 py-2.5 bg-[#0A6D8B] hover:bg-[#075a70] text-white font-medium transition disabled:opacity-60"
          disabled={!input.trim() || isTyping}
        >
          {SEND_LABEL}
        </button>
      </form>
    </section>
  );
}
