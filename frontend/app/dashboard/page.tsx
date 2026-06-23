"use client";

import useSWR from "swr";
import Link from "next/link";
import { Activity, ArrowRight, Dumbbell, Flame, Footprints, ScanLine, Scale, Target, TrendingDown } from "lucide-react";
import { getDashboard, apiError } from "@/lib/api";
import { Badge, Card, ErrorState, Skeleton } from "@/components/ui";
import { StatCard, ProgressBar } from "@/components/dashboard/StatCard";

export default function OverviewPage() {
  const { data, error, isLoading, mutate } = useSWR("dashboard", getDashboard, { refreshInterval: 60000 });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={apiError(error) || "Could not load your dashboard."} onRetry={() => mutate()} />;
  }

  const { user, today, aiGoals, progressMeta, recommendations, workoutPlan } = data;
  const caloriePct = Math.round((progressMeta.calorieProgressRatio || 0) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Today&apos;s snapshot</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {user.full_name || "Athlete"} · {user.fitness_level} · goal: {user.health_goal.replace(/_/g, " ")}
        </p>
      </div>

      {/* AI Form Analyzer — premium feature CTA */}
      <Link
        href="/dashboard/form-analyzer"
        className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 to-cyan-600 p-5 text-white shadow-soft transition hover:shadow-glow"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <ScanLine className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">AI Form Analyzer</p>
            <p className="text-sm text-white/85">
              Real-time posture &amp; rep coaching from your camera — squats, push-ups, planks &amp; more.
            </p>
          </div>
        </div>
        <span className="relative hidden items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold transition group-hover:bg-white/25 sm:inline-flex">
          Try it <ArrowRight className="h-4 w-4" />
        </span>
      </Link>

      {/* Stat grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard accent icon={<Flame className="h-5 w-5" />} label="Calories today" value={today.calories_in} unit={`/ ${aiGoals.daily_calorie_target}`} hint={`${caloriePct}% of target`} />
        <StatCard icon={<Footprints className="h-5 w-5" />} label="Steps" value={today.steps.toLocaleString()} />
        <StatCard icon={<Activity className="h-5 w-5" />} label="Active minutes" value={today.active_minutes} unit="min" />
        <StatCard icon={<Scale className="h-5 w-5" />} label="BMI" value={aiGoals.bmi_estimate} hint={aiGoals.bmi_category} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calorie + macro targets */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">AI nutrition targets</h2>
            <Badge>AI-personalized</Badge>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Calorie intake vs target</span>
              <span>{today.calories_in} / {aiGoals.daily_calorie_target} kcal</span>
            </div>
            <ProgressBar value={caloriePct} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Macro label="Protein" value={`${aiGoals.protein_g_target}g`} />
            <Macro label="Carbs" value={`${aiGoals.carbs_g_target}g`} />
            <Macro label="Fat" value={`${aiGoals.fat_g_target}g`} />
            <Macro label="Burned" value={`${today.calories_out} kcal`} />
          </div>
        </Card>

        {/* Weight progress */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Weight goal</h2>
            <TrendingDown className="h-5 w-5 text-brand-500" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold">{progressMeta.currentWeight || user.weight_current}</span>
            <span className="text-sm text-slate-500">kg</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Target {progressMeta.targetWeight} kg · {aiGoals.estimated_weeks_to_goal} weeks to go</p>
          <div className="mt-4 space-y-2">
            <ProgressBar value={progressMeta.weightProgressPct} />
            <p className="text-xs text-slate-500 dark:text-slate-400">{progressMeta.weightProgressPct}% toward your goal</p>
          </div>
          <Link href="/dashboard/progress" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Log weight →
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recommendations */}
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Today&apos;s recommendations</h2>
          <div className="mt-4 space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{rec.type}</p>
                  <p className="mt-0.5 font-medium">{rec.name}</p>
                </div>
                {rec.calories != null && <span className="text-sm text-slate-500">{rec.calories} kcal</span>}
              </div>
            ))}
          </div>
        </Card>

        {/* Workout plan summary */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Workout plan</h2>
            <Dumbbell className="h-5 w-5 text-brand-500" />
          </div>
          {workoutPlan ? (
            <div className="mt-4">
              <p className="font-medium">{workoutPlan.name}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {workoutPlan.days_per_week} days/week · ~{workoutPlan.est_weekly_calories} kcal/week
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {workoutPlan.days.slice(0, 3).map((d) => (
                  <li key={d.day_index} className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-brand-500" /> {d.day_label}
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/workout" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
                View full plan →
              </Link>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              No active plan yet.{" "}
              <Link href="/dashboard/workout" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Generate one →</Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-950/50">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
