import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { USER_COLUMNS, publicUser, normalizeGoal, normalizeActivity } from '../utils/helpers.js';
import { computeAiGoals, generateWorkoutPlan } from '../utils/planning.js';

const router = Router();
router.use(authRequired);

// Map incoming snake/camel field names to DB columns.
const FIELD_MAP = {
  full_name: 'full_name',
  age: 'age',
  gender: 'gender',
  height_cm: 'height_cm',
  weight_current: 'weight_kg',
  weight_kg: 'weight_kg',
  weight_target: 'weight_target',
  activity_level: 'activity_level',
  fitness_level: 'fitness_level',
  experience_level: 'experience_level',
  health_goal: 'health_goal',
  lifestyle: 'lifestyle',
  dietary_preference: 'dietary_preference',
  medical_conditions: 'medical_conditions',
  workouts_per_week: 'workouts_per_week',
  session_minutes: 'session_minutes',
};

async function loadUser(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

function buildUpdate(payload) {
  const sets = [];
  const values = [];
  let idx = 1;
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      let value = payload[key];
      if (column === 'health_goal') value = normalizeGoal(value);
      if (column === 'activity_level') value = normalizeActivity(value);
      sets.push(`${column} = $${idx}`);
      values.push(value);
      idx += 1;
    }
  }
  return { sets, values, idx };
}

// GET /api/profile
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.userId);
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });
    return res.json({ user: publicUser(user) });
  })
);

// PUT /api/profile
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { sets, values, idx } = buildUpdate(req.body);
    if (sets.length === 0) {
      return res.status(400).json({ error: true, message: 'No valid fields to update' });
    }
    values.push(req.userId);
    const updated = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${USER_COLUMNS}`,
      values
    );
    return res.json({ user: publicUser(updated.rows[0]) });
  })
);

// POST /api/assessment — persist the full fitness assessment, then generate
// the user's AI calorie targets and an initial workout plan.
router.post(
  '/assessment',
  [
    body('age').isInt({ min: 10, max: 120 }).withMessage('Valid age is required'),
    body('gender').isString().notEmpty(),
    body('height_cm').isFloat({ gt: 0 }).withMessage('Valid height is required'),
    body('weight_current').isFloat({ gt: 0 }).withMessage('Valid current weight is required'),
    body('weight_target').isFloat({ gt: 0 }).withMessage('Valid target weight is required'),
    body('activity_level').isString().notEmpty(),
    body('fitness_level').isString().notEmpty(),
    body('health_goal').isString().notEmpty(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sets, values, idx } = buildUpdate(req.body);
    values.push(req.userId);
    await query(
      `UPDATE users SET ${sets.join(', ')}, assessment_completed = TRUE, onboarding_completed = TRUE
       WHERE id = $${idx}`,
      values
    );

    const user = await loadUser(req.userId);

    // Generate AI artifacts. If the AI service is down we still keep the saved
    // assessment and report which parts succeeded.
    let aiGoals = null;
    let workoutPlan = null;
    try {
      aiGoals = await computeAiGoals(user);
      // Seed a weight goal so the dashboard has something to track against.
      await query(
        `INSERT INTO user_goals (user_id, goal_type, target_value, current_value, unit, status)
         VALUES ($1, 'weight', $2, $3, 'kg', 'active')`,
        [user.id, Number(user.weight_target), Number(user.weight_kg)]
      );
    } catch (err) {
      console.error('AI goal generation failed during assessment:', err.message);
    }
    try {
      workoutPlan = await generateWorkoutPlan(user);
    } catch (err) {
      console.error('Workout plan generation failed during assessment:', err.message);
    }

    return res.status(201).json({ user: publicUser(user), aiGoals, workoutPlan });
  })
);

export default router;
