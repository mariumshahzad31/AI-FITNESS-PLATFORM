import pkg from 'pg';
import { config } from './config.js';

const { Pool } = pkg;

const safeUrl = (() => {
  try {
    const u = new URL(config.databaseUrl);
    return `${u.protocol}//${u.username}@${u.host}${u.pathname}`;
  } catch {
    return 'postgres://<hidden>';
  }
})();

console.log('DATABASE_URL loaded:', safeUrl);

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (error) => {
  console.error('Unexpected error on idle PostgreSQL client:', error.message);
});

/**
 * Verify connectivity. Retries a few times so the API can start alongside a
 * freshly-booted database (e.g. docker-compose) without a hard crash loop.
 */
export async function verifyConnection(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('✓ Database connection verified at', result.rows[0].now);
      return true;
    } catch (error) {
      console.error(`✗ Database connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

// PostgreSQL error/connection codes that mean "the database is unreachable"
// rather than "the query was bad". These are surfaced to clients as 503s.
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ECONNRESET',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08006', // connection_failure
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

/**
 * Run a query. If the failure is a connectivity problem (not a SQL error) we
 * tag it with status 503 and a friendly message so the API degrades gracefully
 * instead of returning an opaque 500.
 */
export const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    if (CONNECTION_ERROR_CODES.has(error.code) || /timeout|terminat/i.test(error.message)) {
      const err = new Error('The service is starting up or temporarily unavailable. Please try again in a moment.');
      err.status = 503;
      err.cause = error;
      throw err;
    }
    throw error;
  }
};

/** Lightweight liveness probe used by /health. Never throws. */
export async function isDatabaseHealthy() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default pool;
