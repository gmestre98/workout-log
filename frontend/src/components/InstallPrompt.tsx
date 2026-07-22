import { useEffect, useState } from "react";
import { IconDumbbell } from "./icons";

// Minimal shape of the Chrome-only beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SNOOZE_KEY = "wl_install_snooze_until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function snoozed(): boolean {
  const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return Date.now() < until;
}

// InstallPrompt shows a small "add to home screen" banner — but only when the
// app is NOT already installed and hasn't been dismissed recently. On Android
// it captures beforeinstallprompt for a real one-tap install; on iOS (no such
// event) it shows the Share → Add to Home Screen instructions.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => { setMode(null); setDeferred(null); };
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt; offer manual guidance after a beat.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS()) t = setTimeout(() => setMode((m) => m ?? "ios"), 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setMode(null);
  };

  if (!mode) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Install app">
      <div className="ic"><IconDumbbell /></div>
      <div className="txt">
        <b>Install Workout Log</b>
        {mode === "android" ? (
          <span>Add it to your home screen for one-tap access.</span>
        ) : (
          <span>Tap <ShareGlyph /> Share, then “Add to Home Screen”.</span>
        )}
      </div>
      <div className="act">
        {mode === "android" && <button className="btn primary" style={{ padding: "9px 14px" }} onClick={install}>Install</button>}
        <button className="x" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", margin: "0 1px" }} aria-hidden="true">
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  );
}
