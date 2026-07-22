import { useEffect, useState } from "react";
import { api, UnauthorizedError } from "./api";
import { SignIn } from "./components/SignIn";
import { Today } from "./components/Today";
import { History } from "./components/History";
import { Stats } from "./components/Stats";
import { Routine } from "./components/Routine";
import { InstallPrompt } from "./components/InstallPrompt";
import { IconToday, IconHistory, IconStats, IconRoutine } from "./components/icons";

type Tab = "today" | "history" | "stats" | "routine";
type AuthState = { status: "loading" } | { status: "out" } | { status: "in"; email: string };

const TABS: { id: Tab; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: "today", label: "Today", Icon: IconToday },
  { id: "history", label: "History", Icon: IconHistory },
  { id: "stats", label: "Stats", Icon: IconStats },
  { id: "routine", label: "Routine", Icon: IconRoutine },
];

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    api.me()
      .then(({ email }) => setAuth({ status: "in", email }))
      .catch((err) => setAuth({ status: err instanceof UnauthorizedError ? "out" : "out" }));
  }, []);

  if (auth.status === "loading") return <div className="app"><div className="center">Loading…</div></div>;
  if (auth.status === "out") return <div className="app"><SignIn /></div>;

  return (
    <div className="app">
      <main className="content">
        {tab === "today" && <Today />}
        {tab === "history" && <History />}
        {tab === "stats" && <Stats />}
        {tab === "routine" && <Routine />}
      </main>
      {tab === "today" && <InstallPrompt />}
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
