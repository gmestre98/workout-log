import { api, UnauthorizedError } from "./api";
import type { DayLog } from "./types";

// Local-first day logs.
//
// Every save is written to localStorage first (a per-date cache plus an
// "outbox" of not-yet-synced days) and only then pushed to the server. So an
// edit made offline survives a reload and is replayed when connectivity comes
// back. Reads prefer a pending outbox entry (the freshest local truth), then
// the network, then the cache — so the day you just edited offline is what you
// see, not a stale server copy.
//
// saveDay on the server is a full idempotent PUT keyed by date (last write
// wins), so replaying the outbox needs no merge logic: we just re-send the
// latest state we hold for each date.

const SCHEMA = 1;
const cacheKey = (date: string) => `wl.day.${date}`;
const OUTBOX_KEY = "wl.outbox";

type Wrapped = { v: number; day: DayLog };

// SyncState drives the small "Saved · will sync" / "Saving…" indicator.
export interface SyncState {
  pending: number; // days queued for sync
  syncing: boolean; // a flush is in flight
  online: boolean;
}

let state: SyncState = {
  pending: 0,
  syncing: false,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
};
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(cb: (s: SyncState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

// --- localStorage helpers (all guarded; storage may be full or unavailable) ---

function readCache(date: string): DayLog | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(date));
    if (!raw) return undefined;
    const p = JSON.parse(raw) as Wrapped;
    if (p && p.v === SCHEMA && p.day && p.day.date === date) return p.day;
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return undefined;
}

function writeCache(day: DayLog) {
  try {
    localStorage.setItem(cacheKey(day.date), JSON.stringify({ v: SCHEMA, day }));
  } catch {
    /* ignore quota/availability errors */
  }
}

function readOutbox(): Record<string, DayLog> {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as { v: number; days: Record<string, DayLog> };
    if (p && p.v === SCHEMA && p.days && typeof p.days === "object") return p.days;
  } catch {
    /* ignore */
  }
  return {};
}

function writeOutbox(days: Record<string, DayLog>) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify({ v: SCHEMA, days }));
  } catch {
    /* ignore */
  }
  setState({ pending: Object.keys(days).length });
}

// --- public API ---

// saveDay records the day locally (never lost) and kicks off a background push.
// It resolves immediately and does not reject on offline/network failure — the
// day stays queued and syncs later. Real server rejections (e.g. auth) are
// swallowed here too; the queued day is retried on the next flush.
export function saveDay(day: DayLog): void {
  writeCache(day);
  const box = readOutbox();
  box[day.date] = day;
  writeOutbox(box);
  void flush();
}

// getDay returns the freshest day we can produce: a pending local edit wins,
// otherwise the network (updating the cache), otherwise the last cached copy,
// otherwise an empty day so a brand-new date is still editable offline.
export async function getDay(date: string): Promise<DayLog> {
  const pending = readOutbox()[date];
  if (pending) return pending;
  try {
    const fresh = await api.getDay(date);
    writeCache(fresh);
    return fresh;
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e; // let the app show sign-in
    setState({ online: false });
    return readCache(date) ?? { date, exercises: {} };
  }
}

// flush replays every queued day to the server, oldest date first. It runs once
// per call (no internal retry loop); triggers are: each saveDay, the `online`
// event, and app start. A day that fails to send stays queued for the next
// trigger. Concurrent flushes are coalesced.
let flushing: Promise<void> | null = null;

export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const box = readOutbox();
    const dates = Object.keys(box).sort();
    if (dates.length === 0) return;
    setState({ syncing: true });
    let hitNetworkError = false;
    for (const date of dates) {
      if (hitNetworkError) break; // offline again — stop, keep the rest queued
      try {
        await api.saveDay(box[date]);
        // Re-read in case the day was edited again while this request was in
        // flight; only drop the entry if it still matches what we just sent.
        const latest = readOutbox();
        if (latest[date] === box[date] || sameDay(latest[date], box[date])) {
          delete latest[date];
          writeOutbox(latest);
        }
      } catch (e) {
        if (e instanceof UnauthorizedError) break; // signed out; retry after re-auth
        // A network failure means we're offline: stop and keep everything
        // queued. Any other (server) error also leaves the day queued for a
        // later retry rather than dropping the user's data.
        hitNetworkError = !navigator.onLine || e instanceof TypeError;
      }
    }
    setState({ syncing: false, online: navigator.onLine });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

function sameDay(a: DayLog | undefined, b: DayLog): boolean {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

// init wires connectivity handling and flushes anything left over from a
// previous offline session. Call once at app start.
export function initDayStore(): void {
  setState({ pending: Object.keys(readOutbox()).length });
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    setState({ online: true });
    void flush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  void flush();
}
