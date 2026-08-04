import { describe, it, expect } from "vitest";
import { clockTotals, type ClockState } from "./timer";

const base: ClockState = {
  running: false,
  startedAt: null,
  accumulatedMs: 0,
  restMs: 0,
  restStartedAt: null,
};

describe("clockTotals", () => {
  it("reports an idle, unstarted clock", () => {
    const t = clockTotals(base, 1000);
    expect(t.totalMs).toBe(0);
    expect(t.activeMs).toBe(0);
    expect(t.started).toBe(false);
    expect(t.running).toBe(false);
  });

  it("adds the live running segment to accumulated time", () => {
    const s: ClockState = { ...base, running: true, startedAt: 1000, accumulatedMs: 5000 };
    const t = clockTotals(s, 4000); // 3s into the current segment
    expect(t.totalMs).toBe(8000);
    expect(t.started).toBe(true);
    expect(t.running).toBe(true);
  });

  it("splits active vs rest, counting a live rest segment", () => {
    const s: ClockState = { ...base, running: true, startedAt: 0, accumulatedMs: 0, restMs: 2000, restStartedAt: 6000 };
    const t = clockTotals(s, 10000); // total 10s, rest = 2s + 4s live = 6s
    expect(t.totalMs).toBe(10000);
    expect(t.restMs).toBe(6000);
    expect(t.activeMs).toBe(4000);
    expect(t.resting).toBe(true);
  });

  it("never reports negative active time", () => {
    const s: ClockState = { ...base, accumulatedMs: 1000, restMs: 5000 };
    expect(clockTotals(s, 0).activeMs).toBe(0);
  });
});
