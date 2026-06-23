import { query } from '../db.js';
import { callAi } from './aiClient.js';
import { normalizeActivity, normalizeGoal } from './helpers.js';

/** Ask the AI service for daily calorie + macro targets and goal timeline. */
export async function computeAiGoals(user) {
  const goal = normalizeGoal(user.health_goal);
  const activity = normalizeActivity(user.activity_level);
  const weight = Number(user.weight_kg) || 75;
  const target = Number(user.weight_target) || weight;

  // These two predictions are independent — run them concurrently so the
  // dashboard/assessment waits for a single round-trip instead of two.
  const [calorie, timeline] = await Promise.all([
    callAi('/calorie-target', {
      user_id: user.id,
      age: Number(user.age) || 30,
      gender: (user.gender || 'male').toLowerCase(),
      height_cm: Number(user.height_cm) || 170,
      weight_kg: weight,
      activity_level: activity,
      goal,
    }),
    callAi('/goal-estimate', {
      user_id: user.id,
      weight_kg: weight,
      weight_target: target,
      goal,
      activity_level: activity,
      age: Number(user.age) || 30,
    }),
  ]);

  return {
    daily_calorie_target: calorie.daily_calorie_target,
    protein_g_target: calorie.protein_g_target,
    carbs_g_target: calorie.carbs_g_target,
    fat_g_target: calorie.fat_g_target,
    estimated_weeks_to_goal: timeline.estimated_weeks_to_goal,
    weekly_rate_kg: timeline.weekly_rate_kg,
  };
}

/** Generate a workout plan via the ML service and persist it as the active plan. */
export async function generateWorkoutPlan(user) {
  const goal = normalizeGoal(user.health_goal);
  const plan = await callAi('/workout/plan', {
    user_id: user.id,
    goal,
    fitness_level: user.fitness_level || 'Beginner',
    days_per_week: Number(user.workouts_per_week) || 3,
    session_minutes: Number(user.session_minutes) || 45,
    weight_kg: Number(user.weight_kg) || 75,
  });

  // Deactivate previous plans, then insert the new one transactionally.
  await query('UPDATE workout_plans SET is_active = FALSE WHERE user_id = $1', [user.id]);
  const header = await query(
    `INSERT INTO workout_plans (user_id, name, goal, fitness_level, days_per_week, weeks, est_weekly_calories, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id`,
    [user.id, plan.name, plan.goal, plan.fitness_level, plan.days_per_week, plan.weeks, plan.est_weekly_calories]
  );
  const planId = header.rows[0].id;

  for (const day of plan.days) {
    for (const ex of day.exercises) {
      await query(
        `INSERT INTO workout_plan_exercises
         (plan_id, day_index, day_label, exercise_name, muscle_group, sets, reps, rest_seconds, est_calories, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [planId, day.day_index, day.day_label, ex.exercise_name, ex.muscle_group, ex.sets, ex.reps, ex.rest_seconds, ex.est_calories, ex.position]
      );
    }
  }

  return { id: planId, ...plan };
}

/** Load the active workout plan (with exercises grouped by day) for a user. */
export async function getActiveWorkoutPlan(userId) {
  const header = await query(
    'SELECT * FROM workout_plans WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (header.rows.length === 0) return null;
  const plan = header.rows[0];

  const rows = await query(
    'SELECT * FROM workout_plan_exercises WHERE plan_id = $1 ORDER BY day_index, position',
    [plan.id]
  );

  const daysMap = new Map();
  for (const row of rows.rows) {
    if (!daysMap.has(row.day_index)) {
      daysMap.set(row.day_index, { day_index: row.day_index, day_label: row.day_label, exercises: [] });
    }
    daysMap.get(row.day_index).exercises.push({
      exercise_name: row.exercise_name,
      muscle_group: row.muscle_group,
      sets: row.sets,
      reps: row.reps,
      rest_seconds: row.rest_seconds,
      est_calories: row.est_calories,
    });
  }

  return {
    id: plan.id,
    name: plan.name,
    goal: plan.goal,
    fitness_level: plan.fitness_level,
    days_per_week: plan.days_per_week,
    weeks: plan.weeks,
    est_weekly_calories: plan.est_weekly_calories,
    created_at: plan.created_at,
    days: Array.from(daysMap.values()),
  };
}
