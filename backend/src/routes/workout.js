import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { USER_COLUMNS } from '../utils/helpers.js';
import { generateWorkoutPlan, getActiveWorkoutPlan } from '../utils/planning.js';

const router = Router();
router.use(authRequired);

// GET /api/workout-plan — active plan with exercises grouped by day
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const plan = await getActiveWorkoutPlan(req.userId);
    return res.json({ plan });
  })
);

// POST /api/workout-plan/generate — (re)generate the active plan from the
// user's current profile via the ML service
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });
    const plan = await generateWorkoutPlan(user);
    return res.status(201).json({ plan });
  })
);

export default router;
