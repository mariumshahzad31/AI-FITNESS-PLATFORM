"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { updateProfile, apiError } from "@/lib/api";
import { Button, Card, Input, Select } from "@/components/ui";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(() => ({
    full_name: user?.full_name ?? "",
    age: String(user?.age ?? ""),
    gender: user?.gender ?? "male",
    height_cm: String(user?.height_cm ?? ""),
    weight_current: String(user?.weight_current ?? ""),
    weight_target: String(user?.weight_target ?? ""),
    activity_level: user?.activity_level ?? "moderate",
    health_goal: user?.health_goal ?? "general_fitness",
    fitness_level: user?.fitness_level ?? "Beginner",
    dietary_preference: user?.dietary_preference ?? "omnivore",
    workouts_per_week: String(user?.workouts_per_week ?? 4),
    session_minutes: String(user?.session_minutes ?? 45),
    medical_conditions: user?.medical_conditions ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!user) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const payload: Partial<User> = {
        full_name: form.full_name,
        age: Number(form.age),
        gender: form.gender,
        height_cm: Number(form.height_cm),
        weight_current: Number(form.weight_current),
        weight_target: Number(form.weight_target),
        activity_level: form.activity_level,
        health_goal: form.health_goal,
        fitness_level: form.fitness_level,
        dietary_preference: form.dietary_preference,
        workouts_per_week: Number(form.workouts_per_week),
        session_minutes: Number(form.session_minutes),
        medical_conditions: form.medical_conditions,
      };
      const updated = await updateProfile(payload);
      setUser(updated);
      setMsg("Profile updated. Your AI targets will refresh on your next dashboard load.");
    } catch (error) {
      setErr(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Profile &amp; settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
      </div>

      <Card>
        <form onSubmit={save} className="space-y-6">
          {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{msg}</div>}
          {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{err}</div>}

          <section className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={form.full_name} onChange={set("full_name")} />
            <Input label="Age" type="number" value={form.age} onChange={set("age")} />
            <Select label="Gender" value={form.gender} onChange={set("gender")}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Height (cm)" type="number" value={form.height_cm} onChange={set("height_cm")} />
            <Input label="Current weight (kg)" type="number" step="0.1" value={form.weight_current} onChange={set("weight_current")} />
            <Input label="Target weight (kg)" type="number" step="0.1" value={form.weight_target} onChange={set("weight_target")} />
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Select label="Primary goal" value={form.health_goal} onChange={set("health_goal")}>
              <option value="weight_loss">Lose weight</option>
              <option value="muscle_gain">Build muscle</option>
              <option value="maintenance">Maintain</option>
              <option value="endurance">Improve endurance</option>
              <option value="general_fitness">General fitness</option>
            </Select>
            <Select label="Activity level" value={form.activity_level} onChange={set("activity_level")}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active</option>
              <option value="very_active">Very active</option>
            </Select>
            <Select label="Fitness level" value={form.fitness_level} onChange={set("fitness_level")}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </Select>
            <Select label="Dietary preference" value={form.dietary_preference} onChange={set("dietary_preference")}>
              <option value="omnivore">Omnivore</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="keto">Keto</option>
            </Select>
            <Input label="Workouts per week" type="number" min={1} max={7} value={form.workouts_per_week} onChange={set("workouts_per_week")} />
            <Input label="Minutes per session" type="number" min={15} max={120} value={form.session_minutes} onChange={set("session_minutes")} />
            <div className="sm:col-span-2">
              <label className="label">Medical conditions</label>
              <input className="input" value={form.medical_conditions} onChange={set("medical_conditions")} placeholder="Optional" />
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
