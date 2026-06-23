"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { preload } from "swr";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiError, getDashboard } from "@/lib/api";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.onboarding_completed) {
        // Warm the dashboard's data into SWR's cache so it paints instantly
        // instead of showing a skeleton after the route transition.
        preload("dashboard", getDashboard);
        router.replace("/dashboard");
      } else {
        router.replace("/onboarding");
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-600 font-display font-bold text-white">AI</span>
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Log in to your AI Fitness account</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <Button type="submit" loading={loading} className="w-full">Log in</Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Sign up</Link>
        </p>
        <p className="mt-3 text-center text-xs text-slate-400">
          Demo account: <span className="font-mono">demo@aifitness.app</span> / <span className="font-mono">Demo1234!</span>
        </p>
      </div>
    </div>
  );
}
