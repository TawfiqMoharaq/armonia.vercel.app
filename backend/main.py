"""FastAPI backend powering chat coaching and muscle selection APIs."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from .config import FRONTEND_ORIGIN, OPENAI_API_KEY, OPENAI_MODEL
from .logic import analyze_selection
from .muscle_data import BODY_MAP, BodySideKey

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 24
SYSTEM_PROMPT = (
    "أنت مدرب لياقة افتراضي يتكلم بلهجة سعودية بسيطة. حافظ على الإرشادات عملية وواضحة بدون تشخيص طبي. "
    "ذكّر المستخدم دائماً بالسلامة، الإحماء، والتوقف إذا زاد الألم. لا تكرر نفس الجمل وقدّم خطوات مختصرة وواضحة.\n\n"
    "التزم بالسكيمة التالية في إخراجك باستخدام JSON فقط بدون أي أسوار كود وبدون أي نص خارج JSON:\n"
    "{\n"
    '  "ui_text": "نص عربي منسق للمستخدم (Markdown بسيط بدون أسوار كود وبدون أي JSON داخله)",\n"
    '  "payload": {\n'
    '     "exercise": "اسم التمرين إن وُجد",\n'
    '     "reps": "عدد التكرارات/المدة إن وُجد",\n'
    '     "tips": ["نصيحة 1", "نصيحة 2"]\n'
    "  }\n"
    "}\n"
    "لا تُدخل أي JSON داخل ui_text. ضَع البيانات المنظمة في payload فقط."
)

app = FastAPI(title="Armonia Coaching API")

# ===================== CORS =====================
PROD_ORIGIN = (FRONTEND_ORIGIN or "").strip()
VercelPreviewRegex = r"^https://([a-z0-9-]+\.)*vercel\.app$"

_allowed_origins: List[str] = []
if PROD_ORIGIN:
    _allowed_origins.append(PROD_ORIGIN)
_allowed_origins += ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=VercelPreviewRegex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
    expose_headers=["Content-Type"],
    max_age=86400,
)
# =================== نهاية CORS =========================


class Muscle(BaseModel):
    muscle_ar: str
    muscle_en: str
    region: str
    prob: float = Field(ge=0.0, le=1.0)


class ChatContext(BaseModel):
    muscles: List[Muscle] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    user_message: str = Field(..., min_length=1)
    context: ChatContext = Field(default_factory=ChatContext)
    language: str = Field(default="ar")


class ChatResponse(BaseModel):
    # الحقول الجديدة
    ui_text: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    # توافق خلفي مع الواجهة الحالية
    reply: str
    # باقي الحقول كما هي
    session_id: str
    turns: int
    usedOpenAI: bool
    youtube: str


class CirclePayload(BaseModel):
    cx: float = Field(ge=0.0, le=1.0)
    cy: float = Field(ge=0.0, le=1.0)
    radius: float = Field(gt=0.0, le=0.6)


class AnalyzeRequest(BaseModel):
    side: BodySideKey
    circle: CirclePayload


class AnalyzeResponse(BaseModel):
    results: List[Muscle]


SESSIONS: Dict[str, List[Dict[str, str]]] = {}
SESSIONS_LOCK = asyncio.Lock()

client: Optional[OpenAI] = None
if OPENAI_API_KEY:
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as exc:  # pragma: no cover
        logger.exception("Failed to initialise OpenAI client: %s", exc)
        client = None


def _initial_history() -> List[Dict[str, str]]:
    return [{"role": "system", "content": SYSTEM_PROMPT}]


def _prune_history(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    if not history:
        return history
    system_messages = [msg for msg in history if msg["role"] == "system"]
    base_system = system_messages[0:1]
    conversational = [msg for msg in history if msg["role"] != "system"]
    trimmed = conversational[-MAX_HISTORY_MESSAGES:]
    return base_system + trimmed


def _build_context_message(context: ChatContext) -> Optional[Dict[str, str]]:
    if not context.muscles:
        return None

    lines = ["سياق عضلي مختصر:"]
    for muscle in context.muscles[:6]:
        percent = round(muscle.prob * 100)
        lines.append(
            f"- {muscle.muscle_ar} ({muscle.muscle_en}) | المنطقة: {muscle.region} | الاحتمال التقريبي: {percent}%"
        )
    return {"role": "system", "content": "\n".join(lines)}


def _youtube_link(context: ChatContext) -> str:
    if context.muscles:
        nearest = max(context.muscles, key=lambda m: m.prob, default=None)
        if nearest and nearest.muscle_en:
            query = quote_plus(f"bodyweight exercise {nearest.muscle_en}")
            return f"https://www.youtube.com/results?search_query={query}"
    return "https://www.youtube.com/results?search_query=mobility+exercise+routine"


def _fallback_message(user_message: str, youtube: str) -> Dict[str, Any]:
    text = user_message.lower()
    if "سلام" in text:
        prefix = "وعليكم السلام! السيرفر مو متصل حالياً."
    elif "?" in user_message:
        prefix = "أدري إن عندك سؤال مهم بس الخدمة متوقفة مؤقتاً."
    else:
        prefix = "العذر والسموحة، الخدمة متوقفة مؤقتاً."
    ui = f"{prefix} تقدر تشوف التمرين المقترح هنا: {youtube}"
    return {"ui_text": ui, "payload": {"status": "fallback"}}


async def _update_session(session_id: str, user_text: str, assistant_text: str) -> int:
    async with SESSIONS_LOCK:
        history = SESSIONS.setdefault(session_id, _initial_history())
        history.append({"role": "user", "content": user_text})
        history.append({"role": "assistant", "content": assistant_text})
        pruned = _prune_history(history)
        SESSIONS[session_id] = pruned
        turns = sum(1 for message in pruned if message["role"] == "assistant")
        return turns


async def _get_history(session_id: str) -> List[Dict[str, str]]:
    async with SESSIONS_LOCK:
        history = SESSIONS.setdefault(session_id, _initial_history())
        return list(history)


@app.get("/health")
async def health() -> Dict[str, object]:
    return {
        "status": "ok",
        "coaching": bool(OPENAI_API_KEY),
        "maps": list(BODY_MAP.keys()),
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    results = analyze_selection(
        payload.side, payload.circle.cx, payload.circle.cy, payload.circle.radius
    )
    muscles = [
        Muscle(
            muscle_ar=item["muscle_ar"],
            muscle_en=item["muscle_en"],
            region=item["region"],
            prob=float(item["prob"]),
        )
        for item in results
    ]
    return AnalyzeResponse(results=muscles)


# ========= سكيمة الاستجابة من النموذج =========
JSON_SCHEMA = {
    "name": "coach_response",
    "schema": {
        "type": "object",
        "properties": {
            "ui_text": {
                "type": "string",
                "description": "نص عربي منسق للمستخدم (Markdown بسيط بدون أسوار كود وبدون JSON داخله)."
            },
            "payload": {
                "type": "object",
                "description": "بيانات منظمة للاستخدام الداخلي (غير معروضة للمستخدم).",
                "properties": {
                    "exercise": {"type": "string"},
                    "reps": {"type": "string"},
                    "tips": {"type": "array", "items": {"type": "string"}}
                },
                "additionalProperties": True
            }
        },
        "required": ["ui_text", "payload"],
        "additionalProperties": True
    }
}
# ============================================


async def _handle_chat(payload: ChatRequest) -> ChatResponse:
    session_id = payload.session_id or uuid4().hex
    history = await _get_history(session_id)

    context_message = _build_context_message(payload.context)
    request_messages = list(history)
    if context_message:
        request_messages.append(context_message)
    request_messages.append({"role": "user", "content": payload.user_message})

    youtube = _youtube_link(payload.context)

    ui_text = ""
    payload_obj: Dict[str, Any] = {}
    used_openai = False

    if client:
        try:
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model=OPENAI_MODEL or "gpt-4o-mini",
                messages=request_messages,
                temperature=0.6,
                max_tokens=450,
                response_format={"type": "json_schema", "json_schema": JSON_SCHEMA},
            )

            raw = (completion.choices[0].message.content or "").strip()
            # يجب أن يكون JSON صافي وفق السكيمة
            data = json.loads(raw)
            ui_text = (data.get("ui_text") or "").strip()
            payload_obj = data.get("payload") or {}
            used_openai = True

            # حماية إضافية: لو النموذج خالف التعليمات
            if not ui_text:
                ui_text = "تم تجهيز إرشاداتك. جرّب وضعية الجسم المريحة وابدأ بإحماء خفيف 5–10 دقائق."
        except Exception as exc:  # يشمل فشل JSON/شبكة
            logger.exception("OpenAI chat completion failed: %s", exc)
            fb = _fallback_message(payload.user_message, youtube)
            ui_text = fb["ui_text"]
            payload_obj = fb["payload"]
    else:
        fb = _fallback_message(payload.user_message, youtube)
        ui_text = fb["ui_text"]
        payload_obj = fb["payload"]

    # نخزن في السيشن "نص العرض" فقط (بدون JSON)
    turns = await _update_session(session_id, payload.user_message, ui_text)

    # توافق خلفي: reply = ui_text
    return ChatResponse(
        session_id=session_id,
        ui_text=ui_text,
        payload=payload_obj,
        reply=ui_text,
        turns=turns,
        usedOpenAI=used_openai,
        youtube=youtube,
    )


@app.post("/api/chat/send", response_model=ChatResponse)
async def send_chat(payload: ChatRequest) -> ChatResponse:
    return await _handle_chat(payload)


@app.post("/api/chat", response_model=ChatResponse)
async def send_chat_alias(payload: ChatRequest) -> ChatResponse:
    return await _handle_chat(payload)
