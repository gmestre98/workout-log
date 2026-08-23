import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DayLog } from "./types";

const { saveDayMock, getDayMock } = vi.hoisted(() => ({
  saveDayMock: vi.fn(),
  getDayMock: vi.fn(),
}));

vi.mock("./api", () => {
  class UnauthorizedError extends Error {
    constructor() {
      super("unauthorized");
      this.name = "UnauthorizedError";
    }
  }
  return {
    UnauthorizedError,
    api: {
      saveDay: (d: DayLog) => saveDayMock(d),
      getDay: (date: string) => getDayMock(date),
    },
  };
});

import { saveDay, getDay, flush, getSyncState } from "./dayStore";
import { UnauthorizedError } from "./api";

const day = (date: string, completed = true): DayLog => ({
  date,
  exercises: { "ex-1": { exerciseId: "ex-1", plannedSets: 1, plannedAmount: 10, unit: "reps", sets: [{ completed, actualAmount: 10 }] } },
});

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
}

describe("dayStore", () => {
  beforeEach(() => {
    localStorage.clear();
    saveDayMock.mockReset();
    getDayMock.mockReset();
    setOnline(true);
  });

  it("persists a day locally and pushes it to the server when online", async () => {
    saveDayMock.mockResolvedValue(undefined);
    const d = day("2026-08-23");

    saveDay(d);
    await flush();

    expect(saveDayMock).toHaveBeenCalledWith(d);
    expect(getSyncState().pending).toBe(0);
  });

  it("keeps an offline edit queued, then syncs it on reconnect", async () => {
    setOnline(false);
    saveDayMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const d = day("2026-08-23");

    saveDay(d);
    await flush();

    expect(getSyncState().pending).toBe(1); // not lost — still queued
    expect(getSyncState().online).toBe(false);

    // Back online: the same queued day is replayed and the queue drains.
    setOnline(true);
    saveDayMock.mockResolvedValue(undefined);
    await flush();

    expect(saveDayMock).toHaveBeenLastCalledWith(d);
    expect(getSyncState().pending).toBe(0);
  });

  it("returns the pending offline edit instead of the server copy", async () => {
    setOnline(false);
    saveDayMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const mine = day("2026-08-23");
    saveDay(mine);
    await flush();

    const got = await getDay("2026-08-23");
    expect(got).toEqual(mine);
    expect(getDayMock).not.toHaveBeenCalled(); // never hit the network
  });

  it("falls back to the cached day when the network is unavailable", async () => {
    const server = day("2026-08-20");
    getDayMock.mockResolvedValueOnce(server); // first load caches it
    expect(await getDay("2026-08-20")).toEqual(server);

    getDayMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const got = await getDay("2026-08-20");
    expect(got).toEqual(server);
    expect(getSyncState().online).toBe(false);
  });

  it("returns an empty editable day when offline with nothing cached", async () => {
    getDayMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const got = await getDay("2026-08-19");
    expect(got).toEqual({ date: "2026-08-19", exercises: {} });
  });

  it("propagates UnauthorizedError from getDay so the app can show sign-in", async () => {
    getDayMock.mockRejectedValue(new UnauthorizedError());
    await expect(getDay("2026-08-23")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("keeps the day queued on a server error while staying online", async () => {
    saveDayMock.mockRejectedValue(new Error("500 internal"));
    saveDay(day("2026-08-23"));
    await flush();

    expect(getSyncState().pending).toBe(1); // retried on the next trigger
    expect(getSyncState().online).toBe(true);
  });
});
