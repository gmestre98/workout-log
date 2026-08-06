import { useEffect, useRef, useState } from "react";
import type { Exercise, ExerciseLog } from "../types";
import { useWorkoutClock, workoutClock } from "../timer";
import { exerciseCompletion, formatDuration, setMeta, unitLabel } from "../format";
import { toast } from "../toast";
import { ConfirmDialog } from "./Modal";
import { IconTimer } from "./icons";

const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

// WorkoutClock is the exercise-bound session timer for today's workout. You pick
// the exercise from the dropdown; the big timer stopwatches the current set, and
// "Log set" stores it straight into that exercise's day log. The session below
// splits into Training time (while a set is being timed) and Rest time (all
// other time once started); "Pause workout" freezes both so you can stop and
// finish later the same day without inflating your rest.
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
  const paused = session.paused;
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [confirmReset, setConfirmReset] = useState(false);

  // Per-set stopwatch, which drives the session's training time.
  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const [, tick] = useState(0);

  // Editable reps for rep-based exercises; null means "use planned".
  const [reps, setReps] = useState<number | null>(null);

  // Visual between-set countdown (the session clock counts rest on its own).
  const [restLeft, setRestLeft] = useState<number | null>(null);

  const firstIncomplete = exercises.find((e) => exerciseCompletion(logFor(e)) < 1);
  const selected = exercises.find((e) => e.id === selectedId) ?? firstIncomplete ?? exercises[0];
  const selectedKey = selected?.id;

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

  // Between-set countdown.
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      return;
    }
    const t = setTimeout(() => setRestLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  if (!selected) return null;

  const setElapsedMs =
    accumRef.current + (running && startRef.current !== null ? Date.now() - startRef.current : 0);

  const freezeSet = () => {
    accumRef.current = setElapsedMs;
    startRef.current = null;
    setRunning(false);
  };

  const startSet = () => {
    setRestLeft(null);
    if (running) return;
    startRef.current = Date.now();
    setRunning(true);
    workoutClock.startTraining(date); // training time accrues; resumes if paused
  };

  const pauseSet = () => {
    if (!running) return;
    freezeSet();
    workoutClock.stopTraining(date); // stop timing this set → resting
  };

  const pauseWorkout = () => {
    if (running) freezeSet();
    setRestLeft(null);
    workoutClock.pauseWorkout(date);
  };

  const startWorkout = () => workoutClock.startWorkout(date);

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

    // Reset the set stopwatch and move the session into its resting phase.
    accumRef.current = 0;
    startRef.current = null;
    setRunning(false);
    setReps(null);
    workoutClock.stopTraining(date);

    const willBeDone = doneCount + 1 >= totalSets;
    if (!willBeDone && selected.restSeconds > 0) setRestLeft(selected.restSeconds);
    if (willBeDone) {
      toast(`${selected.name} done!`);
      const next = exercises.find((e) => e.id !== selected.id && exerciseCompletion(logFor(e)) < 1);
      if (next) setSelectedId(next.id);
    }
  };

  const doReset = () => {
    setRestLeft(null);
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

  const total = Math.max(session.totalMs, 1);
  const trainPct = (session.trainingMs / total) * 100;

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
          <button className="pillbadge rest-skip" onClick={() => setRestLeft(null)}>Skip</button>
        </div>
      )}

      <button className="btn primary block" style={{ marginTop: 12 }} onClick={logSet} disabled={allDone || paused}>
        {logLabel}
      </button>

      {/* Session summary: overall time split into training vs rest */}
      <div className="clock-summary">
        <div className="clock-sum-top">
          <div>
            <span className="clock-lab">{paused ? "Workout paused" : "Workout time"}</span>
            <div className="clock-total-big num">{formatDuration(session.totalMs)}</div>
          </div>
          {paused ? (
            <button className="clock-btn primary" onClick={startWorkout}>
              <span className="clock-ic" aria-hidden="true">▶</span>Resume
            </button>
          ) : session.started ? (
            <button className="clock-btn" onClick={pauseWorkout}>
              <span className="clock-ic" aria-hidden="true">❙❙</span>Pause workout
            </button>
          ) : (
            <button className="clock-btn primary" onClick={startWorkout}>
              <span className="clock-ic" aria-hidden="true">▶</span>Start workout
            </button>
          )}
        </div>
        <div className={`clock-bar ${paused ? "paused" : ""}`}>
          <span className="fill train" style={{ width: `${trainPct}%` }} />
        </div>
        <div className="clock-bar-legend">
          <span className="lg"><i className="dot train" />Training <b className="num">{formatDuration(session.trainingMs)}</b></span>
          <span className="lg"><i className="dot rest" />Rest <b className="num">{formatDuration(session.restMs)}</b></span>
        </div>
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button className="link" onClick={() => setConfirmReset(true)} disabled={!session.started && setElapsedMs === 0}>
            Reset timers
          </button>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset timers?"
          message="This clears the workout Total, Training and Rest times and the current set stopwatch for today. Your logged sets are not affected."
          confirmLabel="Reset"
          danger
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
