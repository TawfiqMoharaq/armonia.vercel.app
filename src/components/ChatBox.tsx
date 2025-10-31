// src/components/ChatBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

/* ======================= تنظيف النص ======================= */
// يحذف أي أسوار كود (بما فيها ```json ... ```)
const stripCodeFences = (t: string) =>
  (t ?? "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "");

// يحاول إزالة كتل JSON غير المُسوّرة والأسطر الشبيهة بـ JSON
const stripInlineJson = (t: string) => {
  let out = t.replace(/\bjson\b/gi, "");          // إزالة كلمة json المتناثرة
  out = out.replace(/\{[\s\S]{20,}\}/g, "");      // إزالة كتل { ... } الكبيرة
  out = out.replace(/^\s*"?[a-zA-Z0-9_]+"?\s*:\s*.+$/gm, ""); // إزالة أسطر "key": value
  return out;
};

// تنظيف شامل: إزالة أسوار الكود + أي JSON طائش + ترتيب الأسطر
const cleanModelText = (t: string) => {
  const noFences = stripCodeFences(t);
  const noJson = stripInlineJson(noFences);
  return noJson.replace(/\n{3,}/g, "\n\n").trim();
};

// انتقاء نص العرض من استجابة الـ API (توافق خلفي)
const pickUiText = (data: any): string => {
  if (!data) return "";
  if (typeof data.ui_text === "string" && data.ui_text.trim()) return data.ui_text;
  if (typeof data.reply === "string" && data.reply.trim()) return data.reply;
  // fallback
  return cleanModelText(String(data));
};
/* ========================================================= */

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
  ui_text?: string;   // نص العرض الجميل
  payload?: {
    exercise?: string;
    reps?: string;
    tips?: string[];
    [k: string]: any;
  };                  // بيانات داخلية (لا تُعرض)
  reply?: string;     // توافق خلفي (يساوي ui_text غالبًا)
  session_id: string;
  turns: number;
  usedOpenAI: boolean;
  youtube: string;
};
/* ========================================================= */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

/* =============== بطاقة التمرين المباشرة ================== */
function ExerciseCard({ payload }: { payload: NonNullable<ChatResponse["payload"]> }) {
  if (!payload || !payload.exercise) return null;
  return (
    <div className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="text-base font-semibold">تمرين مقترح</div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div><span className="font-medium">التمرين:</span> {payload.exercise}</div>
        {payload.reps && (
          <div><span className="font-medium">عدد/مدة:</span> {payload.reps}</div>
        )}
        {Array.isArray(payload.tips) && payload.tips.length > 0 && (
          <div>
            <div className="font-medium mb-1">نصائح:</div>
            <ul className="list-disc ms-6 space-y-1">
              {payload.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
/* ========================================================= */

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;   // النص الخام
  pretty: string; // النص المنظّف/المنسّق للعرض
  raw?: ChatResponse;
};

type Props = {
  /** مرّر نتائج /api/analyze هنا ليعرف الشات مكان المشكلة */
  muscles: Muscle[];
};

const ChatBox: React.FC<Props> = ({ muscles }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // أطبع قيمة الـ API للتأكد منها في المتصفح
  useEffect(() => {
    console.log("VITE_API_BASE =", API_BASE);
  }, []);

  const context = useMemo<ChatContext>(() => ({ muscles: muscles ?? [] }), [muscles]);

  /* ================= إرسال رسالة (مع fallback ذكي) ================= */
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

      // لو الاستجابة مو OK حاول نقرأ النص لتشخيص أوضح
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Chat API HTTP error:", res.status, errText);
        throw new Error(`HTTP ${res.status} ${errText}`);
      }

      // جرّب JSON أولاً، ولو ما نفعت خذ النص الخام
      let data: ChatResponse | null = null;
      try {
        data = (await res.json()) as ChatResponse;
      } catch (e) {
        const raw = await res.text().catch(() => "");
        console.error("Failed to parse JSON. Raw response:", raw);
        const fallback =
          raw?.trim() || "تعذر فهم استجابة الخادم. حاول مجددًا لاحقًا.";
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: fallback,
            pretty: cleanModelText(fallback) || fallback,
          },
        ]);
        return;
      }

      if (!sessionId) setSessionId(data.session_id);

      // نختار نص العرض ثم ننظفه
      const ui = pickUiText(data);
      let pretty = cleanModelText(ui);

      // Fallback: إذا التنظيف شال كل شيء، اعرض الخام
      if (!pretty || !pretty.trim()) {
        pretty = ui?.trim() || "";
      }
      // لو ظل فاضي، اعرض رسالة قصيرة بدل الفراغ
      if (!pretty || !pretty.trim()) {
        pretty = "تم تجهيز إرشاداتك. ابدأ بإحماء خفيف (5–10 دقائق) ثم اتبع الخطوات المقترحة.";
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ui,
        pretty,
        raw: data, // payload موجود هنا لبطاقة التمرين
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
  // أول ما تتوفر muscles غير فارغة، نرسل طلب تشخيص تلقائي مرة واحدة
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoSentRef.current && muscles && muscles.length > 0) {
      autoSentRef.current = true;
      const top = muscles.slice(0, 3).map((m) => m.muscle_ar).join("، ");
      const prompt =
        `حدّدت لي هذه المناطق: ${top}. أعطني تشخيصًا أوليًا بسيطًا وخطوات آمنة، ` +
        `وإذا يوجد تمرين مناسب كبداية (مثل سكوات/بلانك/تمطيط لطيف) أرفقه معي في payload ` +
        `(exercise, reps, tips) بدون أي JSON داخل نص العرض.`;
      sendMessage(prompt);
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
          messages.map((m) => (
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

                {/* بطاقة التمرين لو موجودة في payload لهذا الرد */}
                {m.raw?.payload && <ExerciseCard payload={m.raw.payload} />}
              </div>
            </div>
          ))
        )}
        {busy && <div className="text-slate-500 text-sm text-center py-2">جاري إعداد ردك…</div>}
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
