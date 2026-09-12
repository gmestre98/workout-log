// Travel mode is a global switch the user flips on for a trip: while it's on,
// the Today screen swaps every exercise that has a travel replacement for its
// variant. The switch is shared across devices — it is persisted server-side
// (GET/PUT /api/travel) so the watch reads the same trip state — and these
// localStorage helpers are the device-local cache: they seed the initial render
// and keep the last known value while offline until the server load returns.
// Each day that gets logged is separately stamped (DayLog.travel) so history
// records which days were done in travel mode.
const KEY = "wl.travel";

export function getTravelMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setTravelMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota/availability errors */
  }
}

// Per-exercise opt-outs: exercise ids kept on their normal version even while
// travel mode is on (e.g. the movement you brought equipment for). Like the
// global switch, this is stored on the device and persists through the trip so
// each new day inherits it; the choice is stamped onto a day when it is logged
// (DayLog.travelOff) so history stays accurate.
const OFF_KEY = "wl.travelOff";

export function getTravelOff(): Set<string> {
  try {
    const raw = localStorage.getItem(OFF_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function setTravelOff(ids: Set<string>): void {
  try {
    if (ids.size) localStorage.setItem(OFF_KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* ignore quota/availability errors */
  }
}
