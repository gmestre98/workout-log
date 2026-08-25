import { useEffect, useState } from "react";
import { api, UnauthorizedError } from "./api";
import { SignIn } from "./components/SignIn";
import { Today } from "./components/Today";
import { History } from "./components/History";
import { Stats } from "./components/Stats";
import { Routine } from "./components/Routine";
import { Versions } from "./components/Versions";
import { InstallPrompt } from "./components/InstallPrompt";
import { Toaster } from "./components/Toaster";
import { IconToday, IconHistory, IconStats, IconRoutine, IconVersions } from "./components/icons";

type Tab = "today" | "history" | "stats" | "routine" | "versions";
type AuthState = { status: "loading" } | { status: "out" } | { status: "in"; email: string };

const TABS: { id: Tab; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: "today", label: "Today", Icon: IconToday },
  { id: "history", label: "History", Icon: IconHistory },
  { id: "stats", label: "Stats", Icon: IconStats },
  { id: "routine", label: "Routine", Icon: IconRoutine },
  { id: "versions", label: "Versions", Icon: IconVersions },
];

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    api.me()
      .then(({ email }) => setAuth({ status: "in", email }))
      .catch((err) => setAuth({ status: err instanceof UnauthorizedError ? "out" : "out" }));
  }, []);

  // Tidy the URL after returning from the Google Sheets connect redirect.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("sheets")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (auth.status === "loading") return <div className="app"><div className="center">Loading…</div></div>;
  if (auth.status === "out") return <div className="app"><SignIn /></div>;

  return (
    <div className="app">
      <main className="content">
        {/* Today stays mounted while you're on other tabs (just hidden), so a
            running set timer — and its chimes — survive navigating away to, e.g.,
            edit the routine mid-workout. Its per-set stopwatch is local state
            that unmounting would otherwise reset to zero. */}
        <div style={tab === "today" ? undefined : { display: "none" }} aria-hidden={tab !== "today"}>
          <Today email={auth.email} />
        </div>
        {tab === "history" && <History />}
        {tab === "stats" && <Stats />}
        {tab === "routine" && <Routine />}
        {tab === "versions" && <Versions />}
      </main>
      {tab === "today" && <InstallPrompt />}
      <Toaster />
      <nav className="tabbar">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)} aria-current={tab === id}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
