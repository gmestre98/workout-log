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
}

export interface SetEntry {
  completed: boolean;
  actualAmount: number;
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

// Suggested daily blocks offered as quick-pick chips. The field is free text,
// so users can rename these or add their own — any number of blocks is allowed.
export const DEFAULT_TIME_SLOTS = ["Wake up", "Pre lunch", "Afternoon", "Evening", "Night"];
