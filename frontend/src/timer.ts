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

// --- Per-set stopwatch -------------------------------------------------------
//
// The exercise-bound stopwatch (the big timer counting the current set), the
// selected exercise, the editable reps and the between-set rest countdown. Like
// the session clock this is a module-level, localStorage-backed store keyed by
// date, with elapsed derived from timestamps — so it survives a tab switch AND a
// full page reload (e.g. leaving mid-set to edit the routine, or the PWA being
// reloaded). Elapsed = accumMs + (running ? now - start). Rest is stored as an
// absolute end time so the countdown reconstructs after a reload.

export interface SetState {
  exerciseId: string | null;
  running: boolean;
  accumMs: number;
  start: number | null; // epoch ms the current run began, or null when frozen
  reps: number | null; // editable rep count for rep-based sets; null = planned
  restEndsAt: number | null; // epoch ms the rest countdown ends
  beeped: boolean; // target-reached chime already played for this set
}

const EMPTY_SET: SetState = { exerciseId: null, running: false, accumMs: 0, start: null, reps: null, restEndsAt: null, beeped: false };
const setStore = new Map<string, SetState>();
const setListeners = new Set<() => void>();
const setKey = (date: string) => `wl.set.${date}`;
const SET_SCHEMA = 1;

function loadSet(date: string): SetState {
  const cached = setStore.get(date);
  if (cached) return cached;
  let state = EMPTY_SET;
  try {
    const raw = localStorage.getItem(setKey(date));
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === SET_SCHEMA) {
        state = {
          exerciseId: p.exerciseId ?? null,
          running: !!p.running,
          accumMs: p.accumMs ?? 0,
          start: p.start ?? null,
          reps: p.reps ?? null,
          restEndsAt: p.restEndsAt ?? null,
          beeped: !!p.beeped,
        };
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  setStore.set(date, state);
  return state;
}

function writeSet(date: string, next: SetState) {
  setStore.set(date, next);
  try {
    localStorage.setItem(setKey(date), JSON.stringify({ v: SET_SCHEMA, ...next }));
  } catch {
    /* ignore quota/availability errors */
  }
  for (const l of setListeners) l();
}

export const setClock = {
  get: loadSet,

  // Track a different exercise: reset the stopwatch/reps, but let any running
  // rest countdown carry over (it belongs to the session, not the exercise).
  select(date: string, exerciseId: string) {
    const s = loadSet(date);
    if (s.exerciseId === exerciseId) return;
    writeSet(date, { ...EMPTY_SET, exerciseId, restEndsAt: s.restEndsAt });
  },

  // Begin (or resume) timing the current set.
  start(date: string) {
    const s = loadSet(date);
    if (s.running) return;
    writeSet(date, { ...s, running: true, start: Date.now(), restEndsAt: null });
  },

  // Freeze the set stopwatch, folding the live run into the accumulator.
  pause(date: string) {
    const s = loadSet(date);
    if (!s.running) return;
    const now = Date.now();
    writeSet(date, { ...s, running: false, accumMs: s.accumMs + (s.start ? now - s.start : 0), start: null });
  },

  setReps(date: string, reps: number | null) {
    writeSet(date, { ...loadSet(date), reps });
  },

  markBeeped(date: string) {
    writeSet(date, { ...loadSet(date), beeped: true });
  },

  clearRest(date: string) {
    const s = loadSet(date);
    if (s.restEndsAt === null) return;
    writeSet(date, { ...s, restEndsAt: null });
  },

  // A set was just logged: clear the stopwatch and start the rest countdown
  // (restSeconds = 0 skips it, e.g. when the exercise is now complete).
  logged(date: string, restSeconds: number) {
    const s = loadSet(date);
    writeSet(date, {
      ...s, running: false, accumMs: 0, start: null, reps: null, beeped: false,
      restEndsAt: restSeconds > 0 ? Date.now() + restSeconds * 1000 : null,
    });
  },

  // Stop the whole workout: freeze the set and drop any rest countdown.
  pauseWorkout(date: string) {
    const s = loadSet(date);
    const now = Date.now();
    writeSet(date, { ...s, running: false, accumMs: s.accumMs + (s.running && s.start ? now - s.start : 0), start: null, restEndsAt: null });
  },

  reset(date: string) {
    writeSet(date, { ...EMPTY_SET });
  },
};

export interface SetTotals {
  state: SetState;
  elapsedMs: number; // live set-stopwatch time
  restLeft: number | null; // whole seconds left on the rest countdown, or null
}

// useSetClock returns the live set stopwatch for a date, re-rendering ~4×/sec
// while the set or a rest countdown is running.
export function useSetClock(date: string): SetTotals {
  const state = useSyncExternalStore(
    (cb) => { setListeners.add(cb); return () => setListeners.delete(cb); },
    () => loadSet(date),
    () => loadSet(date)
  );
  const [, tick] = useState(0);
  const live = state.running || state.restEndsAt !== null;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [live]);
  const now = Date.now();
  const elapsedMs = state.accumMs + (state.running && state.start !== null ? now - state.start : 0);
  const restLeft = state.restEndsAt !== null ? Math.max(0, Math.ceil((state.restEndsAt - now) / 1000)) : null;
  return { state, elapsedMs, restLeft };
}
