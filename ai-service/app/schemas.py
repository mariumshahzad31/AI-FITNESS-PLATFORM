"""Pydantic v2 request/response models for the AI service."""

from typing import Any, Dict, List

from pydantic import BaseModel, Field, field_validator

SERVICE_NAME = "AI Fitness Platform - AI Service"


# --- shared ---------------------------------------------------------------
class HealthCheckResponse(BaseModel):
    status: str
    service: str
    timestamp: str


# --- NLP ------------------------------------------------------------------
class NLPRequest(BaseModel):
    text: str
    user_id: int

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Text cannot be empty")
        return v.strip()


class NLPResponse(BaseModel):
    intent: str
    confidence: float
    parsed_data: Dict[str, Any]
    service: str = SERVICE_NAME


# --- calorie / nutrition targets -----------------------------------------
class CalorieTargetRequest(BaseModel):
    user_id: int
    age: int = Field(ge=10, le=120)
    gender: str = "male"
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    activity_level: str = "moderate"
    goal: str = "general_fitness"


class CalorieTargetResponse(BaseModel):
    daily_calorie_target: int
    protein_g_target: int
    fat_g_target: int
    carbs_g_target: int
    service: str = SERVICE_NAME


# --- exercise recommendation (single) ------------------------------------
class ExerciseRecommendationRequest(BaseModel):
    user_id: int
    fitness_level: str
    available_time_minutes: int = 30

    @field_validator("available_time_minutes")
    @classmethod
    def time_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Available time must be positive")
        return v


class ExerciseRecommendationResponse(BaseModel):
    exercise_name: str
    duration_minutes: int
    calories_burned_estimate: int
    intensity: str
    instructions: str
    service: str = SERVICE_NAME


# --- full workout plan ----------------------------------------------------
class WorkoutPlanRequest(BaseModel):
    user_id: int
    goal: str = "general_fitness"
    fitness_level: str = "Beginner"
    days_per_week: int = Field(default=3, ge=2, le=6)
    session_minutes: int = Field(default=45, ge=15, le=120)
    weight_kg: float = Field(default=75.0, gt=0)


class WorkoutPlanResponse(BaseModel):
    name: str
    goal: str
    fitness_level: str
    split: str
    days_per_week: int
    weeks: int
    session_minutes: int
    est_weekly_calories: int
    days: List[Dict[str, Any]]
    service: str = SERVICE_NAME


# --- goal timeline --------------------------------------------------------
class GoalEstimateRequest(BaseModel):
    user_id: int
    weight_kg: float = Field(gt=0)
    weight_target: float = Field(gt=0)
    goal: str = "weight_loss"
    activity_level: str = "moderate"
    age: int = Field(default=30, ge=10, le=120)


class GoalEstimateResponse(BaseModel):
    estimated_weeks_to_goal: int
    weekly_rate_kg: float
    service: str = SERVICE_NAME


# --- diet -----------------------------------------------------------------
class DietRecommendationRequest(BaseModel):
    user_id: int
    dietary_preference: str
    calorie_goal: int

    @field_validator("calorie_goal")
    @classmethod
    def calorie_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Calorie goal must be positive")
        return v


class DietRecommendationResponse(BaseModel):
    food_recommendation: str
    macros: Dict[str, float]
    estimated_calories: int
    service: str = SERVICE_NAME


# --- insights -------------------------------------------------------------
class HealthInsightRequest(BaseModel):
    user_id: int
    daily_stats: Dict[str, Any]


class HealthInsightResponse(BaseModel):
    insight_title: str
    insight_description: str
    metric: str
    trend: str
    service: str = SERVICE_NAME


# --- coach ----------------------------------------------------------------
class ChatMessageRequest(BaseModel):
    user_id: int
    message: str

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v.strip()


class ChatMessageResponse(BaseModel):
    response: str
    intent: str
    confidence: float
    service: str = SERVICE_NAME
