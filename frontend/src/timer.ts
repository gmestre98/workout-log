import { useEffect, useState, useSyncExternalStore } from "react";

// A per-day workout clock, shared between the Today screen (which shows and
// controls it) and the LogSheet (which folds rest countdowns into it). State is
// persisted to localStorage so the running clock survives a refresh mid-workout.
//
// Three numbers are derived from the raw state:
//   total  = time since the workout started (running segments accumulated)
//   rest   = time spent in between-set rest countdowns
//   active = total - rest  (actual performance time)

export interface ClockState {
  running: boolean;
  startedAt: number | null; // epoch ms of the current running segment
  accumulatedMs: number; // completed running segments
  restMs: number; // completed rest segments
  restStartedAt: number | null; // epoch ms of the current rest segment
}

const EMPTY: ClockState = {
  running: false,
  startedAt: null,
  accumulatedMs: 0,
  restMs: 0,
  restStartedAt: null,
};

const store = new Map<string, ClockState>();
const listeners = new Set<() => void>();
const key = (date: string) => `wl.clock.${date}`;

function load(date: string): ClockState {
  const cached = store.get(date);
  if (cached) return cached;
  let state = EMPTY;
  try {
    const raw = localStorage.getItem(key(date));
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore malformed storage */
  }
  store.set(date, state);
  return state;
}

function set(date: string, next: ClockState) {
  store.set(date, next);
  try {
    localStorage.setItem(key(date), JSON.stringify(next));
  } catch {
    /* ignore quota/availability errors */
  }
  for (const l of listeners) l();
}

export const workoutClock = {
  get: load,

  // Start (or resume) the main clock.
  start(date: string) {
    const s = load(date);
    if (s.running) return;
    set(date, { ...s, running: true, startedAt: Date.now() });
  },

  // Pause the main clock, folding any open running and rest segments in.
  pause(date: string) {
    const s = load(date);
    const now = Date.now();
    set(date, {
      running: false,
      startedAt: null,
      accumulatedMs: s.accumulatedMs + (s.running && s.startedAt !== null ? now - s.startedAt : 0),
      restMs: s.restMs + (s.restStartedAt !== null ? now - s.restStartedAt : 0),
      restStartedAt: null,
    });
  },

  reset(date: string) {
    set(date, { ...EMPTY });
  },

  // Begin a rest segment (called when a set is completed). Ensures the main
  // clock is running, since resting implies a workout is underway.
  startRest(date: string) {
    const s = load(date);
    const now = Date.now();
    set(date, {
      ...s,
      running: true,
      startedAt: s.startedAt ?? now,
      restStartedAt: s.restStartedAt ?? now,
    });
  },

  // End the current rest segment (timer elapsed or skipped).
  stopRest(date: string) {
    const s = load(date);
    if (s.restStartedAt === null) return;
    set(date, {
      ...s,
      restMs: s.restMs + (Date.now() - s.restStartedAt),
      restStartedAt: null,
    });
  },
};

export interface ClockTotals {
  running: boolean;
  resting: boolean;
  totalMs: number;
  restMs: number;
  activeMs: number;
  started: boolean;
}

export function clockTotals(s: ClockState, now: number): ClockTotals {
  const totalMs = s.accumulatedMs + (s.running && s.startedAt !== null ? now - s.startedAt : 0);
  const restMs = s.restMs + (s.restStartedAt !== null ? now - s.restStartedAt : 0);
  return {
    running: s.running,
    resting: s.restStartedAt !== null,
    totalMs,
    restMs,
    activeMs: Math.max(0, totalMs - restMs),
    started: totalMs > 0 || s.running,
  };
}

// useWorkoutClock returns live totals for a date, re-rendering once a second
// while the clock (or a rest segment) is running.
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
  const live = state.running || state.restStartedAt !== null;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  return clockTotals(state, Date.now());
}
