# Database Documentation

PostgreSQL 16. Defined in [`database/schema.sql`](../database/schema.sql) (idempotent) with
reference data in [`database/seed.sql`](../database/seed.sql). Requires the `pgcrypto`
extension (auto-created) for `gen_random_uuid()`.

## Tables

### users
Core account + profile + assessment record.
- `id` PK, `email` UNIQUE NOT NULL, `password_hash` NOT NULL (bcrypt).
- Profile: `full_name, age, gender, height_cm, weight_kg, weight_target`.
- Assessment: `activity_level, fitness_level, experience_level, health_goal, lifestyle,
  dietary_preference, medical_conditions, workouts_per_week, session_minutes`.
- Flags: `assessment_completed, onboarding_completed`. Timestamps: `created_at, updated_at`.
- Constraints: `age` 1–129, positive `height_cm`/`weight_kg`/`weight_target`,
  `workouts_per_week` 0–14, positive `session_minutes`.
- Trigger `trg_users_updated_at` keeps `updated_at` current on UPDATE.

### refresh_tokens
- `id` UUID PK, `user_id` → users (CASCADE), `token_hash` (SHA-256), `expires_at`,
  `revoked`, `created_at`. Rotated on refresh, revoked on logout.

### weight_logs
- `id` PK, `user_id` → users (CASCADE), `weight_kg` > 0, `logged_on` DATE, `notes`.
- `UNIQUE (user_id, logged_on)` — one entry per day (upsert).

### exercises  *(reference catalog)*
- `id` PK, `name` UNIQUE, `muscle_group`, `category` (strength|cardio|mobility),
  `equipment`, `difficulty`, `met` (for calorie estimates), `instructions`.

### workout_plans
- `id` PK, `user_id` → users (CASCADE), `name`, `goal`, `fitness_level`, `days_per_week`,
  `weeks`, `est_weekly_calories`, `is_active`, `created_at`. One active plan per user.

### workout_plan_exercises
- `id` PK, `plan_id` → workout_plans (CASCADE), `day_index`, `day_label`, `exercise_name`,
  `muscle_group`, `sets`, `reps`, `rest_seconds`, `est_calories`, `position`.

### food_logs
- `id` PK, `user_id` → users (CASCADE), `food_name`, `servings`, `calories`, `protein_g`,
  `carbs_g`, `fat_g`, `meal_type`, `notes`, `logged_on`, `created_at`.

### activity_logs
- `id` PK, `user_id` → users (CASCADE), `activity_type`, `exercise_name`, `duration_minutes`,
  `calories_burned`, `intensity`, `steps`, `notes`, `logged_on`, `created_at`.

### progress_tracking
- `id` PK, `user_id` → users (CASCADE), `date`, `calories_in`, `calories_out`, `steps`,
  `active_minutes`, `notes`. `UNIQUE (user_id, date)`.

### daily_stats
- `id` PK, `user_id` → users (CASCADE), `date`, `total_calories_burned`,
  `total_calories_consumed`, `steps`, `water_ml`, `sleep_hours`, `avg_heart_rate`.
  `UNIQUE (user_id, date)`.

### user_goals
- `id` PK, `user_id` → users (CASCADE), `goal_type`, `target_value`, `current_value`,
  `unit`, `deadline`, `status` (active|achieved|archived), `created_at`.

### chat_history
- `id` PK, `user_id` → users (CASCADE), `message`, `response`, `intent`, `confidence`,
  `created_at`.

## Relationships

```
users 1───∞ refresh_tokens
users 1───∞ weight_logs
users 1───∞ workout_plans 1───∞ workout_plan_exercises
users 1───∞ food_logs
users 1───∞ activity_logs
users 1───∞ progress_tracking
users 1───∞ daily_stats
users 1───∞ user_goals
users 1───∞ chat_history
exercises  (reference data, referenced by name in plans)
```

All child tables reference `users(id)` with `ON DELETE CASCADE`, so deleting a user removes
all their data.

## Indexes

Foreign-key columns are indexed for query performance: `refresh_tokens(user_id)`,
`weight_logs(user_id)`, `workout_plans(user_id)`, `workout_plan_exercises(plan_id)`,
`food_logs(user_id)`, `activity_logs(user_id)`, `progress_tracking(user_id, date)`,
`daily_stats(user_id)`, `chat_history(user_id)`, `user_goals(user_id)`.

## Applying the schema

- **Docker compose**: applied automatically on first DB init.
- **Manual**: `cd backend && npm run migrate` (runs `schema.sql` then `seed.sql`),
  then `npm run seed` for the demo account + history.
