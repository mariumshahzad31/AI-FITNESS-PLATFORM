import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authRequired);

// GET /api/goals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, goal_type, target_value, current_value, unit, deadline, status, created_at
       FROM user_goals WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    return res.json({ goals: result.rows });
  })
);

// POST /api/goals
router.post(
  '/',
  [
    body('goal_type').isString().trim().notEmpty(),
    body('target_value').isFloat(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { goal_type, target_value, current_value, unit, deadline } = req.body;
    const result = await query(
      `INSERT INTO user_goals (user_id, goal_type, target_value, current_value, unit, deadline)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, goal_type, target_value, current_value || 0, unit || '', deadline || null]
    );
    return res.status(201).json({ goal: result.rows[0] });
  })
);

// PUT /api/goals/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: true, message: 'Invalid goal id' });
    const { current_value, status } = req.body;
    const result = await query(
      `UPDATE user_goals
       SET current_value = COALESCE($1, current_value), status = COALESCE($2, status)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [current_value ?? null, status ?? null, id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: true, message: 'Goal not found' });
    return res.json({ goal: result.rows[0] });
  })
);

export default router;
