import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { callAi } from '../utils/aiClient.js';

const router = Router();
router.use(authRequired);

// ---- Activity -----------------------------------------------------------
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, activity_type, exercise_name, duration_minutes, calories_burned, intensity, steps, notes, logged_on, created_at
       FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId]
    );
    return res.json({ activities: result.rows });
  })
);

router.post(
  '/activity',
  [
    body('activity_type').isString().trim().notEmpty(),
    body('exercise_name').isString().trim().notEmpty(),
    body('duration_minutes').isInt({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { activity_type, exercise_name, duration_minutes, calories_burned, intensity, steps, notes } = req.body;
    const result = await query(
      `INSERT INTO activity_logs (user_id, activity_type, exercise_name, duration_minutes, calories_burned, intensity, steps, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.userId, activity_type, exercise_name, duration_minutes, calories_burned || 0, intensity || 'moderate', steps || 0, notes || '']
    );
    return res.status(201).json({ success: true, activity: result.rows[0] });
  })
);

// ---- Food + NLP ---------------------------------------------------------
router.get(
  '/food-log',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, food_name, servings, calories, protein_g, carbs_g, fat_g, meal_type, notes, logged_on, created_at
       FROM food_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId]
    );
    return res.json({ foodLogs: result.rows });
  })
);

router.post(
  '/food-log',
  asyncHandler(async (req, res) => {
    const { text, food_name, calories, servings, protein_g, meal_type, notes } = req.body;

    let parsed = null;
    if (text && typeof text === 'string' && text.trim()) {
      try {
        const aiResponse = await callAi('/nlp/parse', { text: text.trim(), user_id: req.userId });
        parsed = aiResponse.parsed_data || null;
      } catch (err) {
        console.warn('NLP parse unavailable, falling back to raw text:', err.message);
      }
    }

    if (!text && !food_name) {
      return res.status(400).json({ error: true, message: 'Provide either free-text or a food_name' });
    }

    const insertFoodName = food_name || parsed?.food_name || String(text || 'Food item').trim();
    const insertCalories = Number(calories ?? parsed?.calories ?? 0);
    const insertServings = Number(servings ?? parsed?.servings ?? 1);
    const insertProtein = Number(protein_g ?? parsed?.protein_g ?? 0);
    const insertMealType = meal_type || parsed?.meal_type || 'meal';
    const insertNotes = notes || text || '';

    const food = await query(
      `INSERT INTO food_logs (user_id, food_name, servings, calories, protein_g, carbs_g, fat_g, meal_type, notes)
       VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7) RETURNING *`,
      [req.userId, insertFoodName, insertServings, insertCalories, insertProtein, insertMealType, insertNotes]
    );

    // If the text also described an activity, log it too.
    let activity = null;
    if (parsed && (parsed.type === 'activity' || parsed.steps > 0 || parsed.duration > 0) && parsed.exercise) {
      const act = await query(
        `INSERT INTO activity_logs (user_id, activity_type, exercise_name, duration_minutes, calories_burned, intensity, steps, notes)
         VALUES ($1, 'activity', $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.userId, parsed.exercise, Number(parsed.duration || 0), Number(parsed.calories || 0), parsed.intensity || 'moderate', Number(parsed.steps || 0), `Auto-parsed: ${text}`]
      );
      activity = act.rows[0];
    }

    return res.status(201).json({ success: true, food: food.rows[0], activity, parsed });
  })
);

export default router;
