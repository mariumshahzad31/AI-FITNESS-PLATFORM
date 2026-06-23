import { verifyAccessToken } from '../utils/jwt.js';

/** Require a valid access token; attaches req.userId and req.userEmail. */
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: true, message: 'Authentication required' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    return next();
  } catch {
    return res.status(401).json({ error: true, message: 'Invalid or expired token' });
  }
}
