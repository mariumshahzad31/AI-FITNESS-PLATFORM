import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { callAi } from '../utils/aiClient.js';
import { USER_COLUMNS } from '../utils/helpers.js';

const router = Router();
router.use(authRequired);

async function getUser(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

// GET /api/ai/suggestions — combined exercise + diet + insight for the user
router.get(
  '/suggestions',
  asyncHandler(async (req, res) => {
    const user = await getUser(req.userId);
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });

    const totals = await query(
      `SELECT
         (SELECT COALESCE(SUM(calories),0) FROM food_logs WHERE user_id = $1 AND logged_on = CURRENT_DATE) AS calories_in,
         (SELECT COALESCE(SUM(calories_burned),0) FROM activity_logs WHERE user_id = $1 AND logged_on = CURRENT_DATE) AS calories_out,
         (SELECT COALESCE(SUM(steps),0) FROM activity_logs WHERE user_id = $1 AND logged_on = CURRENT_DATE) AS steps`,
      [req.userId]
    );
    const daily = totals.rows[0];

    const [exercise, diet, insight] = await Promise.all([
      callAi('/recommendations/exercise', {
        user_id: req.userId,
        fitness_level: user.fitness_level || 'Beginner',
        available_time_minutes: Number(user.session_minutes) || 30,
      }),
      callAi('/recommendations/diet', {
        user_id: req.userId,
        dietary_preference: user.dietary_preference || 'omnivore',
        calorie_goal: 2000,
      }),
      callAi('/insights/analyze', {
        user_id: req.userId,
        daily_stats: {
          calories_in: Number(daily.calories_in) || 0,
          calories_out: Number(daily.calories_out) || 0,
          steps: Number(daily.steps) || 0,
        },
      }),
    ]);

    return res.json({ exercise, diet, insight });
  })
);

// POST /api/ai/diet — explicit diet recommendation
router.post(
  '/diet',
  asyncHandler(async (req, res) => {
    const user = await getUser(req.userId);
    const data = await callAi('/recommendations/diet', {
      user_id: req.userId,
      dietary_preference: req.body.dietary_preference || user?.dietary_preference || 'omnivore',
      calorie_goal: Number(req.body.calorie_goal) || 2000,
    });
    return res.json({ data });
  })
);

// POST /api/ai/exercise — explicit exercise recommendation
router.post(
  '/exercise',
  asyncHandler(async (req, res) => {
    const user = await getUser(req.userId);
    const data = await callAi('/recommendations/exercise', {
      user_id: req.userId,
      fitness_level: req.body.fitness_level || user?.fitness_level || 'Beginner',
      available_time_minutes: Number(req.body.available_time_minutes) || 30,
    });
    return res.json({ data });
  })
);

export default router;
