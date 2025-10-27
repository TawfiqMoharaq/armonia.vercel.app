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
  context?: {
    muscles: MuscleContext[];
  };
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
  circle: {
    cx: number;
    cy: number;
    radius: number;
  };
}

export interface AnalyzeResponse {
  results: MuscleContext[];
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080",
  timeout: 45000,
});

export const sendChat = async (payload: ChatPayload): Promise<ChatResponse> => {
  const response = await api.post<ChatResponse>("/api/chat/send", {
    session_id: payload.session_id ?? null,
    user_message: payload.user_message,
    context: payload.context ?? { muscles: [] },
    language: payload.language ?? "ar",
  });
  return response.data;
};

export const analyzeSelection = async (payload: AnalyzePayload): Promise<AnalyzeResponse> => {
  const response = await api.post<AnalyzeResponse>("/api/analyze", payload);
  return response.data;
};

export default api;
