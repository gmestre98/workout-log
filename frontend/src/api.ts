import type { DayLog, Exercise, RoutineVersion, Summary } from "./types";

// Thrown when the user is not signed in (HTTP 401). The app uses this to show
// the sign-in screen.
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) {
    let msg = `${method} ${path} failed (${resp.status})`;
    try {
      const data = await resp.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  me: () => request<{ email: string }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),

  listExercises: () => request<Exercise[]>("GET", "/api/exercises"),
  createExercise: (e: Omit<Exercise, "id">) => request<Exercise>("POST", "/api/exercises", e),
  updateExercise: (e: Exercise) => request<Exercise>("PUT", `/api/exercises/${e.id}`, e),
  deleteExercise: (id: string) => request<void>("DELETE", `/api/exercises/${id}`),

  getDay: (date: string) => request<DayLog>("GET", `/api/days/${date}`),
  saveDay: (day: DayLog) => request<DayLog>("PUT", `/api/days/${day.date}`, day),
  listDays: (from: string, to: string) =>
    request<DayLog[]>("GET", `/api/days?from=${from}&to=${to}`),

  summary: (from: string, to: string) =>
    request<Summary>("GET", `/api/summary?from=${from}&to=${to}`),

  listVersions: () => request<RoutineVersion[]>("GET", "/api/routine/versions"),
  saveVersion: (note: string) =>
    request<RoutineVersion>("POST", "/api/routine/versions", { note }),
};
