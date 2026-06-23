"""Rule-based NLP for parsing free-text food / activity logs.

Lightweight and dependency-free: extracts intent, food name, exercise,
duration, calories and steps from natural language entries (English plus a
few common Hindi/Urdu food words, mirroring the original demo corpus).
"""

import re
from typing import Any, Dict

FOOD_WORDS = [
    "eat", "ate", "khayi", "khana", "roti", "rice", "salad", "chicken", "burger",
    "pizza", "sandwich", "banana", "apple", "meal", "daal", "dal", "egg", "oatmeal",
    "yogurt", "shake", "protein", "smoothie", "bread", "pasta", "fish", "paneer",
]
ACTIVITY_WORDS = ["run", "jog", "walk", "lift", "swim", "cycle", "bike", "yoga", "sprint", "steps", "step", "workout", "gym"]


def parse(text: str) -> Dict[str, Any]:
    text_lower = text.lower().strip()
    parsed: Dict[str, Any] = {
        "type": "unknown",
        "food_name": None,
        "meal_type": "meal",
        "servings": 1,
        "calories": 0,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 0,
        "exercise": None,
        "duration": 0,
        "intensity": "moderate",
        "steps": 0,
        "notes": text.strip(),
    }

    if any(word in text_lower for word in FOOD_WORDS):
        parsed["type"] = "food"
        cleaned = re.sub(r"\b(i ate|i had|ate|khayi|khana|food|meal|for|today)\b", "", text_lower).strip()
        parsed["food_name"] = (cleaned or text_lower).strip()[:120]
        for meal in ("breakfast", "lunch", "dinner", "snack"):
            if meal in text_lower:
                parsed["meal_type"] = meal
                break

    if any(word in text_lower for word in ACTIVITY_WORDS):
        parsed["type"] = "activity"
        if any(w in text_lower for w in ("run", "jog", "sprint")):
            parsed["exercise"] = "running"
            parsed["intensity"] = "high" if "sprint" in text_lower else "moderate"
        elif any(w in text_lower for w in ("lift", "weight", "dumbbell", "barbell", "gym")):
            parsed["exercise"] = "weight training"
            parsed["intensity"] = "high"
        elif "walk" in text_lower:
            parsed["exercise"] = "walking"
            parsed["intensity"] = "low"
        elif any(w in text_lower for w in ("yoga", "stretch")):
            parsed["exercise"] = "yoga"
            parsed["intensity"] = "low"
        elif "swim" in text_lower:
            parsed["exercise"] = "swimming"
            parsed["intensity"] = "high"
        elif any(w in text_lower for w in ("cycle", "bike")):
            parsed["exercise"] = "cycling"
            parsed["intensity"] = "moderate"

    duration_match = re.search(r"(\d+)\s*(?:min|minute|minutes|hour|hr|hrs)", text_lower)
    if duration_match:
        value = int(duration_match.group(1))
        parsed["duration"] = value * (60 if ("hour" in text_lower or "hr" in text_lower) else 1)

    calories_match = re.search(r"(\d+)\s*(?:kcal|calories|cal)", text_lower)
    if calories_match:
        parsed["calories"] = int(calories_match.group(1))

    steps_match = re.search(r"(\d[\d,]*)\s*(?:steps|step|k\s*steps)", text_lower)
    if steps_match:
        raw = steps_match.group(1).replace(",", "")
        steps = int(raw)
        if "k" in text_lower[steps_match.end():steps_match.end() + 2] or "k steps" in text_lower:
            steps *= 1000
        parsed["steps"] = steps

    # 'walked 5k' style shorthand.
    k_match = re.search(r"(\d+)\s*k\b", text_lower)
    if k_match and parsed["steps"] == 0 and parsed["type"] == "activity":
        parsed["steps"] = int(k_match.group(1)) * 1000

    if parsed["type"] == "unknown" and parsed["steps"] > 0:
        parsed["type"] = "activity"
    if parsed["type"] == "unknown" and parsed["food_name"]:
        parsed["type"] = "food"

    if parsed["type"] == "food" and parsed["calories"] == 0:
        parsed["calories"] = 220
    if parsed["type"] == "activity" and parsed["duration"] == 0 and parsed["steps"] == 0:
        parsed["duration"] = 30

    return parsed
