import type { DayLog, Exercise, ExerciseLog, SetEntry, Unit } from "./types";

// exerciseCompletion mirrors the backend: (sum of actual over completed sets) /
// (number of logged sets * plannedAmount), clamped to [0, 1]. Basing the
// denominator on the logged set count (not plannedSets) keeps per-side logs —
// which hold two entries per planned set — correct, while being identical for
// ordinary logs where the counts match.
export function exerciseCompletion(log: {
  plannedSets?: number; // ignored; kept so ExerciseLog objects pass cleanly
  plannedAmount: number;
  sets: SetEntry[];
}): number {
  const planned = log.sets.length * log.plannedAmount;
  if (planned <= 0) return 0;
  const done = log.sets.reduce((sum, s) => (s.completed ? sum + s.actualAmount : sum), 0);
  return Math.min(1, Math.max(0, done / planned));
}

// setMeta labels a set entry for display. For per-side exercises entries come in
// left/right pairs, so index 0,1 are "Set 1 · Left/Right", 2,3 are "Set 2", etc.
export function setMeta(index: number, perSide: boolean): { label: string; side: "L" | "R" | null } {
  if (!perSide) return { label: `Set ${index + 1}`, side: null };
  const round = Math.floor(index / 2) + 1;
  const side: "L" | "R" = index % 2 === 0 ? "L" : "R";
  return { label: `Set ${round} · ${side === "L" ? "Left" : "Right"}`, side };
}

// formatPercent renders a fraction as a whole-number percentage.
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// formatDuration renders a millisecond span as m:ss, or h:mm:ss once it passes
// an hour. Used by the workout clock.
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
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

// newLog builds a fresh log with all planned sets uncompleted and pre-filled
// with the planned amount (so a full workout is one tap per set). Per-side
// exercises get two entries per planned set (left, right).
export function newLog(exercise: {
  id: string;
  plannedSets: number;
  plannedAmount: number;
  unit: Unit;
  perSide?: boolean;
}): ExerciseLog {
  const count = exercise.perSide ? exercise.plannedSets * 2 : exercise.plannedSets;
  const sets: SetEntry[] = Array.from({ length: count }, () => ({
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

// setAllSets returns a copy of the log with every set marked completed or not —
// used by the "mark all done" shortcut, which makes backfilling full days fast.
export function setAllSets(log: ExerciseLog, completed: boolean): ExerciseLog {
  return { ...log, sets: log.sets.map((s) => ({ ...s, completed })) };
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

// effectiveVersionId returns the version in effect on date per an effective-
// dated schedule: the assignment with the greatest startDate <= date. Returns
// undefined when no assignment covers the date. Assignments need not be sorted.
export function effectiveVersionId(
  assignments: { startDate: string; versionId: string }[],
  date: string
): string | undefined {
  let best: { startDate: string; versionId: string } | undefined;
  for (const a of assignments) {
    if (a.startDate <= date && (!best || a.startDate > best.startDate)) best = a;
  }
  return best?.versionId;
}

// routineForDate returns the exercises that applied on a given date, so past
// days render against the routine that was actually in effect then rather than
// the current one. It uses the version scheduled for the date (an effective-
// dated snapshot); for the current version, or when nothing is scheduled, it
// returns the live routine. Callers still filter to active exercises.
export function routineForDate<E extends { active: boolean; sortOrder: number }>(
  date: string,
  schedule: { startDate: string; versionId: string }[],
  versions: { id: string; status: string; exercises: E[] }[],
  live: E[]
): E[] {
  const vid = effectiveVersionId(schedule, date);
  if (!vid) return live;
  const current = versions.find((v) => v.status === "current");
  if (current && vid === current.id) return live; // current → editable live routine
  const v = versions.find((x) => x.id === vid);
  if (!v || v.exercises.length === 0) return live;
  return [...v.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
}

// monthLabel formats a YYYY-MM-DD as "Jul 2026".
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MON[m - 1]} ${y}`;
}

// firstOfMonth returns the YYYY-MM-01 of the month containing iso.
export function firstOfMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${y}-${m}-01`;
}

// dayHeader formats a YYYY-MM-DD as { dow: "MON", label: "21 Jul" }.
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dayHeader(iso: string): { dow: string; label: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { dow: DOW[dt.getDay()], label: `${d} ${MON[m - 1]}` };
}
