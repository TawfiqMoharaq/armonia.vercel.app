import React, { useEffect, useMemo, useRef, useState } from "react";
import ExerciseCard from "./ExerciseCard";
import ChatReply from "./ChatReply";
import { findExerciseByName, type Exercise } from "../data/exercises";

/* ---------------- تنظيف النص ---------------- */
const stripCodeFences = (t: string) =>
  (t ?? "").replace(/```json[\s\S]*?```/gi, "").replace(/```[\s\S]*?```/g, "");

const stripJsonKeysEverywhere = (t: string) =>
  t
    .replace(/\bjson\b/gi, "")
    .replace(
      /"?(ui_text|payload|exercise|reps|tips)"?\s*:\s*(\{[^}]*\}|\[[^\]]*\]|"(?:\\.|[^"\\])*"|[^,}\n]+)\s*,?/gi,
      ""
    )
    .replace(/\{[\s\S]{10,}\}/g, "");

const cleanModelText = (t: string) => {
  const noFences = stripCodeFences(t ?? "");
  const noJsonLeftovers = stripJsonKeysEverywhere(noFences);
  return noJsonLeftovers.replace(/\n{3,}/g, "\n\n").trim();
};

const tryParseJson = (s: unknown): any | null => {
  if (typeof s !== "string") return null;
  try { return JSON.parse(s); } catch { return null; }
};

const regexExtractUiText = (s: string): string | null => {
  const m = s.match(/"ui_text"\s*:\s*"(.*?)"/s);
  if (!m) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
};

const extractUiAndPayload = (data: any): { ui: string; payload?: any } => {
  if (data && typeof data === "object") {
    if (typeof data.ui_text === "string" && data.ui_text.trim()) {
      return { ui: data.ui_text, payload: data.payload };
    }
    if (typeof data.reply === "string") {
      const parsed = tryParseJson(data.reply);
      if (parsed && typeof parsed.ui_text === "string") {
        return { ui: parsed.ui_text, payload: parsed.payload ?? data.payload };
      }
      const picked = regexExtractUiText(data.reply);
      if (picked) return { ui: picked, payload: data.payload };
      return { ui: data.reply, payload: data.payload };
    }
  }
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
/* -------------------------------------------- */

/* --------------- أنواع الداتا --------------- */
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
  reply?: string;
  session_id: string;
  turns: number;
  usedOpenAI: boolean;
  youtube: string;
};
/* -------------------------------------------- */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pretty: string;
  raw?: ChatResponse;
};

type Props = { muscles: Muscle[] };

const ChatBox: React.FC<Props> = ({ muscles }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ صندوق التمرين — نبقيه لو ما قدرنا نكشف تمرين جديد
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    console.log("VITE_API_BASE =", API_BASE);
  }, []);

  const context = useMemo<ChatContext>(() => ({ muscles: muscles ?? [] }), [muscles]);

  /* ---------- كشف التمرين: بدائل + مطابقة غامضة ---------- */
  // بدائل أسماء شائعة لكل مفتاح
  const KEYWORD_MAP: Array<{
    kw: RegExp;
    candidates: { name: string; coachType?: string; tips?: string[] }[];
  }> = [
    {
      kw: /سكوات|squat/i,
      candidates: [
        { name: "Squat", coachType: "squat", tips: ["خذ وضع القدمين بعرض الكتفين.", "انزل بالحوض للخلف.", "حافظ على الركب باتجاه أصابع القدمين."] },
        { name: "Bodyweight Squat", coachType: "squat" },
        { name: "Air Squat", coachType: "squat" },
        { name: "سكوات", coachType: "squat" },
      ],
    },
    {
      kw: /plank|بلانك/i,
      candidates: [
        { name: "Plank" },
        { name: "Front Plank" },
        { name: "بلانك" },
      ],
    },
    {
      kw: /chin\s*tuck|ارجاع الذقن|إرجاع الذقن/i,
      candidates: [{ name: "Chin Tuck" }, { name: "Neck Chin Tuck" }],
    },
  ];

  const tryFindLoose = (text: string): Exercise | null => {
    // 1) ابحث حسب الماب
    for (const rule of KEYWORD_MAP) {
      if (rule.kw.test(text)) {
        for (const cand of rule.candidates) {
          const exact = findExerciseByName(cand.name);
          if (exact) return exact as Exercise;
        }
        // 2) مطابقة contains على نفس المرشحين
        for (const cand of rule.candidates) {
          const variants = [cand.name, " " + cand.name + " ", cand.name.toLowerCase()];
          for (const v of variants) {
            const found =
              findExerciseByName(v) ||
              findExerciseByName(v.trim()) ||
              (findExerciseByName as any)(v.toUpperCase?.());
            if (found) return found as Exercise;
          }
        }
        // 3) ما لقينا؟ نُنشئ ad-hoc
        const primary = rule.candidates[0];
        return {
          name: primary.name,
          coachType: (primary.coachType ?? "") as any,
          tips: primary.tips ?? [],
        } as any;
      }
    }

    // 4) fallback عام: كلمات عربية/إنجليزية مباشرة
    if (/سكوات/i.test(text)) {
      return (findExerciseByName("Bodyweight Squat") ||
        findExerciseByName("Squat") ||
        ({
          name: "Squat",
          coachType: "squat",
          tips: [],
        } as any)) as Exercise;
    }

    return null;
  };

  /* --------------------- إرسال رسالة --------------------- */
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
        throw new Error(`HTTP ${res.status} ${errText}`);
      }

      let data: ChatResponse | string;
      try {
        data = (await res.json()) as ChatResponse;
      } catch {
        data = await res.text();
      }

      if (typeof data === "object" && data && !sessionId) {
        setSessionId((data as ChatResponse).session_id);
      }

      const { ui, payload } = extractUiAndPayload(data);
      let pretty = cleanModelText(ui);
      if (!pretty?.trim()) {
        pretty = "تم تجهيز إرشاداتك. ابدأ بإحماء خفيف (5–10 دقائق) ثم اتبع الخطوات المقترحة.";
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ui,
        pretty,
        raw:
          typeof data === "object"
            ? { ...(data as any), payload: payload ?? (data as any).payload }
            : undefined,
      };
      setMessages((m) => [...m, botMsg]);

      // ---------- تحديث صندوق التمرين ----------
      // 1) من الـpayload لو موجود
      const nameFromPayload = (botMsg.raw as any)?.payload?.exercise;
      let nextExercise: Exercise | null = nameFromPayload
        ? (findExerciseByName(String(nameFromPayload)) as any)
        : null;

      // 2) وإلا: كشف غامض من نصّ المساعد + المستخدم
      if (!nextExercise) {
        nextExercise = tryFindLoose(`${botMsg.pretty}\n${userMsg.pretty}`);
      }

      // 3) لو لقينا شيء—حدّث. لو لا، لا تمسح الحالي (نحافظ عليه)
      if (nextExercise) {
        setCurrentExercise(nextExercise);
        console.log("[exercise-detect] chosen =", nextExercise?.name);
      } else {
        console.log("[exercise-detect] none matched — keeping previous");
      }
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

  /* -------- إرسال تلقائي عند تحديد العضلة -------- */
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoSentRef.current && muscles && muscles.length > 0) {
      autoSentRef.current = true;
      sendMessage("شعور بسيط بالألم — خلّنا نبدأ بخطة آمنة 💪");
    }
  }, [muscles]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------- إدخال المستخدم ----------------- */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const pickFallbackKeywords = (m: Message): string | undefined => {
    const p = m.raw?.payload as any;
    return (
      p?.exercise ||
      p?.muscle ||
      p?.keywords ||
      muscles?.[0]?.muscle_ar ||
      muscles?.[0]?.muscle_en ||
      "تمارين منزلية آمنة"
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* الشات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-[380px] overflow-y-auto rounded-xl bg-slate-50 p-3 space-y-3">
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
                    m.role === "user" ? "bg-blue-50" : "bg-white",
                  ].join(" ")}
                >
                  {m.role === "assistant" ? (
                    <ChatReply text={m.pretty} fallbackKeywords={pickFallbackKeywords(m)} />
                  ) : (
                    <div dir="rtl" className="text-slate-800">
                      {m.pretty}
                    </div>
                  )}
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
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-2xl px-4 h-12 bg-blue-600 text-white font-medium shadow hover:bg-blue-700 disabled:opacity-50"
          >
            إرسال
          </button>
        </div>
      </div>

      {/* صندوق التمرين تحت الشات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">🎯 التمرين المقترح</h3>
        </div>

        {!currentExercise ? (
          <p className="text-slate-500 mt-2">
            سيظهر هنا التمرين عندما يقترحه المدرب (سكوات/بلانك/…).
          </p>
        ) : (
          <div className="mt-2">
            <ExerciseCard exercise={currentExercise} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBox;
