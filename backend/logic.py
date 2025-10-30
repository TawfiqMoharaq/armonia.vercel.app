# selection_logic.py
# -- منطق تحديد العضلات بدائرة + تحسينات التسامح ورسائل الديبَغ --

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Iterable, List, Tuple, TypedDict

import math
import numpy as np

from .muscle_data import BODY_MAP, BodySideKey, build_id_lookup

# أبعاد الخريطة التي نرسم عليها مربعات العضلات (ثابتة، عمودي)
LABEL_HEIGHT = 1200
LABEL_WIDTH = 800

ID_LOOKUP = build_id_lookup()


def circle_mask(height: int, width: int, cx: float, cy: float, radius: float) -> np.ndarray:
    """يرجع قناع (mask) للبكسلات داخل دائرة مركزها (cx, cy)."""
    yy, xx = np.ogrid[:height, :width]
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2


@dataclass(frozen=True)
class TopResult:
    muscle_id: int
    weight: float
    pixels: int


@lru_cache(maxsize=None)
def _build_label_map(side: BodySideKey) -> np.ndarray:
    """نحوّل مربعات العضلات (normalized) إلى خريطة تسميات بالبكسل."""
    label_map = np.zeros((LABEL_HEIGHT, LABEL_WIDTH), dtype=np.int32)
    side_data = BODY_MAP[side]
    for item in side_data["items"]:
        x1, y1, x2, y2 = item["box_norm"]
        x1_i = max(int(x1 * LABEL_WIDTH), 0)
        x2_i = min(int(x2 * LABEL_WIDTH), LABEL_WIDTH)
        y1_i = max(int(y1 * LABEL_HEIGHT), 0)
        y2_i = min(int(y2 * LABEL_HEIGHT), LABEL_HEIGHT)
        if x2_i <= x1_i or y2_i <= y1_i:
            continue
        label_map[y1_i:y2_i, x1_i:x2_i] = item["id"]
    return label_map


def top_muscles_circle(
    label_map: np.ndarray,
    cx: float,
    cy: float,
    radius: float,
    *,
    sigma_scale: float = 0.25,  # أضيق من 0.35 حتى يعطي وزن أقوى للمركز
    k: int = 5,
    min_pixels: int = 3,        # تقليل الحد الأدنى لتقليل فشل الالتقاط
) -> List[TopResult]:
    """أعلى k عضلات داخل دائرة، مرتبة بالوزن الغوسي نحو المركز."""
    height, width = label_map.shape
    mask = circle_mask(height, width, cx, cy, radius)
    if not mask.any():
        return []

    # توزيع غوسي حول المركز (الأقرب للمركز وزنه أعلى)
    center_x = np.arange(width)
    center_y = np.arange(height)[:, None]
    sigma = max(sigma_scale * radius, 0.75)  # كان 1.0 → نخفضه قليلاً
    dist_sq = (center_x - cx) ** 2 + (center_y - cy) ** 2
    weights = np.exp(-dist_sq / (2 * sigma**2))

    pixels = label_map[mask]
    valid_pixels = pixels > 0
    if not np.any(valid_pixels):
        return []

    unique_ids = np.unique(pixels[valid_pixels])
    results: List[TopResult] = []
    for muscle_id in unique_ids:
        region_mask = (label_map == muscle_id) & mask
        pix_count = int(region_mask.sum())
        if pix_count < min_pixels:
            continue
        weight = float(weights[region_mask].sum())
        if weight <= 0:
            continue
        results.append(TopResult(muscle_id=muscle_id, weight=weight, pixels=pix_count))

    results.sort(key=lambda item: item.weight, reverse=True)
    return results[:k]


def top_region(results: Iterable[TopResult]) -> Tuple[str, float] | None:
    """تجميع حسب المنطقة (كتف/فخذ/...) لإظهار المنطقة الأبرز."""
    region_scores: Dict[str, float] = {}
    total_weight = 0.0
    for item in results:
        meta = ID_LOOKUP.get(item.muscle_id)
        if not meta:
            continue
        region_scores[meta["region"]] = region_scores.get(meta["region"], 0.0) + item.weight
        total_weight += item.weight

    if not region_scores or total_weight <= 0:
        return None

    top_region_name = max(region_scores.items(), key=lambda kv: kv[1])
    return top_region_name[0], top_region_name[1] / total_weight


class SelectionResult(TypedDict):
    id: int
    prob: float
    muscle_ar: str
    muscle_en: str
    region: str


class AnalyzeResponse(TypedDict):
    results: List[SelectionResult]
    region_hint: str | None
    region_conf: float | None
    debug: Dict[str, float | int | str]


def analyze_selection(
    side: BodySideKey,
    cx_norm: float,
    cy_norm: float,
    radius_norm: float,
    *,
    k: int = 5,
    min_pixels: int = 3,
    sigma_scale: float = 0.25,
    debug: bool = True,
) -> AnalyzeResponse:
    """
    واجهة عالية المستوى:
    - يستقبل إحداثيات مطبّعة 0..1 (متوافقة مع عرض/ارتفاع الصورة على الواجهة)
    - يرجع أفضل عضلات مع نسب (prob) + تلميح منطقة + معلومات ديبَغ.
    """
    # قص القيم لتجنب أي تطبيع خاطئ قادم من الفرونت
    cx_norm = float(np.clip(cx_norm, 0.0, 1.0))
    cy_norm = float(np.clip(cy_norm, 0.0, 1.0))
    radius_norm = float(np.clip(radius_norm, 0.01, 0.5))

    cx = cx_norm * LABEL_WIDTH
    cy = cy_norm * LABEL_HEIGHT
    radius = radius_norm * min(LABEL_WIDTH, LABEL_HEIGHT)

    # خريطة التسميات حسب جهة الجسم
    label_map = _build_label_map(side)

    # النتائج الأساسية
    raw_results = top_muscles_circle(
        label_map, cx, cy, radius, sigma_scale=sigma_scale, k=k, min_pixels=min_pixels
    )

    formatted: List[SelectionResult] = []
    total_weight = sum(item.weight for item in raw_results)
    if total_weight > 0:
        for item in raw_results:
            meta = ID_LOOKUP.get(item.muscle_id)
            if not meta:
                continue
            formatted.append(
                {
                    "id": item.muscle_id,
                    "prob": round(item.weight / total_weight, 4),
                    "muscle_ar": meta["name_ar"],
                    "muscle_en": meta["name_en"],
                    "region": meta["region"],
                }
            )

    # لو ما حصلنا أي تداخل: استخدم fallback (أقرب مربعات لمركز الدائرة)
    if not formatted:
        candidates: List[Tuple[float, int]] = []
        for item in BODY_MAP[side]["items"]:
            x1, y1, x2, y2 = item["box_norm"]
            center_x = ((x1 + x2) / 2) * LABEL_WIDTH
            center_y = ((y1 + y2) / 2) * LABEL_HEIGHT
            dist = math.hypot(center_x - cx, center_y - cy)
            candidates.append((dist, item["id"]))

        candidates.sort(key=lambda pair: pair[0])
        sliced = candidates[:k]

        if not sliced:
            # حل أخير جداً (يفترض ما نحتاجه غالباً)
            formatted = [{
                "id": -1, "prob": 1.0, "muscle_ar": "غير محدد",
                "muscle_en": "Unspecified", "region": "unknown"
            }]
        else:
            inv_sum = sum(1.0 / (dist + 1e-6) for dist, _ in sliced)
            tmp: List[SelectionResult] = []
            for dist, muscle_id in sliced:
                meta = ID_LOOKUP.get(muscle_id)
                if not meta:
                    continue
                weight = (1.0 / (dist + 1e-6)) / inv_sum
                tmp.append(
                    {
                        "id": muscle_id,
                        "prob": round(weight, 4),
                        "muscle_ar": meta["name_ar"],
                        "muscle_en": meta["name_en"],
                        "region": meta["region"],
                    }
                )
            formatted = tmp

    # تلميح المنطقة (اختياري)
    region_hint = None
    region_conf = None
    if raw_results:
        reg = top_region(raw_results)
        if reg:
            region_hint, region_conf = reg

    dbg = {
        "side": str(side),
        "cx_px": round(cx, 2),
        "cy_px": round(cy, 2),
        "radius_px": round(radius, 2),
        "label_w": LABEL_WIDTH,
        "label_h": LABEL_HEIGHT,
        "raw_count": len(raw_results),
        "used_fallback": 0 if total_weight > 0 else 1,
        "sigma_scale": sigma_scale,
        "min_pixels": min_pixels,
    }

    return {
        "results": formatted,
        "region_hint": region_hint,
        "region_conf": round(region_conf, 4) if region_conf is not None else None,
        "debug": dbg if debug else {},
    }
