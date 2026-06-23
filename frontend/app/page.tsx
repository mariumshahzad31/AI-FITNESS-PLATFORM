"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, Brain, Dumbbell, HeartPulse, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Spinner } from "@/components/ui";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace(user.onboarding_completed ? "/dashboard" : "/onboarding");
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      <AnimatedBackdrop />

      {/* Minimal top bar: wordmark + a quiet login link (single primary action lives below) */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-600 font-display font-bold text-white shadow-soft">
            AI
          </div>
          <span className="font-display text-base font-semibold tracking-tight">AI Fitness Platform</span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
        >
          Log in
        </Link>
      </header>

      {/* Hero — one headline, one line, one button. All above the fold. */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <span className="mb-7 inline-flex animate-rise-in items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 px-3.5 py-1.5 text-xs font-medium text-brand-700 dark:text-brand-300">
          <Sparkles className="h-3.5 w-3.5" /> AI-powered fitness
        </span>

        <h1 className="max-w-3xl animate-rise-in font-display text-4xl font-bold leading-[1.1] tracking-tight [animation-delay:80ms] sm:text-6xl">
          Your AI-powered fitness
          <br className="hidden sm:block" />{" "}
          <span className="bg-gradient-to-r from-brand-500 to-cyan-500 bg-clip-text text-transparent">
            journey starts here
          </span>
        </h1>

        <p className="mt-6 max-w-md animate-rise-in text-base text-slate-500 [animation-delay:160ms] dark:text-slate-400 sm:text-lg">
          Personalized training and real-time coaching, adapted to you.
        </p>

        <Link
          href="/register"
          className="group mt-10 inline-flex animate-rise-in items-center gap-2 rounded-2xl bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-soft transition [animation-delay:240ms] hover:bg-brand-700 hover:shadow-glow"
        >
          Get Started
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>
    </main>
  );
}

/**
 * Subtle, abstract fitness/AI "doodle" backdrop — soft drifting orbs, faint
 * outline icons, twinkling AI nodes and an animated heartbeat line. Purely
 * decorative (pointer-events-none) and calmed under reduced-motion.
 */
function AnimatedBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:[&_*]:!animate-none">
      {/* Dotted grid wash */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(20,184,166,0.18) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 35%, transparent 80%)",
        }}
      />

      {/* Soft gradient orbs */}
      <div className="absolute -top-24 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 animate-drift rounded-full bg-brand-500/20 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-[8%] h-72 w-72 animate-float-slow rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="absolute right-[6%] top-[18%] h-64 w-64 animate-drift rounded-full bg-emerald-400/10 blur-3xl [animation-delay:3s]" />

      {/* Faint outline doodles (fitness + AI) */}
      <Dumbbell className="absolute left-[10%] top-[24%] h-16 w-16 animate-float text-brand-500/15 dark:text-brand-400/15" strokeWidth={1.25} />
      <HeartPulse className="absolute right-[12%] top-[30%] h-14 w-14 animate-float-slow text-cyan-500/15 dark:text-cyan-400/15 [animation-delay:1.5s]" strokeWidth={1.25} />
      <Brain className="absolute bottom-[20%] right-[18%] h-16 w-16 animate-float text-brand-500/12 [animation-delay:2.2s]" strokeWidth={1.25} />
      <Activity className="absolute bottom-[24%] left-[16%] h-14 w-14 animate-float-slow text-emerald-500/15 [animation-delay:0.8s]" strokeWidth={1.25} />
      <Sparkles className="absolute left-[6%] top-[55%] h-9 w-9 animate-spin-slow text-cyan-500/20" strokeWidth={1.25} />

      {/* Twinkling AI "nodes" */}
      <span className="absolute left-[22%] top-[40%] h-2 w-2 animate-twinkle rounded-full bg-brand-400/60" />
      <span className="absolute right-[24%] top-[22%] h-1.5 w-1.5 animate-twinkle rounded-full bg-cyan-400/60 [animation-delay:1s]" />
      <span className="absolute right-[30%] bottom-[28%] h-2 w-2 animate-twinkle rounded-full bg-emerald-400/60 [animation-delay:2s]" />
      <span className="absolute left-[34%] bottom-[22%] h-1.5 w-1.5 animate-twinkle rounded-full bg-brand-400/60 [animation-delay:1.6s]" />

      {/* Animated heartbeat / pulse line drawn across the canvas */}
      <svg
        className="absolute inset-x-0 top-1/2 h-24 w-full -translate-y-1/2 opacity-[0.18]"
        viewBox="0 0 1200 100"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 50 H360 l24 -34 22 64 26 -52 20 30 24 -8 H560 l28 -40 24 70 26 -56 18 26 H1200"
          stroke="url(#pulse)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1000"
          className="animate-draw"
        />
        <defs>
          <linearGradient id="pulse" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#14b8a6" stopOpacity="0" />
            <stop offset="0.5" stopColor="#14b8a6" />
            <stop offset="1" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
