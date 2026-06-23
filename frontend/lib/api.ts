import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { tokenStore } from "./tokens";
import type {
  ActivityLog,
  ChatTurn,
  Dashboard,
  FoodLog,
  Goal,
  Place,
  ProgressPoint,
  User,
  WeightPoint,
  WorkoutPlan,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, transparently refresh once and replay the original request.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  try {
    const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken: refresh });
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const isAuthCall = original?.url?.includes("/api/auth/");

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; details?: { message: string }[] } | undefined;
    if (data?.details?.length) return data.details.map((d) => d.message).join(", ");
    return data?.message || error.message;
  }
  return String(error);
}

// --- Auth -----------------------------------------------------------------
type AuthResponse = { accessToken: string; refreshToken: string; user: User };

export async function register(email: string, password: string, full_name: string) {
  const { data } = await api.post<AuthResponse>("/api/auth/register", { email, password, full_name });
  return data;
}
export async function login(email: string, password: string) {
  const { data } = await api.post<AuthResponse>("/api/auth/login", { email, password });
  return data;
}
export async function logout(refreshToken: string | null) {
  try {
    await api.post("/api/auth/logout", { refreshToken });
  } catch {
    /* best effort */
  }
}
export async function fetchMe() {
  const { data } = await api.get<{ user: User }>("/api/auth/me");
  return data.user;
}

// --- Profile / assessment -------------------------------------------------
export async function updateProfile(payload: Partial<User>) {
  const { data } = await api.put<{ user: User }>("/api/profile", payload);
  return data.user;
}
export async function submitAssessment(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/profile/assessment", payload);
  return data as { user: User; aiGoals: unknown; workoutPlan: WorkoutPlan | null };
}

// --- Dashboard ------------------------------------------------------------
export async function getDashboard() {
  const { data } = await api.get<Dashboard>("/api/dashboard");
  return data;
}
export async function getProgress() {
  const { data } = await api.get<{ series: ProgressPoint[] }>("/api/dashboard/progress");
  return data.series;
}

// --- Logs -----------------------------------------------------------------
export async function getFoodLogs() {
  const { data } = await api.get<{ foodLogs: FoodLog[] }>("/api/food-log");
  return data.foodLogs;
}
export async function logFood(payload: { text?: string; food_name?: string; calories?: number; meal_type?: string }) {
  const { data } = await api.post("/api/food-log", payload);
  return data;
}
export async function getActivities() {
  const { data } = await api.get<{ activities: ActivityLog[] }>("/api/activity");
  return data.activities;
}
export async function logActivity(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/activity", payload);
  return data;
}

// --- Weight ---------------------------------------------------------------
export async function getWeight() {
  const { data } = await api.get<{ series: WeightPoint[] }>("/api/weight");
  return data.series;
}
export async function logWeight(weight_kg: number, notes?: string) {
  const { data } = await api.post("/api/weight", { weight_kg, notes });
  return data;
}

// --- Workout --------------------------------------------------------------
export async function getWorkoutPlan() {
  const { data } = await api.get<{ plan: WorkoutPlan | null }>("/api/workout-plan");
  return data.plan;
}
export async function generateWorkoutPlan() {
  const { data } = await api.post<{ plan: WorkoutPlan }>("/api/workout-plan/generate");
  return data.plan;
}

// --- Goals ----------------------------------------------------------------
export async function getGoals() {
  const { data } = await api.get<{ goals: Goal[] }>("/api/goals");
  return data.goals;
}

// --- Coach ----------------------------------------------------------------
export async function sendCoachMessage(message: string) {
  const { data } = await api.post<{ reply: string; intent: string; confidence: number }>("/api/coach", { message });
  return data;
}
export async function getCoachHistory() {
  const { data } = await api.get<{ history: ChatTurn[] }>("/api/coach/history");
  return data.history;
}

// --- Nearby ---------------------------------------------------------------
export async function getNearby(lat: number, lon: number) {
  const { data } = await api.get<{ places: Place[]; source: string }>("/api/nearby", { params: { lat, lon } });
  return data;
}

// --- AI suggestions -------------------------------------------------------
export async function getAiSuggestions() {
  const { data } = await api.get("/api/ai/suggestions");
  return data as {
    exercise: { exercise_name: string; duration_minutes: number; calories_burned_estimate: number; intensity: string; instructions: string };
    diet: { food_recommendation: string; macros: Record<string, number>; estimated_calories: number };
    insight: { insight_title: string; insight_description: string; trend: string };
  };
}
