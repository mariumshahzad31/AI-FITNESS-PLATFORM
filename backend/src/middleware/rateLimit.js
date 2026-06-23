import rateLimit from 'express-rate-limit';

const json = (message) => (req, res) =>
  res.status(429).json({ error: true, message });

/** Global limiter for the whole API surface. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many requests, please slow down.'),
});

/** Tighter limiter for auth endpoints to blunt credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many authentication attempts, please try again later.'),
});
