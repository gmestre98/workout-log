import { useEffect, useState } from "react";
import { api } from "../api";
import type { Summary } from "../types";
import { formatPercent, monthRange, todayISO } from "../format";

// Stats shows the same figures as the spreadsheet's monthly summary: average
// completion, days above 0% and days above 50%, plus a per-day bar chart.
export function Stats() {
  const [month, setMonth] = useState(todayISO().slice(0, 7)); // YYYY-MM
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const { from, to } = monthRange(`${month}-01`);
    setSummary(null);
    setError("");
    api
      .summary(from, to)
      .then(setSummary)
      .catch((e) => setError(String(e.message ?? e)));
  }, [month]);

  const maxDay = summary?.perDay.reduce((m, d) => Math.max(m, d.completion), 0) ?? 0;

  return (
    <div className="stats">
      <div className="stats-head">
        <h2>Stats</h2>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      {!summary && !error && <p className="muted">Loading…</p>}
      {summary && (
        <>
          <div className="tiles">
            <Tile label="Avg completion" value={formatPercent(summary.avgCompletion)} />
            <Tile label="Days above 50%" value={String(summary.daysAbove50)} />
            <Tile label="Days above 0%" value={String(summary.daysAbove0)} />
            <Tile label="Days tracked" value={String(summary.days)} />
          </div>

          {summary.perDay.length === 0 ? (
            <p className="muted">No workouts logged this month.</p>
          ) : (
            <div className="chart" role="img" aria-label="Daily completion">
              {summary.perDay.map((d) => (
                <div key={d.date} className="bar-col" title={`${d.date}: ${formatPercent(d.completion)}`}>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: `${(maxDay ? d.completion / maxDay : 0) * 100}%` }}
                    />
                  </div>
                  <span className="bar-label">{d.date.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  );
}
