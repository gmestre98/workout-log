import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, UnauthorizedError } from "./api";

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws UnauthorizedError on 401", async () => {
    (fetch as any).mockResolvedValue({ status: 401, ok: false });
    await expect(api.listExercises()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("sends credentials and parses JSON on success", async () => {
    (fetch as any).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => [{ id: "ex-1", name: "Pull-ups" }],
    });
    const list = await api.listExercises();
    expect(list[0].name).toBe("Pull-ups");
    expect(fetch).toHaveBeenCalledWith(
      "/api/exercises",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("surfaces the server error message", async () => {
    (fetch as any).mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({ error: "plannedSets must be > 0" }),
    });
    await expect(
      api.createExercise({
        timeSlot: "Wake up",
        name: "x",
        plannedSets: 0,
        plannedAmount: 1,
        unit: "reps",
        note: "",
        restSeconds: 0,
        muscleGroup: "",
        equipment: "",
        sortOrder: 0,
        active: true,
        perSide: false,
      })
    ).rejects.toThrow("plannedSets must be > 0");
  });

  it("returns undefined for 204 responses", async () => {
    (fetch as any).mockResolvedValue({ status: 204, ok: true });
    await expect(api.deleteExercise("ex-1")).resolves.toBeUndefined();
  });

  it("reads Google Sheets connection status", async () => {
    (fetch as any).mockResolvedValue({ status: 200, ok: true, json: async () => ({ connected: true }) });
    await expect(api.sheetsStatus()).resolves.toEqual({ connected: true });
    expect(fetch).toHaveBeenCalledWith("/auth/sheets", expect.objectContaining({ method: "GET" }));
  });

  it("posts an export and returns the sheet URL", async () => {
    (fetch as any).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ url: "https://docs.google.com/spreadsheets/d/abc", title: "Workout Log — 2026-08-23 10:00" }),
    });
    const res = await api.exportSheets();
    expect(res.url).toContain("spreadsheets");
    expect(fetch).toHaveBeenCalledWith("/api/export/sheets", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces a not-connected export error", async () => {
    (fetch as any).mockResolvedValue({ status: 400, ok: false, json: async () => ({ error: "connect Google Sheets first" }) });
    await expect(api.exportSheets()).rejects.toThrow("connect Google Sheets first");
  });
});
