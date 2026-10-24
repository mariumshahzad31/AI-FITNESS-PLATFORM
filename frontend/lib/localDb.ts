import Dexie, { type Table } from "dexie";
import type { ChatTurn, FoodLog, ActivityLog, User, WeightPoint, WorkoutPlan } from "@/lib/types";

export type LocalUser = User & { passwordHash?: string; initial_weight_kg?: number };
export type LocalFoodLog = FoodLog & { userId: number; carbs_g: number; fat_g: number };
export type LocalActivityLog = ActivityLog & { userId: number };
export type LocalWeight = WeightPoint & { id?: number; userId: number };
export type LocalChatTurn = ChatTurn & { id?: number; userId: number };
export type LocalWorkoutPlan = WorkoutPlan & { userId: number };

class FitnessDatabase extends Dexie {
  users!: Table<LocalUser, number>;
  foodLogs!: Table<LocalFoodLog, number>;
  activityLogs!: Table<LocalActivityLog, number>;
  weights!: Table<LocalWeight, number>;
  chatTurns!: Table<LocalChatTurn, number>;
  workoutPlans!: Table<LocalWorkoutPlan, number>;

  constructor() {
    super("ai-fitness-platform");
    this.version(1).stores({
      users: "++id,&email",
      foodLogs: "++id,userId,logged_on,created_at",
      activityLogs: "++id,userId,logged_on,created_at",
      weights: "++id,userId,date",
      chatTurns: "++id,userId,created_at",
      workoutPlans: "++id,userId,created_at",
    });
  }
}

export const db = new FitnessDatabase();
const CURRENT_USER_KEY = "aifitness.localUserId";

export function setCurrentUserId(id: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(CURRENT_USER_KEY, String(id));
}

export function getCurrentUserId() {
  if (typeof window === "undefined") return null;
  const id = Number(window.localStorage.getItem(CURRENT_USER_KEY));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function clearCurrentUserId() {
  if (typeof window !== "undefined") window.localStorage.removeItem(CURRENT_USER_KEY);
}

export function localId() {
  return getCurrentUserId() ?? 0;
}
