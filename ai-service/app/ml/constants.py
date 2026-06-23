"""Domain constants shared across the ML pipeline and inference layer."""

from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Encodings (kept stable so trained models stay valid) -----------------
GENDERS = ["male", "female"]
ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"]
ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}
GOALS = ["weight_loss", "muscle_gain", "maintenance", "endurance", "general_fitness"]
FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced"]

# Calorie delta applied on top of maintenance TDEE for each goal.
GOAL_CALORIE_DELTA = {
    "weight_loss": -500,
    "muscle_gain": 300,
    "maintenance": 0,
    "endurance": 200,
    "general_fitness": 0,
}

# Safe weekly bodyweight change (kg) used to estimate goal timelines.
GOAL_WEEKLY_RATE = {
    "weight_loss": 0.6,
    "muscle_gain": 0.25,
    "maintenance": 0.1,
    "endurance": 0.2,
    "general_fitness": 0.3,
}

# Protein target in grams per kg of bodyweight, by goal.
GOAL_PROTEIN_PER_KG = {
    "weight_loss": 2.0,
    "muscle_gain": 2.2,
    "maintenance": 1.6,
    "endurance": 1.8,
    "general_fitness": 1.6,
}

# Workout split templates the classifier chooses between.
WORKOUT_SPLITS = ["full_body", "upper_lower", "push_pull_legs", "cardio_strength"]

# Model artifact paths.
CALORIE_MODEL_PATH = DATA_DIR / "calorie_model.joblib"
TIMELINE_MODEL_PATH = DATA_DIR / "timeline_model.joblib"
SPLIT_MODEL_PATH = DATA_DIR / "split_model.joblib"

# Dataset paths (persisted so they can be inspected / re-trained).
CALORIE_DATASET = DATA_DIR / "calorie_dataset.csv"
TIMELINE_DATASET = DATA_DIR / "timeline_dataset.csv"
SPLIT_DATASET = DATA_DIR / "split_dataset.csv"


def encode(value, vocab, default=0):
    """Map a categorical value to its stable integer index."""
    try:
        return vocab.index(value)
    except (ValueError, AttributeError):
        return default


def mifflin_st_jeor(weight_kg, height_cm, age, gender):
    """Resting metabolic rate (kcal/day)."""
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + 5 if gender == "male" else base - 161
