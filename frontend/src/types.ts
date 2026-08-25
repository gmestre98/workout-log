export type Unit = "reps" | "seconds" | "minutes";

export interface Exercise {
  id: string;
  // The rotation unit this exercise belongs to, e.g. "Day 1 — Push". Each
  // session performs one workout day. Empty means it predates rotation and is
  // treated as the single default day (see dayOf / DEFAULT_WORKOUT_DAY).
  workoutDay: string;
  // The part *within* a workout day, e.g. "Wake up", "Main", "Mobility". It
  // sub-groups a day's exercises; it is not a day of its own.
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
  // Optional stand-in performed instead of this exercise while travelling. Absent
  // when there is no travel replacement. When travel mode is on, an exercise that
  // has one is shown, logged and scored as its travel variant — under the same
  // exercise id, so history stays aligned.
  travel?: TravelVariant | null;
}

// TravelVariant is the substitute an exercise switches to in travel mode. It
// overrides the fields that affect doing/logging the movement; the base
// exercise's id, workout day, time slot, trained parts and order are kept.
export interface TravelVariant {
  name: string;
  plannedSets: number;
  plannedAmount: number;
  unit: Unit;
  note: string;
  restSeconds: number;
  equipment: string;
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
  // True when this day was done in travel mode (exercises with a travel
  // replacement were performed as their variant). A history/export label only —
  // each ExerciseLog already snapshotted the travel numbers at log time.
  travel?: boolean;
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

// The workout day an exercise falls under when its workoutDay is unset (legacy
// data). Grouping and scoring normalise empty to this, so an old single routine
// reads as one day rather than losing its structure.
export const DEFAULT_WORKOUT_DAY = "Day 1";

// Trained parts offered as chips when editing an exercise. The stored
// muscleGroup is a comma-joined subset of these (plus any custom entries the
// user types), so an exercise can train several parts.
export const MUSCLE_GROUPS = [
  "Chest", "Upper back", "Lats", "Traps", "Shoulders", "Rear delts",
  "Biceps", "Triceps", "Forearms", "Core", "Abs", "Obliques", "Lower back",
  "Glutes", "Quads", "Hamstrings", "Adductors", "Abductors", "Calves",
  "Neck", "Full body", "Cardio",
];

// Equipment options offered as chips — only the ones actually in use for now.
// The user can add more via the add field, and anything used elsewhere in the
// routine resurfaces as a suggestion automatically.
export const EQUIPMENT_OPTIONS = [
  "None", "Dumbbells", "Pull-up Bar", "Backpack",
];
