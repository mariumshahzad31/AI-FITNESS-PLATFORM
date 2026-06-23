import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Issue an opaque refresh token, store its hash, and return the raw token.
 * Tokens are rotated on every refresh and revoked on logout.
 */
export async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(raw), expiresAt]
  );
  return raw;
}

/**
 * Validate a refresh token against the store. Returns the userId if valid.
 */
export async function consumeRefreshToken(raw) {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const result = await query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return null;
  // Rotate: revoke the used token.
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
  return row.user_id;
}

export async function revokeRefreshToken(raw) {
  if (!raw) return;
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [hashToken(raw)]);
}

export async function revokeAllForUser(userId) {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
}
