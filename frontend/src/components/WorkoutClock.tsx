import { useEffect, useRef, useState } from "react";
import type { Exercise, ExerciseLog } from "../types";
import { setClock, useSetClock, useWorkoutClock, workoutClock } from "../timer";
import { exerciseCompletion, formatDuration, setMeta, unitLabel } from "../format";
import { toast } from "../toast";
import { playRestDone, playSetDone } from "../sound";
import { ConfirmDialog } from "./Modal";
import { IconTimer } from "./icons";

const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

// WorkoutClock is the exercise-bound session timer for today's workout. You pick
// the exercise from the dropdown; the big timer stopwatches the current set, and
// "Log set" stores it straight into that exercise's day log. The session below
// splits into Training time (while a set is being timed) and Rest time (all
// other time once started); "Pause workout" freezes both so you can stop and
// finish later the same day without inflating your rest.
//
// All timer state lives in the persisted stores in ../timer (session + per-set
// stopwatch), so a running timer survives navigating away and a full reload.
export function WorkoutClock({
  date,
  exercises,
  logFor,
  onLogSet,
  externalTrainingMs = 0,
  externalRestMs = 0,
}: {
  date: string;
  exercises: Exercise[];
  logFor: (ex: Exercise) => ExerciseLog;
  onLogSet: (ex: Exercise, amount: number, seconds: number) => void;
  // Workout time recorded on other devices (e.g. the watch) for this day, folded
  // into the totals shown here so the session adds up across devices.
  externalTrainingMs?: number;
  externalRestMs?: number;
}) {
  const session = useWorkoutClock(date);
  const paused = session.paused;
  const { state: set, elapsedMs: setElapsedMs, restLeft } = useSetClock(date);
  const running = set.running;
  const [confirmReset, setConfirmReset] = useState(false);

  const firstIncomplete = exercises.find((e) => exerciseCompletion(logFor(e)) < 1);
  const selected = exercises.find((e) => e.id === set.exerciseId) ?? firstIncomplete ?? exercises[0];

  // Chime once when a timed set first reaches its target duration.
  useEffect(() => {
    if (!running || set.beeped || !selected || selected.unit === "reps") return;
    const target = selected.plannedAmount * (selected.unit === "minutes" ? 60000 : 1000);
    if (target > 0 && setElapsedMs >= target) {
      setClock.markBeeped(date);
      playSetDone();
    }
  }, [setElapsedMs, running, set.beeped, selected, date]);

  // Chime when the rest countdown reaches zero on its own (not skipped/expired
  // during a reload), then clear it.
  const prevRest = useRef(restLeft);
  useEffect(() => {
    if (restLeft === 0) {
      if (prevRest.current !== null && prevRest.current > 0) playRestDone();
      setClock.clearRest(date);
    }
    prevRest.current = restLeft;
  }, [restLeft, date]);

  if (!selected) return null;

  const startSet = () => {
    setClock.select(date, selected.id); // pin the tracked exercise (no-op if same)
    setClock.start(date);
    workoutClock.startTraining(date); // training time accrues; resumes if paused
  };

  const pauseSet = () => {
    setClock.pause(date);
    workoutClock.stopTraining(date); // stop timing this set → resting
  };

  const pauseWorkout = () => {
    setClock.pauseWorkout(date);
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
  const repVal = set.reps ?? selected.plannedAmount;

  const logSet = () => {
    if (allDone) return;
    const elapsedSecs = Math.round(setElapsedMs / 1000);
    let amount: number;
    if (unit === "reps") {
      amount = repVal;
    } else if (setElapsedMs === 0) {
      amount = selected.plannedAmount; // logged without timing → assume planned
    } else {
      amount = unit === "minutes" ? Math.max(1, Math.round(elapsedSecs / 60)) : elapsedSecs;
    }
    onLogSet(selected, amount, elapsedSecs);

    const willBeDone = doneCount + 1 >= totalSets;
    // Reset the set stopwatch and start the between-set rest (unless now done).
    setClock.logged(date, willBeDone ? 0 : selected.restSeconds);
    workoutClock.stopTraining(date);

    if (willBeDone) {
      toast(`${selected.name} done!`);
      const next = exercises.find((e) => e.id !== selected.id && exerciseCompletion(logFor(e)) < 1);
      if (next) setClock.select(date, next.id);
    }
  };

  const doReset = () => {
    setClock.reset(date);
    workoutClock.reset(date);
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

  // Fold in time recorded on other devices (the watch) so the figures reflect
  // the whole day's session, not just what this browser stopwatched.
  const trainingMs = session.trainingMs + externalTrainingMs;
  const restMs = session.restMs + externalRestMs;
  const totalMs = trainingMs + restMs;
  const total = Math.max(totalMs, 1);
  const trainPct = (trainingMs / total) * 100;
  const runningWorkout = session.training || session.resting;
  const workoutState = paused
    ? "Workout stopped"
    : session.training
      ? "Workout · in a set"
      : session.resting
        ? "Workout · resting"
        : "Workout time";

  return (
    <div className="card clock">
      <div className="clock-ex">
        <select
          className="clock-select"
          value={selected.id}
          onChange={(e) => setClock.select(date, e.target.value)}
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
              <span className="clock-ic" aria-hidden="true">❙❙</span>Pause set
            </button>
          ) : (
            <button className="clock-btn primary" onClick={startSet} disabled={allDone} aria-label="Start set timer">
              <span className="clock-ic" aria-hidden="true">▶</span>{setElapsedMs > 0 ? "Resume set" : "Start set"}
            </button>
          )}
        </div>
      </div>

      {!isTime && !allDone && (
        <div className="clock-reps">
          <span className="clock-reps-lab">Reps this set</span>
          <div className="stepper">
            <button className="stepbtn" onClick={() => setClock.setReps(date, Math.max(0, repVal - 1))} aria-label="Fewer reps">–</button>
            <span className="stepval">{repVal}</span>
            <button className="stepbtn" onClick={() => setClock.setReps(date, repVal + 1)} aria-label="More reps">+</button>
          </div>
        </div>
      )}

      {restLeft !== null && restLeft > 0 && (
        <div className="clock-rest">
          <span className="clock-rest-ic"><IconTimer /></span>
          <span className="clock-rest-txt">Rest · <span className="num">{mmss(restLeft)}</span></span>
          <button className="pillbadge rest-skip" onClick={() => setClock.clearRest(date)}>Skip</button>
        </div>
      )}

      <button className="btn primary block" style={{ marginTop: 12 }} onClick={logSet} disabled={allDone || paused}>
        {logLabel}
      </button>

      {/* Session summary: overall time split into training vs rest */}
      <div className="clock-summary">
        <div className="clock-sum-top">
          <div>
            <span className="clock-lab">{workoutState}</span>
            <div className="clock-total-big num">{formatDuration(totalMs)}</div>
          </div>
          {runningWorkout ? (
            <button className="clock-btn" onClick={pauseWorkout}>
              <span className="clock-ic" aria-hidden="true">■</span>Stop workout
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
          <span className="lg"><i className="dot train" />Work <b className="num">{formatDuration(trainingMs)}</b></span>
          <span className="lg"><i className="dot rest" />Rest <b className="num">{formatDuration(restMs)}</b></span>
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
          message="This clears the workout Total, Work and Rest times and the current set stopwatch for today. Your logged sets are not affected."
          confirmLabel="Reset"
          danger
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
