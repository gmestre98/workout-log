import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { DayLog, Exercise, ExerciseLog } from "../types";
import { exerciseCompletion, formatPercent, newLog, todayISO, unitLabel } from "../format";

export function Today() {
  const [date, setDate] = useState(todayISO());
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [day, setDay] = useState<DayLog | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load routine + the selected day's log.
  useEffect(() => {
    let cancelled = false;
    setDay(null);
    setError("");
    Promise.all([api.listExercises(), api.getDay(date)])
      .then(([exs, d]) => {
        if (cancelled) return;
        setExercises(exs.filter((e) => e.active));
        setDay(d);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const scheduleSave = useCallback((next: DayLog) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      api
        .saveDay(next)
        .catch((e) => setError(String(e.message ?? e)))
        .finally(() => setSaving(false));
    }, 700);
  }, []);

  const logFor = useCallback(
    (ex: Exercise): ExerciseLog => day?.exercises[ex.id] ?? newLog(ex),
    [day]
  );

  const update = useCallback(
    (ex: Exercise, mutate: (log: ExerciseLog) => ExerciseLog) => {
      setDay((prev) => {
        const base = prev ?? { date, exercises: {} };
        const current = base.exercises[ex.id] ?? newLog(ex);
        const next: DayLog = {
          date,
          exercises: { ...base.exercises, [ex.id]: mutate(current) },
        };
        scheduleSave(next);
        return next;
      });
    },
    [date, scheduleSave]
  );

  const bySlot = useMemo(() => groupBySlot(exercises), [exercises]);
  const dayAverage = useMemo(() => {
    if (exercises.length === 0) return 0;
    const sum = exercises.reduce((acc, ex) => acc + exerciseCompletion(logFor(ex)), 0);
    return sum / exercises.length;
  }, [exercises, logFor]);

  return (
    <div className="today">
      <div className="datebar">
        <button className="btn" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">
          ›
        </button>
      </div>

      <div className="dayscore">
        <span className="big">{formatPercent(dayAverage)}</span>
        <span className="muted">completed today {saving ? "· saving…" : ""}</span>
      </div>

      {error && <p className="error">{error}</p>}
      {!day && !error && <p className="muted">Loading…</p>}
      {day && exercises.length === 0 && (
        <p className="muted">No active exercises. Add some in the Routine tab.</p>
      )}

      {bySlot.map(([slot, exs]) => (
        <section key={slot} className="slot">
          <h2>{slot}</h2>
          {exs.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} log={logFor(ex)} onChange={(m) => update(ex, m)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ExerciseCard({
  exercise,
  log,
  onChange,
}: {
  exercise: Exercise;
  log: ExerciseLog;
  onChange: (mutate: (log: ExerciseLog) => ExerciseLog) => void;
}) {
  const pct = exerciseCompletion(log);
  const suffix = unitLabel(exercise.unit);

  const toggleSet = (i: number) =>
    onChange((l) => {
      const sets = l.sets.map((s, idx) => (idx === i ? { ...s, completed: !s.completed } : s));
      return { ...l, sets };
    });

  const setAmount = (i: number, amount: number) =>
    onChange((l) => {
      const sets = l.sets.map((s, idx) => (idx === i ? { ...s, actualAmount: amount } : s));
      return { ...l, sets };
    });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <strong>{exercise.name}</strong>
          <div className="muted small">
            {exercise.plannedSets} × {exercise.plannedAmount} {suffix}
            {exercise.note ? ` · ${exercise.note}` : ""}
            {exercise.equipment && exercise.equipment !== "None" ? ` · ${exercise.equipment}` : ""}
          </div>
        </div>
        <span className={`pct ${pct >= 0.5 ? "good" : pct > 0 ? "mid" : "zero"}`}>
          {formatPercent(pct)}
        </span>
      </div>
      <div className="sets">
        {log.sets.map((s, i) => (
          <div key={i} className={s.completed ? "setpill done" : "setpill"}>
            <button className="check" onClick={() => toggleSet(i)} aria-label={`Toggle set ${i + 1}`}>
              {s.completed ? "✓" : i + 1}
            </button>
            <input
              type="number"
              min={0}
              value={s.actualAmount}
              onChange={(e) => setAmount(i, Number(e.target.value))}
              aria-label={`Set ${i + 1} amount`}
            />
            <span className="suffix">{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupBySlot(exercises: Exercise[]): [string, Exercise[]][] {
  const map = new Map<string, Exercise[]>();
  for (const e of exercises) {
    const arr = map.get(e.timeSlot) ?? [];
    arr.push(e);
    map.set(e.timeSlot, arr);
  }
  return [...map.entries()];
}

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return todayISO(dt);
}
