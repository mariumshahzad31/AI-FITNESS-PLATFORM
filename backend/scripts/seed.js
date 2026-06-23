/**
 * Idempotent demo seed: creates a demo account (bcrypt-hashed password) plus a
 * realistic 14-day history of weight, food and activity logs so the dashboard
 * and charts are populated out of the box.
 *
 * Usage: npm run seed
 * Demo credentials: demo@aifitness.app / Demo1234!
 */
import bcrypt from 'bcryptjs';
import pool, { query, verifyConnection } from '../src/db.js';
import { config } from '../src/config.js';

const DEMO = {
  email: 'demo@aifitness.app',
  password: 'Demo1234!',
  full_name: 'Demo Athlete',
  age: 29,
  gender: 'male',
  height_cm: 180,
  weight_kg: 85,
  weight_target: 78,
  activity_level: 'active',
  fitness_level: 'Intermediate',
  experience_level: 'Intermediate',
  health_goal: 'weight_loss',
  lifestyle: 'active',
  dietary_preference: 'omnivore',
  workouts_per_week: 4,
  session_minutes: 45,
};

const FOODS = [
  ['Oatmeal with banana', 'breakfast', 320, 12],
  ['Grilled chicken & rice', 'lunch', 540, 45],
  ['Greek yogurt & berries', 'snack', 180, 15],
  ['Salmon with vegetables', 'dinner', 480, 38],
];
const ACTIVITIES = [
  ['cardio', 'Running', 35, 'high'],
  ['strength', 'Weight training', 45, 'high'],
  ['cardio', 'Cycling', 40, 'moderate'],
  ['walk', 'Brisk Walking', 30, 'low'],
];

async function ensureDemoUser() {
  const existing = await query('SELECT id FROM users WHERE email = $1', [DEMO.email]);
  const passwordHash = await bcrypt.hash(DEMO.password, config.bcryptRounds);
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await query(
      `UPDATE users SET password_hash=$2, full_name=$3, age=$4, gender=$5, height_cm=$6, weight_kg=$7,
        weight_target=$8, activity_level=$9, fitness_level=$10, experience_level=$11, health_goal=$12,
        lifestyle=$13, dietary_preference=$14, workouts_per_week=$15, session_minutes=$16,
        assessment_completed=TRUE, onboarding_completed=TRUE WHERE id=$1`,
      [id, passwordHash, DEMO.full_name, DEMO.age, DEMO.gender, DEMO.height_cm, DEMO.weight_kg,
       DEMO.weight_target, DEMO.activity_level, DEMO.fitness_level, DEMO.experience_level,
       DEMO.health_goal, DEMO.lifestyle, DEMO.dietary_preference, DEMO.workouts_per_week, DEMO.session_minutes]
    );
    return id;
  }
  const inserted = await query(
    `INSERT INTO users (email, password_hash, full_name, age, gender, height_cm, weight_kg, weight_target,
      activity_level, fitness_level, experience_level, health_goal, lifestyle, dietary_preference,
      workouts_per_week, session_minutes, assessment_completed, onboarding_completed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,TRUE) RETURNING id`,
    [DEMO.email, passwordHash, DEMO.full_name, DEMO.age, DEMO.gender, DEMO.height_cm, DEMO.weight_kg,
     DEMO.weight_target, DEMO.activity_level, DEMO.fitness_level, DEMO.experience_level, DEMO.health_goal,
     DEMO.lifestyle, DEMO.dietary_preference, DEMO.workouts_per_week, DEMO.session_minutes]
  );
  return inserted.rows[0].id;
}

async function seedHistory(userId) {
  // Weight trend from 86kg down toward target.
  let weight = 86;
  for (let daysAgo = 14; daysAgo >= 0; daysAgo -= 2) {
    weight -= 0.35 + Math.random() * 0.15;
    await query(
      `INSERT INTO weight_logs (user_id, weight_kg, logged_on)
       VALUES ($1, $2, CURRENT_DATE - $3::int)
       ON CONFLICT (user_id, logged_on) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`,
      [userId, Number(weight.toFixed(1)), daysAgo]
    );
  }
  await query('UPDATE users SET weight_kg = $1 WHERE id = $2', [Number(weight.toFixed(1)), userId]);

  // Clear and reseed recent logs so the script is idempotent.
  await query("DELETE FROM food_logs WHERE user_id = $1 AND logged_on >= CURRENT_DATE - 13", [userId]);
  await query("DELETE FROM activity_logs WHERE user_id = $1 AND logged_on >= CURRENT_DATE - 13", [userId]);

  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    for (const [name, meal, cals, protein] of FOODS) {
      if (Math.random() < 0.85) {
        await query(
          `INSERT INTO food_logs (user_id, food_name, servings, calories, protein_g, meal_type, logged_on)
           VALUES ($1,$2,1,$3,$4,$5, CURRENT_DATE - $6::int)`,
          [userId, name, cals, protein, meal, daysAgo]
        );
      }
    }
    const [type, ex, dur, intensity] = ACTIVITIES[daysAgo % ACTIVITIES.length];
    const steps = 5000 + Math.floor(Math.random() * 6000);
    const burned = 250 + Math.floor(Math.random() * 250);
    await query(
      `INSERT INTO activity_logs (user_id, activity_type, exercise_name, duration_minutes, calories_burned, intensity, steps, logged_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE - $8::int)`,
      [userId, type, ex, dur, burned, intensity, steps, daysAgo]
    );
  }

  // Active weight goal.
  await query(
    `INSERT INTO user_goals (user_id, goal_type, target_value, current_value, unit, status)
     SELECT $1, 'weight', $2, $3, 'kg', 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM user_goals WHERE user_id = $1 AND goal_type = 'weight' AND status = 'active'
     )`,
    [userId, DEMO.weight_target, Number(weight.toFixed(1))]
  );
}

async function run() {
  await verifyConnection();
  const userId = await ensureDemoUser();
  await seedHistory(userId);
  console.log(`✓ Demo data seeded for user #${userId}`);
  console.log(`  Login: ${DEMO.email} / ${DEMO.password}`);
  await pool.end();
}

run().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
