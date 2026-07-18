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

export const UNITS: Unit[] = ["reps", "seconds", "minutes"];

// Common time slots from the spreadsheet; the field is free text so users can
// add their own.
export const DEFAULT_TIME_SLOTS = ["Wake up", "Pre lunch", "Evening"];
