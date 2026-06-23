"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Scale } from "lucide-react";
import { getProgress, getWeight, logWeight, apiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(15,23,42,0.92)",
  color: "#e2e8f0",
  fontSize: 12,
};

export default function ProgressPage() {
  const progress = useSWR("progress", getProgress);
  const weight = useSWR("weight", getWeight);
  const [newWeight, setNewWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const calorieData = (progress.data || []).map((p) => ({
    date: p.log_date.slice(5),
    In: p.calories_in,
    Out: p.calories_out,
    Steps: p.steps,
  }));
  const weightData = (weight.data || []).map((w) => ({ date: w.date.slice(5), weight: w.weight_kg }));

  const submitWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(newWeight);
    if (!value || value <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      await logWeight(value);
      setNewWeight("");
      weight.mutate();
    } catch (error) {
      setErr(apiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Progress &amp; analytics</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your last 14 days of nutrition, activity and weight.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">Calorie flow</h2>
          {progress.isLoading ? <Skeleton className="h-64" /> : progress.error ? <ErrorState message={apiError(progress.error)} onRetry={() => progress.mutate()} /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={calorieData}>
                  <defs>
                    <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} /><stop offset="95%" stopColor="#14b8a6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b822" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="In" stroke="#14b8a6" fill="url(#g-in)" />
                  <Area type="monotone" dataKey="Out" stroke="#6366f1" fill="url(#g-out)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">Daily steps</h2>
          {progress.isLoading ? <Skeleton className="h-64" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calorieData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b822" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="Steps" fill="#2dd4bf" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold">Weight trend</h2>
          {weight.isLoading ? <Skeleton className="h-64" /> : !weightData.length ? (
            <EmptyState icon={<Scale className="h-7 w-7" />} title="No weight entries yet" description="Log your weight to start tracking your trend." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b822" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="weight" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Log weight</h2>
          <form onSubmit={submitWeight} className="mt-4 space-y-3">
            <Input label="Current weight (kg)" type="number" step="0.1" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="84.5" />
            {err && <p className="text-sm text-red-500">{err}</p>}
            <Button type="submit" loading={busy} className="w-full">Save entry</Button>
          </form>
          <p className="mt-3 text-xs text-slate-400">Logging today&apos;s weight updates your goal progress automatically.</p>
        </Card>
      </div>
    </div>
  );
}
