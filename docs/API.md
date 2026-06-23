# API Reference

Base URL (dev): `http://localhost:5000`. All responses are JSON. Errors use
`{ "error": true, "message": string, "details"?: [...] }`.

Authenticated routes require `Authorization: Bearer <accessToken>`.

## Authentication

### POST /api/auth/register
Body: `{ email, password (≥8), full_name? }`
→ `201 { accessToken, refreshToken, user }` · `409` if email exists · `422` validation.

### POST /api/auth/login
Body: `{ email, password }` → `200 { accessToken, refreshToken, user }` · `401` invalid.

### POST /api/auth/refresh
Body: `{ refreshToken }` → `200 { accessToken, refreshToken, user }` (rotates token) · `401`.

### POST /api/auth/logout
Body: `{ refreshToken }` → `200 { success: true }` (revokes the token).

### GET /api/auth/me  🔒
→ `200 { user }`.

The `user` object:
```json
{
  "id": 1, "email": "...", "full_name": "...", "age": 29, "gender": "male",
  "height_cm": 180, "weight_current": 85, "weight_target": 78,
  "activity_level": "active", "fitness_level": "Intermediate",
  "experience_level": "Intermediate", "health_goal": "weight_loss",
  "lifestyle": "active", "dietary_preference": "omnivore",
  "medical_conditions": "", "workouts_per_week": 4, "session_minutes": 45,
  "assessment_completed": true, "onboarding_completed": true
}
```

## Profile & assessment 🔒

- **GET /api/profile** → `{ user }`
- **PUT /api/profile** — partial profile update (any user fields) → `{ user }`
- **POST /api/profile/assessment** — body: age, gender, height_cm, weight_current,
  weight_target, activity_level, fitness_level, experience_level, health_goal,
  dietary_preference, workouts_per_week, session_minutes, medical_conditions?
  → `201 { user, aiGoals, workoutPlan }` (generates AI targets + a workout plan).

## Dashboard 🔒

- **GET /api/dashboard** →
  `{ user, today{calories_in,calories_out,steps,active_minutes,protein_g},
     aiGoals{daily_calorie_target,protein_g_target,carbs_g_target,fat_g_target,
             estimated_weeks_to_goal,bmi_estimate,bmi_category},
     progressMeta{calorieProgressRatio,targetCalories,weightProgressPct,currentWeight,
                  startWeight,targetWeight,hasWeightGoal},
     workoutPlan, recommendations[] }`
- **GET /api/dashboard/progress** → `{ series: [{ log_date, calories_in, calories_out, steps }] }` (14 days)

## Logging 🔒

- **GET /api/food-log** → `{ foodLogs[] }`
- **POST /api/food-log** — `{ text }` (NLP) or `{ food_name, calories, meal_type }`
  → `201 { food, activity?, parsed? }`
- **GET /api/activity** → `{ activities[] }`
- **POST /api/activity** — `{ activity_type, exercise_name, duration_minutes, calories_burned?, intensity?, steps?, notes? }` → `201 { activity }`

## Weight 🔒

- **GET /api/weight** → `{ series: [{ date, weight_kg, notes }] }`
- **POST /api/weight** — `{ weight_kg, notes? }` → `201 { entry }` (upserts today; syncs profile + goal)

## Workout 🔒

- **GET /api/workout-plan** → `{ plan | null }` (days → exercises)
- **POST /api/workout-plan/generate** → `201 { plan }`

## Goals 🔒

- **GET /api/goals** → `{ goals[] }`
- **POST /api/goals** — `{ goal_type, target_value, current_value?, unit?, deadline? }` → `201 { goal }`
- **PUT /api/goals/:id** — `{ current_value?, status? }` → `{ goal }`

## AI coach 🔒

- **POST /api/coach** — `{ message }` → `{ reply, intent, confidence }` (persists history)
- **GET /api/coach/history?limit=** → `{ history[] }`

## AI suggestions 🔒

- **GET /api/ai/suggestions** → `{ exercise, diet, insight }`
- **POST /api/ai/diet** — `{ dietary_preference?, calorie_goal? }` → `{ data }`
- **POST /api/ai/exercise** — `{ fitness_level?, available_time_minutes? }` → `{ data }`

## Nearby 🔒

- **GET /api/nearby?lat=&lon=** → `{ places[], source: "openstreetmap" | "simulated" }`

---

## ML service (internal, `http://localhost:8000`)

Called server-to-server by the backend; not exposed to the browser.

| Endpoint | Purpose | Model |
|----------|---------|-------|
| `POST /nlp/parse` | parse free-text logs | rule-based |
| `POST /calorie-target` | daily calorie + macro targets | GradientBoostingRegressor |
| `POST /goal-estimate` | weeks to goal | GradientBoostingRegressor |
| `POST /workout/plan` | full multi-day plan | RandomForestClassifier + expansion |
| `POST /recommendations/exercise` | single exercise | engine |
| `POST /recommendations/diet` | meal + macros | rule-based |
| `POST /insights/analyze` | daily insight | rule-based |
| `POST /coach/chat` | coaching reply | TF-IDF + cosine similarity |
| `GET  /health` | health check | — |
