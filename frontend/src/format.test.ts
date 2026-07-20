import { describe, it, expect } from "vitest";
import {
  exerciseCompletion,
  formatPercent,
  unitLabel,
  todayISO,
  monthRange,
  newLog,
  dayCompletion,
  addDaysISO,
  computeStreak,
  heatLevel,
  slotColor,
  primaryMuscle,
  muscleBreakdown,
  dayHeader,
} from "./format";
import type { DayLog, Exercise } from "./types";

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, timeSlot: "Wake up", name: id, plannedSets: 1, plannedAmount: 10,
  unit: "reps", note: "", restSeconds: 0, muscleGroup: "Core", equipment: "None",
  sortOrder: 0, active: true, ...over,
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

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    expect(formatPercent(0.5625)).toBe("56%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
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

describe("dayCompletion", () => {
  it("averages across exercises, missing = 0%", () => {
    const exs = [ex("a"), ex("b")];
    expect(dayCompletion(exs, day("2026-07-01", ["a"]))).toBeCloseTo(0.5);
    expect(dayCompletion(exs, day("2026-07-01", ["a", "b"]))).toBe(1);
    expect(dayCompletion(exs, undefined)).toBe(0);
    expect(dayCompletion([], day("2026-07-01", []))).toBe(0);
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
  it("maps known slot names to day-arc hues", () => {
    const order = ["Wake up", "Pre lunch", "Evening"];
    expect(slotColor("Wake up", order)).toBe("dawn");
    expect(slotColor("Pre lunch", order)).toBe("noon");
    expect(slotColor("Evening", order)).toBe("dusk");
  });
  it("cycles unknown slots by order", () => {
    const order = ["Alpha", "Beta", "Gamma", "Delta"];
    expect(slotColor("Alpha", order)).toBe("dawn");
    expect(slotColor("Beta", order)).toBe("noon");
    expect(slotColor("Gamma", order)).toBe("dusk");
    expect(slotColor("Delta", order)).toBe("dawn");
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
