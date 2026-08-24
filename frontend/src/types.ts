export type Unit = "reps" | "seconds" | "minutes";

export interface Exercise {
  id: string;
  timeSlot: string;
  name: string;
  plannedSets: number;
  plannedAmount: number;
  unit: Unit;
  note: string;
  restSeconds: number;
  muscleGroup: string;
  equipment: string;
  sortOrder: number;
  active: boolean;
  // When true the exercise is tracked once per side (left/right), so a day log
  // holds 2*plannedSets entries ordered left, right, left, right…
  perSide: boolean;
}

export interface SetEntry {
  completed: boolean;
  actualAmount: number;
  seconds?: number; // wall-clock duration of the set if timed; 0/absent otherwise
}

export interface ExerciseLog {
  exerciseId: string;
  plannedSets: number;
  plannedAmount: number;
  unit: Unit;
  sets: SetEntry[];
}

export interface DayLog {
  date: string; // YYYY-MM-DD
  // The workout-day label (an exercise timeSlot) performed on this date, e.g.
  // "Day 1 — Push". When set, only that day's exercises apply (single-workout
  // rotation). Empty/absent means a legacy day logged before rotation existed,
  // which renders and scores against the whole routine as before.
  workoutDay?: string;
  exercises: Record<string, ExerciseLog>;
}

export interface DayStat {
  date: string;
  completion: number; // 0..1
}

export interface Summary {
  days: number;
  avgCompletion: number;
  daysAbove0: number;
  daysAbove50: number;
  perDay: DayStat[];
}

export type VersionStatus = "current" | "future" | "past";

export interface RoutineVersion {
  id: string;
  createdAt: string; // RFC3339
  note: string;
  status: VersionStatus;
  exercises: Exercise[];
}

// VersionAssignment records that a version was in effect starting on startDate.
// Assignments form an effective-dated timeline (see backend domain). It is a
// record/label only and does not change which routine daily tracking uses.
export interface VersionAssignment {
  startDate: string; // YYYY-MM-DD
  versionId: string;
}

export const UNITS: Unit[] = ["reps", "seconds", "minutes"];

// Suggested workout-day labels offered as quick-pick chips. The field (an
// exercise's timeSlot) is free text, so users can rename these or add their own
// — any number of workout days is allowed, and a label can be as descriptive as
// "Day 1 — Push". Each session performs one workout day, rotating through them.
export const DEFAULT_TIME_SLOTS = ["Day 1", "Day 2", "Day 3", "Day 4"];
