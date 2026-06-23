export type User = {
  id: number;
  email: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  height_cm: number;
  weight_current: number;
  weight_target: number;
  activity_level: string;
  fitness_level: string;
  experience_level: string;
  health_goal: string;
  lifestyle: string;
  dietary_preference: string;
  medical_conditions: string;
  workouts_per_week: number;
  session_minutes: number;
  assessment_completed: boolean;
  onboarding_completed: boolean;
};

export type AiGoals = {
  daily_calorie_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
  estimated_weeks_to_goal: number;
  weekly_rate_kg: number;
  bmi_estimate: number;
  bmi_category: string;
};

export type Today = {
  calories_in: number;
  calories_out: number;
  steps: number;
  active_minutes: number;
  protein_g: number;
};

export type ProgressMeta = {
  calorieProgressRatio: number;
  targetCalories: number;
  weightProgressPct: number;
  currentWeight: number;
  startWeight: number;
  targetWeight: number;
  hasWeightGoal: boolean;
};

export type Recommendation = { type: string; name: string; calories: number | null };

export type WorkoutExercise = {
  exercise_name: string;
  muscle_group: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  est_calories: number;
};

export type WorkoutDay = {
  day_index: number;
  day_label: string;
  exercises: WorkoutExercise[];
};

export type WorkoutPlan = {
  id: number;
  name: string;
  goal: string;
  fitness_level: string;
  days_per_week: number;
  weeks: number;
  est_weekly_calories: number;
  created_at?: string;
  days: WorkoutDay[];
};

export type Dashboard = {
  user: User;
  today: Today;
  aiGoals: AiGoals;
  progressMeta: ProgressMeta;
  workoutPlan: WorkoutPlan | null;
  recommendations: Recommendation[];
};

export type ProgressPoint = {
  log_date: string;
  calories_in: number;
  calories_out: number;
  steps: number;
};

export type WeightPoint = { date: string; weight_kg: number; notes?: string };

export type FoodLog = {
  id: number;
  food_name: string;
  servings: number;
  calories: number;
  protein_g: number;
  meal_type: string;
  notes: string;
  logged_on: string;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  activity_type: string;
  exercise_name: string;
  duration_minutes: number;
  calories_burned: number;
  intensity: string;
  steps: number;
  notes: string;
  logged_on: string;
  created_at: string;
};

export type Goal = {
  id: number;
  goal_type: string;
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string | null;
  status: string;
  created_at: string;
};

export type Place = {
  name: string;
  type: string;
  rating: number;
  distance_m: number;
  description: string;
  lat: number;
  lng: number;
};

export type ChatTurn = {
  message: string;
  response: string;
  intent: string;
  confidence: number;
  created_at: string;
};
