/**
 * Real-time workout form analysis.
 *
 * Pure, framework-agnostic logic that turns MediaPipe Pose landmarks (33 points,
 * normalized 0..1) into actionable coaching feedback and rep counts. Kept free of
 * React / DOM so it stays fast and testable and can run inside the render loop.
 *
 * Landmark indices follow the MediaPipe Pose model.
 */

export type Landmark = { x: number; y: number; z: number; visibility?: number };

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type ExerciseId = "squat" | "pushup" | "lunge" | "plank" | "jumpingjack";

export type Exercise = {
  id: ExerciseId;
  label: string;
  blurb: string;
  /** Coaching points shown before the user starts. */
  tips: string[];
  /** "reps" exercises count repetitions; "hold" exercises track time held. */
  mode: "reps" | "hold";
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat",
    label: "Squats",
    blurb: "Depth, knee tracking and an upright chest.",
    tips: ["Stand side-on to the camera", "Feet shoulder-width apart", "Sit back to at least parallel"],
    mode: "reps",
  },
  {
    id: "pushup",
    label: "Push-ups",
    blurb: "Elbow depth and a straight body line.",
    tips: ["Position side-on to the camera", "Keep a straight line head to heels", "Lower until elbows reach ~90°"],
    mode: "reps",
  },
  {
    id: "lunge",
    label: "Lunges",
    blurb: "Front-knee angle and balance.",
    tips: ["Stand side-on to the camera", "Step forward into a lunge", "Front knee over the ankle, not past the toes"],
    mode: "reps",
  },
  {
    id: "plank",
    label: "Plank",
    blurb: "A flat body line — no sagging or piking.",
    tips: ["Position side-on to the camera", "Forearms under shoulders", "Brace your core and glutes"],
    mode: "hold",
  },
  {
    id: "jumpingjack",
    label: "Jumping Jacks",
    blurb: "Full arm extension and wide legs.",
    tips: ["Face the camera", "Arms all the way overhead", "Jump feet out wide"],
    mode: "reps",
  },
];

export const EXERCISE_MAP: Record<ExerciseId, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e])
) as Record<ExerciseId, Exercise>;

export type Cue = { text: string; ok: boolean };
export type Status = "idle" | "good" | "warn" | "bad";

export type FormResult = {
  status: Status;
  /** Headline feedback line shown prominently. */
  message: string;
  /** Per-check coaching cues. */
  cues: Cue[];
  /** Numeric read-outs (joint angles etc.) for the live readout panel. */
  metrics: { label: string; value: string }[];
  reps: number;
  /** Seconds held in good position (hold exercises only). */
  holdSeconds: number;
  phase: string;
  /** Form quality 0..100 over the current session. */
  score: number;
};

export type AnalyzerState = {
  reps: number;
  phase: "up" | "down" | "open" | "closed" | "unknown";
  holdMs: number;
  lastTs: number | null;
  goodFrames: number;
  totalFrames: number;
};

export function createState(): AnalyzerState {
  return { reps: 0, phase: "unknown", holdMs: 0, lastTs: null, goodFrames: 0, totalFrames: 0 };
}

// --------------------------------------------------------------------------
// Geometry helpers (2D, image plane — z is noisier than x/y from a webcam)
// --------------------------------------------------------------------------

/** Interior angle at point b for the path a-b-c, in degrees (0..180). */
export function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAb = Math.hypot(abx, aby);
  const magCb = Math.hypot(cbx, cby);
  if (magAb === 0 || magCb === 0) return 0;
  let cos = dot / (magAb * magCb);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of segment a→b relative to vertical (0 = perfectly upright), degrees. */
export function angleFromVertical(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}

const vis = (l?: Landmark) => (l?.visibility ?? 0);

/** Pick whichever side (left/right) has the better landmark visibility. */
function bestSide(lms: Landmark[], leftIdx: number, rightIdx: number): "left" | "right" {
  return vis(lms[leftIdx]) >= vis(lms[rightIdx]) ? "left" : "right";
}

function avg(...n: number[]): number {
  return n.reduce((s, v) => s + v, 0) / n.length;
}

function round(n: number): number {
  return Math.round(n);
}

/** True when the core landmarks for analysis are confidently visible. */
function bodyVisible(lms: Landmark[], idxs: number[]): boolean {
  return idxs.every((i) => vis(lms[i]) > 0.5);
}

function score(state: AnalyzerState): number {
  if (state.totalFrames === 0) return 100;
  return round((state.goodFrames / state.totalFrames) * 100);
}

function tickQuality(state: AnalyzerState, good: boolean) {
  state.totalFrames += 1;
  if (good) state.goodFrames += 1;
}

// --------------------------------------------------------------------------
// Per-exercise analyzers
// --------------------------------------------------------------------------

type Analyzer = (lms: Landmark[], state: AnalyzerState, ts: number) => FormResult;

const idle = (state: AnalyzerState, msg: string, mode: "reps" | "hold"): FormResult => ({
  status: "idle",
  message: msg,
  cues: [],
  metrics: [],
  reps: state.reps,
  holdSeconds: mode === "hold" ? Math.round(state.holdMs / 1000) : 0,
  phase: "—",
  score: score(state),
});

const squat: Analyzer = (lms, state) => {
  const side = bestSide(lms, LM.leftHip, LM.rightHip);
  const hip = lms[side === "left" ? LM.leftHip : LM.rightHip];
  const knee = lms[side === "left" ? LM.leftKnee : LM.rightKnee];
  const ankle = lms[side === "left" ? LM.leftAnkle : LM.rightAnkle];
  const shoulder = lms[side === "left" ? LM.leftShoulder : LM.rightShoulder];

  if (vis(hip) < 0.5 || vis(knee) < 0.5 || vis(ankle) < 0.5) {
    return idle(state, "Step back so your hips, knees and ankles are visible.", "reps");
  }

  const kneeAngle = angle(hip, knee, ankle);
  const torsoLean = angleFromVertical(hip, shoulder); // 0 = upright

  // Rep state machine on knee flexion.
  if (kneeAngle < 100) state.phase = "down";
  if (kneeAngle > 160 && state.phase === "down") {
    state.reps += 1;
    state.phase = "up";
  } else if (kneeAngle > 160) {
    state.phase = "up";
  }

  const cues: Cue[] = [];
  const depthOk = kneeAngle <= 110;
  const backOk = torsoLean <= 50;
  if (state.phase === "down") {
    cues.push({ text: depthOk ? "Good squat depth" : "Go a little deeper", ok: depthOk });
  } else {
    cues.push({ text: "Lower into your squat", ok: true });
  }
  cues.push({ text: backOk ? "Chest upright" : "Keep your chest up — back too bent", ok: backOk });

  const goodForm = backOk && (state.phase !== "down" || depthOk);
  tickQuality(state, goodForm);

  let message = "Lower into your squat";
  let status: Status = "good";
  if (state.phase === "down" && depthOk && backOk) { message = "Excellent depth — drive up!"; status = "good"; }
  else if (state.phase === "down" && !depthOk) { message = "Sit back and go deeper"; status = "warn"; }
  else if (!backOk) { message = "Keep your chest up"; status = "bad"; }

  return {
    status,
    message,
    cues,
    metrics: [
      { label: "Knee angle", value: `${round(kneeAngle)}°` },
      { label: "Torso lean", value: `${round(torsoLean)}°` },
    ],
    reps: state.reps,
    holdSeconds: 0,
    phase: state.phase === "down" ? "Bottom" : "Standing",
    score: score(state),
  };
};

const pushup: Analyzer = (lms, state) => {
  const side = bestSide(lms, LM.leftShoulder, LM.rightShoulder);
  const shoulder = lms[side === "left" ? LM.leftShoulder : LM.rightShoulder];
  const elbow = lms[side === "left" ? LM.leftElbow : LM.rightElbow];
  const wrist = lms[side === "left" ? LM.leftWrist : LM.rightWrist];
  const hip = lms[side === "left" ? LM.leftHip : LM.rightHip];
  const ankle = lms[side === "left" ? LM.leftAnkle : LM.rightAnkle];

  if (vis(shoulder) < 0.5 || vis(elbow) < 0.5 || vis(wrist) < 0.5 || vis(hip) < 0.5) {
    return idle(state, "Get side-on so your arms and torso are visible.", "reps");
  }

  const elbowAngle = angle(shoulder, elbow, wrist);
  const bodyLine = angle(shoulder, hip, ankle); // ~180 when straight

  if (elbowAngle < 100) state.phase = "down";
  if (elbowAngle > 150 && state.phase === "down") {
    state.reps += 1;
    state.phase = "up";
  } else if (elbowAngle > 150) {
    state.phase = "up";
  }

  const straight = bodyLine >= 160;
  const depthOk = elbowAngle <= 100;
  const cues: Cue[] = [
    { text: straight ? "Body in a straight line" : "Keep your hips in line — don't sag", ok: straight },
    state.phase === "down"
      ? { text: depthOk ? "Good depth" : "Lower a little more", ok: depthOk }
      : { text: "Lower with control", ok: true },
  ];

  const goodForm = straight && (state.phase !== "down" || depthOk);
  tickQuality(state, goodForm);

  let message = "Lower with control";
  let status: Status = "good";
  if (!straight) { message = "Keep your body straight"; status = "bad"; }
  else if (state.phase === "down" && depthOk) { message = "Great depth — press up!"; status = "good"; }
  else if (state.phase === "down" && !depthOk) { message = "Go a little lower"; status = "warn"; }

  return {
    status,
    message,
    cues,
    metrics: [
      { label: "Elbow angle", value: `${round(elbowAngle)}°` },
      { label: "Body line", value: `${round(bodyLine)}°` },
    ],
    reps: state.reps,
    holdSeconds: 0,
    phase: state.phase === "down" ? "Bottom" : "Top",
    score: score(state),
  };
};

const lunge: Analyzer = (lms, state) => {
  const lKnee = angle(lms[LM.leftHip], lms[LM.leftKnee], lms[LM.leftAnkle]);
  const rKnee = angle(lms[LM.rightHip], lms[LM.rightKnee], lms[LM.rightAnkle]);
  const visOk = vis(lms[LM.leftKnee]) > 0.5 && vis(lms[LM.rightKnee]) > 0.5;
  if (!visOk) return idle(state, "Step back so both legs are visible.", "reps");

  const frontKnee = Math.min(lKnee, rKnee); // the more-bent leg leads
  const torsoLean = angleFromVertical(
    lms[bestSide(lms, LM.leftHip, LM.rightHip) === "left" ? LM.leftHip : LM.rightHip],
    lms[bestSide(lms, LM.leftShoulder, LM.rightShoulder) === "left" ? LM.leftShoulder : LM.rightShoulder]
  );

  if (frontKnee < 110) state.phase = "down";
  if (frontKnee > 160 && state.phase === "down") {
    state.reps += 1;
    state.phase = "up";
  } else if (frontKnee > 160) {
    state.phase = "up";
  }

  const depthOk = frontKnee >= 80 && frontKnee <= 110;
  const uprightOk = torsoLean <= 30;
  const cues: Cue[] = [
    state.phase === "down"
      ? { text: depthOk ? "Good front-knee angle (~90°)" : frontKnee < 80 ? "Don't drop too low" : "Bend a bit deeper", ok: depthOk }
      : { text: "Step into your lunge", ok: true },
    { text: uprightOk ? "Torso upright" : "Stay tall — don't lean forward", ok: uprightOk },
  ];

  const goodForm = uprightOk && (state.phase !== "down" || depthOk);
  tickQuality(state, goodForm);

  let message = "Step into your lunge";
  let status: Status = "good";
  if (state.phase === "down" && depthOk && uprightOk) { message = "Strong lunge — push back up!"; status = "good"; }
  else if (state.phase === "down" && !depthOk) { message = "Aim for a 90° front knee"; status = "warn"; }
  else if (!uprightOk) { message = "Keep your torso upright"; status = "warn"; }

  return {
    status,
    message,
    cues,
    metrics: [
      { label: "Front knee", value: `${round(frontKnee)}°` },
      { label: "Torso lean", value: `${round(torsoLean)}°` },
    ],
    reps: state.reps,
    holdSeconds: 0,
    phase: state.phase === "down" ? "Bottom" : "Standing",
    score: score(state),
  };
};

const plank: Analyzer = (lms, state, ts) => {
  const side = bestSide(lms, LM.leftShoulder, LM.rightShoulder);
  const shoulder = lms[side === "left" ? LM.leftShoulder : LM.rightShoulder];
  const hip = lms[side === "left" ? LM.leftHip : LM.rightHip];
  const ankle = lms[side === "left" ? LM.leftAnkle : LM.rightAnkle];
  const knee = lms[side === "left" ? LM.leftKnee : LM.rightKnee];

  if (vis(shoulder) < 0.5 || vis(hip) < 0.5 || (vis(ankle) < 0.5 && vis(knee) < 0.5)) {
    return idle(state, "Get side-on so your shoulders, hips and legs are visible.", "hold");
  }

  const ref = vis(ankle) > 0.5 ? ankle : knee;
  const bodyLine = angle(shoulder, hip, ref); // ~180 = flat
  const flat = bodyLine >= 165;
  const sagging = bodyLine < 165 && hip.y > (shoulder.y + ref.y) / 2; // hips below the line
  tickQuality(state, flat);

  // Accumulate hold time only while the plank is flat.
  if (state.lastTs != null) {
    const dt = ts - state.lastTs;
    if (flat) state.holdMs += dt;
  }
  state.lastTs = ts;

  const cues: Cue[] = [
    { text: flat ? "Strong, flat body line" : sagging ? "Hips sagging — squeeze your glutes" : "Hips too high — lower them", ok: flat },
  ];
  const message = flat ? "Solid plank — hold it!" : sagging ? "Lift your hips in line" : "Drop your hips into line";

  return {
    status: flat ? "good" : "warn",
    message,
    cues,
    metrics: [
      { label: "Body line", value: `${round(bodyLine)}°` },
      { label: "Hold", value: `${Math.round(state.holdMs / 1000)}s` },
    ],
    reps: 0,
    holdSeconds: Math.round(state.holdMs / 1000),
    phase: flat ? "Holding" : "Adjust",
    score: score(state),
  };
};

const jumpingjack: Analyzer = (lms, state) => {
  const needed = [LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist, LM.leftAnkle, LM.rightAnkle];
  if (!bodyVisible(lms, needed)) {
    return idle(state, "Step back so your whole body is in frame.", "reps");
  }
  const shoulderY = avg(lms[LM.leftShoulder].y, lms[LM.rightShoulder].y);
  const wristsUp = lms[LM.leftWrist].y < shoulderY && lms[LM.rightWrist].y < shoulderY;
  const shoulderW = Math.abs(lms[LM.leftShoulder].x - lms[LM.rightShoulder].x);
  const ankleW = Math.abs(lms[LM.leftAnkle].x - lms[LM.rightAnkle].x);
  const legsWide = ankleW > shoulderW * 1.3;

  const open = wristsUp && legsWide;
  if (open) {
    if (state.phase === "closed" || state.phase === "unknown") {
      // entering the open position
    }
    state.phase = "open";
  } else {
    if (state.phase === "open") state.reps += 1; // completed open→closed
    state.phase = "closed";
  }

  const cues: Cue[] = [
    { text: wristsUp ? "Arms fully overhead" : "Reach your arms higher", ok: wristsUp },
    { text: legsWide ? "Wide stance" : "Jump your feet wider", ok: legsWide },
  ];
  tickQuality(state, open);

  return {
    status: open ? "good" : "warn",
    message: open ? "Full extension — nice!" : "Open up — arms high, feet wide",
    cues,
    metrics: [{ label: "Arms", value: wristsUp ? "Up" : "Low" }, { label: "Legs", value: legsWide ? "Wide" : "Narrow" }],
    reps: state.reps,
    holdSeconds: 0,
    phase: open ? "Open" : "Closed",
    score: score(state),
  };
};

const ANALYZERS: Record<ExerciseId, Analyzer> = {
  squat,
  pushup,
  lunge,
  plank,
  jumpingjack,
};

/** Analyze a single frame's landmarks and advance the rep/hold state in place. */
export function analyze(
  exercise: ExerciseId,
  landmarks: Landmark[] | undefined,
  state: AnalyzerState,
  ts: number
): FormResult {
  const mode = EXERCISE_MAP[exercise].mode;
  if (!landmarks || landmarks.length < 33) {
    state.lastTs = ts;
    return idle(state, "No person detected — step into the camera's view.", mode);
  }
  return ANALYZERS[exercise](landmarks, state, ts);
}
