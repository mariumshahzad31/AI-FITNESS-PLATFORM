import { db, clearCurrentUserId, getCurrentUserId, setCurrentUserId, type LocalActivityLog, type LocalChatTurn, type LocalFoodLog, type LocalUser, type LocalWorkoutPlan } from "@/lib/localDb";
import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { tokenStore } from "@/lib/tokens";
import type {
  ActivityLog, AiGoals, ChatTurn, Dashboard, FoodLog, Goal, Place, ProgressPoint,
  User, WeightPoint, WorkoutDay, WorkoutPlan,
} from "@/lib/types";

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const DAY = 24 * 60 * 60 * 1000;
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL?.trim();
const BASE_URL = RAW_API_URL
  ? (/^https?:\/\//i.test(RAW_API_URL) ? RAW_API_URL : `https://${RAW_API_URL}`)
  : process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:5000";
const remoteApi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

remoteApi.interceptors.request.use((config) => {
  const access = tokenStore.getAccess();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;
async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken }, { timeout: 20000 });
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    tokenStore.clear();
    return null;
  }
}

remoteApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !original.url?.includes("/api/auth/")) {
      original._retried = true;
      refreshing ??= refreshAccessToken();
      const access = await refreshing;
      refreshing = null;
      if (access) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${access}`;
        return remoteApi(original);
      }
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

function remoteSession() {
  return Boolean(tokenStore.getAccess());
}

function requireUserId() {
  const id = getCurrentUserId();
  if (!id) throw new Error("Your local profile is unavailable. Please continue as a guest or log in again.");
  return id;
}

function validateProfile(payload: Partial<User>) {
  if (payload.age != null && (!Number.isInteger(Number(payload.age)) || Number(payload.age) < 10 || Number(payload.age) > 120)) {
    throw new Error("Age must be a whole number between 10 and 120.");
  }
  for (const [field, label] of [["height_cm", "Height"], ["weight_current", "Current weight"], ["weight_target", "Target weight"]] as const) {
    const value = payload[field];
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      throw new Error(`${label} must be greater than zero.`);
    }
  }
  if (payload.workouts_per_week != null && (payload.workouts_per_week < 1 || payload.workouts_per_week > 7)) {
    throw new Error("Workouts per week must be between 1 and 7.");
  }
  if (payload.session_minutes != null && (payload.session_minutes < 15 || payload.session_minutes > 120)) {
    throw new Error("Session length must be between 15 and 120 minutes.");
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timestamp() {
  return new Date().toISOString();
}

function makeUser(values: Partial<User> = {}): Omit<User, "id"> {
  return {
    email: values.email ?? "",
    full_name: values.full_name ?? "",
    age: values.age ?? null,
    gender: values.gender ?? "other",
    height_cm: values.height_cm ?? 0,
    weight_current: values.weight_current ?? 0,
    weight_target: values.weight_target ?? 0,
    activity_level: values.activity_level ?? "moderate",
    fitness_level: values.fitness_level ?? "Beginner",
    experience_level: values.experience_level ?? "Beginner",
    health_goal: values.health_goal ?? "general_fitness",
    lifestyle: values.lifestyle ?? "balanced",
    dietary_preference: values.dietary_preference ?? "omnivore",
    medical_conditions: values.medical_conditions ?? "",
    workouts_per_week: values.workouts_per_week ?? 3,
    session_minutes: values.session_minutes ?? 45,
    assessment_completed: values.assessment_completed ?? false,
    onboarding_completed: values.onboarding_completed ?? false,
  };
}

async function currentUser(): Promise<LocalUser> {
  const user = await db.users.get(requireUserId());
  if (!user) throw new Error("Your local profile could not be found.");
  return user;
}

function publicUser(user: LocalUser): User {
  const profile = { ...user };
  delete profile.passwordHash;
  delete profile.initial_weight_kg;
  return profile;
}

async function passwordHash(password: string, salt?: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure local sign-in requires a modern browser on HTTPS or localhost.");
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new ArrayBuffer(actualSalt.byteLength);
  new Uint8Array(saltBuffer).set(actualSalt);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer, iterations: 120000, hash: "SHA-256" }, key, 256);
  const encoded = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${encoded(actualSalt)}:${encoded(new Uint8Array(bits))}`;
}

function matchesHash(saved: string, candidate: string) {
  if (saved.length !== candidate.length) return false;
  let diff = 0;
  for (let i = 0; i < saved.length; i += 1) diff |= saved.charCodeAt(i) ^ candidate.charCodeAt(i);
  return diff === 0;
}

export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; details?: { message: string }[] } | undefined;
    if (data?.details?.length) return data.details.map((item) => item.message).join(", ");
    if (!error.response) {
      return BASE_URL
        ? `Cannot reach the API at ${BASE_URL}. Start the backend and check frontend/.env.local.`
        : "Cannot reach the API at /api on this origin.";
    }
    return data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function createGuest() {
  const existingGuest = await db.users.where("email").startsWith("guest-").first();
  if (existingGuest) {
    setCurrentUserId(existingGuest.id);
    return publicUser(existingGuest);
  }
  const key = `guest-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}@local.invalid`;
  const id = await db.users.add(makeUser({ email: key, full_name: "Guest athlete" }) as LocalUser);
  setCurrentUserId(id);
  const user = await db.users.get(id);
  if (!user) throw new Error("Could not create your local guest profile.");
  return publicUser(user);
}

export async function register(email: string, password: string, full_name: string) {
  const { data } = await remoteApi.post("/api/auth/register", { email, password, full_name });
  return data as { accessToken: string; refreshToken: string; user: User };
}

export async function login(email: string, password: string) {
  const localAccount = await db.users.where("email").equals(email.trim().toLowerCase()).first();
  if (localAccount?.passwordHash) return loginLocal(email, password);
  const { data } = await remoteApi.post("/api/auth/login", { email, password });
  return data as { accessToken: string; refreshToken: string; user: User };
}

async function loginLocal(email: string, password: string) {
  const account = await db.users.where("email").equals(email.trim().toLowerCase()).first();
  if (!account?.passwordHash) throw new Error("No local account found for this email on this device.");
  const [saltHex] = account.passwordHash.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);
  if (!matchesHash(account.passwordHash, await passwordHash(password, salt))) throw new Error("Incorrect password.");
  tokenStore.clear();
  setCurrentUserId(account.id);
  return { accessToken: "", refreshToken: "", user: publicUser(account) };
}

export async function logout() {
  if (remoteSession()) {
    try {
      await remoteApi.post("/api/auth/logout", { refreshToken: tokenStore.getRefresh() });
    } catch {
      // Clearing local credentials is sufficient if the API is offline.
    }
  }
  clearCurrentUserId();
}

export async function fetchMe() {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ user: User }>("/api/auth/me");
    return data.user;
  }
  return publicUser(await currentUser());
}

export async function updateProfile(payload: Partial<User>) {
  if (remoteSession()) {
    const { data } = await remoteApi.put<{ user: User }>("/api/profile", payload);
    return data.user;
  }
  validateProfile(payload);
  const user = await currentUser();
  const updated = { ...user, ...payload, id: user.id, email: user.email };
  await db.users.put(updated);
  return publicUser(updated);
}

export async function computeTargets(profile?: User): Promise<AiGoals> {
  const user = profile ?? await currentUser();
  const age = Number(user.age) || 30;
  const weight = Number(user.weight_current) || 75;
  const height = Number(user.height_cm) || 170;
  const genderOffset = user.gender === "male" ? 5 : user.gender === "female" ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
  const maintenance = bmr * (ACTIVITY_FACTORS[user.activity_level] ?? ACTIVITY_FACTORS.moderate);
  const goal = user.health_goal;
  const adjustment = goal === "weight_loss" ? -400 : goal === "muscle_gain" ? 250 : goal === "endurance" ? 100 : 0;
  const daily_calorie_target = Math.round(Math.max(user.gender === "female" ? 1200 : 1500, maintenance + adjustment));
  const protein_g_target = Math.round(weight * (goal === "muscle_gain" ? 2 : 1.8));
  const fat_g_target = Math.round(weight * 0.8);
  const carbs_g_target = Math.max(0, Math.round((daily_calorie_target - protein_g_target * 4 - fat_g_target * 9) / 4));
  const bmi = height > 0 ? Number((weight / ((height / 100) ** 2)).toFixed(1)) : 0;
  const delta = Math.abs(weight - (Number(user.weight_target) || weight));
  const rate = goal === "weight_loss" ? 0.4 : goal === "muscle_gain" ? 0.2 : 0;
  return {
    daily_calorie_target, protein_g_target, carbs_g_target, fat_g_target,
    estimated_weeks_to_goal: rate ? Math.ceil(delta / rate) : 0,
    weekly_rate_kg: rate,
    bmi_estimate: bmi,
    bmi_category: !bmi ? "unknown" : bmi < 18.5 ? "Underweight" : bmi < 25 ? "Healthy" : bmi < 30 ? "Overweight" : "Obese",
  };
}

function workoutFor(user: User): WorkoutPlan {
  const templates: { label: string; groups: string[] }[] = [
    { label: "Full Body A", groups: ["chest", "back", "legs", "core"] },
    { label: "Full Body B", groups: ["legs", "shoulders", "back", "core"] },
    { label: "Strength & Conditioning", groups: ["chest", "legs", "arms", "core"] },
    { label: "Upper Body", groups: ["chest", "back", "shoulders", "arms"] },
    { label: "Lower Body", groups: ["legs", "glutes", "core", "calves"] },
    { label: "Mobility & Cardio", groups: ["mobility", "cardio", "core"] },
    { label: "Active Recovery", groups: ["mobility", "cardio"] },
  ];
  const exercises: Record<string, string[]> = {
    chest: ["Push-ups", "Dumbbell press", "Incline push-ups"],
    back: ["Bent-over rows", "Bird-dogs", "Resistance-band rows"],
    legs: ["Squats", "Reverse lunges", "Step-ups"],
    shoulders: ["Overhead press", "Lateral raises", "Pike push-ups"],
    arms: ["Biceps curls", "Triceps dips", "Hammer curls"],
    core: ["Plank", "Dead bugs", "Bicycle crunches"],
    glutes: ["Glute bridges", "Hip hinges", "Donkey kicks"],
    calves: ["Calf raises", "Single-leg calf raises", "Marching"],
    mobility: ["Hip mobility flow", "Cat-cow stretch", "World's greatest stretch"],
    cardio: ["Brisk walk", "Low-impact intervals", "Marching in place"],
  };
  const count = Math.max(1, Math.min(7, Number(user.workouts_per_week) || 3));
  const beginner = user.fitness_level.toLowerCase() === "beginner";
  const days: WorkoutDay[] = templates.slice(0, count).map((template, index) => ({
    day_index: index + 1,
    day_label: `Day ${index + 1} · ${template.label}`,
    exercises: template.groups.map((group) => ({
      exercise_name: exercises[group][index % exercises[group].length],
      muscle_group: group,
      sets: beginner ? 2 : 3,
      reps: group === "mobility" ? "30 sec" : group === "cardio" ? "10 min" : "8-12",
      rest_seconds: 60,
      est_calories: group === "cardio" ? 100 : 35,
    })),
  }));
  return {
    id: Date.now(), name: `${user.fitness_level} ${user.health_goal.replace(/_/g, " ")} plan`,
    goal: user.health_goal, fitness_level: user.fitness_level, days_per_week: count, weeks: 4,
    est_weekly_calories: days.reduce((sum, day) => sum + day.exercises.reduce((total, ex) => total + ex.est_calories, 0), 0),
    created_at: timestamp(), days,
  };
}

export async function submitAssessment(payload: Partial<User>) {
  if (remoteSession()) {
    const { data } = await remoteApi.post("/api/profile/assessment", payload);
    return data as { user: User; aiGoals: unknown; workoutPlan: WorkoutPlan | null };
  }
  validateProfile(payload);
  if (!payload.gender || !payload.activity_level || !payload.fitness_level || !payload.health_goal) {
    throw new Error("Complete the required assessment fields before generating your plan.");
  }
  const updated = await updateProfile({
    ...payload,
    assessment_completed: true,
    onboarding_completed: true,
  });
  await db.users.update(updated.id, { initial_weight_kg: Number(updated.weight_current) });
  const plan = workoutFor(updated);
  await db.workoutPlans.add({ ...plan, userId: updated.id } as LocalWorkoutPlan);
  return { user: updated, aiGoals: await computeTargets(updated), workoutPlan: plan };
}

export async function getWorkoutPlan(): Promise<WorkoutPlan | null> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ plan: WorkoutPlan | null }>("/api/workout-plan");
    return data.plan;
  }
  const plans = await db.workoutPlans.where("userId").equals(requireUserId()).toArray();
  return plans.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
}

export async function generateWorkoutPlan() {
  if (remoteSession()) {
    const { data } = await remoteApi.post<{ plan: WorkoutPlan }>("/api/workout-plan/generate");
    return data.plan;
  }
  const user = await currentUser();
  const plan = workoutFor(user);
  await db.workoutPlans.add({ ...plan, userId: user.id } as LocalWorkoutPlan);
  return plan;
}

export async function getDashboard(): Promise<Dashboard> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<Dashboard>("/api/dashboard");
    return data;
  }
  const user = await currentUser();
  const [goals, foods, activities, weights, workoutPlan] = await Promise.all([
    computeTargets(user),
    db.foodLogs.where("userId").equals(user.id).toArray(),
    db.activityLogs.where("userId").equals(user.id).toArray(),
    db.weights.where("userId").equals(user.id).toArray(),
    getWorkoutPlan(),
  ]);
  const date = today();
  const todayFoods = foods.filter((entry) => entry.logged_on === date);
  const todayActivities = activities.filter((entry) => entry.logged_on === date);
  const currentWeight = weights.sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight_kg ?? user.weight_current;
  const startingWeight = user.initial_weight_kg ?? user.weight_current;
  const progress = startingWeight === user.weight_target ? 100
    : Math.min(100, Math.max(0, Math.round(((startingWeight - currentWeight) / (startingWeight - user.weight_target)) * 100)));
  const totalCalories = todayFoods.reduce((sum, item) => sum + item.calories, 0);
  return {
    user: publicUser(user),
    today: {
      calories_in: totalCalories,
      calories_out: todayActivities.reduce((sum, item) => sum + item.calories_burned, 0),
      steps: todayActivities.reduce((sum, item) => sum + item.steps, 0),
      active_minutes: todayActivities.reduce((sum, item) => sum + item.duration_minutes, 0),
      protein_g: todayFoods.reduce((sum, item) => sum + item.protein_g, 0),
    },
    aiGoals: goals,
    progressMeta: {
      calorieProgressRatio: goals.daily_calorie_target ? totalCalories / goals.daily_calorie_target : 0,
      targetCalories: goals.daily_calorie_target, weightProgressPct: progress,
      currentWeight, startWeight: startingWeight, targetWeight: user.weight_target,
      hasWeightGoal: startingWeight !== user.weight_target,
    },
    workoutPlan,
    recommendations: [
      { type: "Nutrition", name: "Build meals around lean protein and colorful produce", calories: null },
      { type: "Activity", name: todayActivities.length ? "Great work staying active today" : "Add a short walk or mobility session today", calories: null },
      { type: "Recovery", name: `Aim for ${goals.protein_g_target}g of protein and steady hydration`, calories: null },
    ],
  };
}

export async function getProgress(): Promise<ProgressPoint[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ series: ProgressPoint[] }>("/api/dashboard/progress");
    return data.series;
  }
  const userId = requireUserId();
  const [foods, activities] = await Promise.all([
    db.foodLogs.where("userId").equals(userId).toArray(),
    db.activityLogs.where("userId").equals(userId).toArray(),
  ]);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.now() - (13 - index) * DAY).toISOString().slice(0, 10);
    const dailyFoods = foods.filter((entry) => entry.logged_on === date);
    const dailyActivities = activities.filter((entry) => entry.logged_on === date);
    return {
      log_date: date,
      calories_in: dailyFoods.reduce((sum, item) => sum + item.calories, 0),
      calories_out: dailyActivities.reduce((sum, item) => sum + item.calories_burned, 0),
      steps: dailyActivities.reduce((sum, item) => sum + item.steps, 0),
    };
  });
}

export async function getFoodLogs(): Promise<FoodLog[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ foodLogs: FoodLog[] }>("/api/food-log");
    return data.foodLogs;
  }
  return (await db.foodLogs.where("userId").equals(requireUserId()).toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
}

function parseLog(text: string) {
  const lower = text.toLowerCase();
  const isActivity = /\b(run|ran|jog|walk|lift|swim|cycle|bike|yoga|sprint|steps?|workout|gym)\b/.test(lower);
  const isFood = /\b(eat|ate|had|food|meal|roti|rice|salad|chicken|burger|pizza|sandwich|banana|apple|dal|daal|egg|oatmeal|yogurt|shake|protein|smoothie|bread|pasta|fish|paneer)\b/.test(lower);
  const durationMatch = lower.match(/(\d+)\s*(min(?:ute)?s?|hours?|hrs?)/);
  const caloriesMatch = lower.match(/(\d+)\s*(?:kcal|calories|cal)\b/);
  const stepsMatch = lower.match(/(\d[\d,]*)\s*(?:steps?|k\s*steps)\b/) ?? lower.match(/(\d+)\s*k\b/);
  const exercise = /\b(run|ran|jog|sprint)\b/.test(lower) ? "running"
    : /\b(lift|weight|dumbbell|barbell|gym)\b/.test(lower) ? "weight training"
      : /\bwalk\b/.test(lower) ? "walking" : /\byoga|stretch\b/.test(lower) ? "yoga"
        : /\bswim\b/.test(lower) ? "swimming" : /\bcycle|bike\b/.test(lower) ? "cycling" : null;
  const mealType = ["breakfast", "lunch", "dinner", "snack"].find((meal) => lower.includes(meal)) ?? "meal";
  const steps = stepsMatch ? Number(stepsMatch[1].replace(/,/g, "")) * (/\bk\b/.test(stepsMatch[0]) ? 1000 : 1) : 0;
  return {
    type: isActivity ? "activity" : isFood ? "food" : steps ? "activity" : "food",
    food_name: text.replace(/\b(i ate|i had|ate|had|food|meal|for|today)\b/gi, "").trim().slice(0, 120) || text.slice(0, 120),
    meal_type: mealType,
    calories: Number(caloriesMatch?.[1]) || (isActivity ? 0 : 220),
    protein_g: 0, servings: 1,
    duration: durationMatch ? Number(durationMatch[1]) * (/hour|hr/.test(durationMatch[2]) ? 60 : 1) : (isActivity && !steps ? 30 : 0),
    steps, exercise: exercise ?? (steps ? "walking" : null),
    intensity: /sprint|swim|lift|gym/.test(lower) ? "high" : /\bwalk|yoga/.test(lower) ? "low" : "moderate",
  };
}

export async function logFood(payload: { text?: string; food_name?: string; calories?: number; meal_type?: string; servings?: number; protein_g?: number }) {
  if (remoteSession()) {
    const { data } = await remoteApi.post("/api/food-log", payload);
    return data;
  }
  const userId = requireUserId();
  const text = payload.text?.trim() ?? "";
  if (!text && !payload.food_name) throw new Error("Provide a food name or a natural-language entry.");
  const parsed = text ? parseLog(text) : null;
  const now = timestamp();
  const food = {
    userId,
    food_name: payload.food_name ?? parsed?.food_name ?? text,
    servings: payload.servings ?? parsed?.servings ?? 1,
    calories: payload.calories ?? parsed?.calories ?? 0,
    protein_g: payload.protein_g ?? parsed?.protein_g ?? 0,
    carbs_g: 0, fat_g: 0,
    meal_type: payload.meal_type ?? parsed?.meal_type ?? "meal",
    notes: text,
    logged_on: today(),
    created_at: now,
  } as LocalFoodLog;
  let activity: ActivityLog | null = null;
  await db.transaction("rw", db.foodLogs, db.activityLogs, async () => {
    await db.foodLogs.add(food);
    if (parsed?.type === "activity" && parsed.exercise) {
      const item: Omit<LocalActivityLog, "id"> = {
        userId, activity_type: "activity", exercise_name: parsed.exercise,
        duration_minutes: parsed.duration, calories_burned: parsed.calories,
        intensity: parsed.intensity, steps: parsed.steps, notes: text,
        logged_on: today(), created_at: now,
      };
      const id = await db.activityLogs.add(item as LocalActivityLog);
      activity = { ...item, id };
    }
  });
  return { success: true, food, activity, parsed };
}

export async function getActivities(): Promise<ActivityLog[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ activities: ActivityLog[] }>("/api/activity");
    return data.activities;
  }
  return (await db.activityLogs.where("userId").equals(requireUserId()).toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
}

export async function logActivity(payload: Record<string, unknown>) {
  if (remoteSession()) {
    const { data } = await remoteApi.post("/api/activity", payload);
    return data;
  }
  const id = await db.activityLogs.add({
    userId: requireUserId(),
    activity_type: String(payload.activity_type ?? "activity"),
    exercise_name: String(payload.exercise_name ?? "Workout"),
    duration_minutes: Number(payload.duration_minutes) || 0,
    calories_burned: Number(payload.calories_burned) || 0,
    intensity: String(payload.intensity ?? "moderate"),
    steps: Number(payload.steps) || 0,
    notes: String(payload.notes ?? ""), logged_on: today(), created_at: timestamp(),
  } as LocalActivityLog);
  return { success: true, id };
}

export async function getWeight(): Promise<WeightPoint[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ series: WeightPoint[] }>("/api/weight");
    return data.series;
  }
  const weights = await db.weights.where("userId").equals(requireUserId()).toArray();
  return weights.sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
}

export async function logWeight(weight_kg: number, notes?: string) {
  if (remoteSession()) {
    await remoteApi.post("/api/weight", { weight_kg, notes });
    return;
  }
  if (!Number.isFinite(weight_kg) || weight_kg <= 0) throw new Error("Enter a valid weight greater than zero.");
  const user = await currentUser();
  const date = today();
  await db.transaction("rw", db.weights, db.users, async () => {
    const existing = await db.weights.where("userId").equals(user.id).filter((entry) => entry.date === date).first();
    if (existing?.id != null) {
      await db.weights.update(existing.id, { weight_kg, notes });
    } else {
      await db.weights.add({ userId: user.id, date, weight_kg, notes });
    }
    await db.users.update(user.id, { weight_current: weight_kg });
  });
}

export async function getGoals(): Promise<Goal[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ goals: Goal[] }>("/api/goals");
    return data.goals;
  }
  const user = await currentUser();
  return [{
    id: user.id, goal_type: user.health_goal, target_value: user.weight_target,
    current_value: user.weight_current, unit: "kg", deadline: null,
    status: user.weight_current === user.weight_target ? "completed" : "active", created_at: timestamp(),
  }];
}

const COACH_RULES: { intent: string; triggers: string[]; response: string }[] = [
  { intent: "injury_concern", triggers: ["pain", "hurt", "injury", "injured", "sore", "strain", "sprain"], response: "I'm sorry you're in discomfort. Stop any movement that causes sharp pain. If pain is severe or persists, please consult a healthcare professional before training that area again." },
  { intent: "fatigue", triggers: ["tired", "fatigue", "exhausted", "drained", "overtrained", "burnout"], response: "Persistent fatigue often signals under-recovery. Prioritise 7-9 hours of sleep, schedule at least one full rest day this week, and eat enough protein and carbohydrates to fuel training." },
  { intent: "motivation", triggers: ["motivation", "unmotivated", "quit", "discouraged", "lazy", "procrastinate"], response: "Motivation often follows action. Shrink the goal: commit to just 10 minutes today. Track small wins, schedule workouts like appointments, and remember that progress compounds." },
  { intent: "nutrition", triggers: ["diet", "nutrition", "eat", "food", "protein", "calories", "meal", "carbs", "macros"], response: "Build meals around a palm of protein, a fist of vegetables, a cupped hand of carbs and a thumb of healthy fats. Choose a modest calorie deficit for fat loss or a small surplus for muscle gain, and hydrate throughout the day." },
  { intent: "workout", triggers: ["workout", "exercise", "training", "routine", "plan", "reps", "sets", "strength", "gym"], response: "Train each major muscle group 2-3 times per week with gradual progression. Pair strength work with cardio that you enjoy, and always warm up before working sets." },
  { intent: "recovery", triggers: ["recovery", "rest", "sleep", "stretch", "mobility", "soreness"], response: "Recovery is where adaptation happens. Prioritise sleep and nutrition, add light mobility or walking on rest days, and avoid training the same muscle hard on consecutive days." },
  { intent: "help_request", triggers: ["help", "how", "guide", "explain", "beginner", "start"], response: "Happy to help! Tell me your main goal and how many days a week you can train. You can also generate a personalised workout plan from your dashboard." },
];

function coachReply(message: string) {
  const normalized = message.toLowerCase();
  const rule = COACH_RULES.find((item) => item.triggers.some((word) => normalized.includes(word)));
  return {
    intent: rule?.intent ?? "general",
    confidence: rule ? 0.8 : 0.5,
    reply: rule?.response ?? "Consistency and good form are the foundation of every result. Keep logging your meals and workouts so your guidance stays relevant.",
  };
}

export async function sendCoachMessage(message: string) {
  if (remoteSession()) {
    const { data } = await remoteApi.post("/api/coach", { message });
    return data as { reply: string; intent: string; confidence: number };
  }
  const clean = message.trim();
  if (!clean) throw new Error("Message is required.");
  const userId = requireUserId();
  const result = coachReply(clean);
  await db.chatTurns.add({
    userId, message: clean, response: result.reply, intent: result.intent,
    confidence: result.confidence, created_at: timestamp(),
  } as LocalChatTurn);
  return result;
}

export async function getCoachHistory(): Promise<ChatTurn[]> {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ history: ChatTurn[] }>("/api/coach/history");
    return data.history;
  }
  const turns = await db.chatTurns.where("userId").equals(requireUserId()).toArray();
  return turns.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-50);
}

export async function getNearby(lat: number, lon: number) {
  if (remoteSession()) {
    const { data } = await remoteApi.get<{ places: Place[]; source: string }>("/api/nearby", { params: { lat, lon } });
    return data;
  }
  const descriptions: Record<string, string> = {
    Gym: "Strength, cardio and recovery equipment with coaching on demand.",
    Wellness: "Group classes, mobility training and personal coaching.",
    Outdoor: "Open-air running and walking area for active recovery.",
    Pool: "Lap swimming and aqua fitness for low-impact training.",
  };
  const distance = (aLat: number, aLon: number, bLat: number, bLon: number) => {
    const radians = (degree: number) => degree * Math.PI / 180;
    const dLat = radians(bLat - aLat);
    const dLon = radians(bLon - aLon);
    const value = Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
  };
  const query = `[out:json][timeout:8];(node["leisure"="fitness_centre"](around:3000,${lat},${lon});node["leisure"="sports_centre"](around:3000,${lat},${lon});node["leisure"="swimming_pool"](around:3000,${lat},${lon}););out body 20;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
      signal: AbortSignal.timeout(9000),
    });
    if (response.ok) {
      const result = await response.json() as { elements?: { lat: number; lon: number; tags?: { name?: string; leisure?: string } }[] };
      const places = (result.elements ?? []).filter((item) => item.lat && item.lon && item.tags?.name).map((item) => {
        const type = item.tags?.leisure === "swimming_pool" ? "Pool" : item.tags?.leisure === "sports_centre" ? "Wellness" : "Gym";
        return {
          name: item.tags?.name ?? "Fitness venue", type, lat: item.lat, lng: item.lon,
          rating: 4.5, distance_m: distance(lat, lon, item.lat, item.lon), description: descriptions[type],
        };
      }).sort((a, b) => a.distance_m - b.distance_m).slice(0, 10);
      if (places.length) return { places, source: "openstreetmap" };
    }
  } catch {
    // Public venue lookup is optional; deterministic local suggestions keep this page usable offline.
  }
  const seeds = [
    { name: "CoreFit Gym", type: "Gym", dLat: 0.004, dLon: 0.003, rating: 4.8 },
    { name: "Pulse Health Studio", type: "Wellness", dLat: -0.003, dLon: 0.005, rating: 4.6 },
    { name: "Green Track Park", type: "Outdoor", dLat: 0.006, dLon: -0.004, rating: 4.7 },
    { name: "AquaLife Pool", type: "Pool", dLat: -0.005, dLon: -0.006, rating: 4.5 },
    { name: "Iron Temple Strength", type: "Gym", dLat: 0.008, dLon: 0.002, rating: 4.4 },
  ];
  const places: Place[] = seeds.map((item) => {
    const placeLat = lat + item.dLat;
    const placeLon = lon + item.dLon;
    return {
      name: item.name, type: item.type, rating: item.rating, lat: placeLat, lng: placeLon,
      distance_m: distance(lat, lon, placeLat, placeLon), description: descriptions[item.type],
    };
  }).sort((a, b) => a.distance_m - b.distance_m);
  return { places, source: "simulated" };
}

export async function getAiSuggestions() {
  if (remoteSession()) {
    const { data } = await remoteApi.get("/api/ai/suggestions");
    return data as {
      exercise: { exercise_name: string; duration_minutes: number; calories_burned_estimate: number; intensity: string; instructions: string };
      diet: { food_recommendation: string; macros: Record<string, number>; estimated_calories: number };
      insight: { insight_title: string; insight_description: string; trend: string };
    };
  }
  const goals = await computeTargets();
  return {
    exercise: { exercise_name: "Brisk walk", duration_minutes: 30, calories_burned_estimate: 140, intensity: "moderate", instructions: "Walk at a pace that raises your breathing while allowing conversation." },
    diet: { food_recommendation: "A balanced meal with lean protein, vegetables and whole grains", macros: { protein: goals.protein_g_target, carbohydrates: goals.carbs_g_target, fat: goals.fat_g_target }, estimated_calories: goals.daily_calorie_target },
    insight: { insight_title: "Small consistent steps", insight_description: "Regular movement and steady nutrition habits support lasting progress.", trend: "positive" },
  };
}
