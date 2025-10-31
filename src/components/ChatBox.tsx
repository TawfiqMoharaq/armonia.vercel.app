// src/components/ChatBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import ExerciseCard from "./ExerciseCard";
import { findExerciseByName } from "../data/exercises";
import type { Exercise } from "../data/exercises";

/* ======================= ربط payload بقاعدة التمارين ======================= */
function pickExerciseFromPayload(payload: any): Exercise | null {
  const name = payload?.exercise;
  if (!name) return null;
  return findExerciseByName(String(name));
}

/* ======================= تنظيف واستخراج ======================= */
// يحذف أسوار الكود (``` و ```json)
const stripCodeFences = (t: string) =>
  (t ?? "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "");

// يحاول إزالة بقايا مفاتيح JSON أينما ظهرت داخل النص
const stripJsonKeysEverywhere = (t: string) =>
  t
    // امسح كلمة json المتناثرة
    .replace(/\bjson\b/gi, "")
    // امسح أزواج "المفتاح":القيمة الشائعة (ui_text, payload, exercise, reps, tips)
    .replace(
      /"?(ui_text|payload|exercise|reps|tips)"?\s*:\s*(\{[^}]*\}|\[[^\]]*\]|"(?:\\.|[^"\\])*"|[^,}\n]+)\s*,?/gi,
      ""
    )
    // امسح أي كتل { ... } طويلة (سطر واحد أو متعددة الأسطر)
    .replace(/\{[\s\S]{10,}\}/g, "");

// تنظيف شامل
const cleanModelText = (t: string) => {
  const noFences = stripCodeFences(t ?? "");
  const noJsonLeftovers = stripJsonKeysEverywhere(noFences);
  return noJsonLeftovers.replace(/\n{3,}/g, "\n\n").trim();
};

// محاولات آمنة لفك JSON من نص
const tryParseJson = (s: unknown): any | null => {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// يقتنص قيمة ui_text من سلسلة تشبه JSON حتى لو مو صالحة بالكامل
const regexExtractUiText = (s: string): string | null => {
  const m = s.match(/"ui_text"\s*:\s*"(.*?)"/s);
  if (!m) return null;
  // نفك الهروب البسيط داخل السلسلة
  return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
};

// انتقاء نص العرض والـpayload من استجابة قد تكون مشوّهة
const extractUiAndPayload = (data: any): { ui: string; payload?: any } => {
  // الحالة الصحيحة
  if (data && typeof data === "object") {
    if (typeof data.ui_text === "string" && data.ui_text.trim()) {
      return { ui: data.ui_text, payload: data.payload };
    }
    // بعض السيرفرات ترجع reply كسلسلة JSON
    if (typeof data.reply === "string") {
      const parsed = tryParseJson(data.reply);
      if (parsed && typeof parsed.ui_text === "string") {
        return { ui: parsed.ui_text, payload: parsed.payload ?? data.payload };
      }
      const picked = regexExtractUiText(data.reply);
      if (picked) return { ui: picked, payload: data.payload };
      // لو reply نص عادي
      return { ui: data.reply, payload: data.payload };
    }
  }
  // لو اللي جاي سلسلة JSON كاملة
  if (typeof data === "string") {
    const parsed = tryParseJson(data);
    if (parsed && typeof parsed.ui_text === "string") {
      return { ui: parsed.ui_text, payload: parsed.payload };
    }
    const picked = regexExtractUiText(data);
    if (picked) return { ui: picked };
    return { ui: data };
  }
  return { ui: "" };
};
/* ============================================================= */

/* ===================== أنواع الداتا ====================== */
export type Muscle = {
  muscle_ar: string;
  muscle_en: string;
  region: string;
  prob: number;
};

type ChatContext = { muscles: Muscle[] };

type ChatRequest = {
  session_id?: string | null;
  user_message: string;
  context: ChatContext;
  language?: "ar" | "en";
};

type ChatResponse = {
  ui_text?: string;
  payload?: {
    exercise?: string;
    reps?: string;
    tips?: string[];
    [k: string]: any;
  };
  reply?: string; // أحيانًا ترجع كسلسلة JSON
  session_id: string;
  turns: number;
  usedOpenAI: boolean;
  youtube: string;
};
/* ========================================================= */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;   // النص الخام (قبل التنظيف)
  pretty: string; // النص المنسّق للعرض (بعد التنظيف القوي)
  raw?: ChatResponse;
};

type Props = {
  muscles: Muscle[];
};

const ChatBox: React.FC<Props> = ({ muscles }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    console.log("VITE_API_BASE =", API_BASE);
  }, []);

  const context = useMemo<ChatContext>(() => ({ muscles: muscles ?? [] }), [muscles]);

  /* ================= إرسال رسالة ================= */
  const sendMessage = async (userText: string) => {
    const text = userText.trim();
    if (!text) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      pretty: cleanModelText(text),
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    try {
      const body: ChatRequest = {
        session_id: sessionId,
        user_message: text,
        context,
        language: "ar",
      };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Chat API HTTP error:", res.status, errText);
        throw new Error(`HTTP ${res.status} ${errText}`);
      }

      // حاول JSON، وإلا اقرأ كنص
      let data: ChatResponse | string;
      try {
        data = (await res.json()) as ChatResponse;
      } catch {
        data = await res.text();
      }

      if (typeof data === "object" && data && !sessionId) {
        setSessionId(data.session_id);
      }

      // استخرج ui_text/ payload مهما كان شكل الاستجابة
      const { ui, payload } = extractUiAndPayload(data);
      // نظّف بقوة
      let pretty = cleanModelText(ui);

      // fallback مضمون
      if (!pretty || !pretty.trim()) pretty = ui?.trim() || "";
      if (!pretty || !pretty.trim()) {
        pretty = "تم تجهيز إرشاداتك. ابدأ بإحماء خفيف (5–10 دقائق) ثم اتبع الخطوات المقترحة.";
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ui,
        pretty,
        raw: typeof data === "object" ? { ...(data as any), payload: (payload ?? (data as any).payload) } : undefined,
      };

      setMessages((m) => [...m, botMsg]);
    } catch (err) {
      console.error(err);
      const fallback =
        "تعذر الاتصال بالخدمة الآن. جرّب لاحقًا أو تحقق من إعداد VITE_API_BASE و CORS.";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: fallback,
          pretty: fallback,
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage(text);
  };

  /* ============ إرسال تلقائي عند تحديد العضلة ============ */
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoSentRef.current && muscles && muscles.length > 0) {
      autoSentRef.current = true;
      // رسالة قصيرة جداً — الباكيند سيعتمد على العضلات الممرّرة في context
      sendMessage("شعور بسيط بالألم — خلنا نبدأ بخطة آمنة 💪");
    }
  }, [muscles]); // eslint-disable-line react-hooks/exhaustive-deps

  /* =============== إدخال المستخدم =============== */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* الرسائل */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-50 p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-center py-10">
            حدّد مكان الألم أو اكتب سؤالك، وبنرد عليك بإرشادات مرتبة. ✨
          </div>
        ) : (
          messages.map((m) => {
            const fullExercise = pickExerciseFromPayload(m.raw?.payload);

            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={[
                    "max-w-[90%] rounded-2xl px-4 py-3 leading-7 shadow-sm",
                    m.role === "user" ? "bg-blue-50" : "bg-white/70",
                  ].join(" ")}
                >
                  <ReactMarkdown
                    components={{
                      code: ({ inline, children, ...props }) =>
                        inline ? (
                          <code className="px-1 py-0.5 rounded bg-black/5" {...props}>
                            {children}
                          </code>
                        ) : null,
                      h3: ({ children }) => <h3 className="text-lg font-semibold mt-1 mb-1">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-base font-semibold mt-1 mb-1">{children}</h4>,
                      ul: ({ children }) => <ul className="list-disc ms-6 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal ms-6 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-7">{children}</li>,
                      p: ({ children }) => <p className="my-1">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="opacity-90">{children}</em>,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="underline">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {m.pretty}
                  </ReactMarkdown>

                  {/* ✅ بطاقة التمرين (من قاعدة بياناتك) */}
                  {fullExercise && <ExerciseCard exercise={fullExercise} />}
                </div>
              </div>
            );
          })
        )}
        {busy && <div className="text-slate-500 text-sm text-center py-2">يكتب…</div>}
      </div>

      {/* الإدخال */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="اكتب هنا… (Enter للإرسال)"
          className="flex-1 min-h-[48px] max-h-40 resize-y rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-2xl px-4 h-12 bg-blue-600 text-white font-medium shadow hover:bg-blue-700 disabled:opacity-50"
        >
          إرسال
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
