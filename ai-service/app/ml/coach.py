"""Retrieval-style AI coach.

Classifies the user's intent and returns an evidence-based coaching reply.
Uses TF-IDF cosine similarity over a curated coaching corpus (scikit-learn)
to retrieve the most relevant guidance, with a keyword-intent overlay for
safety-critical topics (injuries).
"""

import logging
from typing import Any, Dict

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# (intent, trigger phrases for retrieval, coaching response)
CORPUS = [
    (
        "injury_concern",
        "pain hurt injury sore strain ache joint knee shoulder back pain injured",
        "I'm sorry you're in discomfort. Stop any movement that causes sharp pain and "
        "apply the RICE principle (rest, ice, compression, elevation). If pain persists "
        "beyond a few days or is severe, please see a healthcare professional before "
        "training that area again.",
    ),
    (
        "fatigue",
        "tired fatigue exhausted drained low energy overtrained burnout no energy",
        "Persistent fatigue often signals under-recovery. Prioritise 7-9 hours of sleep, "
        "schedule at least one full rest day this week, and make sure you're eating enough "
        "protein and carbohydrates to fuel training.",
    ),
    (
        "motivation",
        "motivation unmotivated quit give up stop discouraged lazy procrastinate consistency",
        "Motivation follows action more often than it precedes it. Shrink the goal: commit to "
        "just 10 minutes today. Track small wins, schedule workouts like appointments, and "
        "remember why you started — progress compounds.",
    ),
    (
        "nutrition",
        "diet nutrition eat food protein calories meal carbs fat lose weight macros",
        "Build meals around a palm of protein, a fist of vegetables, a cupped hand of carbs and "
        "a thumb of healthy fats. Stay in a modest calorie deficit for fat loss or a small "
        "surplus for muscle gain, and hydrate well throughout the day.",
    ),
    (
        "workout",
        "workout exercise training routine plan reps sets muscle strength gym lift cardio",
        "Train each major muscle group 2-3x per week with progressive overload — add a little "
        "weight or a rep when a set feels easy. Pair compound lifts with 2-3 cardio sessions, "
        "and always warm up before working sets.",
    ),
    (
        "recovery",
        "recovery rest sleep stretch mobility recover muscle soreness foam roll",
        "Recovery is where adaptation happens. Sleep is the biggest lever, followed by nutrition. "
        "Add light mobility work and walking on rest days, and don't train the same muscle hard "
        "on consecutive days.",
    ),
    (
        "help_request",
        "help how guide tell explain what should i do start beginner getting started",
        "Happy to help! Tell me your main goal — fat loss, muscle gain, or general fitness — plus "
        "how many days a week you can train, and I'll point you to the right plan. You can also "
        "generate a personalised workout from your dashboard.",
    ),
    (
        "general",
        "hello hi thanks good great okay yes progress update keep going",
        "Great to hear from you! Consistency and good form are the foundation of every result. "
        "Keep logging your meals and workouts so I can tailor better guidance over time.",
    ),
]

_INTENTS = [c[0] for c in CORPUS]
_DOCS = [c[1] for c in CORPUS]
_RESPONSES = [c[2] for c in CORPUS]

_VECTORIZER = TfidfVectorizer(stop_words="english")
_MATRIX = _VECTORIZER.fit_transform(_DOCS)

# Safety-critical keywords always win regardless of similarity score.
_INJURY_WORDS = ("pain", "hurt", "injury", "injured", "sore", "strain", "sprain")


def respond(message: str) -> Dict[str, Any]:
    text = (message or "").strip()
    if not text:
        return {"response": _RESPONSES[-1], "intent": "general", "confidence": 0.5}

    lower = text.lower()
    if any(w in lower for w in _INJURY_WORDS):
        idx = _INTENTS.index("injury_concern")
        return {"response": _RESPONSES[idx], "intent": "injury_concern", "confidence": 0.95}

    sims = cosine_similarity(_VECTORIZER.transform([text]), _MATRIX)[0]
    best = int(sims.argmax())
    score = float(sims[best])
    if score < 0.05:  # nothing matched — fall back to general encouragement
        best = _INTENTS.index("general")
        score = 0.5
    confidence = round(min(0.99, 0.55 + score), 2)
    return {"response": _RESPONSES[best], "intent": _INTENTS[best], "confidence": confidence}
