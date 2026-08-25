// Travel mode is a global switch the user flips on for a trip: while it's on,
// the Today screen swaps every exercise that has a travel replacement for its
// variant. The choice is stored on the device (like the theme) so it stays on
// across days and reloads until the trip ends and the user turns it off. Each
// day that gets logged is separately stamped (DayLog.travel) so history records
// which days were done in travel mode.
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
