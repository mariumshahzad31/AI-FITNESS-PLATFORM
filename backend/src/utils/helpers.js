/** Shared domain helpers. */

export function calculateBmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!w || !h) return 0;
  return Number((w / (h * h)).toFixed(1));
}

export function bmiCategory(bmi) {
  if (!bmi) return 'unknown';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

const ALLOWED_GOALS = ['weight_loss', 'muscle_gain', 'maintenance', 'endurance', 'general_fitness'];
const ALLOWED_ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

export function normalizeGoal(goal) {
  return ALLOWED_GOALS.includes(goal) ? goal : 'general_fitness';
}

export function normalizeActivity(level) {
  return ALLOWED_ACTIVITY.includes(level) ? level : 'moderate';
}

/** Shape a DB user row into the public profile object the frontend consumes. */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    age: user.age,
    gender: user.gender,
    height_cm: Number(user.height_cm) || 0,
    weight_current: Number(user.weight_kg) || 0,
    weight_target: Number(user.weight_target) || Number(user.weight_kg) || 0,
    activity_level: user.activity_level || 'moderate',
    fitness_level: user.fitness_level || 'Beginner',
    experience_level: user.experience_level || 'Beginner',
    health_goal: user.health_goal || 'general_fitness',
    lifestyle: user.lifestyle || 'balanced',
    dietary_preference: user.dietary_preference || 'omnivore',
    medical_conditions: user.medical_conditions || '',
    workouts_per_week: user.workouts_per_week ?? 3,
    session_minutes: user.session_minutes ?? 45,
    assessment_completed: Boolean(user.assessment_completed),
    onboarding_completed: Boolean(user.onboarding_completed),
  };
}

export const USER_COLUMNS = `id, email, full_name, age, gender, height_cm, weight_kg, weight_target,
  activity_level, fitness_level, experience_level, health_goal, lifestyle, dietary_preference,
  medical_conditions, workouts_per_week, session_minutes, assessment_completed, onboarding_completed`;
