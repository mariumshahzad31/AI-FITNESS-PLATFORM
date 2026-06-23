"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Repeat,
  Square,
  Timer,
} from "lucide-react";
import clsx from "clsx";
import {
  EXERCISES,
  EXERCISE_MAP,
  analyze,
  createState,
  type AnalyzerState,
  type ExerciseId,
  type FormResult,
} from "@/lib/poseAnalysis";

type Phase = "idle" | "loading" | "running" | "error";
type ErrKind = "permission" | "nocamera" | "inuse" | "unsupported" | "model" | "generic";

const ERROR_COPY: Record<ErrKind, { title: string; body: string }> = {
  permission: {
    title: "Camera access blocked",
    body: "We need camera access to analyze your form. Allow camera access in your browser's address bar, then try again.",
  },
  nocamera: {
    title: "No camera found",
    body: "We couldn't find a connected camera. Plug one in or switch to a device with a webcam, then try again.",
  },
  inuse: {
    title: "Camera is busy",
    body: "Another app seems to be using your camera. Close it (e.g. video calls), then try again.",
  },
  unsupported: {
    title: "Camera not supported here",
    body: "This browser can't access the camera securely. Use a modern browser (Chrome, Edge or Safari) on localhost or HTTPS.",
  },
  model: {
    title: "Could not load the analysis engine",
    body: "The on-device pose model failed to load. Check your connection and try again.",
  },
  generic: {
    title: "Something went wrong",
    body: "We couldn't start the camera analysis. Please try again.",
  },
};

const STATUS_RING: Record<FormResult["status"], string> = {
  idle: "ring-slate-300 dark:ring-slate-700",
  good: "ring-emerald-500",
  warn: "ring-amber-500",
  bad: "ring-red-500",
};

const STATUS_TEXT: Record<FormResult["status"], string> = {
  idle: "text-slate-500 dark:text-slate-400",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

// Skeleton overlay colour follows form quality.
const SKELETON_COLOR: Record<FormResult["status"], string> = {
  idle: "#94a3b8",
  good: "#10b981",
  warn: "#f59e0b",
  bad: "#ef4444",
};

export default function FormAnalyzerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKind, setErrorKind] = useState<ErrKind>("generic");
  const [exercise, setExercise] = useState<ExerciseId>("squat");
  const [result, setResult] = useState<FormResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawingRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visionRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<AnalyzerState>(createState());
  const exerciseRef = useRef<ExerciseId>("squat");
  const lastUiRef = useRef<number>(0);
  const latestStatus = useRef<FormResult["status"]>("idle");

  exerciseRef.current = exercise;

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      stopCamera();
      try {
        landmarkerRef.current?.close?.();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
    };
  }, [stopCamera]);

  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ts = performance.now();
    let landmarks;
    try {
      const res = landmarker.detectForVideo(video, ts);
      landmarks = res?.landmarks?.[0];
    } catch {
      landmarks = undefined;
    }

    const form = analyze(exerciseRef.current, landmarks, stateRef.current, ts);
    latestStatus.current = form.status;

    // Draw mirrored video frame + skeleton overlay.
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1); // mirror to match the selfie-view video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const drawing = drawingRef.current;
      const vision = visionRef.current;
      if (drawing && vision && landmarks) {
        const color = SKELETON_COLOR[form.status];
        try {
          drawing.drawConnectors(landmarks, vision.PoseLandmarker.POSE_CONNECTIONS, {
            color,
            lineWidth: 4,
          });
          drawing.drawLandmarks(landmarks, { color: "#ffffff", fillColor: color, lineWidth: 1, radius: 4 });
        } catch {
          /* drawing best-effort */
        }
      }
      ctx.restore();
    }

    // Throttle React state updates to ~10/s to avoid re-render storms.
    if (ts - lastUiRef.current > 100) {
      lastUiRef.current = ts;
      setResult(form);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const start = useCallback(async () => {
    setPhase("loading");
    setResult(null);
    stateRef.current = createState();

    // 1. Browser capability / secure-context check.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorKind("unsupported");
      setPhase("error");
      return;
    }

    // 2. Load the on-device pose model (once).
    if (!landmarkerRef.current) {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        visionRef.current = vision;
        const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        // Retry once on CPU in case GPU delegate is unavailable.
        try {
          const vision = visionRef.current ?? (await import("@mediapipe/tasks-vision"));
          visionRef.current = vision;
          const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
          landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch {
          setErrorKind("model");
          setPhase("error");
          return;
        }
      }
    }

    // 3. Request the camera.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setErrorKind(
        name === "NotAllowedError" || name === "SecurityError"
          ? "permission"
          : name === "NotFoundError" || name === "OverconstrainedError"
          ? "nocamera"
          : name === "NotReadableError"
          ? "inuse"
          : "generic"
      );
      setPhase("error");
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;

    try {
      await video.play();
    } catch {
      /* autoplay can resolve late; the loop guards on readyState */
    }

    // 4. Prepare the canvas drawing helper and start the loop.
    try {
      const vision = visionRef.current ?? (await import("@mediapipe/tasks-vision"));
      visionRef.current = vision;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawingRef.current = new vision.DrawingUtils(ctx);
    } catch {
      /* skeleton drawing is optional; analysis still runs */
    }

    setPhase("running");
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [renderLoop]);

  const stop = useCallback(() => {
    stopCamera();
    setPhase("idle");
  }, [stopCamera]);

  // Reset rep/hold counters when the user switches exercise mid-session.
  const onPickExercise = useCallback((id: ExerciseId) => {
    setExercise(id);
    stateRef.current = createState();
  }, []);

  const active = phase === "running";
  const meta = EXERCISE_MAP[exercise];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">AI Form Analyzer</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time posture and rep coaching using on-device motion tracking. Your camera feed never leaves your device.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300">
          <Activity className="h-3.5 w-3.5" /> On-device · private
        </span>
      </div>

      {/* Exercise selector */}
      <div className="flex flex-wrap gap-2">
        {EXERCISES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onPickExercise(ex.id)}
            className={clsx(
              "rounded-xl border px-4 py-2 text-sm font-medium transition",
              exercise === ex.id
                ? "border-brand-500 bg-brand-600 text-white shadow-soft"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Camera stage */}
        <div className="lg:col-span-2">
          <div
            className={clsx(
              "relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 ring-2 transition",
              result ? STATUS_RING[result.status] : "ring-slate-300 dark:ring-slate-700"
            )}
          >
            {/* The mirrored canvas shows the video + skeleton; the <video> stays hidden. */}
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="h-full w-full object-cover" />

            {/* Idle overlay */}
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-300">
                  <Camera className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-white">Start Workout Analysis</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300">
                    Grant camera access to get live form feedback for {meta.label.toLowerCase()}.
                  </p>
                </div>
                <button onClick={start} className="btn-primary px-6 py-3 text-base">
                  <Camera className="h-4 w-4" /> Start Workout Analysis
                </button>
              </div>
            )}

            {/* Loading overlay */}
            {phase === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
                <p className="text-sm text-slate-200">Starting camera & loading the motion engine…</p>
              </div>
            )}

            {/* Error overlay */}
            {phase === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
                  <CameraOff className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-white">{ERROR_COPY[errorKind].title}</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300">{ERROR_COPY[errorKind].body}</p>
                </div>
                <button onClick={start} className="btn-primary">
                  <RefreshCw className="h-4 w-4" /> Try again
                </button>
              </div>
            )}

            {/* Live feedback banner */}
            {active && result && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold dark:bg-slate-900/90",
                      STATUS_TEXT[result.status]
                    )}
                  >
                    {result.status === "good" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : result.status === "idle" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {result.message}
                  </span>
                </div>
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                  {result.phase}
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">{meta.blurb}</p>
            {active ? (
              <button onClick={stop} className="btn-ghost">
                <Square className="h-4 w-4" /> Stop
              </button>
            ) : (
              phase !== "loading" && (
                <button onClick={start} className="btn-primary">
                  <Camera className="h-4 w-4" /> {phase === "error" ? "Retry" : "Start"}
                </button>
              )
            )}
          </div>
        </div>

        {/* Live stats + cues */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              icon={<Repeat className="h-4 w-4" />}
              label={meta.mode === "hold" ? "Hold" : "Reps"}
              value={meta.mode === "hold" ? `${result?.holdSeconds ?? 0}s` : `${result?.reps ?? 0}`}
            />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Form" value={`${result?.score ?? 100}%`} />
            <Stat icon={<Timer className="h-4 w-4" />} label="Phase" value={result?.phase ?? "—"} small />
          </div>

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Live coaching cues
            </h2>
            <div className="mt-3 space-y-2">
              {result && result.cues.length > 0 ? (
                result.cues.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className={c.ok ? "text-slate-700 dark:text-slate-200" : "text-amber-700 dark:text-amber-300"}>
                      {c.text}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {active ? "Get into position…" : "Start the analyzer to see real-time cues."}
                </p>
              )}
            </div>

            {result && result.metrics.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                {result.metrics.map((m) => (
                  <div key={m.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <p className="font-display text-base font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              How to set up
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {meta.tips.map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="card p-3 text-center">
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
        {icon}
      </div>
      <p className={clsx("mt-2 font-display font-bold", small ? "text-sm" : "text-xl")}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
