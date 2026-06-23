import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  USER_COLUMNS,
  publicUser,
  calculateBmi,
  bmiCategory,
  normalizeGoal,
} from '../utils/helpers.js';
import { computeAiGoals, getActiveWorkoutPlan } from '../utils/planning.js';

const router = Router();
router.use(authRequired);

async function getUser(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

/** Aggregate today's food + activity logs into a single totals object. */
async function getTodayTotals(userId) {
  const food = await query(
    `SELECT COALESCE(SUM(calories),0) AS calories_in, COALESCE(SUM(protein_g),0) AS protein_g
     FROM food_logs WHERE user_id = $1 AND logged_on = CURRENT_DATE`,
    [userId]
  );
  const activity = await query(
    `SELECT COALESCE(SUM(calories_burned),0) AS calories_out,
            COALESCE(SUM(steps),0) AS steps,
            COALESCE(SUM(duration_minutes),0) AS active_minutes
     FROM activity_logs WHERE user_id = $1 AND logged_on = CURRENT_DATE`,
    [userId]
  );
  return {
    calories_in: Number(food.rows[0].calories_in) || 0,
    protein_g: Number(food.rows[0].protein_g) || 0,
    calories_out: Number(activity.rows[0].calories_out) || 0,
    steps: Number(activity.rows[0].steps) || 0,
    active_minutes: Number(activity.rows[0].active_minutes) || 0,
  };
}

/** Deterministic fallback if the AI service is unreachable. */
function fallbackGoals(user) {
  const w = Number(user.weight_kg) || 75;
  const h = Number(user.height_cm) || 170;
  const age = Number(user.age) || 30;
  const bmr = (user.gender || 'male').toLowerCase() === 'female'
    ? 10 * w + 6.25 * h - 5 * age - 161
    : 10 * w + 6.25 * h - 5 * age + 5;
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }[user.activity_level] || 1.55;
  const goal = normalizeGoal(user.health_goal);
  const delta = goal === 'weight_loss' ? -500 : goal === 'muscle_gain' ? 300 : 0;
  const calories = Math.max(1200, Math.round(bmr * factor + delta));
  const weeks = Math.max(1, Math.round((Math.abs(w - (Number(user.weight_target) || w)) / 0.5)));
  return {
    daily_calorie_target: calories,
    protein_g_target: Math.round(w * 1.8),
    carbs_g_target: Math.round((calories * 0.45) / 4),
    fat_g_target: Math.round((calories * 0.25) / 9),
    estimated_weeks_to_goal: weeks,
    weekly_rate_kg: 0.5,
  };
}

// GET /api/dashboard
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getUser(req.userId);
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });

    const today = await getTodayTotals(req.userId);
    const bmi = calculateBmi(user.weight_kg, user.height_cm);

    let aiGoals;
    try {
      aiGoals = await computeAiGoals(user);
    } catch (err) {
      console.warn('Dashboard AI goals fallback:', err.message);
      aiGoals = fallbackGoals(user);
    }
    aiGoals.bmi_estimate = bmi;
    aiGoals.bmi_category = bmiCategory(bmi);

    const targetCalories = aiGoals.daily_calorie_target;
    const calorieRatio = targetCalories ? today.calories_in / targetCalories : 0;

    // Weight progress against the active 'weight' goal.
    const goalRow = await query(
      `SELECT target_value, current_value FROM user_goals
       WHERE user_id = $1 AND goal_type = 'weight' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.userId]
    );
    const start = Number(user.weight_kg) || 0;
    const target = Number(user.weight_target) || start;
    const latestWeight = await query(
      'SELECT weight_kg FROM weight_logs WHERE user_id = $1 ORDER BY logged_on DESC LIMIT 1',
      [req.userId]
    );
    const current = latestWeight.rows[0] ? Number(latestWeight.rows[0].weight_kg) : start;
    const totalDelta = Math.abs(start - target) || 1;
    const achievedDelta = Math.abs(start - current);
    const weightProgressPct = Math.max(0, Math.min(100, Math.round((achievedDelta / totalDelta) * 100)));

    const workoutPlan = await getActiveWorkoutPlan(req.userId);

    const recommendations = [
      { type: 'Nutrition', name: `Hit ${aiGoals.protein_g_target}g protein today`, calories: null },
      { type: 'Activity', name: `Burn ${Math.round(targetCalories * 0.15)} kcal of cardio`, calories: Math.round(targetCalories * 0.15) },
      { type: 'Recovery', name: 'Sleep 7–9 hours for recovery', calories: null },
    ];

    return res.json({
      user: publicUser(user),
      today,
      aiGoals,
      progressMeta: {
        calorieProgressRatio: Number(calorieRatio.toFixed(2)),
        targetCalories,
        weightProgressPct,
        currentWeight: current,
        startWeight: start,
        targetWeight: target,
        hasWeightGoal: goalRow.rows.length > 0,
      },
      workoutPlan,
      recommendations,
    });
  })
);

// GET /api/progress — 14-day series for charts (logs aggregated by day).
router.get(
  '/progress',
  asyncHandler(async (req, res) => {
    const result = await query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day')::date AS d
       )
       SELECT days.d AS log_date,
              COALESCE(f.calories_in, 0)  AS calories_in,
              COALESCE(a.calories_out, 0) AS calories_out,
              COALESCE(a.steps, 0)        AS steps
       FROM days
       LEFT JOIN (
         SELECT logged_on, SUM(calories) AS calories_in
         FROM food_logs WHERE user_id = $1 GROUP BY logged_on
       ) f ON f.logged_on = days.d
       LEFT JOIN (
         SELECT logged_on, SUM(calories_burned) AS calories_out, SUM(steps) AS steps
         FROM activity_logs WHERE user_id = $1 GROUP BY logged_on
       ) a ON a.logged_on = days.d
       ORDER BY days.d ASC`,
      [req.userId]
    );
    const series = result.rows.map((row) => ({
      log_date: row.log_date.toISOString().slice(0, 10),
      calories_in: Number(row.calories_in) || 0,
      calories_out: Number(row.calories_out) || 0,
      steps: Number(row.steps) || 0,
    }));
    return res.json({ series });
  })
);

export default router;
