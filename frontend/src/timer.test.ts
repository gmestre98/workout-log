import { describe, it, expect } from "vitest";
import { clockTotals, workoutClock, type ClockState } from "./timer";

const base: ClockState = { phase: "idle", trainingMs: 0, restMs: 0, segStart: null };

describe("clockTotals", () => {
  it("reports an idle, unstarted clock", () => {
    const t = clockTotals(base, 1000);
    expect(t.totalMs).toBe(0);
    expect(t.started).toBe(false);
    expect(t.paused).toBe(false);
  });

  it("adds the live training segment", () => {
    const s: ClockState = { ...base, phase: "training", segStart: 1000, trainingMs: 5000 };
    const t = clockTotals(s, 4000); // 3s into the current set
    expect(t.trainingMs).toBe(8000);
    expect(t.restMs).toBe(0);
    expect(t.totalMs).toBe(8000);
    expect(t.training).toBe(true);
  });

  it("adds the live resting segment and splits total", () => {
    const s: ClockState = { ...base, phase: "resting", segStart: 6000, trainingMs: 10000, restMs: 2000 };
    const t = clockTotals(s, 10000); // 4s into rest
    expect(t.trainingMs).toBe(10000);
    expect(t.restMs).toBe(6000); // 2s folded + 4s live
    expect(t.totalMs).toBe(16000);
    expect(t.resting).toBe(true);
  });

  it("accrues nothing while paused", () => {
    const s: ClockState = { ...base, phase: "paused", trainingMs: 9000, restMs: 3000, segStart: null };
    const t = clockTotals(s, 999999);
    expect(t.trainingMs).toBe(9000);
    expect(t.restMs).toBe(3000);
    expect(t.totalMs).toBe(12000);
    expect(t.paused).toBe(true);
    expect(t.started).toBe(true);
  });
});

describe("persisted schema", () => {
  it("discards clock data from an older/unknown schema instead of mis-merging", () => {
    // Old-shape blob (no schema version) — the kind that previously scrambled
    // the training/rest split.
    localStorage.setItem(
      "wl.clock.2099-01-02",
      JSON.stringify({ running: true, accumulatedMs: 600000, restMs: 120000 })
    );
    const t = clockTotals(workoutClock.get("2099-01-02"), 0);
    expect(t.started).toBe(false);
    expect(t.totalMs).toBe(0);
  });

  it("round-trips current-schema state", () => {
    workoutClock.startTraining("2099-01-03");
    const raw = JSON.parse(localStorage.getItem("wl.clock.2099-01-03")!);
    expect(raw.v).toBe(2);
    expect(raw.phase).toBe("training");
  });
});
