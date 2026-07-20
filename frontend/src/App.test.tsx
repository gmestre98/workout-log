import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { api, UnauthorizedError } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    api: {
      me: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      listExercises: vi.fn().mockResolvedValue([]),
      getDay: vi.fn().mockResolvedValue({ date: "2026-07-21", exercises: {} }),
      listDays: vi.fn().mockResolvedValue([]),
      summary: vi.fn().mockResolvedValue({ days: 0, avgCompletion: 0, daysAbove0: 0, daysAbove50: 0, perDay: [] }),
      listVersions: vi.fn().mockResolvedValue([]),
    },
  };
});

describe("App auth gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows sign-in when unauthenticated", async () => {
    (api.me as any).mockRejectedValue(new UnauthorizedError());
    render(<App />);
    await waitFor(() => expect(screen.getByText("Sign in with Google")).toBeInTheDocument());
  });

  it("shows the four tabs when authenticated", async () => {
    (api.me as any).mockResolvedValue({ email: "me@gmail.com" });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Routine" })).toBeInTheDocument();
  });
});
