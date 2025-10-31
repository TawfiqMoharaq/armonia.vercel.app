// src/components/ChatBox.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ExerciseCard from "./ExerciseCard";
import ChatReply from "./ChatReply";
import { findExerciseByName, type Exercise } from "../data/exercises";

const stripCodeFences = (t: string) => (t ?? "").replace(/```json[\s\S]*?```/gi, "").replace(/```[\s\S]*?```/g, "");
const stripJsonKeysEverywhere = (t: string) =>
  t.replace(/\bjson\b/gi, "")
   .replace(/"?(ui_text|payload|exercise|reps|tips)"?\s*:\s*(\{[^}]*\}|\[[^\]]*\]|"(?:\\.|[^"\\])*"|[^,}\n]+)\s*,?/gi, "")
   .replace(/\{[\s\S]{10,}\}/g, "");
const cleanModelText = (t: string) => stripJsonKeysEverywhere(stripCodeFences(t ?? "")).replace(/\n{3,}/g, "\n\n").trim();
const tryParseJson = (s: unknown): any | null => { if (typeof s !== "string") return null; try { return JSON.parse(s); } catch { return null; } };
const regexExtractUiText = (s: string): string | null => { const m = s.match(/"ui_text"\s*:\s*"(.*?)"/s); return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : null; };
const extractUiAndPayload = (data: any): { ui: string; payload?: any } => {
  if (data && typeof data === "object") {
    if (typeof data.ui_text === "string" && data.ui_text.trim()) return { ui: data.ui_text, payload: data.payload };
    if (typeof data.reply === "string") {
      const parsed = tryParseJson(data.reply);
      if (parsed && typeof parsed.ui_text === "string") return { ui: parsed.ui_text, payload: parsed.payload ?? data.payload };
      const picked = regexExtractUiText(data.reply);
      if (picked) return { ui: picked, payload: data.payload };
      return { ui: data.reply, payload: data.payload };
    }
  }
  if (typeof data === "string") {
    const parsed = tryParseJson(data);
    if (parsed && typeof parsed.ui_text === "string") return { ui: parsed.ui_text, payload: parsed.payload };
    const picked = regexExtractUiText(data);
    if (picked) return { ui: picked };
    return { ui: data };
  }
  return { ui: "" };
};

export type Muscle = { muscle_ar: string; muscle_en: string; region: string; prob: number };
type ChatContext = { muscles: Muscle[] };
type ChatRequest = { session_id?: string | null; user_message: string; context: ChatContext; language?: "ar" | "en" };
type ChatResponse = { ui_text?: string; payload?: { exercise?: string; reps?: string; tips?: string[]; [k: string]: any }; reply?: string; session_id: string; turns: number; usedOpenAI: boolean; youtube: string };

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8080";

type Message = { id: string; role: "user" | "assistant"; text: string; pretty: string; raw?: ChatResponse };

type Props = {
  muscles?: Muscle[];
  musclesContext?: Muscle[];
  autoStartAdvice?: boolean;
  autoStartPrompt?: string;
  sessionKey?: string;
  onSuggestedExercise?: (name: string) => void;
};

const ChatBox: React.FC<Props> = ({
  muscles,
  musclesContext,
  autoStartAdvice = false,
  autoStartPrompt,
  sessionKey,
  onSuggestedExercise,
}) => {
  console.log("[ChatBox] v2.5 loaded");
  const musclesArr = useMemo<Muscle[]>(
    () => (musclesContext && musclesContext.length ? musclesContext : muscles || []),
    [musclesContext, muscles]
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);

  useEffect(() => { setMessages([]); setSessionId(null); setCurrentExercise(null); }, [sessionKey]);
  useEffect(() => { console.log("VITE_API_BASE =", API_BASE); }, []);

  const context = useMemo<ChatContext>(() => ({ muscles: musclesArr ?? [] }), [musclesArr]);

  // كلمات أكثر شمولًا (عربي/إنجليزي/تعابير)
  const RULES: Array<{ kw: RegExp; name: string; coachType?: string; tips?: string[]; aliases?: string[] }> = [
    { kw: /(سكوات|سكوّت|السكوات|\bsquat\b|\bair\s*squat\b|\bbodyweight\s*squat\b)/i,
      name: "Squat", aliases: ["Bodyweight Squat", "Air Squat", "سكوات"], coachType: "squat",
      tips: ["خذ وضع القدمين بعرض الكتفين.","انزل بالحوض للخلف.","حافظ على الركب باتجاه أصابع القدمين."] },
    { kw: /(بلانك|البلانك|\bplank\b|\bfront\s*plank\b)/i, name: "Plank", aliases: ["Front Plank", "بلانك"] },
    { kw: /(ارجاع الذقن|إرجاع الذقن|chin\s*tuck|neck\s*chin\s*tuck)/i, name: "Chin Tuck", aliases: ["Neck Chin Tuck"] },
  ];
  const makeAdHoc = (name: string, coachType?: string, tips?: string[]): Exercise =>
    ({ name, coachType: (coachType ?? "") as any, tips: tips ?? [] } as any);

  const detectExerciseFromText = (text: string): Exercise | null => {
    for (const r of RULES) {
      if (r.kw.test(text)) {
        const exact = findExerciseByName(r.name);
        if (exact) return exact;
        if (r.aliases) for (const a of r.aliases) { const hit = findExerciseByName(a); if (hit) return hit; }
        return makeAdHoc(r.name, r.coachType, r.tips);
      }
    }
    return null;
  };

  const sendMessage = async (userText: string) => {
    const text = userText.trim();
    if (!text) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text, pretty: cleanModelText(text) };
    setMessages((m) => [...m, userMsg]);

    // كشف مسبق — يظهر الكارد فوراً حتى لو الـAPI فشل
    const preEx = detectExerciseFromText(userMsg.pretty);
    if (preEx) {
      setCurrentExercise(preEx);
      onSuggestedExercise?.(preEx.name);
      console.log("[exercise-detect] pre =", preEx.name);
    }

    setBusy(true);
    try {
      const body: ChatRequest = { session_id: sessionId, user_message: text, context, language: "ar" };
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: ChatResponse | string;
      try { data = (await res.json()) as ChatResponse; } catch { data = await res.text(); }
      if (typeof data === "object" && data && !sessionId) setSessionId((data as ChatResponse).session_id);

      const { ui, payload } = extractUiAndPayload(data);
      const pretty = cleanModelText(ui) || "تم تجهيز إرشاداتك. ابدأ بإحماء خفيف (5–10 دقائق) ثم اتبع الخطوات المقترحة.";
      const botMsg: Message = {
        id: crypto.randomUUID(), role: "assistant", text: ui, pretty,
        raw: typeof data === "object" ? { ...(data as any), payload: payload ?? (data as any).payload } : undefined,
      };
      setMessages((m) => [...m, botMsg]);

      // كشف لاحق من الرد أو النصوص
      let ex: Exercise | null = null;
      const nameFromPayload = (botMsg.raw as any)?.payload?.exercise;
      if (nameFromPayload) ex = findExerciseByName(String(nameFromPayload));
      if (!ex) ex = detectExerciseFromText(`${botMsg.pretty}\n${userMsg.pretty}`);
      if (ex) {
        setCurrentExercise(ex);
        onSuggestedExercise?.(ex.name);
        console.log("[exercise-detect] post =", ex.name);
      }
    } catch (err) {
      console.error(err);
      const fallback = "تعذر الاتصال بالخدمة الآن. جرّب لاحقًا أو تحقق من إعداد VITE_API_BASE.";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: fallback, pretty: fallback }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // ✅ تصحيح تلقائي: لو ما طلع الكارد لأي سبب، افحص آخر الرسائل وحدّد التمرين
  useEffect(() => {
    if (currentExercise) return;
    const last = messages.slice(-4);
    const blob = last.map(m => m.pretty).join("\n");
    const ex = detectExerciseFromText(blob);
    if (ex) {
      setCurrentExercise(ex);
      onSuggestedExercise?.(ex.name);
      console.log("[exercise-detect] fixup =", ex.name);
    }
  }, [messages, currentExercise, onSuggestedExercise]);

  const send = async () => {
    const txt = input.trim();
    if (!txt || busy) return;
    setInput("");
    await sendMessage(txt);
  };

  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoStartAdvice || autoSentRef.current) return;
    const prompt = (autoStartPrompt && autoStartPrompt.trim()) || "شعور بسيط بالألم — خلّنا نبدأ بخطة آمنة 💪. أعطني نصائح مختصرة وتمرين مناسب.";
    autoSentRef.current = true;
    void sendMessage(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAdvice, autoStartPrompt, musclesArr?.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const pickFallbackKeywords = (m: Message): string | undefined => {
    const p = m.raw?.payload as any;
    return p?.exercise || p?.muscle || p?.keywords || musclesArr?.[0]?.muscle_ar || musclesArr?.[0]?.muscle_en || "تمارين منزلية آمنة";
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* الشات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-[380px] overflow-y-auto rounded-xl bg-slate-50 p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="text-slate-500 text-center py-10">حدّد مكان الألم أو اكتب سؤالك، وبنرد عليك بإرشادات مرتبة. ✨</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={["max-w-[90%] rounded-2xl px-4 py-3 leading-7 shadow-sm", m.role === "user" ? "bg-blue-50" : "bg-white"].join(" ")}>
                  {m.role === "assistant"
                    ? <ChatReply text={m.pretty} fallbackKeywords={pickFallbackKeywords(m)} />
                    : <div dir="rtl" className="text-slate-800">{m.pretty}</div>}
                </div>
              </div>
            ))
          )}
          {busy && <div className="text-slate-500 text-sm text-center py-2">يكتب…</div>}
        </div>

        {/* الإدخال */}
        <div className="mt-3 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اكتب هنا… (Enter للإرسال)"
            className="flex-1 min-h-[48px] max-h-40 resize-y rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
          <button onClick={send} disabled={busy || !input.trim()} className="shrink-0 rounded-2xl px-4 h-12 bg-blue-600 text-white font-medium shadow hover:bg-blue-700 disabled:opacity-50">
            إرسال
          </button>
        </div>
      </div>

      {/* الكارد تحت الشات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">🎯 التمرين المقترح</h3>
        </div>
        {!currentExercise ? (
          <p className="text-slate-500 mt-2">سيظهر هنا التمرين عندما يُذكر (سكوات/بلانك/…).</p>
        ) : (
          <div className="mt-2"><ExerciseCard exercise={currentExercise} /></div>
        )}
      </div>
    </div>
  );
};

export default ChatBox;
