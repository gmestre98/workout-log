import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { getDay, saveDay, subscribeSync, getSyncState, type SyncState } from "../dayStore";
import type { DayLog, Exercise, ExerciseLog, RoutineVersion, VersionAssignment } from "../types";
import {
  addDaysISO, computeStreak, dayCompletion, dayHeader, effectiveVersionId, exerciseCompletion,
  formatPercent, newLog, routineForDate, setMeta, slotColor, todayISO,
} from "../format";
import { Ring } from "./Ring";
import { LogSheet } from "./LogSheet";
import { WorkoutClock } from "./WorkoutClock";
import { ConfirmDialog } from "./Modal";
import { ProfileMenu } from "./ProfileMenu";
import { IconCheck, IconPlus } from "./icons";

const today = todayISO();
const dayHasActivity = (d: DayLog) =>
  Object.values(d.exercises).some((l) => l.sets.some((s) => s.completed));

// The status word under the day's completion percentage. It doubles as the
// offline-sync indicator: a queued edit reads "Will sync" until it reaches the
// server, so the user knows their offline logging is safe and pending.
function syncLabel(saving: boolean, sync: SyncState): string {
  if (sync.pending > 0 && !sync.online) return "Will sync";
  if (saving || sync.syncing) return "Saving…";
  return "Complete";
}

export function Today({ email }: { email: string }) {
  const [date, setDate] = useState(today);
  const [profileOpen, setProfileOpen] = useState(false);
  const [liveExercises, setLiveExercises] = useState<Exercise[]>([]);
  const [day, setDay] = useState<DayLog | null>(null);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<VersionAssignment[]>([]);
  const [versions, setVersions] = useState<RoutineVersion[]>([]);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sync, setSync] = useState(getSyncState());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect the offline sync queue in the status line.
  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    if (!sync.syncing && sync.pending === 0) setSaving(false);
  }, [sync.syncing, sync.pending]);

  // Streak history (once).
  useEffect(() => {
    api.listDays(addDaysISO(today, -90), today)
      .then((days) => {
        const set = new Set<string>();
        for (const d of days) if (dayHasActivity(d)) set.add(d.date);
        setActiveDates(set);
      })
      .catch(() => {});
  }, []);

  // Schedule + versions, to label which version applied to the viewed date.
  useEffect(() => {
    Promise.all([api.listSchedule(), api.listVersions()])
      .then(([sch, vs]) => { setSchedule(sch); setVersions(vs); })
      .catch(() => {});
  }, []);

  // Routine + selected day.
  useEffect(() => {
    let cancelled = false;
    setDay(null);
    setError("");
    Promise.all([api.listExercises(), getDay(date)])
      .then(([exs, d]) => {
        if (cancelled) return;
        setLiveExercises(exs);
        setDay(d);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => { cancelled = true; };
  }, [date]);

  // The routine shown for the viewed date: the version scheduled for that date
  // (so past days render against the routine that was actually in effect then),
  // falling back to the live routine for the current version or unscheduled days.
  const exercises = useMemo(
    () => routineForDate(date, schedule, versions, liveExercises).filter((e) => e.active),
    [date, schedule, versions, liveExercises]
  );

  const scheduleSave = useCallback((next: DayLog) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      // Local-first: the day is persisted to storage synchronously and pushed
      // to the server in the background, so an offline edit is never lost. The
      // streak dots can update immediately off the just-saved state.
      saveDay(next);
      if (next.date === today) {
        setActiveDates((prev) => {
          const s = new Set(prev);
          if (dayHasActivity(next)) s.add(today); else s.delete(today);
          return s;
        });
      }
    }, 600);
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
        const next: DayLog = { date, exercises: { ...base.exercises, [ex.id]: mutate(current) } };
        scheduleSave(next);
        return next;
      });
    },
    [date, scheduleSave]
  );

  // logSet marks the next incomplete set of ex as done with the given amount
  // (reps, or seconds/minutes held) and its timed duration in seconds. Used by
  // the exercise-bound timer to store a set directly. No-op once complete.
  const logSet = useCallback(
    (ex: Exercise, amount: number, seconds = 0) =>
      update(ex, (l) => {
        const i = l.sets.findIndex((s) => !s.completed);
        if (i < 0) return l;
        const sets = l.sets.map((s, k) => (k === i ? { completed: true, actualAmount: amount, seconds } : s));
        return { ...l, sets };
      }),
    [update]
  );

  const orderedSlots = useMemo(() => {
    const seen: string[] = [];
    for (const e of exercises) if (!seen.includes(e.timeSlot)) seen.push(e.timeSlot);
    return seen;
  }, [exercises]);

  const dayAvg = useMemo(() => dayCompletion(exercises, day ?? undefined), [exercises, day]);
  const streak = computeStreak(activeDates, today);
  const activeId = useMemo(
    () => exercises.find((e) => exerciseCompletion(logFor(e)) < 1)?.id,
    [exercises, logFor]
  );
  const doneCount = exercises.filter((e) => exerciseCompletion(logFor(e)) >= 1).length;
  const hdr = dayHeader(date);
  const sheetEx = exercises.find((e) => e.id === sheetFor) ?? null;
  const scheduledVersion = useMemo(() => {
    const id = effectiveVersionId(schedule, date);
    return id ? versions.find((v) => v.id === id) : undefined;
  }, [schedule, versions, date]);
  const scheduledLabel = scheduledVersion
    ? (scheduledVersion.note?.trim() || dayHeader(scheduledVersion.createdAt.slice(0, 10)).label)
    : "";

  return (
    <div className="screen-body">
      <div className="app-head">
        <div>
          <div className="subt">{hdr.dow} · {hdr.label}</div>
          <div className="title">Today</div>
        </div>
        <button className="avatar" title="Account" onClick={() => setProfileOpen(true)}>{(email.trim()[0] || "?").toUpperCase()}</button>
      </div>

      <div className="datebar">
        <button className="nav" onClick={() => setDate(addDaysISO(date, -1))} aria-label="Previous day">‹</button>
        <label className="disp" style={{ position: "relative", cursor: "pointer" }}>
          <span className="dow">{date === today ? "Today" : hdr.dow}</span><br />{hdr.label}
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Jump to a date"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer" }}
          />
        </label>
        <button className="nav" onClick={() => setDate(addDaysISO(date, 1))} aria-label="Next day" disabled={date >= today} style={date >= today ? { opacity: 0.4 } : undefined}>›</button>
      </div>

      {scheduledVersion && (
        <div className="sched-tag" title="Scheduled workout version for this date (label only)">
          <span className="dot" /> Version: <b>{scheduledLabel}</b>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div className="ring-wrap">
          <Ring value={dayAvg} label={date === today ? "Today" : "Day"} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13 }}>
            {streak > 0 && <div className="streakpill"><span>🔥</span><span className="num">{streak}</span>-day streak</div>}
            <div style={{ display: "flex", gap: 18 }}>
              <div className="kv"><span className="n num">{doneCount}/{exercises.length}</span><span className="l">Exercises</span></div>
              <div className="kv"><span className="n num">{formatPercent(dayAvg)}</span><span className="l">{syncLabel(saving, sync)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {date === today && exercises.length > 0 && (
        <WorkoutClock date={today} exercises={exercises} logFor={logFor} onLogSet={logSet} />
      )}

      {error && <p className="error">{error}</p>}
      {!day && !error && <p className="empty">Loading…</p>}
      {day && exercises.length === 0 && <p className="empty">No active exercises yet. Add some in the Routine tab.</p>}

      {orderedSlots.map((slot) => {
        const slotExs = exercises.filter((e) => e.timeSlot === slot);
        const color = slotColor(slot, orderedSlots);
        const slotAvg = slotExs.reduce((a, e) => a + exerciseCompletion(logFor(e)), 0) / slotExs.length;
        return (
          <div key={slot}>
            <div className="slot-head">
              <div className="lft" style={{ color: `var(--${color})` }}>
                <span className="slot-dot" style={{ background: `var(--${color})` }} />
                <span className="slot-title">{slot}</span>
              </div>
              <span className="slot-prog">{slotAvg >= 1 ? "done" : `${formatPercent(slotAvg)}`}</span>
            </div>
            {slotExs.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                log={logFor(ex)}
                active={ex.id === activeId}
                onOpen={() => setSheetFor(ex.id)}
              />
            ))}
          </div>
        );
      })}

      <div className="scroll-pad" />

      {activeId && (
        <button className="fab" onClick={() => setSheetFor(activeId)} aria-label="Log current exercise"><IconPlus /></button>
      )}

      {sheetEx && (
        <LogSheet
          exercise={sheetEx}
          log={logFor(sheetEx)}
          date={date}
          onChange={(m) => update(sheetEx, m)}
          onClose={() => setSheetFor(null)}
        />
      )}

      {profileOpen && (
        <ProfileMenu
          email={email}
          onClose={() => setProfileOpen(false)}
          onSignOut={() => { setProfileOpen(false); setSigningOut(true); }}
        />
      )}

      {signingOut && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll need to sign in with Google again to track your workouts."
          confirmLabel="Sign out"
          danger
          onConfirm={() => api.logout().then(() => location.reload())}
          onCancel={() => setSigningOut(false)}
        />
      )}
    </div>
  );
}

function ExerciseCard({
  exercise, log, active, onOpen,
}: { exercise: Exercise; log: ExerciseLog; active: boolean; onOpen: () => void }) {
  const pct = exerciseCompletion(log);
  return (
    <button className={`card ex ${active ? "active" : ""}`} onClick={onOpen} style={{ width: "100%", textAlign: "left" }}>
      <div className="ex-top">
        <div>
          <div className="ex-name">{exercise.name}</div>
          <div className="ex-meta">
            {exercise.plannedSets} × {exercise.plannedAmount} {exercise.unit === "reps" ? "" : exercise.unit === "seconds" ? "s" : "min"}
            {exercise.perSide ? " · per side" : ""}
            {exercise.note ? ` · ${exercise.note}` : ""}
            {active ? " · Now" : ""}
          </div>
        </div>
        <div className={`ex-pct num ${pct >= 1 ? "g" : pct > 0 ? "a" : "z"}`}>{formatPercent(pct)}</div>
      </div>
      <div className="sets">
        {log.sets.map((s, i) => {
          const cls = s.completed ? (s.actualAmount < exercise.plannedAmount ? "part" : "done") : "";
          const side = setMeta(i, exercise.perSide).side;
          return (
            <span key={i} className={`setchip ${cls}`}>
              {side && <span className="side">{side}</span>}
              {s.completed && s.actualAmount >= exercise.plannedAmount ? <IconCheck /> : null}
              {s.completed ? s.actualAmount : exercise.plannedAmount}
            </span>
          );
        })}
      </div>
    </button>
  );
}
