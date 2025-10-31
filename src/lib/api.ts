// src/lib/api.ts
import axios from "axios";

export interface MuscleContext {
  muscle_ar: string;
  muscle_en: string;
  region: string;
  prob: number;
}

export interface ChatPayload {
  session_id?: string | null;
  user_message: string;
  context?: { muscles: MuscleContext[] };
  language?: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  turns: number;
  usedOpenAI: boolean;
  youtube: string;
}

export interface AnalyzePayload {
  side: "front" | "back";
  circle: { cx: number; cy: number; radius: number };
}

export interface AnalyzeResponse {
  results: MuscleContext[];
}

/* ====================== إعداد API_BASE آمن ====================== */
const rawBase =
  (import.meta as any)?.env?.VITE_API_BASE || "https://armonia-backend.onrender.com";
// شيل أي سلاش نهائي لتفادي // في العناوين:
const API_BASE = String(rawBase).replace(/\/+$/, "");

console.log("VITE_API_BASE =", API_BASE);

/* ====================== axios instance ====================== */
const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  // لا نرسل كريدنشلز (الـCORS ما يحتاجها هنا)
  withCredentials: false,
});

// رسالة خطأ موحّدة للتشخيص فقط (بدون كسر الواجهة)
const logAxiosError = (err: any, where: string) => {
  try {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = err?.message || "unknown";
    // نطبع ولكن لا نرمي الخطأ — الدوال تحت ترجع fallback
    console.warn(`[api:${where}] failed`, { status, data, msg });
  } catch {
    // تجاهل
  }
};

/* ====================== API functions ====================== */

// ملاحظة: استخدمنا /api/chat (الأبسط). فيه alias في الباكند.
export const sendChat = async (payload: ChatPayload): Promise<ChatResponse> => {
  try {
    const res = await api.post<ChatResponse>("/api/chat", {
      session_id: payload.session_id ?? null,
      user_message: payload.user_message,
      context: payload.context ?? { muscles: [] },
      language: payload.language ?? "ar",
    });
    return res.data;
  } catch (err) {
    logAxiosError(err, "sendChat");
    // ✅ Fallback: ما نكسر الـUI — نرجّع رد افتراضي عربي مفيد
    const text = (payload.user_message || "").toLowerCase();
    const ytQuery =
      payload?.context?.muscles?.[0]?.muscle_en ||
      payload?.context?.muscles?.[0]?.muscle_ar ||
      "safe home mobility exercise";

    const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      ytQuery
    )}`;

    const reply =
      text.includes("سلام") || text.includes("السلام")
        ? `وعليكم السلام! السيرفر متعذر حاليًا. تقدر تبدأ بخطة خفيفة: 5–10 دقائق إحماء (مشي/دراجة)، ثم تمارين حركة خفيفة. هذا بحث قد يفيدك: ${youtube}`
        : `الخدمة متعذّرة مؤقتًا، لكن تقدر تبدأ بإحماء 5–10 دقائق وتمارين مدى حركة خفيفة بدون ألم. هذا بحث قد يساعدك: ${youtube}`;

    return {
      session_id: payload.session_id || "local-fallback",
      reply,
      turns: 0,
      usedOpenAI: false,
      youtube,
    };
  }
};

export const analyzeSelection = async (
  payload: AnalyzePayload
): Promise<AnalyzeResponse> => {
  try {
    const res = await api.post<AnalyzeResponse>("/api/analyze", payload);
    // لو الباك رجع شيء غير متوقع، نضمن شكل ثابت
    return res?.data?.results ? res.data : { results: [] };
  } catch (err) {
    logAxiosError(err, "analyzeSelection");
    // ✅ لا نكسر واجهة التشخيص — نخلي الـfallback في الواجهة يشتغل
    return { results: [] };
  }
};

export default api;
