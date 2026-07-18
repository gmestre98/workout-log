// routine.ts holds the seed routine (transcribed from the July spreadsheet)
// and pure helpers to parse the free-text "Reps/Duration" column into the
// structured shape the app uses. The helpers are unit tested in routine.test.ts.

export type Unit = "reps" | "seconds" | "minutes";

export interface Exercise {
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

export interface ParsedAmount {
  plannedAmount: number;
  unit: Unit;
  note: string;
}

// parseAmount turns strings like "8", "30s", "10/leg", "30s/side", "10min"
// into a structured amount + unit + note.
export function parseAmount(raw: string): ParsedAmount {
  const text = raw.trim().toLowerCase();
  let note = "";
  let rest = text;

  // Split off a "per leg / per side" qualifier.
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    const qualifier = rest.slice(slash + 1).trim();
    rest = rest.slice(0, slash).trim();
    if (qualifier === "leg" || qualifier === "legs") note = "per leg";
    else if (qualifier === "side" || qualifier === "sides") note = "per side";
    else if (qualifier) note = `per ${qualifier}`;
  }

  let unit: Unit = "reps";
  if (rest.endsWith("min")) {
    unit = "minutes";
    rest = rest.slice(0, -3);
  } else if (rest.endsWith("s")) {
    unit = "seconds";
    rest = rest.slice(0, -1);
  }

  const plannedAmount = parseInt(rest, 10);
  if (Number.isNaN(plannedAmount)) {
    throw new Error(`cannot parse amount from "${raw}"`);
  }
  return { plannedAmount, unit, note };
}

// parseRest turns the "Rest" column into seconds; "Not needed" -> 0.
export function parseRest(raw: string): number {
  const n = parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Raw rows transcribed from the July sheet: [slot, name, reps/duration, rest,
// sets, muscleGroup, equipment].
const rows: [string, string, string, string, number, string, string][] = [
  ["Wake up", "Burpees", "5", "15", 4, "Full Body Cardio", "None"],
  ["Wake up", "Hollow hold", "30s", "5", 3, "Core", "None"],
  ["Wake up", "Pull-ups", "8", "60", 4, "Back, Biceps", "Pull-up Bar"],
  ["Wake up", "Walking lunges", "10/leg", "30", 3, "Legs (Quads, Glutes, Hamstrings)", "None"],
  ["Pre lunch", "Push-ups", "12", "60", 4, "Chest, Triceps, Shoulders", "None"],
  ["Pre lunch", "Plank", "60s", "15", 3, "Core", "None"],
  ["Pre lunch", "Diamond push-ups", "8", "30", 3, "Triceps, Chest (Inner)", "None"],
  ["Pre lunch", "Side plank", "30s/side", "5", 2, "Obliques, Core", "None"],
  ["Evening", "Bulgarian split squats", "8/leg", "15", 4, "Legs (Quads, Glutes)", "Dumbbells"],
  ["Evening", "Backpack carry", "10min", "Not needed", 1, "Endurance, Traps, Core", "Backpack"],
  ["Evening", "Hanging knee raises", "8", "30", 3, "Core (Lower Abs)", "Pull-up Bar"],
  ["Evening", "Backpack squats", "15", "30", 3, "Legs (Quads, Glutes)", "Backpack"],
];

// seedRoutine is the fully parsed routine ready to write to the store.
export function seedRoutine(): Exercise[] {
  return rows.map(([timeSlot, name, amount, rest, sets, muscleGroup, equipment], i) => {
    const { plannedAmount, unit, note } = parseAmount(amount);
    return {
      timeSlot,
      name,
      plannedSets: sets,
      plannedAmount,
      unit,
      note,
      restSeconds: parseRest(rest),
      muscleGroup,
      equipment,
      sortOrder: i,
      active: true,
    };
  });
}
