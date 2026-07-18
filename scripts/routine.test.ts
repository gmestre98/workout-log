import { describe, it, expect } from "vitest";
import { parseAmount, parseRest, seedRoutine } from "./routine";

describe("parseAmount", () => {
  it("parses plain reps", () => {
    expect(parseAmount("8")).toEqual({ plannedAmount: 8, unit: "reps", note: "" });
  });
  it("parses seconds", () => {
    expect(parseAmount("30s")).toEqual({ plannedAmount: 30, unit: "seconds", note: "" });
  });
  it("parses minutes", () => {
    expect(parseAmount("10min")).toEqual({ plannedAmount: 10, unit: "minutes", note: "" });
  });
  it("parses per-leg reps", () => {
    expect(parseAmount("10/leg")).toEqual({ plannedAmount: 10, unit: "reps", note: "per leg" });
  });
  it("parses seconds per side", () => {
    expect(parseAmount("30s/side")).toEqual({ plannedAmount: 30, unit: "seconds", note: "per side" });
  });
  it("throws on garbage", () => {
    expect(() => parseAmount("abc")).toThrow();
  });
});

describe("parseRest", () => {
  it("parses numeric rest", () => {
    expect(parseRest("60")).toBe(60);
  });
  it("treats 'Not needed' as 0", () => {
    expect(parseRest("Not needed")).toBe(0);
  });
});

describe("seedRoutine", () => {
  it("produces the full July routine with unique sort orders", () => {
    const r = seedRoutine();
    expect(r).toHaveLength(12);
    expect(r.map((e) => e.sortOrder)).toEqual([...Array(12).keys()]);
    const carry = r.find((e) => e.name === "Backpack carry")!;
    expect(carry).toMatchObject({ plannedAmount: 10, unit: "minutes", restSeconds: 0, plannedSets: 1 });
    const lunges = r.find((e) => e.name === "Walking lunges")!;
    expect(lunges.note).toBe("per leg");
  });
});
