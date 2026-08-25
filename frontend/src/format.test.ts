import { describe, it, expect } from "vitest";
import {
  exerciseCompletion,
  formatPercent,
  unitLabel,
  todayISO,
  monthRange,
  newLog,
  setAllSets,
  dayCompletion,
  addDaysISO,
  computeStreak,
  heatLevel,
  slotColor,
  primaryMuscle,
  muscleBreakdown,
  dayHeader,
  formatDuration,
  effectiveVersionId,
  firstOfMonth,
  monthLabel,
  routineForDate,
  setMeta,
  dayOf,
  orderedWorkoutDays,
  orderedParts,
  nextWorkoutDay,
  applyTravel,
} from "./format";
import type { DayLog, Exercise } from "./types";

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, workoutDay: "Day 1", timeSlot: "Wake up", name: id, plannedSets: 1, plannedAmount: 10,
  unit: "reps", note: "", restSeconds: 0, muscleGroup: "Core", equipment: "None",
  sortOrder: 0, active: true, perSide: false, ...over,
});
const fullLog = { exerciseId: "x", plannedSets: 1, plannedAmount: 10, unit: "reps" as const, sets: [{ completed: true, actualAmount: 10 }] };
const day = (date: string, ids: string[]): DayLog => ({
  date, exercises: Object.fromEntries(ids.map((id) => [id, { ...fullLog, exerciseId: id }])),
});

describe("exerciseCompletion", () => {
  it("is 100% when every set is done in full", () => {
    expect(
      exerciseCompletion({
        plannedSets: 4,
        plannedAmount: 8,
        sets: Array.from({ length: 4 }, () => ({ completed: true, actualAmount: 8 })),
      })
    ).toBe(1);
  });

  it("counts partial reps on completed sets", () => {
    const c = exerciseCompletion({
      plannedSets: 4,
      plannedAmount: 8,
      sets: [
        { completed: true, actualAmount: 6 },
        { completed: true, actualAmount: 6 },
        { completed: true, actualAmount: 6 },
        { completed: false, actualAmount: 0 },
      ],
    });
    expect(c).toBeCloseTo(18 / 32);
  });

  it("ignores incomplete sets and clamps overshoot", () => {
    expect(
      exerciseCompletion({ plannedSets: 1, plannedAmount: 10, sets: [{ completed: true, actualAmount: 20 }] })
    ).toBe(1);
    expect(exerciseCompletion({ plannedSets: 0, plannedAmount: 0, sets: [] })).toBe(0);
  });
});

describe("per-side (setMeta, newLog, completion)", () => {
  it("newLog makes two entries per set for per-side exercises", () => {
    const log = newLog({ id: "sp", plannedSets: 2, plannedAmount: 30, unit: "seconds", perSide: true });
    expect(log.sets.length).toBe(4);
    const normal = newLog({ id: "n", plannedSets: 2, plannedAmount: 30, unit: "seconds" });
    expect(normal.sets.length).toBe(2);
  });
  it("setMeta labels alternate left/right in rounds", () => {
    expect(setMeta(0, true)).toEqual({ label: "Set 1 · Left", side: "L" });
    expect(setMeta(1, true)).toEqual({ label: "Set 1 · Right", side: "R" });
    expect(setMeta(2, true)).toEqual({ label: "Set 2 · Left", side: "L" });
    expect(setMeta(1, false)).toEqual({ label: "Set 2", side: null });
  });
  it("completion counts logged entries, so one side done is 50%", () => {
    const sets = [
      { completed: true, actualAmount: 30 }, { completed: false, actualAmount: 30 },
      { completed: true, actualAmount: 30 }, { completed: false, actualAmount: 30 },
    ];
    expect(exerciseCompletion({ plannedAmount: 30, sets })).toBe(0.5);
  });
});

describe("applyTravel", () => {
  const base = ex("pullups", {
    name: "Pull-ups", plannedSets: 4, plannedAmount: 8, unit: "reps", note: "wide",
    restSeconds: 60, equipment: "Pull-up Bar", perSide: false, muscleGroup: "Lats",
    travel: { name: "Backpack rows", plannedSets: 3, plannedAmount: 15, unit: "reps", note: "each arm", restSeconds: 30, equipment: "Backpack", perSide: true },
  });

  it("returns the base exercise untouched when travel mode is off", () => {
    expect(applyTravel(base, false)).toBe(base);
  });

  it("returns the base exercise when it has no travel replacement", () => {
    const plain = ex("plank", { travel: null });
    expect(applyTravel(plain, true)).toBe(plain);
  });

  it("swaps movement fields for the variant but keeps identity/grouping", () => {
    const t = applyTravel(base, true);
    // Movement fields come from the variant.
    expect(t.name).toBe("Backpack rows");
    expect(t.plannedSets).toBe(3);
    expect(t.plannedAmount).toBe(15);
    expect(t.note).toBe("each arm");
    expect(t.restSeconds).toBe(30);
    expect(t.equipment).toBe("Backpack");
    expect(t.perSide).toBe(true);
    // Identity and grouping stay with the base, so logs/scoring are unaffected.
    expect(t.id).toBe("pullups");
    expect(t.workoutDay).toBe("Day 1");
    expect(t.timeSlot).toBe("Wake up");
    expect(t.muscleGroup).toBe("Lats");
  });

  it("ignores a travel replacement with no name", () => {
    const noName = ex("x", { travel: { name: "", plannedSets: 1, plannedAmount: 1, unit: "reps", note: "", restSeconds: 0, equipment: "", perSide: false } });
    expect(applyTravel(noName, true)).toBe(noName);
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    expect(formatPercent(0.5625)).toBe("56%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("formatDuration", () => {
  it("shows m:ss under an hour", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(90_000)).toBe("1:30");
    expect(formatDuration(59 * 60_000 + 59_000)).toBe("59:59");
  });
  it("shows h:mm:ss once past an hour and clamps negatives", () => {
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
    expect(formatDuration(-5000)).toBe("0:00");
  });
});

describe("effectiveVersionId", () => {
  const sched = [
    { startDate: "2026-07-01", versionId: "vA" },
    { startDate: "2026-08-01", versionId: "vB" },
  ];
  it("returns the assignment in effect on the date", () => {
    expect(effectiveVersionId(sched, "2026-07-15")).toBe("vA");
    expect(effectiveVersionId(sched, "2026-08-01")).toBe("vB"); // boundary is inclusive
    expect(effectiveVersionId(sched, "2026-09-30")).toBe("vB"); // last one is open-ended
  });
  it("returns undefined before the first assignment or when empty", () => {
    expect(effectiveVersionId(sched, "2026-06-30")).toBeUndefined();
    expect(effectiveVersionId([], "2026-07-15")).toBeUndefined();
  });
  it("does not depend on input order", () => {
    expect(effectiveVersionId([...sched].reverse(), "2026-07-15")).toBe("vA");
  });
});

describe("routineForDate", () => {
  const ex = (tag: string, sortOrder: number) => ({ tag, active: true, sortOrder });
  const july = [ex("j2", 1), ex("j1", 0)];
  const live = [ex("live", 0)];
  const schedule = [
    { startDate: "2026-07-01", versionId: "vJul" },
    { startDate: "2026-08-01", versionId: "vAug" },
  ];
  const versions = [
    { id: "vAug", status: "current", exercises: [ex("aug", 0)] },
    { id: "vJul", status: "past", exercises: july },
  ];

  it("uses a past version's snapshot for dates it covers, sorted", () => {
    const r = routineForDate("2026-07-15", schedule, versions, live);
    expect(r.map((e) => e.tag)).toEqual(["j1", "j2"]); // sorted by sortOrder
  });
  it("uses the live routine for the current version's dates", () => {
    expect(routineForDate("2026-08-10", schedule, versions, live).map((e) => e.tag)).toEqual(["live"]);
  });
  it("falls back to live when no assignment or version is missing/empty", () => {
    expect(routineForDate("2026-06-01", schedule, versions, live).map((e) => e.tag)).toEqual(["live"]);
    expect(routineForDate("2026-07-15", schedule, [{ id: "vJul", status: "past", exercises: [] }], live).map((e) => e.tag)).toEqual(["live"]);
  });
});

describe("month helpers", () => {
  it("firstOfMonth and monthLabel", () => {
    expect(firstOfMonth("2026-07-26")).toBe("2026-07-01");
    expect(monthLabel("2026-07-26")).toBe("Jul 2026");
  });
});

describe("unitLabel", () => {
  it("maps units to suffixes", () => {
    expect(unitLabel("reps")).toBe("reps");
    expect(unitLabel("seconds")).toBe("s");
    expect(unitLabel("minutes")).toBe("min");
  });
});

describe("todayISO", () => {
  it("formats local date as YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 6, 5))).toBe("2026-07-05");
  });
});

describe("monthRange", () => {
  it("returns first and last day of the month", () => {
    expect(monthRange("2026-07-18")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthRange("2026-02-10").to).toBe("2026-02-28");
  });
});

describe("newLog", () => {
  it("prefills planned sets with planned amount, uncompleted", () => {
    const log = newLog({ id: "ex-1", plannedSets: 3, plannedAmount: 12, unit: "reps" });
    expect(log.sets).toHaveLength(3);
    expect(log.sets.every((s) => !s.completed && s.actualAmount === 12)).toBe(true);
    expect(log.exerciseId).toBe("ex-1");
  });
});

describe("setAllSets", () => {
  it("marks every set completed or not, preserving amounts", () => {
    const log = newLog({ id: "a", plannedSets: 3, plannedAmount: 10, unit: "reps" });
    const done = setAllSets(log, true);
    expect(done.sets.every((s) => s.completed && s.actualAmount === 10)).toBe(true);
    expect(setAllSets(done, false).sets.every((s) => !s.completed)).toBe(true);
    // original is untouched
    expect(log.sets.every((s) => !s.completed)).toBe(true);
  });
});

describe("dayCompletion", () => {
  it("averages across exercises, missing = 0%", () => {
    const exs = [ex("a"), ex("b")];
    expect(dayCompletion(exs, day("2026-07-01", ["a"]))).toBeCloseTo(0.5);
    expect(dayCompletion(exs, day("2026-07-01", ["a", "b"]))).toBe(1);
    expect(dayCompletion(exs, undefined)).toBe(0);
    expect(dayCompletion([], day("2026-07-01", []))).toBe(0);
  });

  it("scopes to the day's workoutDay, ignoring other days' exercises", () => {
    const exs = [
      ex("push1", { workoutDay: "Day 1" }), ex("push2", { workoutDay: "Day 1" }),
      ex("pull1", { workoutDay: "Day 2" }), ex("legs1", { workoutDay: "Day 3" }),
    ];
    const d: DayLog = { ...day("2026-08-24", ["push1", "push2"]), workoutDay: "Day 1" };
    // Both Day 1 exercises done -> 100%, Day 2/3 exercises don't drag it down.
    expect(dayCompletion(exs, d)).toBe(1);
    // Legacy day (no workoutDay) averages the whole routine: 2 of 4 done.
    expect(dayCompletion(exs, day("2026-08-24", ["push1", "push2"]))).toBeCloseTo(0.5);
  });
});

describe("dayOf", () => {
  it("normalises an empty workoutDay to the default day", () => {
    expect(dayOf({ workoutDay: "Day 2" })).toBe("Day 2");
    expect(dayOf({ workoutDay: "" })).toBe("Day 1");
    expect(dayOf({})).toBe("Day 1");
  });
});

describe("orderedParts", () => {
  it("lists distinct parts in first-seen order, keeping blanks", () => {
    const exs = [{ timeSlot: "Wake up" }, { timeSlot: "Main" }, { timeSlot: "Wake up" }, { timeSlot: "" }];
    expect(orderedParts(exs)).toEqual(["Wake up", "Main", ""]);
  });
});

describe("orderedWorkoutDays", () => {
  it("groups empty workoutDays under the default day", () => {
    expect(orderedWorkoutDays([{ workoutDay: "" }, { workoutDay: "Day 2" }, {}])).toEqual(["Day 1", "Day 2"]);
  });
  it("lists distinct labels in first-seen order", () => {
    const exs = [
      { workoutDay: "Day 1" }, { workoutDay: "Day 1" },
      { workoutDay: "Day 2" }, { workoutDay: "Day 3" }, { workoutDay: "Day 2" },
    ];
    expect(orderedWorkoutDays(exs)).toEqual(["Day 1", "Day 2", "Day 3"]);
    expect(orderedWorkoutDays([])).toEqual([]);
  });
});

describe("nextWorkoutDay", () => {
  const days = ["Day 1", "Day 2", "Day 3"];
  it("advances from the most recent prior session, wrapping around", () => {
    const map = new Map<string, string | undefined>([["2026-08-22", "Day 3"]]);
    expect(nextWorkoutDay(map, days, "2026-08-24")).toBe("Day 1");
    map.set("2026-08-23", "Day 1");
    expect(nextWorkoutDay(map, days, "2026-08-24")).toBe("Day 2");
  });
  it("defaults to the first day with no usable history", () => {
    expect(nextWorkoutDay(new Map(), days, "2026-08-24")).toBe("Day 1");
    // Legacy days (no workoutDay) and retired labels are ignored.
    const map = new Map<string, string | undefined>([
      ["2026-08-20", undefined], ["2026-08-21", "Old Day"],
    ]);
    expect(nextWorkoutDay(map, days, "2026-08-24")).toBe("Day 1");
  });
  it("ignores the viewed date and any future dates", () => {
    const map = new Map<string, string | undefined>([
      ["2026-08-24", "Day 3"], ["2026-08-25", "Day 3"], ["2026-08-23", "Day 1"],
    ]);
    expect(nextWorkoutDay(map, days, "2026-08-24")).toBe("Day 2");
  });
  it("returns undefined when there are no workout days", () => {
    expect(nextWorkoutDay(new Map(), [], "2026-08-24")).toBeUndefined();
  });
});

describe("addDaysISO", () => {
  it("shifts calendar dates across month boundaries", () => {
    expect(addDaysISO("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const dates = new Set(["2026-07-21", "2026-07-20", "2026-07-19"]);
    expect(computeStreak(dates, "2026-07-21")).toBe(3);
  });
  it("uses yesterday as a grace day when today is empty", () => {
    const dates = new Set(["2026-07-20", "2026-07-19"]);
    expect(computeStreak(dates, "2026-07-21")).toBe(2);
  });
  it("is zero when neither today nor yesterday is active", () => {
    expect(computeStreak(new Set(["2026-07-10"]), "2026-07-21")).toBe(0);
  });
  it("stops at the first gap", () => {
    const dates = new Set(["2026-07-21", "2026-07-20", "2026-07-18"]);
    expect(computeStreak(dates, "2026-07-21")).toBe(2);
  });
});

describe("heatLevel", () => {
  it("buckets fractions 0-4", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(0.2)).toBe(1);
    expect(heatLevel(0.5)).toBe(2);
    expect(heatLevel(0.9)).toBe(3);
    expect(heatLevel(1)).toBe(4);
  });
});

describe("slotColor", () => {
  it("spreads 3 slots across the arc (first=dawn, last=night)", () => {
    const order = ["Wake up", "Pre lunch", "Evening"];
    expect(slotColor("Wake up", order)).toBe("dawn");
    expect(slotColor("Pre lunch", order)).toBe("noon");
    expect(slotColor("Evening", order)).toBe("night");
  });
  it("spreads 5 slots across the full day arc", () => {
    const order = ["A", "B", "C", "D", "E"];
    expect(order.map((s) => slotColor(s, order))).toEqual(["dawn", "morning", "noon", "dusk", "night"]);
  });
  it("returns dawn for a single or unknown slot", () => {
    expect(slotColor("Only", ["Only"])).toBe("dawn");
    expect(slotColor("Missing", ["A", "B"])).toBe("dawn");
  });
});

describe("primaryMuscle", () => {
  it("reduces free text to its headline", () => {
    expect(primaryMuscle("Legs (Quads, Glutes)")).toBe("Legs");
    expect(primaryMuscle("Back, Biceps")).toBe("Back");
    expect(primaryMuscle("Core")).toBe("Core");
    expect(primaryMuscle("")).toBe("Other");
  });
});

describe("muscleBreakdown", () => {
  it("groups exercises by primary muscle and averages, sorted desc", () => {
    const exs = [ex("a", { muscleGroup: "Core" }), ex("b", { muscleGroup: "Legs (Quads)" })];
    const days = [day("2026-07-01", ["a"])]; // a=100%, b=0%
    const result = muscleBreakdown(exs, days);
    expect(result[0]).toEqual({ group: "Core", completion: 1 });
    expect(result[1]).toEqual({ group: "Legs", completion: 0 });
  });
});

describe("dayHeader", () => {
  it("formats weekday and label", () => {
    expect(dayHeader("2026-07-21")).toEqual({ dow: "TUE", label: "21 Jul" });
  });
});
