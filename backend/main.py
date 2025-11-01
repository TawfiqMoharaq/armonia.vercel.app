"""FastAPI backend powering chat coaching and muscle selection APIs."""

from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional, Any
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
    "أنت مدرب لياقة افتراضي ومستشار أسري تتكلم بلهجة سعودية بسيطة. "
    "دورك يتغيّر تلقائياً حسب محتوى رسالة المستخدم: "
    "🔹 إذا كانت الرسالة عن التمارين، العضلات، الأداء الحركي، التصحيح، الإصابات الخفيفة → "
    "تتصرّف كمدرب لياقة: تقدم خطوات عملية وواضحة بدون تشخيص طبي، "
    "ذكّر دائماً بالإحماء، التنفس، التدرّج، والتوقف إذا زاد الألم. "
    "لا تكرر نفس الجمل وقدّم تعليمات قصيرة ومباشرة وعدّات واضحة. "
    "🔹 إذا كانت الرسالة عن طفل من ذوي اضطراب طيف التوحّد، أو عن سلوكيات، دمج مدرسي، روتين، تنظيم الحواس "
    "→ تتصرف كمستشار أسري: تقدّم نصائح عملية قابلة للتطبيق في البيت والمدرسة، "
    "بدون أي تشخيص أو تأكيدات علاجية. "
    "استخدم تعاطف وطمأنة بدون مبالغة، وقدّم خطوات بسيطة وروتينات قصيرة. "
    "ذكّر دائماً بسلامة الطفل وطلب مساعدة مختص عند وجود مؤشرات خطر مثل "
    "إيذاء النفس أو تدهور حاد في المهارات. "
    "🔸 لا تستخدم مصطلحات طبية ثقيلة. "
    "🔸 تجنّب الحديث في الدين والسياسة والطب النفسي العميق. "
    "🔸 لا تنتقد الأهل ولا تشعرهم بالذنب. "
    "اضبط نبرة الرد بحيث تكون ودودة، مرتّبة، ومناسبة للسياق: لياقة = حماس وطاقة، أسري = طمأنة وتعاطف."
)



app = FastAPI(title="Armonia Coaching API")


def _parse_origins(origin_setting: str) -> List[str]:
    if origin_setting.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in origin_setting.split(",") if origin.strip()]


# ✅ CORS باستخدام regex (Vercel + Localhost)
origin_regex = r"https://.*vercel\.app$|http://localhost:5173"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================== نماذج البيانات ===============================

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
    session_id: str
    reply: str
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


# ============================== جلسات المحادثة ===============================

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


def _fallback_message(user_message: str, youtube: str) -> str:
    text = (user_message or "").lower()
    if "سلام" in text:
        prefix = "وعليكم السلام! السيرفر مو متصل حالياً."
    elif "?" in user_message:
        prefix = "أدري إن عندك سؤال مهم بس الخدمة متوقفة مؤقتاً."
    else:
        prefix = "العذر والسموحة، الخدمة متوقفة مؤقتاً."
    return f"{prefix} تقدر تشوف التمرين المقترح هنا: {youtube}"


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


# ================================== Health ===================================

@app.get("/health")
async def health() -> Dict[str, object]:
    return {
        "status": "ok",
        "coaching": bool(OPENAI_API_KEY),
        "maps": list(BODY_MAP.keys()),
    }


# ============================== Helpers للتحليل ===============================

def _bm_items_for_side(side_key: str) -> List[dict]:
    """يرجع عناصر BODY_MAP[side].items إن أمكن."""
    try:
        side_map = BODY_MAP.get(side_key) or {}
        items = side_map.get("items") or side_map.get("ITEMS") or []
        if isinstance(items, list):
            return items
    except Exception:
        pass
    return []


def _lookup_by_en(side_key: str, name_en: str) -> tuple[str, str]:
    """
    يحاول إيجاد (muscle_ar, region) عبر name_en ضمن BODY_MAP للجهة،
    ثم الجهة الأخرى إن فشل. عند الفشل يرجّع (name_en, "").
    """
    name_en_l = (name_en or "").strip().lower()
    # الجهة نفسها
    for it in _bm_items_for_side(side_key):
        if str(it.get("name_en", "")).strip().lower() == name_en_l:
            return (it.get("name_ar") or name_en, it.get("region") or "")
    # الجهة الأخرى
    other = "back" if side_key == "front" else "front"
    for it in _bm_items_for_side(other):
        if str(it.get("name_en", "")).strip().lower() == name_en_l:
            return (it.get("name_ar") or name_en, it.get("region") or "")
    # فشل
    return (name_en or "", "")


def _coerce_item_to_muscle(side_key: str, item: Any) -> Optional[Muscle]:
    """
    يحوّل item بأي صيغة إلى Muscle:
      - dict: يدعم مفاتيح muscle_ar/name_ar/ar, muscle_en/name_en/en, region, prob/score/p
      - tuple/list: (en, prob) أو (en, region, prob)
      - str: تعتبر muscle_en
    """
    try:
        # dict
        if isinstance(item, dict):
            ar = item.get("muscle_ar") or item.get("name_ar") or item.get("ar") or ""
            en = item.get("muscle_en") or item.get("name_en") or item.get("en") or ""
            region = item.get("region") or ""
            prob_val = item.get("prob", item.get("score", item.get("p", 0.0)))
            try:
                prob = float(prob_val)
            except Exception:
                prob = 0.0
            if not ar or not region:
                ar2, reg2 = _lookup_by_en(side_key, en or ar)
                ar = ar or ar2
                region = region or reg2
            if not (ar or en):
                return None
            return Muscle(
                muscle_ar=ar or en,
                muscle_en=en or ar,
                region=region or "",
                prob=max(0.0, min(prob, 1.0)),
            )

        # tuple/list: (en, prob) أو (en, region, prob)
        if isinstance(item, (list, tuple)) and len(item) >= 1:
            en = str(item[0] or "")
            region = ""
            prob = 0.0
            if len(item) == 2:
                try:
                    prob = float(item[1] or 0.0)
                except Exception:
                    prob = 0.0
            elif len(item) >= 3:
                region = str(item[1] or "")
                try:
                    prob = float(item[2] or 0.0)
                except Exception:
                    prob = 0.0
            ar, reg2 = _lookup_by_en(side_key, en)
            region = region or reg2
            return Muscle(
                muscle_ar=ar or en,
                muscle_en=en,
                region=region or "",
                prob=max(0.0, min(prob, 1.0)),
            )

        # string: اعتبرها muscle_en
        if isinstance(item, str):
            en = item
            ar, region = _lookup_by_en(side_key, en)
            return Muscle(
                muscle_ar=ar or en,
                muscle_en=en,
                region=region or "",
                prob=0.0,
            )

    except Exception as exc:
        logger.exception("Failed to coerce muscle item: %r", exc)

    return None


# ================================ Analyze API ================================

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    """
    يُرجع نتائج موحّدة حتى لو تغيّر شكل مخرجات analyze_selection
    (list[dict]/list[str]/list[tuple]/dict يحتوي على 'results'/غير ذلك).
    """
    raw = analyze_selection(
        payload.side, payload.circle.cx, payload.circle.cy, payload.circle.radius
    )

    # قد يرجع dict فيه 'results' أو مباشرة list
    if isinstance(raw, dict) and "results" in raw:
        raw_list = raw.get("results", [])
    else:
        raw_list = raw

    if not isinstance(raw_list, list):
        raw_list = []

    muscles: List[Muscle] = []
    for item in raw_list:
        m = _coerce_item_to_muscle(payload.side, item)
        if m:
            muscles.append(m)

    return AnalyzeResponse(results=muscles)


# ================================ Chat Helpers ===============================

async def _handle_chat(payload: ChatRequest) -> ChatResponse:
    session_id = payload.session_id or uuid4().hex
    history = await _get_history(session_id)

    context_message = _build_context_message(payload.context)
    request_messages = list(history)
    if context_message:
        request_messages.append(context_message)
    request_messages.append({"role": "user", "content": payload.user_message})

    youtube = _youtube_link(payload.context)

    reply_text = ""
    used_openai = False

    if client:
        try:
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model=OPENAI_MODEL or "gpt-4o-mini",
                messages=request_messages,
                temperature=0.6,
                max_tokens=350,
            )
            reply_text = (completion.choices[0].message.content or "").strip()
            used_openai = True
        except (ValueError, IndexError) as exc:
            logger.exception("OpenAI chat completion failed: %s", exc)
            reply_text = _fallback_message(payload.user_message, youtube)
        except Exception as exc:  # pragma: no cover
            logger.exception("Unexpected error from OpenAI: %s", exc)
            reply_text = _fallback_message(payload.user_message, youtube)
    else:
        reply_text = _fallback_message(payload.user_message, youtube)

    turns = await _update_session(session_id, payload.user_message, reply_text)

    return ChatResponse(
        session_id=session_id,
        reply=reply_text,
        turns=turns,
        usedOpenAI=used_openai,
        youtube=youtube,
    )


# ================================= Chat APIs =================================

@app.post("/api/chat/send", response_model=ChatResponse)
async def send_chat(payload: ChatRequest) -> ChatResponse:
    return await _handle_chat(payload)


@app.post("/api/chat", response_model=ChatResponse)
async def send_chat_alias(payload: ChatRequest) -> ChatResponse:
    return await _handle_chat(payload)
