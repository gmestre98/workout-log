import { useEffect, useState } from "react";
import { api, UnauthorizedError } from "./api";
import { SignIn } from "./components/SignIn";
import { Today } from "./components/Today";
import { Routine } from "./components/Routine";
import { Stats } from "./components/Stats";

type Tab = "today" | "routine" | "stats";
type AuthState = { status: "loading" } | { status: "out" } | { status: "in"; email: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    api
      .me()
      .then(({ email }) => setAuth({ status: "in", email }))
      .catch((err) => {
        if (err instanceof UnauthorizedError) setAuth({ status: "out" });
        else setAuth({ status: "out" });
      });
  }, []);

  if (auth.status === "loading") {
    return <div className="center muted">Loading…</div>;
  }
  if (auth.status === "out") {
    return <SignIn />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Workout Log</h1>
        <button
          className="link"
          onClick={async () => {
            await api.logout();
            setAuth({ status: "out" });
          }}
        >
          Sign out
        </button>
      </header>

      <main className="content">
        {tab === "today" && <Today />}
        {tab === "routine" && <Routine />}
        {tab === "stats" && <Stats />}
      </main>

      <nav className="tabbar">
        <TabButton label="Today" active={tab === "today"} onClick={() => setTab("today")} />
        <TabButton label="Routine" active={tab === "routine"} onClick={() => setTab("routine")} />
        <TabButton label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
      </nav>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "tab active" : "tab"} onClick={onClick}>
      {label}
    </button>
  );
}
