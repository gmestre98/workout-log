import { useEffect, useState } from "react";
import type { Exercise, ExerciseLog } from "../types";
import { exerciseCompletion, formatPercent, setAllSets, unitLabel } from "../format";
import { IconCheck, IconTimer } from "./icons";

export function LogSheet({
  exercise,
  log,
  onChange,
  onClose,
}: {
  exercise: Exercise;
  log: ExerciseLog;
  onChange: (mutate: (log: ExerciseLog) => ExerciseLog) => void;
  onClose: () => void;
}) {
  const suffix = unitLabel(exercise.unit);
  const pct = exerciseCompletion(log);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const firstIncomplete = log.sets.findIndex((s) => !s.completed);
  const allDone = log.sets.length > 0 && log.sets.every((s) => s.completed);
  const toggleAll = () => onChange((l) => setAllSets(l, !allDone));

  // Rest countdown; starts when a set is completed and restSeconds > 0.
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      return;
    }
    const t = setTimeout(() => setRestLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  const toggle = (i: number) => {
    let willComplete = false;
    onChange((l) => {
      willComplete = !l.sets[i].completed;
      const sets = l.sets.map((s, idx) => (idx === i ? { ...s, completed: !s.completed } : s));
      return { ...l, sets };
    });
    if (willComplete && exercise.restSeconds > 0) setRestLeft(exercise.restSeconds);
  };

  const bump = (i: number, delta: number) =>
    onChange((l) => {
      const sets = l.sets.map((s, idx) =>
        idx === i ? { ...s, actualAmount: Math.max(0, s.actualAmount + delta) } : s
      );
      return { ...l, sets };
    });

  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Log ${exercise.name}`}>
        <div className="sheet-grabber" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 2px 4px" }}>
          <div>
            <div className="ex-name" style={{ fontSize: 18 }}>{exercise.name}</div>
            <div className="ex-meta">
              {exercise.muscleGroup}
              {exercise.restSeconds > 0 ? ` · ${exercise.restSeconds}s rest` : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className={`ex-pct num ${pct >= 1 ? "g" : pct > 0 ? "a" : "z"}`} style={{ fontSize: 21 }}>
              {formatPercent(pct)}
            </div>
            <button className="link" style={{ padding: 0 }} onClick={toggleAll}>
              {allDone ? "Clear all" : "Mark all done"}
            </button>
          </div>
        </div>

        {restLeft !== null && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", margin: "13px 0", background: "var(--bg)" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--ember) 15%, transparent)", color: "var(--ember)" }}>
              <IconTimer />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 730, fontSize: 15 }}>Rest · <span className="num">{mmss(restLeft)}</span></div>
              <div className="tiny muted">Next set coming up</div>
            </div>
            <button className="pillbadge" style={{ background: "color-mix(in srgb, var(--ember) 13%, transparent)", color: "var(--ember)", border: "none" }} onClick={() => setRestLeft(null)}>Skip</button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: restLeft === null ? 13 : 0 }}>
          {log.sets.map((s, i) => {
            const active = i === firstIncomplete;
            return (
              <div key={i} className={`setrow ${s.completed ? "done" : active ? "active" : ""}`}>
                <button
                  className={`setchip ${s.completed ? "done" : ""}`}
                  style={{ width: 32, minWidth: 32, height: 32 }}
                  onClick={() => toggle(i)}
                  aria-label={`Toggle set ${i + 1}`}
                >
                  {s.completed ? <IconCheck /> : i + 1}
                </button>
                <span className="lbl">Set {i + 1}</span>
                <div className="stepper">
                  <button className="stepbtn" onClick={() => bump(i, -1)} aria-label="Decrease reps">–</button>
                  <span className="stepval">{s.actualAmount}</span>
                  <button className="stepbtn" onClick={() => bump(i, 1)} aria-label="Increase reps">+</button>
                  <span className="tiny muted" style={{ width: 26 }}>{suffix}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn primary block" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
      </div>
    </>
  );
}
