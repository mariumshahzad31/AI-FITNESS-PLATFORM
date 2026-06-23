"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { submitAssessment, apiError } from "@/lib/api";
import { Button, Input, Select, Spinner } from "@/components/ui";

type Form = {
  age: string;
  gender: string;
  height_cm: string;
  weight_current: string;
  weight_target: string;
  activity_level: string;
  health_goal: string;
  fitness_level: string;
  experience_level: string;
  dietary_preference: string;
  workouts_per_week: string;
  session_minutes: string;
  medical_conditions: string;
};

const STEPS = ["Body basics", "Goals & activity", "Preferences"];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>({
    age: "",
    gender: "male",
    height_cm: "",
    weight_current: "",
    weight_target: "",
    activity_level: "moderate",
    health_goal: "weight_loss",
    fitness_level: "Beginner",
    experience_level: "Beginner",
    dietary_preference: "omnivore",
    workouts_per_week: "4",
    session_minutes: "45",
    medical_conditions: "",
  });

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.onboarding_completed) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.age || !form.height_cm || !form.weight_current || !form.weight_target) {
        setError("Please fill in all fields.");
        return false;
      }
    }
    setError(null);
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitAssessment({
        age: Number(form.age),
        gender: form.gender,
        height_cm: Number(form.height_cm),
        weight_current: Number(form.weight_current),
        weight_target: Number(form.weight_target),
        activity_level: form.activity_level,
        health_goal: form.health_goal,
        fitness_level: form.fitness_level,
        experience_level: form.experience_level,
        dietary_preference: form.dietary_preference,
        workouts_per_week: Number(form.workouts_per_week),
        session_minutes: Number(form.session_minutes),
        medical_conditions: form.medical_conditions,
      });
      await refreshUser();
      router.replace("/dashboard");
    } catch (err) {
      setError(apiError(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold">Let&apos;s build your plan</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          A few questions so the AI can personalise your targets and workouts.
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition ${
              i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-600 text-white ring-4 ring-brand-500/20" : "bg-slate-200 text-slate-500 dark:bg-slate-800"
            }`}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < step ? "bg-brand-600" : "bg-slate-200 dark:bg-slate-800"}`} />}
          </div>
        ))}
      </div>

      <div className="card p-6 sm:p-8">
        <h2 className="mb-5 font-display text-xl font-semibold">{STEPS[step]}</h2>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Age" type="number" min={10} max={120} value={form.age} onChange={set("age")} placeholder="29" />
            <Select label="Gender" value={form.gender} onChange={set("gender")}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Height (cm)" type="number" value={form.height_cm} onChange={set("height_cm")} placeholder="180" />
            <Input label="Current weight (kg)" type="number" step="0.1" value={form.weight_current} onChange={set("weight_current")} placeholder="85" />
            <Input label="Target weight (kg)" type="number" step="0.1" value={form.weight_target} onChange={set("weight_target")} placeholder="78" />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Primary goal" value={form.health_goal} onChange={set("health_goal")}>
              <option value="weight_loss">Lose weight</option>
              <option value="muscle_gain">Build muscle</option>
              <option value="maintenance">Maintain</option>
              <option value="endurance">Improve endurance</option>
              <option value="general_fitness">General fitness</option>
            </Select>
            <Select label="Activity level" value={form.activity_level} onChange={set("activity_level")}>
              <option value="sedentary">Sedentary (little exercise)</option>
              <option value="light">Light (1-2 days/week)</option>
              <option value="moderate">Moderate (3-4 days/week)</option>
              <option value="active">Active (5-6 days/week)</option>
              <option value="very_active">Very active (daily)</option>
            </Select>
            <Select label="Fitness level" value={form.fitness_level} onChange={set("fitness_level")}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </Select>
            <Select label="Training experience" value={form.experience_level} onChange={set("experience_level")}>
              <option value="Beginner">Less than 1 year</option>
              <option value="Intermediate">1-3 years</option>
              <option value="Advanced">3+ years</option>
            </Select>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Dietary preference" value={form.dietary_preference} onChange={set("dietary_preference")}>
              <option value="omnivore">Omnivore</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="keto">Keto</option>
            </Select>
            <Input label="Workouts per week" type="number" min={1} max={7} value={form.workouts_per_week} onChange={set("workouts_per_week")} />
            <Input label="Minutes per session" type="number" min={15} max={120} value={form.session_minutes} onChange={set("session_minutes")} />
            <div className="sm:col-span-2">
              <label className="label">Medical conditions (optional)</label>
              <input className="input" value={form.medical_conditions} onChange={set("medical_conditions")} placeholder="e.g. knee injury, asthma" />
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0}>Back</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={finish} loading={submitting}>Generate my plan</Button>
          )}
        </div>
      </div>
    </div>
  );
}
