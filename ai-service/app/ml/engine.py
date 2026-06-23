"""Inference layer: loads trained models and turns their predictions into
concrete, user-facing fitness artifacts (calorie targets, workout plans,
goal timelines, diet recommendations, insights).

Models are loaded lazily and trained on first use if the joblib artifacts
are missing, so the service bootstraps itself with no manual step.
"""

import logging
import threading
from functools import lru_cache

import joblib
import numpy as np

from . import train
from .constants import (
    ACTIVITY_LEVELS,
    FITNESS_LEVELS,
    GENDERS,
    GOALS,
    GOAL_PROTEIN_PER_KG,
    CALORIE_MODEL_PATH,
    TIMELINE_MODEL_PATH,
    SPLIT_MODEL_PATH,
    encode,
)

logger = logging.getLogger(__name__)
_LOCK = threading.Lock()
_MODELS = {}


# --------------------------------------------------------------------------
# Model loading
# --------------------------------------------------------------------------
def _ensure_models():
    if _MODELS:
        return _MODELS
    with _LOCK:
        if _MODELS:
            return _MODELS
        if not (CALORIE_MODEL_PATH.exists() and TIMELINE_MODEL_PATH.exists() and SPLIT_MODEL_PATH.exists()):
            logger.info("Model artifacts missing — training now (first run).")
            train.train_all()
        _MODELS["calorie"] = joblib.load(CALORIE_MODEL_PATH)
        _MODELS["timeline"] = joblib.load(TIMELINE_MODEL_PATH)
        _MODELS["split"] = joblib.load(SPLIT_MODEL_PATH)
        logger.info("ML models loaded.")
    return _MODELS


def warmup():
    """Eagerly load/train models AND run one prediction through each at startup.

    Loading the joblib artifacts is cheap; the real first-call cost is scikit-learn /
    numpy / scipy initialising their internals on the *first* ``predict``. We pay that
    once here so the first real user request is already warm (~10ms instead of ~2s).
    """
    _ensure_models()
    try:
        predict_calorie_target(30, "male", 175.0, 80.0, "moderate", "weight_loss")
        predict_timeline_weeks(80.0, 74.0, "weight_loss", "moderate", 30)
        recommend_split("weight_loss", "Beginner", 4, 45)
        build_workout_plan("weight_loss", "Beginner", 4, 45, 80.0)
        logger.info("ML models warmed (prediction paths primed).")
    except Exception:  # pragma: no cover - defensive
        logger.exception("Model prediction warmup failed; first request may be slower.")


# --------------------------------------------------------------------------
# Exercise pool used to expand a training split into a concrete plan
# --------------------------------------------------------------------------
# (name, met) grouped by muscle focus — mirrors the DB exercise catalog.
POOL = {
    "chest": [("Push-up", 8.0), ("Incline Dumbbell Press", 6.0), ("Bench Press", 6.0)],
    "back": [("Lat Pulldown", 5.0), ("Bent-over Row", 6.0), ("Pull-up", 8.0)],
    "legs": [("Bodyweight Squat", 5.0), ("Walking Lunge", 6.0), ("Romanian Deadlift", 6.0), ("Barbell Back Squat", 6.0)],
    "shoulders": [("Overhead Press", 6.0), ("Lateral Raise", 4.0)],
    "arms": [("Bicep Curl", 4.0), ("Tricep Dip", 5.0)],
    "core": [("Plank", 4.0), ("Hanging Leg Raise", 5.0), ("Mountain Climber", 8.0)],
    "cardio": [("Running", 9.8), ("Cycling", 7.5), ("Jump Rope", 11.0), ("Rowing Machine", 7.0), ("Brisk Walking", 4.3)],
}

# Each split maps to an ordered list of (day_label, [muscle groups]) cycled
# across the user's available days.
SPLIT_DAYS = {
    "full_body": [
        ("Full Body A", ["legs", "chest", "back", "core"]),
        ("Full Body B", ["legs", "shoulders", "back", "core"]),
        ("Full Body C", ["legs", "chest", "arms", "core"]),
    ],
    "upper_lower": [
        ("Upper Body", ["chest", "back", "shoulders", "arms"]),
        ("Lower Body", ["legs", "legs", "core"]),
    ],
    "push_pull_legs": [
        ("Push", ["chest", "shoulders", "arms"]),
        ("Pull", ["back", "back", "arms"]),
        ("Legs", ["legs", "legs", "core"]),
    ],
    "cardio_strength": [
        ("Conditioning", ["cardio", "cardio", "core"]),
        ("Strength", ["legs", "chest", "back"]),
    ],
}

# Sets / reps / rest prescription per goal.
PRESCRIPTION = {
    "muscle_gain": dict(sets=4, reps="8-12", rest=75),
    "weight_loss": dict(sets=3, reps="12-15", rest=45),
    "endurance": dict(sets=3, reps="15-20", rest=40),
    "maintenance": dict(sets=3, reps="10-12", rest=60),
    "general_fitness": dict(sets=3, reps="10-12", rest=60),
}


# --------------------------------------------------------------------------
# Public inference functions
# --------------------------------------------------------------------------
@lru_cache(maxsize=2048)
def predict_calorie_target(age, gender, height_cm, weight_kg, activity_level, goal):
    # Deterministic model → identical inputs always yield the identical target,
    # so caching repeated requests is correct and avoids recomputing predictions.
    model = _ensure_models()["calorie"]
    x = np.array([[
        age,
        encode(gender, GENDERS),
        height_cm,
        weight_kg,
        encode(activity_level, ACTIVITY_LEVELS),
        encode(goal, GOALS),
    ]], dtype=float)
    calories = int(round(float(model.predict(x)[0])))
    protein = int(round(weight_kg * GOAL_PROTEIN_PER_KG.get(goal, 1.6)))
    # 25% fat by calories, remainder carbs.
    fat_g = int(round(calories * 0.25 / 9))
    carbs_g = int(round((calories - protein * 4 - fat_g * 9) / 4))
    return {
        "daily_calorie_target": max(1200, calories),
        "protein_g_target": protein,
        "fat_g_target": fat_g,
        "carbs_g_target": max(0, carbs_g),
    }


@lru_cache(maxsize=2048)
def predict_timeline_weeks(weight_kg, weight_target, goal, activity_level, age):
    model = _ensure_models()["timeline"]
    delta = abs(float(weight_kg) - float(weight_target))
    if delta < 0.5:
        return 1
    x = np.array([[
        delta,
        encode(goal, GOALS),
        encode(activity_level, ACTIVITY_LEVELS),
        age,
    ]], dtype=float)
    weeks = int(round(float(model.predict(x)[0])))
    return max(1, min(104, weeks))


@lru_cache(maxsize=1024)
def recommend_split(goal, fitness_level, days_per_week, session_minutes):
    model = _ensure_models()["split"]
    x = np.array([[
        encode(goal, GOALS),
        encode(fitness_level, FITNESS_LEVELS),
        days_per_week,
        session_minutes,
    ]], dtype=float)
    return str(model.predict(x)[0])


def _exercises_per_day(session_minutes):
    # ~9 minutes per exercise including rest; clamp to a sane range.
    return max(3, min(7, round(session_minutes / 9)))


def build_workout_plan(goal, fitness_level, days_per_week, session_minutes, weight_kg):
    days_per_week = max(2, min(6, int(days_per_week)))
    session_minutes = max(15, min(120, int(session_minutes)))
    weight_kg = float(weight_kg) if weight_kg else 75.0

    split = recommend_split(goal, fitness_level, days_per_week, session_minutes)
    rx = PRESCRIPTION.get(goal, PRESCRIPTION["general_fitness"])
    day_templates = SPLIT_DAYS[split]
    per_day = _exercises_per_day(session_minutes)
    minutes_per_ex = session_minutes / per_day

    # Rotate selection through the pool so repeated muscle groups vary.
    cursor = {m: 0 for m in POOL}
    plan_days = []
    weekly_calories = 0

    for d in range(days_per_week):
        label_base, groups = day_templates[d % len(day_templates)]
        # Expand the muscle-group list to the desired exercise count.
        groups = (groups * ((per_day // len(groups)) + 1))[:per_day]
        exercises = []
        for pos, group in enumerate(groups):
            options = POOL[group]
            name, met = options[cursor[group] % len(options)]
            cursor[group] += 1
            is_cardio = group == "cardio"
            sets = 1 if is_cardio else rx["sets"]
            reps = f"{int(minutes_per_ex)} min" if is_cardio else rx["reps"]
            est_cal = int(round(met * weight_kg * (minutes_per_ex / 60)))
            weekly_calories += est_cal
            exercises.append({
                "exercise_name": name,
                "muscle_group": group,
                "sets": sets,
                "reps": reps,
                "rest_seconds": rx["rest"],
                "est_calories": est_cal,
                "position": pos,
            })
        plan_days.append({
            "day_index": d + 1,
            "day_label": f"Day {d + 1} — {label_base}",
            "exercises": exercises,
        })

    return {
        "name": f"{goal.replace('_', ' ').title()} — {split.replace('_', ' ').title()} Program",
        "goal": goal,
        "fitness_level": fitness_level,
        "split": split,
        "days_per_week": days_per_week,
        "weeks": 4,
        "session_minutes": session_minutes,
        "est_weekly_calories": int(weekly_calories),
        "days": plan_days,
    }


# --------------------------------------------------------------------------
# Diet recommendation (rule-based, macro-aware)
# --------------------------------------------------------------------------
DIET_TEMPLATES = {
    "vegetarian": [
        ("Lentil & quinoa power bowl", 18, 55, 8, 380),
        ("Greek yogurt with berries & granola", 22, 40, 9, 330),
        ("Paneer & vegetable stir-fry with brown rice", 26, 48, 14, 450),
    ],
    "vegan": [
        ("Chickpea Buddha bowl with tahini", 16, 60, 12, 410),
        ("Tofu scramble with whole-grain toast", 20, 38, 11, 360),
        ("Black bean & sweet potato chili", 18, 55, 7, 390),
    ],
    "keto": [
        ("Grilled steak with avocado salad", 40, 8, 30, 520),
        ("Salmon with asparagus & butter", 38, 6, 28, 480),
        ("Egg & cheese omelette with spinach", 30, 5, 26, 410),
    ],
    "omnivore": [
        ("Grilled chicken with quinoa & greens", 38, 35, 12, 430),
        ("Salmon, sweet potato & broccoli", 34, 40, 16, 470),
        ("Turkey & avocado wholegrain wrap", 30, 38, 14, 420),
    ],
}


def recommend_diet(dietary_preference, calorie_goal):
    options = DIET_TEMPLATES.get(dietary_preference, DIET_TEMPLATES["omnivore"])
    # Pick the meal whose calories best fit ~1/3 of the daily goal.
    target_meal = calorie_goal / 3 if calorie_goal else 420
    food, protein, carbs, fat, cals = min(options, key=lambda o: abs(o[4] - target_meal))
    return {
        "food_recommendation": food,
        "macros": {"protein_g": float(protein), "carbs_g": float(carbs), "fat_g": float(fat)},
        "estimated_calories": int(cals),
    }


# --------------------------------------------------------------------------
# Insights
# --------------------------------------------------------------------------
def analyze_health(daily_stats):
    steps = daily_stats.get("steps", 0) or 0
    calories_in = daily_stats.get("calories_consumed", daily_stats.get("calories_in", 0)) or 0
    calories_out = daily_stats.get("calories_burned", daily_stats.get("calories_out", 0)) or 0
    sleep = daily_stats.get("sleep_hours", 0) or 0

    insights = []
    if steps and steps < 5000:
        insights.append(("Step count is low", "Aim for 8,000-10,000 steps to support cardiovascular health.", "declining"))
    elif steps > 12000:
        insights.append(("Excellent activity", "You exceeded the recommended daily step target.", "improving"))
    if calories_in and calories_out and calories_in > calories_out * 1.2:
        insights.append(("Calorie surplus detected", "Intake outpaces expenditure — adjust portions or add activity.", "declining"))
    elif calories_out > calories_in * 1.4 and calories_in:
        insights.append(("Large deficit", "Ensure adequate nutrition to protect recovery and muscle.", "watch"))
    if sleep and sleep < 6:
        insights.append(("Sleep is insufficient", "Target 7-9 hours for recovery and hormonal balance.", "declining"))

    if not insights:
        insights.append(("On track", "Your metrics look balanced — keep the routine consistent.", "improving"))

    title, desc, trend = insights[0]
    return {"insight_title": title, "insight_description": desc, "metric": "overall_health", "trend": trend}
