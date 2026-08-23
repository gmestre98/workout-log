import { useEffect, useState } from "react";

// useOnline tracks the browser's connectivity, re-rendering on change. It backs
// the routine editor's offline block: routine changes can't be queued (unlike
// day logs), so the UI disables editing while offline rather than letting a
// change be made and silently lost.
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
