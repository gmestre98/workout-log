import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { DayLog, Exercise } from "../types";
import { dayCompletion, dayHeader, formatPercent, heatLevel, monthRange, todayISO } from "../format";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function History() {
  const [month, setMonth] = useState(todayISO().slice(0, 7)); // YYYY-MM
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [days, setDays] = useState<DayLog[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const { from, to } = monthRange(`${month}-01`);
    setDays(null);
    setError("");
    Promise.all([api.listExercises(), api.listDays(from, to)])
      .then(([exs, ds]) => { setExercises(exs.filter((e) => e.active)); setDays(ds); })
      .catch((e) => setError(String(e.message ?? e)));
  }, [month]);

  const byDate = useMemo(() => {
    const m = new Map<string, DayLog>();
    for (const d of days ?? []) m.set(d.date, d);
    return m;
  }, [days]);

  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const leadBlanks = (new Date(year, mon - 1, 1).getDay() + 6) % 7; // Monday-first
  const cells = useMemo(() => {
    const out: { date?: string; level: number; today?: boolean }[] = [];
    for (let i = 0; i < leadBlanks; i++) out.push({ level: -1 });
    for (let d = 1; d <= lastDay; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const comp = dayCompletion(exercises, byDate.get(date));
      out.push({ date, level: heatLevel(comp), today: date === todayISO() });
    }
    return out;
  }, [leadBlanks, lastDay, month, exercises, byDate]);

  const activeDays = (days ?? []).filter((d) => dayCompletion(exercises, d) > 0).length;
  const recent = useMemo(
    () => [...(days ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    [days]
  );

  return (
    <div>
      <div className="app-head">
        <div>
          <div className="subt">{MON[mon - 1]} {year}</div>
          <div className="title">History</div>
        </div>
        <input className="iconbtn" type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: "auto", padding: "0 8px" }} aria-label="Select month" />
      </div>

      {error && <p className="error">{error}</p>}
      {!days && !error && <p className="empty">Loading…</p>}

      {days && (
        <>
          <div className="card" style={{ padding: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span className="small" style={{ fontWeight: 750 }}>{MON[mon - 1]}</span>
              <span className="tiny muted num">M&nbsp;T&nbsp;W&nbsp;T&nbsp;F&nbsp;S&nbsp;S</span>
            </div>
            <div className="heat">
              {cells.map((c, i) =>
                c.level < 0
                  ? <i key={i} style={{ background: "transparent" }} />
                  : <i key={i} className={`l${c.level} ${c.today ? "today" : ""}`.trim()} title={c.date ? `${c.date}: ${formatPercent(byDate.has(c.date) ? dayCompletion(exercises, byDate.get(c.date)) : 0)}` : ""} />
              )}
            </div>
            <div className="legend-row">
              <span className="sc">Less <i style={{ background: "var(--surface-2)" }} /><i style={{ background: "color-mix(in srgb,var(--ember) 45%,transparent)" }} /><i style={{ background: "var(--ember)" }} /> More</span>
              <span style={{ fontWeight: 700, color: "var(--ink)" }}><span className="num">{activeDays}</span> active days</span>
            </div>
          </div>

          <div className="slot-head" style={{ marginTop: 18 }}><span className="slot-title">Recent workouts</span></div>
          {recent.length === 0 ? (
            <p className="empty">Nothing logged this month yet.</p>
          ) : (
            <div className="card" style={{ padding: "4px 14px" }}>
              {recent.map((d) => {
                const comp = dayCompletion(exercises, d);
                const h = dayHeader(d.date);
                const label = comp >= 1 ? "Full day" : comp > 0 ? "Partial day" : "Rest day";
                const barCls = comp >= 1 ? "bar g" : comp > 0 ? "bar" : "bar zero";
                return (
                  <div key={d.date} className="daylist-row">
                    <div className="dnum"><div className="d num">{Number(d.date.slice(8))}</div><div className="m">{h.dow}</div></div>
                    <div className="dbar">
                      <div className="top">
                        <span style={{ fontWeight: 700 }}>{label}</span>
                        <span className={`num ${comp >= 1 ? "g" : comp > 0 ? "a" : "z"}`} style={{ fontWeight: 700 }}>{comp > 0 ? formatPercent(comp) : "—"}</span>
                      </div>
                      <div className={barCls}><span style={{ width: `${Math.max(comp * 100, comp > 0 ? 6 : 3)}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="scroll-pad" />
        </>
      )}
    </div>
  );
}
