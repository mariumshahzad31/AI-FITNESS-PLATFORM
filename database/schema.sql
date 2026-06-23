-- =====================================================================
-- AI Fitness Platform — PostgreSQL Schema
-- ---------------------------------------------------------------------
-- Single source of truth for the relational model. Safe to run multiple
-- times (idempotent: IF NOT EXISTS everywhere). Seed data lives in
-- seed.sql and is applied after this file.
-- =====================================================================

-- Required for gen_random_uuid() used by refresh tokens.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Users + authentication + profile + fitness assessment
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) UNIQUE NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,

  -- Profile
  full_name          VARCHAR(255),
  age                INTEGER CHECK (age IS NULL OR (age > 0 AND age < 130)),
  gender             VARCHAR(50),
  height_cm          DECIMAL(5,2) CHECK (height_cm IS NULL OR height_cm > 0),
  weight_kg          DECIMAL(6,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  weight_target      DECIMAL(6,2) CHECK (weight_target IS NULL OR weight_target > 0),

  -- Assessment
  activity_level     VARCHAR(50)  DEFAULT 'moderate',   -- sedentary|light|moderate|active|very_active
  fitness_level      VARCHAR(50)  DEFAULT 'Beginner',   -- Beginner|Intermediate|Advanced
  experience_level   VARCHAR(50)  DEFAULT 'Beginner',
  health_goal        VARCHAR(255) DEFAULT 'general_fitness', -- weight_loss|muscle_gain|maintenance|endurance|general_fitness
  lifestyle          VARCHAR(100) DEFAULT 'balanced',
  dietary_preference VARCHAR(50)  DEFAULT 'omnivore',    -- omnivore|vegetarian|vegan|keto
  medical_conditions TEXT,
  workouts_per_week  INTEGER DEFAULT 3 CHECK (workouts_per_week BETWEEN 0 AND 14),
  session_minutes    INTEGER DEFAULT 45 CHECK (session_minutes > 0),

  assessment_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed  BOOLEAN DEFAULT FALSE,

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Refresh tokens (rotating JWT refresh-token store)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Weight history (drives weight-progress analytics)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weight_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg   DECIMAL(6,2) NOT NULL CHECK (weight_kg > 0),
  logged_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, logged_on)
);

-- ---------------------------------------------------------------------
-- Exercise catalog (referenced by generated workout plans)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) UNIQUE NOT NULL,
  muscle_group  VARCHAR(100) NOT NULL,        -- chest|back|legs|shoulders|arms|core|full_body|cardio
  category      VARCHAR(50)  NOT NULL,        -- strength|cardio|mobility
  equipment     VARCHAR(100) DEFAULT 'bodyweight',
  difficulty    VARCHAR(50)  DEFAULT 'Beginner',
  met           DECIMAL(4,1) DEFAULT 4.0,     -- metabolic equivalent for calorie estimates
  instructions  TEXT
);

-- ---------------------------------------------------------------------
-- Workout plans (header) + per-exercise rows
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_plans (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  goal            VARCHAR(100) NOT NULL,
  fitness_level   VARCHAR(50)  NOT NULL,
  days_per_week   INTEGER NOT NULL,
  weeks           INTEGER DEFAULT 4,
  est_weekly_calories INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workout_plan_exercises (
  id              SERIAL PRIMARY KEY,
  plan_id         INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_index       INTEGER NOT NULL,            -- 1..days_per_week
  day_label       VARCHAR(100) NOT NULL,       -- e.g. "Day 1 — Upper Body"
  exercise_name   VARCHAR(255) NOT NULL,
  muscle_group    VARCHAR(100),
  sets            INTEGER DEFAULT 3,
  reps            VARCHAR(50)  DEFAULT '10-12',
  rest_seconds    INTEGER DEFAULT 60,
  est_calories    INTEGER DEFAULT 0,
  position        INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Food + activity logging
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name   VARCHAR(255) NOT NULL,
  servings    DECIMAL(5,2) DEFAULT 1,
  calories    INTEGER DEFAULT 0,
  protein_g   DECIMAL(6,2) DEFAULT 0,
  carbs_g     DECIMAL(6,2) DEFAULT 0,
  fat_g       DECIMAL(6,2) DEFAULT 0,
  meal_type   VARCHAR(50)  DEFAULT 'meal',
  notes       TEXT,
  logged_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type    VARCHAR(50) NOT NULL,
  exercise_name    VARCHAR(255),
  duration_minutes INTEGER DEFAULT 0,
  calories_burned  INTEGER DEFAULT 0,
  intensity        VARCHAR(50) DEFAULT 'moderate',
  steps            INTEGER DEFAULT 0,
  notes            TEXT,
  logged_on        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Daily aggregates + progress series
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_tracking (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  calories_in    INTEGER DEFAULT 0,
  calories_out   INTEGER DEFAULT 0,
  steps          INTEGER DEFAULT 0,
  active_minutes INTEGER DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  total_calories_burned   INTEGER DEFAULT 0,
  total_calories_consumed INTEGER DEFAULT 0,
  steps                   INTEGER DEFAULT 0,
  water_ml                INTEGER DEFAULT 0,
  sleep_hours             DECIMAL(4,2) DEFAULT 0,
  avg_heart_rate          INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- ---------------------------------------------------------------------
-- Goals + AI coach chat history
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_goals (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_type     VARCHAR(100) NOT NULL,
  target_value  DECIMAL(8,2) NOT NULL,
  current_value DECIMAL(8,2) DEFAULT 0,
  unit          VARCHAR(50) DEFAULT '',
  deadline      DATE,
  status        VARCHAR(50) DEFAULT 'active',  -- active|achieved|archived
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_history (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  response    TEXT,
  intent      VARCHAR(100),
  confidence  DECIMAL(4,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user      ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user         ON weight_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user       ON workout_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_exercises_plan      ON workout_plan_exercises(plan_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_user           ON food_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user       ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_tracking_user   ON progress_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_tracking_date   ON progress_tracking(date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user         ON daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user        ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_user          ON user_goals(user_id);

-- ---------------------------------------------------------------------
-- updated_at trigger for users
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
