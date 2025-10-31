// src/components/ChatBox.tsx
import React, { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

/* ======================= أدوات تنظيف النص ======================= */
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
/* =============================================================== */

/* ===================== أنواع الطلب/الاستجابة ==================== */
type Muscle = {
  muscle_ar: string;
  muscle_en: string;
  region: string;
  prob: number;
};

type ChatContext = {
  muscles: Muscle[];
};

type ChatRequest = {
  session_id?: string | null;
  user_message: string;
  context: ChatContext;
  language?: "ar" | "en";
};

type ChatResponse = {
  ui_text?: string;   // نص العرض الجميل
  payload?: any;      // بيانات داخلية (لا تُعرض)
  reply?: string;     // توافق خلفي (يساوي ui_text غالبًا)
  session_id: string;
  turns: number;
  usedOpenAI: boolean;
  youtube: string;
};
/* =============================================================== */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;   // النص الخام
  pretty: string; // النص المنظّف/المنسّق للعرض
  raw?: ChatResponse;
};

function ChatMessageView({ msg }: { msg: Message }) {
  const mine = msg.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[90%] rounded-2xl px-4 py-3 leading-7 shadow-sm",
          mine ? "bg-blue-50" : "bg-white/70",
        ].join(" ")}
      >
        <ReactMarkdown
          components={{
            // لا نعرض كتل الكود إطلاقًا (أو كـ inline صغير إن وُجد)
            code: ({ inline, children, ...props }) =>
              inline ? (
                <code className="px-1 py-0.5 rounded bg-black/5" {...props}>
                  {children}
                </code>
              ) : null,
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold mt-1 mb-1">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold mt-1 mb-1">{children}</h4>
            ),
            ul: ({ children }) => (
              <ul className="list-disc ms-6 space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal ms-6 space-y-1">{children}</ol>
            ),
            li: ({ children }) => <li className="leading-7">{children}</li>,
            p: ({ children }) => <p className="my-1">{children}</p>,
            strong: ({ children }) => (
              <strong className="font-semibold">{children}</strong>
            ),
            em: ({ children }) => <em className="opacity-90">{children}</em>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {msg.pretty}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const ChatBox: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // سياق العضلات (لو عندك بيانات حقيقية مررها هنا)
  const context = useMemo<ChatContext>(() => ({ muscles: [] }), []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    // أضف رسالة المستخدم
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      pretty: cleanModelText(text),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ChatResponse = await res.json();

      // نخزن session_id أول مرة
      if (!sessionId) setSessionId(data.session_id);

      // ننتقي نص العرض وننظفه
      const ui = pickUiText(data);
      const pretty = cleanModelText(ui);

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ui,
        pretty,
        raw: data, // payload داخل data.payload إن احتجته
      };

      setMessages((m) => [...m, botMsg]);
    } catch (err) {
      const fallback =
        "تعذر الاتصال بالخدمة الآن. جرّب لاحقًا أو تحقق من اتصالك بالإنترنت.";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: fallback,
          pretty: fallback,
        },
      ]);
      console.error(err);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* منطقة الرسائل */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-50 p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-center py-10">
            اكتب سؤالك عن التمرين أو الألم وسيتم الرد بإرشادات مرتبة. ✨
          </div>
        ) : (
          messages.map((m) => <ChatMessageView key={m.id} msg={m} />)
        )}
        {busy && (
          <div className="text-slate-500 text-sm text-center py-2">
            جاري إعداد ردك…
          </div>
        )}
      </div>

      {/* صندوق الإدخال */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef as any}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="اكتب هنا… (اضغط Enter للإرسال)"
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
