import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { verifyConnection, isDatabaseHealthy } from './db.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import dashboardRoutes from './routes/dashboard.js';
import logRoutes from './routes/logs.js';
import weightRoutes from './routes/weight.js';
import workoutRoutes from './routes/workout.js';
import goalRoutes from './routes/goals.js';
import coachRoutes from './routes/coach.js';
import nearbyRoutes from './routes/nearby.js';
import aiRoutes from './routes/ai.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/health', async (_req, res) => {
  const database = (await isDatabaseHealthy()) ? 'connected' : 'unavailable';
  res.json({
    status: 'healthy',
    service: 'AI Fitness Platform - Backend API',
    database,
    timestamp: new Date().toISOString(),
  });
});

// Rate limiting (stricter on auth).
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes); // GET / and GET /progress
app.use('/api', logRoutes); // /api/food-log, /api/activity
app.use('/api/weight', weightRoutes);
app.use('/api/workout-plan', workoutRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/nearby', nearbyRoutes);
app.use('/api/ai', aiRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  // PostgreSQL is the primary store. We try hard to connect, but a temporary
  // database outage must never prevent the API from booting — routes that need
  // the database return a clean 503 instead, so the frontend stays usable and
  // recovers automatically once the database is reachable again.
  try {
    await verifyConnection();
  } catch (error) {
    console.warn(
      '⚠ Starting in degraded mode — database is unavailable:',
      error.message
    );
    console.warn('  The API will keep retrying; data endpoints return 503 until it recovers.');
  }
  app.listen(config.port, () => {
    console.log(`AI Fitness Platform - Backend API running on http://localhost:${config.port}`);
    console.log(`CORS origin: ${config.frontendOrigin}`);
    console.log(`AI Service URL: ${config.aiServiceUrl}`);
  });
}

start();

export default app;
