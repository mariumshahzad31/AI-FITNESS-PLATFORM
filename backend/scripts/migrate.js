/**
 * Apply the database schema and reference seed data.
 * Usage: npm run migrate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { verifyConnection } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(__dirname, '..', '..', 'database');

async function run() {
  await verifyConnection();
  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf-8');
    console.log(`Applying ${file}...`);
    await pool.query(sql);
    console.log(`✓ ${file} applied`);
  }
  console.log('Migration complete.');
  await pool.end();
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
