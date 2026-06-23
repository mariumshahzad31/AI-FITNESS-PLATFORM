import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authRequired);

// GET /api/weight — weight history (oldest first for charting)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      'SELECT id, weight_kg, logged_on, notes FROM weight_logs WHERE user_id = $1 ORDER BY logged_on ASC LIMIT 365',
      [req.userId]
    );
    return res.json({
      series: result.rows.map((r) => ({
        date: r.logged_on.toISOString().slice(0, 10),
        weight_kg: Number(r.weight_kg),
        notes: r.notes,
      })),
    });
  })
);

// POST /api/weight — log/replace today's weight; keeps users.weight_kg current
router.post(
  '/',
  [body('weight_kg').isFloat({ gt: 0 }).withMessage('Valid weight is required')],
  validate,
  asyncHandler(async (req, res) => {
    const { weight_kg, logged_on, notes } = req.body;
    const date = logged_on || new Date().toISOString().slice(0, 10);
    const result = await query(
      `INSERT INTO weight_logs (user_id, weight_kg, logged_on, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, logged_on)
       DO UPDATE SET weight_kg = EXCLUDED.weight_kg, notes = EXCLUDED.notes
       RETURNING id, weight_kg, logged_on, notes`,
      [req.userId, weight_kg, date, notes || null]
    );
    // Keep the profile's current weight and any active weight goal in sync.
    await query('UPDATE users SET weight_kg = $1 WHERE id = $2', [weight_kg, req.userId]);
    await query(
      `UPDATE user_goals SET current_value = $1
       WHERE user_id = $2 AND goal_type = 'weight' AND status = 'active'`,
      [weight_kg, req.userId]
    );
    return res.status(201).json({ success: true, entry: result.rows[0] });
  })
);

export default router;
