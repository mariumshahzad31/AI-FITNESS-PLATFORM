/** Wraps async route handlers so thrown errors reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: true, message: 'Endpoint not found', path: req.path });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error('Unhandled error:', error.message);
  }
  res.status(status).json({
    error: true,
    message: status >= 500 ? 'Internal server error' : error.message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { detail: error.message } : {}),
  });
}
