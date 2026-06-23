"""AI Fitness Platform — FastAPI AI/ML service.

Exposes the machine-learning engine over HTTP:
  - /nlp/parse                 natural-language food/activity parsing
  - /calorie-target            GradientBoosting daily calorie + macro targets
  - /workout/plan              RandomForest split -> full multi-day plan
  - /recommendations/exercise  single next-best exercise
  - /recommendations/diet      macro-aware meal recommendation
  - /goal-estimate             GradientBoosting weeks-to-goal
  - /insights/analyze          data-driven daily insight
  - /coach/chat                TF-IDF retrieval coach
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import schemas
from .ml import coach, engine, nlp

logging.basicConfig(level=logging.INFO, format="%(asctime)s - AI Service - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
BACKEND_ORIGIN = os.getenv("BACKEND_ORIGIN", "http://localhost:5000")
ALLOWED_ORIGINS = list({FRONTEND_ORIGIN, BACKEND_ORIGIN})


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Train/load models at startup so the first request is fast.
    try:
        engine.warmup()
    except Exception:  # pragma: no cover - defensive
        logger.exception("Model warmup failed; will retry lazily on first request.")
    yield


app = FastAPI(
    title="AI Fitness Platform - AI Service",
    description="AI Coach, NLP, and scikit-learn recommendation engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
@app.get("/health", response_model=schemas.HealthCheckResponse)
async def health_check():
    return schemas.HealthCheckResponse(
        status="healthy",
        service="AI Fitness Platform - AI Coach Service",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# --------------------------------------------------------------------------
# NLP
# --------------------------------------------------------------------------
@app.post("/nlp/parse", response_model=schemas.NLPResponse)
def nlp_parse(request: schemas.NLPRequest):
    try:
        parsed = nlp.parse(request.text)
        return schemas.NLPResponse(
            intent=parsed["type"] or "unknown",
            confidence=0.85,
            parsed_data=parsed,
        )
    except Exception:
        logger.exception("NLP parse error")
        raise HTTPException(status_code=500, detail="NLP processing failed")


# --------------------------------------------------------------------------
# Calorie + macro targets
# --------------------------------------------------------------------------
@app.post("/calorie-target", response_model=schemas.CalorieTargetResponse)
def calorie_target(request: schemas.CalorieTargetRequest):
    try:
        result = engine.predict_calorie_target(
            request.age,
            (request.gender or "male").lower(),
            request.height_cm,
            request.weight_kg,
            request.activity_level,
            request.goal,
        )
        return schemas.CalorieTargetResponse(**result)
    except Exception:
        logger.exception("Calorie target error")
        raise HTTPException(status_code=500, detail="Calorie target prediction failed")


# --------------------------------------------------------------------------
# Full workout plan
# --------------------------------------------------------------------------
@app.post("/workout/plan", response_model=schemas.WorkoutPlanResponse)
def workout_plan(request: schemas.WorkoutPlanRequest):
    try:
        plan = engine.build_workout_plan(
            request.goal,
            request.fitness_level,
            request.days_per_week,
            request.session_minutes,
            request.weight_kg,
        )
        return schemas.WorkoutPlanResponse(**plan)
    except Exception:
        logger.exception("Workout plan error")
        raise HTTPException(status_code=500, detail="Workout plan generation failed")


# --------------------------------------------------------------------------
# Single exercise recommendation
# --------------------------------------------------------------------------
@app.post("/recommendations/exercise", response_model=schemas.ExerciseRecommendationResponse)
def recommend_exercise(request: schemas.ExerciseRecommendationRequest):
    try:
        # Use the engine to build a quick plan and surface the headline movement.
        plan = engine.build_workout_plan(
            goal="general_fitness",
            fitness_level=request.fitness_level,
            days_per_week=3,
            session_minutes=request.available_time_minutes,
            weight_kg=75.0,
        )
        first = plan["days"][0]["exercises"][0]
        intensity = {"Beginner": "low", "Intermediate": "moderate", "Advanced": "high"}.get(
            request.fitness_level, "moderate"
        )
        return schemas.ExerciseRecommendationResponse(
            exercise_name=first["exercise_name"],
            duration_minutes=min(request.available_time_minutes, plan["session_minutes"]),
            calories_burned_estimate=first["est_calories"] * first["sets"],
            intensity=intensity,
            instructions=f"Perform {first['sets']} sets of {first['reps']} with {first['rest_seconds']}s rest. Focus on controlled form.",
        )
    except Exception:
        logger.exception("Exercise recommendation error")
        raise HTTPException(status_code=500, detail="Exercise recommendation failed")


# --------------------------------------------------------------------------
# Diet recommendation
# --------------------------------------------------------------------------
@app.post("/recommendations/diet", response_model=schemas.DietRecommendationResponse)
def recommend_diet(request: schemas.DietRecommendationRequest):
    try:
        result = engine.recommend_diet(request.dietary_preference.lower(), request.calorie_goal)
        return schemas.DietRecommendationResponse(**result)
    except Exception:
        logger.exception("Diet recommendation error")
        raise HTTPException(status_code=500, detail="Diet recommendation failed")


# --------------------------------------------------------------------------
# Goal timeline
# --------------------------------------------------------------------------
@app.post("/goal-estimate", response_model=schemas.GoalEstimateResponse)
def goal_estimate(request: schemas.GoalEstimateRequest):
    try:
        weeks = engine.predict_timeline_weeks(
            request.weight_kg,
            request.weight_target,
            request.goal,
            request.activity_level,
            request.age,
        )
        delta = abs(request.weight_kg - request.weight_target)
        rate = round(delta / weeks, 2) if weeks else 0.0
        return schemas.GoalEstimateResponse(estimated_weeks_to_goal=weeks, weekly_rate_kg=rate)
    except Exception:
        logger.exception("Goal estimate error")
        raise HTTPException(status_code=500, detail="Goal estimation failed")


# --------------------------------------------------------------------------
# Insights
# --------------------------------------------------------------------------
@app.post("/insights/analyze", response_model=schemas.HealthInsightResponse)
def analyze_health(request: schemas.HealthInsightRequest):
    try:
        result = engine.analyze_health(request.daily_stats)
        return schemas.HealthInsightResponse(**result)
    except Exception:
        logger.exception("Health analysis error")
        raise HTTPException(status_code=500, detail="Health analysis failed")


# --------------------------------------------------------------------------
# Coach
# --------------------------------------------------------------------------
@app.post("/coach/chat", response_model=schemas.ChatMessageResponse)
def coach_chat(request: schemas.ChatMessageRequest):
    try:
        result = coach.respond(request.message)
        return schemas.ChatMessageResponse(**result)
    except Exception:
        logger.exception("Coach chat error")
        raise HTTPException(status_code=500, detail="Coach chat failed")


# --------------------------------------------------------------------------
# Error handlers
# --------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "status_code": exc.status_code,
            "detail": exc.detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": schemas.SERVICE_NAME,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "status_code": 500,
            "detail": "Internal server error",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": schemas.SERVICE_NAME,
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
