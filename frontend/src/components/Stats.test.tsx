import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Stats } from "./Stats";
import { api } from "../api";
import type { DayLog } from "../types";

const day = (date: string, workoutDay: string, trainingSeconds: number, restSeconds = 0): DayLog => ({
  date,
  workoutDay,
  exercises: {},
  timeBySource: { app: { trainingSeconds, restSeconds } },
});

// Two workout days, "Push" and "Pull", each with a few timed sessions, plus an
// untimed day that must be ignored by the training-time trend.
const RECENT: DayLog[] = [
  day("2026-09-01", "Push", 600), // 10:00
  day("2026-09-04", "Pull", 1200), // 20:00
  day("2026-09-08", "Push", 900), // 15:00 — most recent overall, so Push is the default
  { date: "2026-09-09", workoutDay: "Pull", exercises: {} }, // untimed → excluded
];

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      listExercises: vi.fn().mockResolvedValue([]),
      listDays: vi.fn().mockResolvedValue([]),
      listSchedule: vi.fn().mockResolvedValue([]),
      listVersions: vi.fn().mockResolvedValue([]),
    },
  };
});

describe("Stats training-time trend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.listExercises as any).mockResolvedValue([]);
    (api.listDays as any).mockResolvedValue(RECENT);
    (api.listSchedule as any).mockResolvedValue([]);
    (api.listVersions as any).mockResolvedValue([]);
  });

  const card = () => screen.getByText("Training time").closest(".card") as HTMLElement;

  it("groups sessions per workout day and defaults to the most recent day", async () => {
    render(<Stats />);
    await waitFor(() => expect(screen.getByText("Training time")).toBeInTheDocument());
    const c = within(card());
    // Both workout days offered as chips.
    expect(c.getByRole("button", { name: "Push" })).toBeInTheDocument();
    expect(c.getByRole("button", { name: "Pull" })).toBeInTheDocument();
    // Defaults to Push (its 09-08 session is the most recent), showing its two
    // sessions: avg (10:00 + 15:00)/2 = 12:30, last 15:00, up 5:00 on the prior.
    expect(c.getByText("12:30")).toBeInTheDocument();
    expect(c.getByText("15:00")).toBeInTheDocument();
    expect(c.getByText(/▲ 5:00/)).toBeInTheDocument();
    expect(c.getByText(/2 sessions/)).toBeInTheDocument();
  });

  it("switches the trend to another workout day when its chip is picked", async () => {
    render(<Stats />);
    await waitFor(() => expect(screen.getByText("Training time")).toBeInTheDocument());
    fireEvent.click(within(card()).getByRole("button", { name: "Pull" }));
    const c = within(card());
    // Pull has one session at 20:00 — avg == last, no delta, one session.
    expect(c.getAllByText("20:00").length).toBeGreaterThanOrEqual(2);
    expect(c.queryByText(/▲|▼/)).not.toBeInTheDocument();
    expect(c.getByText(/1 session\b/)).toBeInTheDocument();
  });

  it("shows an empty state when no sessions were timed", async () => {
    (api.listDays as any).mockResolvedValue([{ date: "2026-09-01", workoutDay: "Push", exercises: {} }]);
    render(<Stats />);
    await waitFor(() => expect(screen.getByText("Training time")).toBeInTheDocument());
    expect(within(card()).getByText(/No timed workouts yet/)).toBeInTheDocument();
  });
});
