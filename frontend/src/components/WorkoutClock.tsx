import { useState } from "react";
import { useWorkoutClock, workoutClock } from "../timer";
import { formatDuration } from "../format";
import { ConfirmDialog } from "./Modal";

// WorkoutClock is the live session timer for today's workout. It shows overall
// workout time and splits it into active (performance) vs rest time. Rest is
// accumulated automatically as between-set rest countdowns run in the LogSheet.
export function WorkoutClock({ date }: { date: string }) {
  const t = useWorkoutClock(date);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="card clock">
      <div className="clock-main">
        <div className="clock-total">
          <span className="clock-lab">{t.resting ? "Resting" : t.running ? "Workout time" : "Total time"}</span>
          <span className="clock-big num">{formatDuration(t.totalMs)}</span>
        </div>
        <div className="clock-actions">
          {t.running ? (
            <button className="clock-btn" onClick={() => workoutClock.pause(date)} aria-label="Pause workout">
              <span className="clock-ic" aria-hidden="true">❙❙</span>Pause
            </button>
          ) : (
            <button className="clock-btn primary" onClick={() => workoutClock.start(date)} aria-label={t.started ? "Resume workout" : "Start workout"}>
              <span className="clock-ic" aria-hidden="true">▶</span>{t.started ? "Resume" : "Start"}
            </button>
          )}
          {t.started && (
            <button className="clock-btn ghost" onClick={() => setConfirmReset(true)} aria-label="Reset workout timer">Reset</button>
          )}
        </div>
      </div>

      <div className="clock-split">
        <div className="clock-seg">
          <span className="clock-seg-n num a">{formatDuration(t.activeMs)}</span>
          <span className="clock-seg-l">Active</span>
        </div>
        <div className="clock-seg">
          <span className="clock-seg-n num">{formatDuration(t.restMs)}</span>
          <span className="clock-seg-l">Rest</span>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset timer?"
          message="This clears the workout, active and rest times for today. Your logged sets are not affected."
          confirmLabel="Reset"
          danger
          onConfirm={() => { workoutClock.reset(date); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
