// src/lib/api.ts
import axios from "axios";

export interface MuscleContext { muscle_ar: string; muscle_en: string; region: string; prob: number; }
export interface ChatPayload { session_id?: string | null; user_message: string; context?: { muscles: MuscleContext[] }; language?: string; }
export interface ChatResponse { session_id: string; reply: string; turns: number; usedOpenAI: boolean; youtube: string; }
export interface AnalyzePayload { side: "front" | "back"; circle: { cx: number; cy: number; radius: number }; }
export interface AnalyzeResponse { results: MuscleContext[]; }

const rawBase = (import.meta as any)?.env?.VITE_API_BASE || "https://armonia-backend.onrender.com";
export const API_BASE = String(rawBase).replace(/\/+$/, "");
console.log("VITE_API_BASE =", API_BASE);

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  withCredentials: false,
});

const log = (err: any, where: string) => {
  const status = err?.response?.status; const data = err?.response?.data; const msg = err?.message || "unknown";
  console.warn(`[api:${where}]`, { status, data, msg });
};

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
    log(err, "sendChat");
    const q = payload?.context?.muscles?.[0]?.muscle_en || payload?.context?.muscles?.[0]?.muscle_ar || "safe home mobility exercise";
    const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const t = (payload.user_message || "").toLowerCase();
    const reply = t.includes("سلام") ? `وعليكم السلام! الخدمة متعذّرة مؤقتًا. ابدأ بإحماء 5–10 دقائق وتمارين حركة خفيفة. بحث قد يفيدك: ${youtube}`
                                     : `الخدمة متعذّرة مؤقتًا. ابدأ بإحماء 5–10 دقائق وتمارين مدى حركة خفيفة. بحث قد يساعدك: ${youtube}`;
    return { session_id: payload.session_id || "local-fallback", reply, turns: 0, usedOpenAI: false, youtube };
  }
};

export const analyzeSelection = async (payload: AnalyzePayload): Promise<AnalyzeResponse> => {
  try {
    const res = await api.post<AnalyzeResponse>("/api/analyze", payload);
    return res?.data?.results ? res.data : { results: [] };
  } catch (err) {
    log(err, "analyzeSelection");
    return { results: [] };
  }
};

export default api;
