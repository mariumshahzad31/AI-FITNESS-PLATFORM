import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    console.error(`FATAL: required environment variable ${name} is not set`);
    process.exit(1);
  }
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

// In production, secrets MUST be provided. In development we fall back to
// clearly-marked dev secrets so the stack runs with zero configuration.
const devSecret = (label) => {
  if (isProd) {
    console.error(`FATAL: ${label} must be set in production`);
    process.exit(1);
  }
  return `dev-only-${label}-change-me`;
};

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://fitness_user:fitness_password@localhost:5432/ai_fitness_platform',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || devSecret('jwt-access-secret'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || devSecret('jwt-refresh-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 7,
  },
  // 10 rounds is the bcrypt default — strong, while keeping login/register
  // responsive (~5x faster than 12 rounds) for a snappy user experience.
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};
