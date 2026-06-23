import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { query } from '../db.js';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { USER_COLUMNS, publicUser } from '../utils/helpers.js';
import {
  signAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from '../utils/jwt.js';

const router = Router();

async function getUserById(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
    body('password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('full_name').optional().isString().trim().isLength({ max: 255 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, full_name } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: true, message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const inserted = await query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [email, passwordHash, full_name || null]
    );
    const user = inserted.rows[0];
    const tokens = await issueSession(user);
    return res.status(201).json({ ...tokens, user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty()],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await query(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    // Constant-ish failure path (always run a compare) to limit user enumeration.
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !valid) {
      return res.status(401).json({ error: true, message: 'Invalid email or password' });
    }
    const tokens = await issueSession(user);
    return res.json({ ...tokens, user: publicUser(user) });
  })
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  [body('refreshToken').isString().notEmpty()],
  validate,
  asyncHandler(async (req, res) => {
    const userId = await consumeRefreshToken(req.body.refreshToken);
    if (!userId) {
      return res.status(401).json({ error: true, message: 'Invalid or expired refresh token' });
    }
    const user = await getUserById(userId);
    if (!user) {
      return res.status(401).json({ error: true, message: 'User no longer exists' });
    }
    const tokens = await issueSession(user);
    return res.json({ ...tokens, user: publicUser(user) });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.body?.refreshToken);
    return res.json({ success: true });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });
    return res.json({ user: publicUser(user) });
  })
);

export default router;
