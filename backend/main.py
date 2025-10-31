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
    "أنت مدرب لياقة افتراضي بلهجة سعودية بسيطة.\n"
    "قدّم تعليمات قصيرة ومباشرة.\n"
    "الشكل يكون:\n"
    "• جملة بسيطة تشير لمكان الألم.\n"
    "• تمرين واحد مناسب + عدد تكرارات.\n"
    "• تمرين إطالة واحد + مدة.\n"
    "• ثلاث نصائح سلامة قصيرة.\n"
    "لا تظهر JSON ولا كود للمستخدم نهائيًا.\n"
    "استخدم ui_text لعرض النص، و payload: exercise,reps,tips للاستخدام الداخلي.\n"
    "الرد لا يزيد عن 5 أسطر.\n"
    "إذا أُعطيت سياق عضلي، قدّم تمرين في بداية الخطة.\n"
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
# =================================================


class Muscle(BaseModel):
    muscle_ar: str
    muscle_en: str
    region: str
    prob: float = Field(ge=0.0, le=1.0)


class ChatContext(BaseModel):
    muscles: List[Muscle] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    user_message: str
    context: ChatContext = Field(default_factory=ChatContext)
    language: str = Field(default="ar")


class ChatResponse(BaseModel):
    ui_text: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    reply: str
    session_id: str
    turns: int
    usedOpenAI: bool
    youtube: str


class CirclePayload(BaseModel):
    cx: float
    cy: float
    radius: float


class AnalyzeRequest(BaseModel):
    side: BodySideKey
    circle: CirclePayload


class AnalyzeResponse(BaseModel):
    results: List[Muscle]


SESSIONS: Dict[str, List[Dict[str, str]]] = {}
SESSIONS_LOCK = asyncio.Lock()

client = None
if OPENAI_API_KEY:
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception:
        client = None


def _initial_history():
    return [{"role": "system", "content": SYSTEM_PROMPT}]


def _prune_history(history):
    system_msgs = [m for m in history if m["role"] == "system"]
    conversational = [m for m in history if m["role"] != "system"]
    return system_msgs[:1] + conversational[-MAX_HISTORY_MESSAGES:]


async def _update_session(session_id, user, assistant):
    async with SESSIONS_LOCK:
        hist = SESSIONS.setdefault(session_id, _initial_history())
        hist.append({"role": "user", "content": user})
        hist.append({"role": "assistant", "content": assistant})
        SESSIONS[session_id] = _prune_history(hist)
        return sum(1 for m in hist if m["role"] == "assistant")


async def _get_history(session_id):
    async with SESSIONS_LOCK:
        return list(SESSIONS.setdefault(session_id, _initial_history()))


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest):
    results = analyze_selection(payload.side, payload.circle.cx, payload.circle.cy, payload.circle.radius)
    return AnalyzeResponse(results=[
        Muscle(**item) for item in results
    ])


JSON_SCHEMA = {
    "name": "coach_response",
    "schema": {
        "type": "object",
        "properties": {
            "ui_text": {"type": "string"},
            "payload": {
                "type": "object",
                "properties": {
                    "exercise": {"type": "string"},
                    "reps": {"type": "string"},
                    "tips": {"type": "array", "items": {"type": "string"}},
                },
                "additionalProperties": True,
            },
        },
        "required": ["ui_text"],
        "additionalProperties": True,
    },
}

# ✅ منطقي ينفّذ السكوات حسب العضلات
def detect_squat(context: ChatContext) -> bool:
    if not context.muscles:
        return False
    top = max(context.muscles, key=lambda m: m.prob)
    return ("ظهر" in top.muscle_ar) or ("lumbar" in top.muscle_en.lower())


async def _handle_chat(payload: ChatRequest) -> ChatResponse:
    session_id = payload.session_id or uuid4().hex
    history = await _get_history(session_id)

    history.append({"role": "user", "content": payload.user_message})

    youtube = "https://www.youtube.com/results?search_query=squat+form"

    ui_text = ""
    payload_obj: Dict[str, Any] = {}
    used_openai = False

    if client:
        try:
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model=OPENAI_MODEL or "gpt-4o-mini",
                messages=history,
                temperature=0.55,
                max_tokens=300,
                response_format={"type": "json_schema", "json_schema": JSON_SCHEMA},
            )
            data = json.loads(completion.choices[0].message.content or "{}")
            ui_text = (data.get("ui_text") or "").strip()
            payload_obj = data.get("payload") or {}
            used_openai = True
        except Exception as e:
            logger.error(e)
            ui_text = "تأكد من اتصالك وجرّب لاحقًا."
            payload_obj = {}

    # ✅ إذا ما عطى تمارين → نضيف سكوات تلقائيًا
    if detect_squat(payload.context):
        if "exercise" not in payload_obj:
            payload_obj.update({
                "exercise": "Squat",
                "reps": "3×10",
                "tips": ["نزل بالورك", "ظهر مستقيم", "اكبس كعبك"]
            })

        if not ui_text:
            ui_text = "خلنا نقوي ظهرك بتمرين سكوات، جاهز؟ 💪"

    if not ui_text:
        ui_text = "تمام! عطنا وضعيتك بشكل مريح ونبدأ بخطوات آمنة."

    turns = await _update_session(session_id, payload.user_message, ui_text)

    return ChatResponse(
        session_id=session_id,
        ui_text=ui_text,
        payload=payload_obj,
        reply=ui_text,
        turns=turns,
        usedOpenAI=used_openai,
        youtube=youtube,
    )


@app.post("/api/chat")
async def chat_alias(payload: ChatRequest):
    return await _handle_chat(payload)
