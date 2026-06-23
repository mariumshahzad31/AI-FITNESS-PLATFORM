import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { callAi } from '../utils/aiClient.js';

const router = Router();
router.use(authRequired);

// POST /api/coach — chat with the AI coach; persists the exchange
router.post(
  '/',
  [body('message').isString().trim().notEmpty().withMessage('Message is required')],
  validate,
  asyncHandler(async (req, res) => {
    const message = req.body.message.trim();
    const ai = await callAi('/coach/chat', { user_id: req.userId, message });

    await query(
      'INSERT INTO chat_history (user_id, message, response, intent, confidence) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, message, ai.response, ai.intent, ai.confidence]
    );

    return res.json({ reply: ai.response, intent: ai.intent, confidence: ai.confidence });
  })
);

// GET /api/coach/history
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await query(
      `SELECT message, response, intent, confidence, created_at
       FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.userId, limit]
    );
    return res.json({ history: result.rows.reverse() });
  })
);

export default router;
