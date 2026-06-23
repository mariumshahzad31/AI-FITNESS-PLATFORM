"use client";

import { useState } from "react";
import useSWR from "swr";
import { Salad, Send, UtensilsCrossed, Activity } from "lucide-react";
import { getFoodLogs, getActivities, logFood, apiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";

export default function NutritionPage() {
  const foods = useSWR("food-logs", getFoodLogs);
  const activities = useSWR("activities", getActivities);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const res = await logFood({ text: value });
      const parsed = res.parsed;
      const summary = parsed
        ? `Logged: ${parsed.food_name || parsed.exercise || "entry"} · ${parsed.calories || 0} kcal${parsed.steps ? ` · ${parsed.steps} steps` : ""}`
        : "Entry logged.";
      setNote(summary);
      setText("");
      foods.mutate();
      activities.mutate();
    } catch (error) {
      setErr(apiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Nutrition &amp; activity log</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Type entries in plain language — the AI parses calories, steps and more.</p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-3">
          <label className="label">Quick log</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="input resize-none"
            placeholder='e.g. "Lunch: grilled chicken and rice, then ran 30 min and walked 5000 steps"'
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Just type naturally — we&apos;ll do the math</span>
            <Button type="submit" loading={busy}><Send className="h-4 w-4" /> Log</Button>
          </div>
          {note && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{note}</div>}
          {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{err}</div>}
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Food logs */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-brand-500" />
            <h2 className="font-display text-lg font-semibold">Recent meals</h2>
          </div>
          {foods.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : foods.error ? (
            <ErrorState message={apiError(foods.error)} onRetry={() => foods.mutate()} />
          ) : !foods.data?.length ? (
            <EmptyState icon={<Salad className="h-7 w-7" />} title="No meals logged" description="Log your first meal above." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {foods.data.slice(0, 12).map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium capitalize">{f.food_name}</p>
                    <p className="text-xs text-slate-400">{f.meal_type} · {new Date(f.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge tone="slate">{f.calories} kcal</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity logs */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-500" />
            <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          </div>
          {activities.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : activities.error ? (
            <ErrorState message={apiError(activities.error)} onRetry={() => activities.mutate()} />
          ) : !activities.data?.length ? (
            <EmptyState icon={<Activity className="h-7 w-7" />} title="No activity logged" description="Log a workout or steps above." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activities.data.slice(0, 12).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium capitalize">{a.exercise_name}</p>
                    <p className="text-xs text-slate-400">
                      {a.duration_minutes} min · {a.intensity}{a.steps ? ` · ${a.steps} steps` : ""}
                    </p>
                  </div>
                  <Badge tone="green">{a.calories_burned} kcal</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
