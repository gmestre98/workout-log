import { describe, it, expect } from "vitest";
import {
  exerciseCompletion,
  formatPercent,
  unitLabel,
  todayISO,
  monthRange,
  newLog,
} from "./format";

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
