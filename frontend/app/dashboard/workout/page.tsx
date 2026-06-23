"use client";

import { useState } from "react";
import useSWR from "swr";
import { Dumbbell, RefreshCw, Timer, Repeat } from "lucide-react";
import { getWorkoutPlan, generateWorkoutPlan, apiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";

export default function WorkoutPage() {
  const { data: plan, error, isLoading, mutate } = useSWR("workout-plan", getWorkoutPlan);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const regenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const newPlan = await generateWorkoutPlan();
      await mutate(newPlan, { revalidate: false });
    } catch (err) {
      setGenError(apiError(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Workout plan</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ML-generated program tuned to your goal and schedule.</p>
        </div>
        <Button onClick={regenerate} loading={generating}>
          <RefreshCw className="h-4 w-4" /> Regenerate
        </Button>
      </div>

      {genError && <ErrorState message={genError} />}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : error ? (
        <ErrorState message={apiError(error)} onRetry={() => mutate()} />
      ) : !plan ? (
        <EmptyState
          icon={<Dumbbell className="h-8 w-8" />}
          title="No workout plan yet"
          description="Generate a personalised, multi-day plan based on your assessment."
          action={<Button onClick={regenerate} loading={generating}>Generate plan</Button>}
        />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {plan.days_per_week} days/week · {plan.weeks}-week cycle · ~{plan.est_weekly_calories} kcal/week
                </p>
              </div>
              <div className="flex gap-2">
                <Badge tone="brand">{plan.goal.replace(/_/g, " ")}</Badge>
                <Badge tone="slate">{plan.fitness_level}</Badge>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {plan.days.map((day) => (
              <Card key={day.day_index}>
                <h3 className="font-display font-semibold">{day.day_label}</h3>
                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {day.exercises.map((ex, i) => (
                    <div key={`${ex.exercise_name}-${i}`} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium">{ex.exercise_name}</p>
                        <p className="text-xs capitalize text-slate-400">{ex.muscle_group.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />{ex.sets}×{ex.reps}</span>
                        <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{ex.rest_seconds}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
