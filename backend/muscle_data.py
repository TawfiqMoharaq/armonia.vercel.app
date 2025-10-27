"""Static body map metadata for front and back muscle selections."""

from __future__ import annotations

from typing import Dict, List, Literal, TypedDict


class MuscleMeta(TypedDict):
    id: int
    name_en: str
    name_ar: str
    region: str
    shape: Literal["box"]
    box_norm: List[float]


class BodySide(TypedDict):
    image: str
    items: List[MuscleMeta]


BodySideKey = Literal["front", "back"]


BODY_MAP: Dict[BodySideKey, BodySide] = {
    "back": {
        "image": "src/assets/body_back.png",
        "items": [
            {
                "id": 101,
                "name_en": "Trapezius (Upper/Middle)",
                "name_ar": "شبه المنحرف (علوي/أوسط)",
                "region": "Back-Upper",
                "shape": "box",
                "box_norm": [0.32, 0.10, 0.68, 0.28],
            },
            {
                "id": 102,
                "name_en": "Deltoid (Posterior) - Left",
                "name_ar": "الدالية الخلفية - يسار",
                "region": "Shoulder",
                "shape": "box",
                "box_norm": [0.15, 0.22, 0.32, 0.36],
            },
            {
                "id": 103,
                "name_en": "Deltoid (Posterior) - Right",
                "name_ar": "الدالية الخلفية - يمين",
                "region": "Shoulder",
                "shape": "box",
                "box_norm": [0.68, 0.22, 0.85, 0.36],
            },
            {
                "id": 104,
                "name_en": "Infraspinatus - Left",
                "name_ar": "تحت الشوكة الكتفية - يسار",
                "region": "Shoulder-Back",
                "shape": "box",
                "box_norm": [0.18, 0.32, 0.34, 0.44],
            },
            {
                "id": 105,
                "name_en": "Infraspinatus - Right",
                "name_ar": "تحت الشوكة الكتفية - يمين",
                "region": "Shoulder-Back",
                "shape": "box",
                "box_norm": [0.66, 0.32, 0.82, 0.44],
            },
            {
                "id": 106,
                "name_en": "Teres Major - Left",
                "name_ar": "المدور الكبير - يسار",
                "region": "Shoulder-Back",
                "shape": "box",
                "box_norm": [0.22, 0.42, 0.36, 0.50],
            },
            {
                "id": 107,
                "name_en": "Teres Major - Right",
                "name_ar": "المدور الكبير - يمين",
                "region": "Shoulder-Back",
                "shape": "box",
                "box_norm": [0.64, 0.42, 0.78, 0.50],
            },
            {
                "id": 108,
                "name_en": "Latissimus Dorsi - Left",
                "name_ar": "الظهر العريضة - يسار",
                "region": "Back",
                "shape": "box",
                "box_norm": [0.22, 0.50, 0.40, 0.70],
            },
            {
                "id": 109,
                "name_en": "Latissimus Dorsi - Right",
                "name_ar": "الظهر العريضة - يمين",
                "region": "Back",
                "shape": "box",
                "box_norm": [0.60, 0.50, 0.78, 0.70],
            },
            {
                "id": 110,
                "name_en": "Triceps (Long Head) - Left",
                "name_ar": "ثلاثية الرؤوس (الرأس الطويل) - يسار",
                "region": "Upper Arm",
                "shape": "box",
                "box_norm": [0.10, 0.42, 0.20, 0.62],
            },
            {
                "id": 111,
                "name_en": "Triceps (Long Head) - Right",
                "name_ar": "ثلاثية الرؤوس (الرأس الطويل) - يمين",
                "region": "Upper Arm",
                "shape": "box",
                "box_norm": [0.80, 0.42, 0.90, 0.62],
            },
            {
                "id": 112,
                "name_en": "Gluteus Maximus - Left",
                "name_ar": "الألوية الكبرى - يسار",
                "region": "Gluteal",
                "shape": "box",
                "box_norm": [0.28, 0.70, 0.44, 0.86],
            },
            {
                "id": 113,
                "name_en": "Gluteus Maximus - Right",
                "name_ar": "الألوية الكبرى - يمين",
                "region": "Gluteal",
                "shape": "box",
                "box_norm": [0.56, 0.70, 0.72, 0.86],
            },
            {
                "id": 114,
                "name_en": "Hamstrings - Left",
                "name_ar": "أوتار الفخذ الخلفية - يسار",
                "region": "Thigh-Back",
                "shape": "box",
                "box_norm": [0.32, 0.86, 0.42, 0.98],
            },
            {
                "id": 115,
                "name_en": "Hamstrings - Right",
                "name_ar": "أوتار الفخذ الخلفية - يمين",
                "region": "Thigh-Back",
                "shape": "box",
                "box_norm": [0.58, 0.86, 0.68, 0.98],
            },
            {
                "id": 116,
                "name_en": "Gastrocnemius - Left",
                "name_ar": "بطة الساق - يسار",
                "region": "Calf",
                "shape": "box",
                "box_norm": [0.36, 0.98, 0.42, 1.00],
            },
            {
                "id": 117,
                "name_en": "Gastrocnemius - Right",
                "name_ar": "بطة الساق - يمين",
                "region": "Calf",
                "shape": "box",
                "box_norm": [0.58, 0.98, 0.64, 1.00],
            },
        ],
    },
    "front": {
        "image": "src/assets/body_front.png",
        "items": [
            {
                "id": 201,
                "name_en": "Sternocleidomastoid - Left",
                "name_ar": "القصية الترقوية الخشائية - يسار",
                "region": "Neck",
                "shape": "box",
                "box_norm": [0.42, 0.08, 0.48, 0.16],
            },
            {
                "id": 202,
                "name_en": "Sternocleidomastoid - Right",
                "name_ar": "القصية الترقوية الخشائية - يمين",
                "region": "Neck",
                "shape": "box",
                "box_norm": [0.52, 0.08, 0.58, 0.16],
            },
            {
                "id": 203,
                "name_en": "Deltoid (Anterior) - Left",
                "name_ar": "الدالية الأمامية - يسار",
                "region": "Shoulder",
                "shape": "box",
                "box_norm": [0.18, 0.24, 0.32, 0.36],
            },
            {
                "id": 204,
                "name_en": "Deltoid (Anterior) - Right",
                "name_ar": "الدالية الأمامية - يمين",
                "region": "Shoulder",
                "shape": "box",
                "box_norm": [0.68, 0.24, 0.82, 0.36],
            },
            {
                "id": 205,
                "name_en": "Pectoralis Major - Left",
                "name_ar": "الصدري الكبير - يسار",
                "region": "Chest",
                "shape": "box",
                "box_norm": [0.30, 0.28, 0.48, 0.42],
            },
            {
                "id": 206,
                "name_en": "Pectoralis Major - Right",
                "name_ar": "الصدري الكبير - يمين",
                "region": "Chest",
                "shape": "box",
                "box_norm": [0.52, 0.28, 0.70, 0.42],
            },
            {
                "id": 207,
                "name_en": "Biceps Brachii - Left",
                "name_ar": "العضلة ذات الرأسين - يسار",
                "region": "Upper Arm",
                "shape": "box",
                "box_norm": [0.14, 0.38, 0.24, 0.56],
            },
            {
                "id": 208,
                "name_en": "Biceps Brachii - Right",
                "name_ar": "العضلة ذات الرأسين - يمين",
                "region": "Upper Arm",
                "shape": "box",
                "box_norm": [0.76, 0.38, 0.86, 0.56],
            },
            {
                "id": 209,
                "name_en": "Rectus Abdominis",
                "name_ar": "عضلات البطن المستقيمة",
                "region": "Abdomen",
                "shape": "box",
                "box_norm": [0.43, 0.42, 0.57, 0.70],
            },
            {
                "id": 210,
                "name_en": "External Oblique - Left",
                "name_ar": "المائلة الخارجية - يسار",
                "region": "Abdomen-Side",
                "shape": "box",
                "box_norm": [0.32, 0.46, 0.42, 0.68],
            },
            {
                "id": 211,
                "name_en": "External Oblique - Right",
                "name_ar": "المائلة الخارجية - يمين",
                "region": "Abdomen-Side",
                "shape": "box",
                "box_norm": [0.58, 0.46, 0.68, 0.68],
            },
            {
                "id": 212,
                "name_en": "Quadriceps - Left",
                "name_ar": "رباعية الرؤوس - يسار",
                "region": "Thigh-Front",
                "shape": "box",
                "box_norm": [0.36, 0.70, 0.46, 0.96],
            },
            {
                "id": 213,
                "name_en": "Quadriceps - Right",
                "name_ar": "رباعية الرؤوس - يمين",
                "region": "Thigh-Front",
                "shape": "box",
                "box_norm": [0.54, 0.70, 0.64, 0.96],
            },
            {
                "id": 214,
                "name_en": "Tibialis Anterior - Left",
                "name_ar": "الظنبوبية الأمامية - يسار",
                "region": "Shin",
                "shape": "box",
                "box_norm": [0.40, 0.96, 0.46, 1.00],
            },
            {
                "id": 215,
                "name_en": "Tibialis Anterior - Right",
                "name_ar": "الظنبوبية الأمامية - يمين",
                "region": "Shin",
                "shape": "box",
                "box_norm": [0.54, 0.96, 0.60, 1.00],
            },
            {
                "id": 216,
                "name_en": "Forearm Flexors - Left",
                "name_ar": "مثنيات الساعد - يسار",
                "region": "Forearm",
                "shape": "box",
                "box_norm": [0.10, 0.56, 0.22, 0.72],
            },
            {
                "id": 217,
                "name_en": "Forearm Flexors - Right",
                "name_ar": "مثنيات الساعد - يمين",
                "region": "Forearm",
                "shape": "box",
                "box_norm": [0.78, 0.56, 0.90, 0.72],
            },
            {
                "id": 218,
                "name_en": "Sartorius - Left",
                "name_ar": "الخياطية - يسار",
                "region": "Thigh-Front",
                "shape": "box",
                "box_norm": [0.32, 0.70, 0.40, 0.96],
            },
            {
                "id": 219,
                "name_en": "Sartorius - Right",
                "name_ar": "الخياطية - يمين",
                "region": "Thigh-Front",
                "shape": "box",
                "box_norm": [0.60, 0.70, 0.68, 0.96],
            },
        ],
    },
}


def build_id_lookup() -> Dict[int, MuscleMeta]:
    """Return a flat {id: meta} mapping for quick lookup."""
    lookup: Dict[int, MuscleMeta] = {}
    for side in BODY_MAP.values():
        for item in side["items"]:
            lookup[item["id"]] = item
    return lookup

