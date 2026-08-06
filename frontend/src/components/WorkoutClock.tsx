import { useEffect, useRef, useState } from "react";
import type { Exercise, ExerciseLog } from "../types";
import { useWorkoutClock, workoutClock } from "../timer";
import { exerciseCompletion, formatDuration, setMeta, unitLabel } from "../format";
import { toast } from "../toast";
import { ConfirmDialog } from "./Modal";
import { IconTimer } from "./icons";

const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

// WorkoutClock is the exercise-bound session timer for today's workout. You pick
// the exercise you're doing from the dropdown; the big timer stopwatches the
// current set, and "Log set" stores it straight into that exercise's day log —
// the elapsed time for time-based moves (Plank, Hollow hold…) or the rep count
// for rep-based ones. Overall Total / Active / Rest keep accumulating for the
// whole session, with rest fed automatically by the between-set countdown.
export function WorkoutClock({
  date,
  exercises,
  logFor,
  onLogSet,
}: {
  date: string;
  exercises: Exercise[];
  logFor: (ex: Exercise) => ExerciseLog;
  onLogSet: (ex: Exercise, amount: number) => void;
}) {
  const session = useWorkoutClock(date);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [confirmReset, setConfirmReset] = useState(false);

  // Per-set stopwatch, independent of the session clock.
  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const [, tick] = useState(0);

  // Editable reps for rep-based exercises; null means "use planned".
  const [reps, setReps] = useState<number | null>(null);

  // Rest countdown after logging a set.
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const resting = useRef(false);

  // Default the tracked exercise to the first one that isn't finished yet, so
  // it follows your progress until you pick a specific one.
  const firstIncomplete = exercises.find((e) => exerciseCompletion(logFor(e)) < 1);
  const selected = exercises.find((e) => e.id === selectedId) ?? firstIncomplete ?? exercises[0];
  const selectedKey = selected?.id;

  // Ends the current rest segment (countdown elapsed or skipped) and folds it
  // into the session clock. Defined before the effects that reference it.
  const endRest = () => {
    setRestLeft(null);
    if (resting.current) {
      resting.current = false;
      workoutClock.stopRest(date);
      workoutClock.pause(date); // idle until the next set starts
    }
  };

  // Reset the per-set stopwatch whenever the tracked exercise changes.
  useEffect(() => {
    accumRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setReps(null);
  }, [selectedKey]);

  // Tick the set stopwatch display while it runs.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);

  // Rest countdown between sets.
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) {
      endRest();
      return;
    }
    const t = setTimeout(() => setRestLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restLeft]);

  // Fold any open rest into the session clock if the card unmounts mid-rest.
  useEffect(() => () => { if (resting.current) workoutClock.stopRest(date); }, [date]);

  if (!selected) return null;

  const setElapsedMs =
    accumRef.current + (running && startRef.current !== null ? Date.now() - startRef.current : 0);

  const startSet = () => {
    endRest();
    if (running) return;
    startRef.current = Date.now();
    setRunning(true);
    workoutClock.start(date);
  };

  const pauseSet = () => {
    if (!running) return;
    accumRef.current = setElapsedMs;
    startRef.current = null;
    setRunning(false);
    workoutClock.pause(date);
  };

  const log = logFor(selected);
  const doneCount = log.sets.filter((s) => s.completed).length;
  const totalSets = log.sets.length;
  const allDone = totalSets > 0 && doneCount >= totalSets;
  const unit = selected.unit;
  const isTime = unit !== "reps";
  const targetMs = selected.plannedAmount * (unit === "minutes" ? 60000 : 1000);
  const targetReached = isTime && setElapsedMs >= targetMs;
  const repVal = reps ?? selected.plannedAmount;

  const logSet = () => {
    if (allDone) return;
    let amount: number;
    if (unit === "reps") {
      amount = repVal;
    } else if (setElapsedMs === 0) {
      amount = selected.plannedAmount; // logged without timing → assume planned
    } else {
      const secs = Math.round(setElapsedMs / 1000);
      amount = unit === "minutes" ? Math.max(1, Math.round(secs / 60)) : secs;
    }
    onLogSet(selected, amount);

    // Reset the set stopwatch for the next set.
    accumRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setReps(null);

    const willBeDone = doneCount + 1 >= totalSets;
    if (!willBeDone && selected.restSeconds > 0) {
      resting.current = true;
      workoutClock.startRest(date);
      setRestLeft(selected.restSeconds);
    } else {
      workoutClock.pause(date);
    }
    if (willBeDone) {
      toast(`${selected.name} done!`);
      const next = exercises.find((e) => e.id !== selected.id && exerciseCompletion(logFor(e)) < 1);
      if (next) setSelectedId(next.id);
    }
  };

  const doReset = () => {
    endRest();
    workoutClock.reset(date);
    accumRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setReps(null);
    setConfirmReset(false);
  };

  const currentSetNo = Math.min(doneCount + 1, totalSets);
  const nextIdx = log.sets.findIndex((s) => !s.completed);
  const nextMeta = setMeta(nextIdx < 0 ? totalSets - 1 : nextIdx, selected.perSide);
  const logWord = nextMeta.side ? (nextMeta.side === "L" ? "Left" : "Right") : "set";
  const logLabel = allDone
    ? "Exercise complete"
    : isTime
      ? `Log ${logWord}${setElapsedMs > 0 ? ` · ${formatDuration(setElapsedMs)}` : ""}`
      : `Log ${logWord} · ${repVal} ${unitLabel(unit)}`;

  return (
    <div className="card clock">
      <div className="clock-ex">
        <select
          className="clock-select"
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Exercise to track"
        >
          {exercises.map((e) => {
            const l = logFor(e);
            const d = l.sets.filter((s) => s.completed).length;
            return (
              <option key={e.id} value={e.id}>
                {e.name} ({d}/{l.sets.length})
              </option>
            );
          })}
        </select>
        <span className="clock-setno num">{currentSetNo}/{totalSets}</span>
      </div>

      <div className="clock-main">
        <div className="clock-total">
          <span className="clock-lab">
            {allDone ? "All sets done" : `${nextMeta.label} · target ${selected.plannedAmount} ${unitLabel(unit)}`}
          </span>
          <span className={`clock-big num ${targetReached ? "g" : ""}`}>{formatDuration(setElapsedMs)}</span>
        </div>
        <div className="clock-actions">
          {running ? (
            <button className="clock-btn" onClick={pauseSet} aria-label="Pause set timer">
              <span className="clock-ic" aria-hidden="true">❙❙</span>Pause
            </button>
          ) : (
            <button className="clock-btn primary" onClick={startSet} disabled={allDone} aria-label="Start set timer">
              <span className="clock-ic" aria-hidden="true">▶</span>{setElapsedMs > 0 ? "Resume" : "Start"}
            </button>
          )}
        </div>
      </div>

      {!isTime && !allDone && (
        <div className="clock-reps">
          <span className="clock-reps-lab">Reps this set</span>
          <div className="stepper">
            <button className="stepbtn" onClick={() => setReps(Math.max(0, repVal - 1))} aria-label="Fewer reps">–</button>
            <span className="stepval">{repVal}</span>
            <button className="stepbtn" onClick={() => setReps(repVal + 1)} aria-label="More reps">+</button>
          </div>
        </div>
      )}

      {restLeft !== null && (
        <div className="clock-rest">
          <span className="clock-rest-ic"><IconTimer /></span>
          <span className="clock-rest-txt">Rest · <span className="num">{mmss(restLeft)}</span></span>
          <button className="pillbadge rest-skip" onClick={endRest}>Skip</button>
        </div>
      )}

      <button className="btn primary block" style={{ marginTop: 12 }} onClick={logSet} disabled={allDone}>
        {logLabel}
      </button>

      <div className="clock-split">
        <div className="clock-seg">
          <span className="clock-seg-n num a">{formatDuration(session.activeMs)}</span>
          <span className="clock-seg-l">Active</span>
        </div>
        <div className="clock-seg">
          <span className="clock-seg-n num">{formatDuration(session.restMs)}</span>
          <span className="clock-seg-l">Rest</span>
        </div>
        <div className="clock-seg">
          <span className="clock-seg-n num">{formatDuration(session.totalMs)}</span>
          <span className="clock-seg-l">Total</span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 6 }}>
        <button className="link" onClick={() => setConfirmReset(true)} disabled={!session.started && setElapsedMs === 0}>
          Reset timers
        </button>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset timers?"
          message="This clears the session Total, Active and Rest times and the current set stopwatch for today. Your logged sets are not affected."
          confirmLabel="Reset"
          danger
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
