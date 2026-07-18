import type { ExerciseLog, SetEntry, Unit } from "./types";

// exerciseCompletion mirrors the backend: (sum of actual over completed sets) /
// (plannedSets * plannedAmount), clamped to [0, 1]. Used for instant UI
// feedback before the server round-trips.
export function exerciseCompletion(log: {
  plannedSets: number;
  plannedAmount: number;
  sets: SetEntry[];
}): number {
  const planned = log.plannedSets * log.plannedAmount;
  if (planned <= 0) return 0;
  const done = log.sets.reduce((sum, s) => (s.completed ? sum + s.actualAmount : sum), 0);
  return Math.min(1, Math.max(0, done / planned));
}

// formatPercent renders a fraction as a whole-number percentage.
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// unitLabel is the short suffix shown next to an amount.
export function unitLabel(unit: Unit): string {
  switch (unit) {
    case "reps":
      return "reps";
    case "seconds":
      return "s";
    case "minutes":
      return "min";
  }
}

// todayISO returns the local date as YYYY-MM-DD (not UTC, so "today" matches
// the user's calendar).
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// monthRange returns the first and last day of the month containing dateISO.
export function monthRange(dateISO: string): { from: string; to: string } {
  const [y, m] = dateISO.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// emptyLogForExercise builds a fresh log with all planned sets uncompleted and
// pre-filled with the planned amount (so a full workout is one tap per set).
export function newLog(exercise: {
  id: string;
  plannedSets: number;
  plannedAmount: number;
  unit: Unit;
}): ExerciseLog {
  const sets: SetEntry[] = Array.from({ length: exercise.plannedSets }, () => ({
    completed: false,
    actualAmount: exercise.plannedAmount,
  }));
  return {
    exerciseId: exercise.id,
    plannedSets: exercise.plannedSets,
    plannedAmount: exercise.plannedAmount,
    unit: exercise.unit,
    sets,
  };
}
