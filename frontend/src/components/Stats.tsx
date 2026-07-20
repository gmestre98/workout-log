import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { DayLog, Exercise } from "../types";
import {
  addDaysISO, computeStreak, dayCompletion, formatPercent, monthRange, muscleBreakdown, todayISO,
} from "../format";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayHasActivity = (d: DayLog) => Object.values(d.exercises).some((l) => l.sets.some((s) => s.completed));

export function Stats() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [days, setDays] = useState<DayLog[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [prevAvg, setPrevAvg] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const { from, to } = monthRange(`${month}-01`);
    const [y, m] = month.split("-").map(Number);
    const prev = monthRange(`${todayISO(new Date(y, m - 2, 1)).slice(0, 7)}-01`);
    setDays(null);
    setError("");
    Promise.all([
      api.listExercises(),
      api.listDays(from, to),
      api.listDays(addDaysISO(todayISO(), -90), todayISO()),
      api.summary(prev.from, prev.to),
    ])
      .then(([exs, ds, streakDays, prevSummary]) => {
        const active = exs.filter((e) => e.active);
        setExercises(active);
        setDays(ds);
        const set = new Set<string>();
        for (const d of streakDays) if (dayHasActivity(d)) set.add(d.date);
        setStreak(computeStreak(set, todayISO()));
        setPrevAvg(prevSummary.days > 0 ? prevSummary.avgCompletion : null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [month]);

  const [year, mon] = month.split("-").map(Number);
  const byDate = useMemo(() => {
    const map = new Map<string, DayLog>();
    for (const d of days ?? []) map.set(d.date, d);
    return map;
  }, [days]);

  const logged = days ?? [];
  const avg = logged.length ? logged.reduce((a, d) => a + dayCompletion(exercises, d), 0) / logged.length : 0;
  const daysAbove0 = logged.filter((d) => dayCompletion(exercises, d) > 0).length;
  const daysAbove50 = logged.filter((d) => dayCompletion(exercises, d) > 0.5).length;
  const avgDelta = prevAvg === null ? null : avg - prevAvg;
  const muscles = useMemo(() => muscleBreakdown(exercises, logged), [exercises, logged]);

  // Trend path across the calendar month.
  const isCurrentMonth = month === todayISO().slice(0, 7);
  const lastDay = new Date(year, mon, 0).getDate();
  const endDay = isCurrentMonth ? Number(todayISO().slice(8)) : lastDay;
  const points = useMemo(() => {
    const pts: number[] = [];
    for (let d = 1; d <= endDay; d++) {
      pts.push(dayCompletion(exercises, byDate.get(`${month}-${String(d).padStart(2, "0")}`)));
    }
    return pts;
  }, [endDay, month, exercises, byDate]);

  const W = 300, top = 12, bottom = 104;
  const toXY = (v: number, i: number) => {
    const x = points.length <= 1 ? 0 : (i / (points.length - 1)) * W;
    const y = bottom - v * (bottom - top);
    return [x, y] as const;
  };
  const linePath = points.map((v, i) => { const [x, y] = toXY(v, i); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const areaPath = points.length ? `${linePath} L${W},${bottom} L0,${bottom} Z` : "";
  const last = points.length ? toXY(points[points.length - 1], points.length - 1) : [0, bottom];

  return (
    <div>
      <div className="app-head">
        <div>
          <div className="subt">{MON[mon - 1]} {year}</div>
          <div className="title">Stats</div>
        </div>
        <input className="iconbtn" type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: "auto", padding: "0 8px" }} aria-label="Select month" />
      </div>

      {error && <p className="error">{error}</p>}
      {!days && !error && <p className="empty">Loading…</p>}

      {days && (
        <>
          <div className="tiles">
            <Tile n={formatPercent(avg)} l="Avg completion" trend={avgDelta === null ? undefined : `${avgDelta >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(avgDelta))}`} good={avgDelta !== null && avgDelta >= 0} />
            <Tile n={String(streak)} l="Day streak 🔥" />
            <Tile n={String(daysAbove0)} l="Active days" />
            <Tile n={String(daysAbove50)} l="Days above 50%" />
          </div>

          <div className="card" style={{ padding: 15, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="small" style={{ fontWeight: 750 }}>Daily completion</span>
              <span className="tiny muted num">{MON[mon - 1]}</span>
            </div>
            {points.length === 0 ? (
              <p className="empty" style={{ padding: "24px 0" }}>No workouts logged this month.</p>
            ) : (
              <svg className="chart-svg" viewBox="0 0 300 116" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="statArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--ember)" stopOpacity="0.32" />
                    <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1={top} x2="300" y2={top} stroke="var(--line)" strokeWidth="1" />
                <line x1="0" y1={(top + bottom) / 2} x2="300" y2={(top + bottom) / 2} stroke="var(--line)" strokeWidth="1" />
                <path d={areaPath} fill="url(#statArea)" />
                <path d={linePath} fill="none" stroke="var(--ember)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <circle cx={last[0]} cy={last[1]} r="4" fill="var(--ember)" />
              </svg>
            )}
          </div>

          <div className="card" style={{ padding: 15, marginTop: 12 }}>
            <span className="small" style={{ fontWeight: 750 }}>By muscle group</span>
            {muscles.length === 0 ? (
              <p className="empty" style={{ padding: "12px 0" }}>Add exercises to see this.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12 }}>
                {muscles.map((mstat) => (
                  <div key={mstat.group}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                      <span>{mstat.group}</span><span className="num" style={{ fontWeight: 700 }}>{formatPercent(mstat.completion)}</span>
                    </div>
                    <div className="bar"><span style={{ width: `${mstat.completion * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="scroll-pad" />
        </>
      )}
    </div>
  );
}

function Tile({ n, l, trend, good }: { n: string; l: string; trend?: string; good?: boolean }) {
  return (
    <div className="card tile">
      <div className="n num">{n}</div>
      <div className="l">{l}</div>
      {trend && <div className={`trend num ${good ? "g" : "z"}`}>{trend}</div>}
    </div>
  );
}
