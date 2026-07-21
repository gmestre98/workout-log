import type { DayLog, Exercise, ExerciseLog, SetEntry, Unit } from "./types";

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

// dayCompletion mirrors the backend DayAverage: the mean completion across the
// given (active) exercises for one day; a missing log counts as 0%.
export function dayCompletion(exercises: Exercise[], day: DayLog | undefined): number {
  if (exercises.length === 0) return 0;
  let sum = 0;
  for (const ex of exercises) {
    const log = day?.exercises[ex.id];
    if (log) sum += exerciseCompletion(log);
  }
  return sum / exercises.length;
}

// addDaysISO shifts a YYYY-MM-DD date by delta days (local calendar).
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + delta));
}

// computeStreak counts consecutive active days ending today (or yesterday, as a
// grace day if today isn't logged yet). activeDates holds YYYY-MM-DD strings
// with any completion.
export function computeStreak(activeDates: Set<string>, today: string): number {
  let cursor = activeDates.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

// heatLevel buckets a completion fraction into 0–4 for the heatmap.
export function heatLevel(fraction: number): 0 | 1 | 2 | 3 | 4 {
  if (fraction <= 0) return 0;
  if (fraction < 0.34) return 1;
  if (fraction < 0.67) return 2;
  if (fraction < 1) return 3;
  return 4;
}

export type SlotHue = "dawn" | "morning" | "noon" | "dusk" | "night";
const SLOT_ARC: SlotHue[] = ["dawn", "morning", "noon", "dusk", "night"];

// slotColor spreads a time slot across the day's arc by its position in the
// ordered slot list: the first slot is dawn, the last is night, and any number
// of slots in between are distributed across the arc. So 3 blocks read
// dawn/noon/night and 5 read dawn/morning/noon/dusk/night.
export function slotColor(timeSlot: string, orderedSlots: string[]): SlotHue {
  const n = orderedSlots.length;
  if (n <= 1) return "dawn";
  let idx = orderedSlots.indexOf(timeSlot);
  if (idx < 0) idx = 0;
  const pos = Math.round((idx / (n - 1)) * (SLOT_ARC.length - 1));
  return SLOT_ARC[pos];
}

// primaryMuscle reduces a free-text muscle group to its headline (e.g.
// "Legs (Quads, Glutes)" → "Legs", "Back, Biceps" → "Back").
export function primaryMuscle(muscleGroup: string): string {
  const head = muscleGroup.split(/[(,]/)[0].trim();
  return head || "Other";
}

export interface MuscleStat {
  group: string;
  completion: number; // [0,1]
}

// muscleBreakdown averages each exercise's completion over the period, then
// groups by primary muscle. Missing logs count as 0% (consistency with the
// day average). Returns groups sorted by completion descending.
export function muscleBreakdown(exercises: Exercise[], days: DayLog[]): MuscleStat[] {
  const groups = new Map<string, { sum: number; count: number }>();
  for (const ex of exercises) {
    let exSum = 0;
    for (const day of days) {
      const log = day.exercises[ex.id];
      exSum += log ? exerciseCompletion(log) : 0;
    }
    const exAvg = days.length > 0 ? exSum / days.length : 0;
    const key = primaryMuscle(ex.muscleGroup);
    const g = groups.get(key) ?? { sum: 0, count: 0 };
    g.sum += exAvg;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([group, g]) => ({ group, completion: g.count ? g.sum / g.count : 0 }))
    .sort((a, b) => b.completion - a.completion);
}

// dayHeader formats a YYYY-MM-DD as { dow: "MON", label: "21 Jul" }.
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dayHeader(iso: string): { dow: string; label: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { dow: DOW[dt.getDay()], label: `${d} ${MON[m - 1]}` };
}
