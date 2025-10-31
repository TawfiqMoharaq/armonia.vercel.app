// src/components/ChatBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { findExerciseByName, type Exercise } from "../data/exercises";

/* ... (دوال التنظيف والاستخراج كما هي) ... */

type Muscle = { muscle_ar: string; muscle_en: string; region: string; prob: number; };
type ChatContext = { muscles: Muscle[] };
type ChatRequest = { session_id?: string|null; user_message: string; context: ChatContext; language?: "ar"|"en" };
type ChatResponse = {
  ui_text?: string; payload?: { exercise?: string; reps?: string; tips?: string[]; [k: string]: any };
  reply?: string; session_id: string; turns: number; usedOpenAI: boolean; youtube: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

type Message = { id: string; role: "user"|"assistant"; text: string; pretty: string; raw?: ChatResponse };

type Props = {
  muscles: Muscle[];
  onExerciseDetected?: (exercise: Exercise | null) => void; // 👈 جديد
};

const ChatBox: React.FC<Props> = ({ muscles, onExerciseDetected }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { console.log("VITE_API_BASE =", API_BASE); }, []);
  const context = useMemo<ChatContext>(() => ({ muscles: muscles ?? [] }), [muscles]);

  const sendMessage = async (userText: string) => {
    const text = userText.trim();
    if (!text) return;

    setMessages(m => [...m, { id: crypto.randomUUID(), role: "user", text, pretty: cleanModelText(text) }]);
    setBusy(true);

    try {
      const body: ChatRequest = { session_id: sessionId, user_message: text, context, language: "ar" };
      const res = await fetch(`${API_BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(()=> "")}`);

      let data: ChatResponse | string;
      try { data = await res.json(); } catch { data = await res.text(); }

      if (typeof data === "object" && data && !sessionId) setSessionId(data.session_id);

      const { ui, payload } = extractUiAndPayload(data);
      let pretty = cleanModelText(ui) || "تم تجهيز إرشاداتك. ابدأ بإحماء خفيف (5–10 دقائق) ثم اتبع الخطوات المقترحة.";

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ui,
        pretty,
        raw: typeof data === "object" ? { ...(data as any), payload: (payload ?? (data as any).payload) } : undefined,
      };
      setMessages(m => [...m, botMsg]);

      // 👇 بلّغ الأب عن التمرين المستنتج
      const name = (botMsg.raw as any)?.payload?.exercise;
      if (onExerciseDetected) onExerciseDetected(name ? findExerciseByName(String(name)) : null);

    } catch (err) {
      console.error(err);
      setMessages(m => [...m, { id: crypto.randomUUID(), role: "assistant", text: "تعذر الاتصال بالخدمة الآن. جرّب لاحقًا.", pretty: "تعذر الاتصال بالخدمة الآن. جرّب لاحقًا." }]);
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

  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoSentRef.current && muscles && muscles.length > 0) {
      autoSentRef.current = true;
      sendMessage("شعور بسيط بالألم — خلّنا نبدأ بخطة آمنة 💪");
    }
  }, [muscles]); // eslint-disable-line

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* الرسائل */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-50 p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-center py-10">حدّد مكان الألم أو اكتب سؤالك، وبنرد عليك بإرشادات مرتبة. ✨</div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={["max-w-[90%] rounded-2xl px-4 py-3 leading-7 shadow-sm", m.role === "user" ? "bg-blue-50" : "bg-white/70"].join(" ")}>
                <ReactMarkdown
                  components={{
                    code: ({ inline, children, ...props }) => inline ? <code className="px-1 py-0.5 rounded bg-black/5" {...props}>{children}</code> : null,
                    h3: ({ children }) => <h3 className="text-lg font-semibold mt-1 mb-1">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold mt-1 mb-1">{children}</h4>,
                    ul: ({ children }) => <ul className="list-disc ms-6 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal ms-6 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-7">{children}</li>,
                    p: ({ children }) => <p className="my-1">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="opacity-90">{children}</em>,
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline">{children}</a>,
                  }}
                >
                  {m.pretty}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
        {busy && <div className="text-slate-500 text-sm text-center py-2">يكتب…</div>}
      </div>

      {/* ملاحظة: ما فيه ExerciseCard هنا بعد الآن */}
      
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
