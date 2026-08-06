import { useEffect, useState, useSyncExternalStore } from "react";

// A per-day workout clock shared between the Today screen (which shows and
// controls it) and the LogSheet. It splits the session into TRAINING time (while
// a set is actively being timed) and REST time (all other time once the workout
// has started). "Pause workout" freezes both so a long break — e.g. stopping and
// finishing later the same day — is not counted. State is persisted so a running
// clock survives a refresh.
//
// Phases:
//   idle     — not started yet
//   training — a set stopwatch is running → training time accrues
//   resting  — workout active but not timing a set → rest time accrues
//   paused   — workout stopped → nothing accrues
//
// Only the current segment is "live"; completed segments are folded into
// trainingMs / restMs.

export type Phase = "idle" | "training" | "resting" | "paused";

export interface ClockState {
  phase: Phase;
  trainingMs: number;
  restMs: number;
  segStart: number | null; // epoch ms the current training/resting segment began
}

const EMPTY: ClockState = { phase: "idle", trainingMs: 0, restMs: 0, segStart: null };

const store = new Map<string, ClockState>();
const listeners = new Set<() => void>();
const key = (date: string) => `wl.clock.${date}`;

// Schema version of the persisted clock. Bump this whenever ClockState changes
// shape — stored data from an older schema is discarded rather than mis-merged,
// which is what previously scrambled a day's training/rest split.
const SCHEMA = 2;

function load(date: string): ClockState {
  const cached = store.get(date);
  if (cached) return cached;
  let state = EMPTY;
  try {
    const raw = localStorage.getItem(key(date));
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === SCHEMA && typeof p.phase === "string") {
        state = {
          phase: p.phase,
          trainingMs: p.trainingMs ?? 0,
          restMs: p.restMs ?? 0,
          segStart: p.segStart ?? null,
        };
      }
      // Any other shape (older schema, corrupt) is ignored → clean slate.
    }
  } catch {
    /* ignore malformed storage */
  }
  store.set(date, state);
  return state;
}

function set(date: string, next: ClockState) {
  store.set(date, next);
  try {
    localStorage.setItem(key(date), JSON.stringify({ v: SCHEMA, ...next }));
  } catch {
    /* ignore quota/availability errors */
  }
  for (const l of listeners) l();
}

// fold closes the current live segment into its accumulator and clears segStart.
function fold(s: ClockState, now: number): ClockState {
  if (s.phase === "training" && s.segStart !== null) {
    return { ...s, trainingMs: s.trainingMs + (now - s.segStart), segStart: null };
  }
  if (s.phase === "resting" && s.segStart !== null) {
    return { ...s, restMs: s.restMs + (now - s.segStart), segStart: null };
  }
  return { ...s, segStart: null };
}

export const workoutClock = {
  get: load,

  // Begin timing a set. Resumes the workout if it was paused/idle.
  startTraining(date: string) {
    const now = Date.now();
    const s = fold(load(date), now);
    set(date, { ...s, phase: "training", segStart: now });
  },

  // Stop timing a set and start (or continue) resting. From idle this simply
  // starts the workout in the resting phase — used when a set is logged without
  // the stopwatch.
  stopTraining(date: string) {
    const now = Date.now();
    const s = fold(load(date), now);
    set(date, { ...s, phase: "resting", segStart: now });
  },

  // Freeze the whole workout — neither training nor rest accrues.
  pauseWorkout(date: string) {
    const now = Date.now();
    const s = fold(load(date), now);
    set(date, { ...s, phase: "paused", segStart: null });
  },

  // Start the overall workout (from idle) or resume it (from paused) into the
  // resting phase. No-op while a set is already being timed.
  startWorkout(date: string) {
    const s = load(date);
    if (s.phase === "training") return;
    const now = Date.now();
    set(date, { ...fold(s, now), phase: "resting", segStart: now });
  },

  reset(date: string) {
    set(date, { ...EMPTY });
  },
};

export interface ClockTotals {
  phase: Phase;
  trainingMs: number;
  restMs: number;
  totalMs: number;
  started: boolean;
  paused: boolean;
  resting: boolean;
  training: boolean;
}

export function clockTotals(s: ClockState, now: number): ClockTotals {
  const liveTraining = s.phase === "training" && s.segStart !== null ? now - s.segStart : 0;
  const liveRest = s.phase === "resting" && s.segStart !== null ? now - s.segStart : 0;
  const trainingMs = s.trainingMs + liveTraining;
  const restMs = s.restMs + liveRest;
  return {
    phase: s.phase,
    trainingMs,
    restMs,
    totalMs: trainingMs + restMs,
    started: s.phase !== "idle",
    paused: s.phase === "paused",
    resting: s.phase === "resting",
    training: s.phase === "training",
  };
}

// useWorkoutClock returns live totals for a date, re-rendering once a second
// while a training or resting segment is live (never while paused/idle).
export function useWorkoutClock(date: string): ClockTotals {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(date),
    () => load(date)
  );
  const [, tick] = useState(0);
  const live = state.phase === "training" || state.phase === "resting";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  return clockTotals(state, Date.now());
}
