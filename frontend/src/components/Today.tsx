import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { getDay, saveDay, subscribeSync, getSyncState, type SyncState } from "../dayStore";
import type { DayLog, Exercise, ExerciseLog, RoutineVersion, VersionAssignment } from "../types";
import {
  addDaysISO, applyTravel, computeStreak, dayCompletion, dayHeader, dayOf, effectiveVersionId, exerciseCompletion,
  formatPercent, newLog, nextWorkoutDay, orderedWorkoutDays, routineForDate, setMeta, slotColor, todayISO,
} from "../format";
import { getTravelMode, setTravelMode, getTravelOff, setTravelOff } from "../travel";
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
  // Which workout day was performed on each recent date, for the rotation
  // default. Built from the same recent-days fetch that feeds the streak.
  const [workoutDayByDate, setWorkoutDayByDate] = useState<Map<string, string | undefined>>(new Map());
  // Manual override of the viewed date's workout day (the day switcher). Cleared
  // whenever the viewed date changes so each date starts from its own default.
  const [override, setOverride] = useState<string | null>(null);
  // Travel mode: a global switch (persisted on the device) that swaps every
  // exercise with a travel replacement for its variant. Already-logged days
  // instead honour the travel flag stamped on them, so history is authoritative.
  const [travelMode, setTravel] = useState(getTravelMode);
  // Device-local default set of exercises kept on their normal version while
  // travelling (see travel.ts). Drives unlogged days; a logged day instead uses
  // the set it was stamped with (day.travelOff).
  const [travelOffState, setTravelOffState] = useState(getTravelOff);
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

  // Streak history + recent workout days (once). The same fetch feeds the streak
  // dots and the rotation default (which workout day was last performed).
  useEffect(() => {
    api.listDays(addDaysISO(today, -90), today)
      .then((days) => {
        const set = new Set<string>();
        const wd = new Map<string, string | undefined>();
        for (const d of days) {
          if (dayHasActivity(d)) set.add(d.date);
          wd.set(d.date, d.workoutDay);
        }
        setActiveDates(set);
        setWorkoutDayByDate(wd);
      })
      .catch(() => {});
  }, []);

  // Each viewed date starts from its own rotation default; drop any manual pick.
  useEffect(() => setOverride(null), [date]);

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

  // The routine in effect for the viewed date: the version scheduled for that
  // date (so past days render against the routine that was actually in effect
  // then), falling back to the live routine for the current version or
  // unscheduled days.
  const routineExercises = useMemo(
    () => routineForDate(date, schedule, versions, liveExercises).filter((e) => e.active),
    [date, schedule, versions, liveExercises]
  );
  const orderedDays = useMemo(() => orderedWorkoutDays(routineExercises), [routineExercises]);

  // A legacy day (logged before rotation existed: has activity, no workoutDay)
  // keeps showing the whole routine as before. Every other date is a single
  // workout in the rotation.
  const legacy = !!day && !day.workoutDay && dayHasActivity(day);

  // The workout day shown for this date: a manual override (the day switcher),
  // else the one already stored on the day, else the rotation default — the day
  // after the most recently performed session.
  const rotationDefault = useMemo(
    () => nextWorkoutDay(workoutDayByDate, orderedDays, date),
    [workoutDayByDate, orderedDays, date]
  );
  // The chosen day must be one that still exists in the routine. A stored or
  // stamped workoutDay that no longer matches any day (e.g. logged under an
  // earlier model, or a since-renamed day) is ignored so we fall back to the
  // rotation default rather than filtering the list down to nothing.
  const validDay = (d?: string | null): d is string => !!d && orderedDays.includes(d);
  const selectedDay = legacy
    ? undefined
    : validDay(override) ? override
    : validDay(day?.workoutDay) ? day!.workoutDay
    : rotationDefault;

  // Exercises for the selected workout day (the subset in rotation mode, or the
  // whole routine on legacy days). If a stored workoutDay no longer matches any
  // exercise (label was renamed) but the day has logged work, show everything so
  // that history stays visible. These are the base exercises, before travel-mode
  // substitution.
  const dayExercises = useMemo(() => {
    if (legacy || !selectedDay) return routineExercises;
    const subset = routineExercises.filter((e) => dayOf(e) === selectedDay);
    if (subset.length === 0 && day && dayHasActivity(day)) return routineExercises;
    return subset;
  }, [legacy, selectedDay, routineExercises, day]);

  // Whether travel versions apply to the viewed date: an already-logged day
  // honours the travel flag it was stamped with; an unlogged day follows the
  // global travel switch. So past days always render as they were performed.
  const dayLogged = !!day && dayHasActivity(day);
  const useTravel = dayLogged ? !!day?.travel : travelMode;
  const travelCount = useMemo(
    () => dayExercises.filter((e) => e.travel && e.travel.name).length,
    [dayExercises]
  );
  // Which exercises are kept on their normal version this day: a logged day uses
  // the set it was stamped with; an unlogged day follows the device default.
  const offForDay = useMemo(
    () => (dayLogged ? new Set(day?.travelOff ?? []) : travelOffState),
    [dayLogged, day, travelOffState]
  );

  // Whether a given exercise runs as its travel variant on this day: day-level
  // travel is on and this one isn't individually opted out.
  const travelFor = useCallback(
    (id: string) => useTravel && !offForDay.has(id),
    [useTravel, offForDay]
  );

  // What's actually shown, logged and scored: each exercise swapped for its
  // travel variant when travel mode applies to it (kept under the same id, so
  // logs and scoring are unaffected).
  const exercises = useMemo(
    () => dayExercises.map((e) => applyTravel(e, travelFor(e.id))),
    [dayExercises, travelFor]
  );
  // How many are actually running as their travel version right now (travelCount
  // minus any individually kept on the normal version).
  const swappedCount = useMemo(
    () => dayExercises.filter((e) => e.travel?.name && travelFor(e.id)).length,
    [dayExercises, travelFor]
  );

  const scheduleSave = useCallback((next: DayLog) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      // Local-first: the day is persisted to storage synchronously and pushed
      // to the server in the background, so an offline edit is never lost. The
      // streak dots can update immediately off the just-saved state.
      saveDay(next);
      // Keep the rotation map current so the next session advances correctly.
      setWorkoutDayByDate((prev) => new Map(prev).set(next.date, next.workoutDay));
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
        // Stamp which workout day this session is (rotation mode) so the date
        // renders and scores as a single workout. Legacy days keep it empty.
        const workoutDay = legacy ? base.workoutDay : (selectedDay ?? base.workoutDay);
        // Stamp travel mode + which exercises were kept normal, so the day is
        // recorded as (and keeps rendering as) it was performed. ex is already the
        // effective exercise, so its log below snapshots the right numbers.
        const travelOff = [...offForDay];
        const next: DayLog = {
          date, workoutDay, travel: useTravel,
          ...(travelOff.length ? { travelOff } : {}),
          exercises: { ...base.exercises, [ex.id]: mutate(current) },
        };
        scheduleSave(next);
        return next;
      });
    },
    [date, scheduleSave, legacy, selectedDay, useTravel, offForDay]
  );

  // chooseDay switches which workout day this session is (the day switcher). It
  // persists the choice immediately — even before any set is logged — so the
  // pick sticks across reloads and drives the rotation.
  const chooseDay = useCallback(
    (d: string) => {
      setOverride(d);
      setDay((prev) => {
        const base = prev ?? { date, exercises: {} };
        if (base.workoutDay === d) return base;
        const next: DayLog = { ...base, date, workoutDay: d };
        scheduleSave(next);
        return next;
      });
    },
    [date, scheduleSave]
  );

  // chooseTravel flips travel mode. It updates the global switch, which persists
  // across days and reloads and drives the display of any not-yet-logged day (so
  // the swap takes effect immediately without writing an empty day record). An
  // already-logged day is instead re-stamped and saved, since its own flag — not
  // the global switch — is what its display follows.
  const chooseTravel = useCallback(
    (on: boolean) => {
      setTravelMode(on);
      setTravel(on);
      setDay((prev) => {
        if (!prev || !dayHasActivity(prev) || !!prev.travel === on) return prev;
        const next: DayLog = { ...prev, date, travel: on };
        scheduleSave(next);
        return next;
      });
    },
    [date, scheduleSave]
  );

  // toggleExerciseTravel flips one exercise between its travel and normal version
  // within a travel day. It updates the device default (so the choice carries to
  // the rest of the trip) and, on an already-logged day, re-stamps and saves that
  // day's opt-out set so its history keeps rendering as performed.
  const toggleExerciseTravel = useCallback(
    (id: string) => {
      const next = new Set(offForDay);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setTravelOffState(next);
      setTravelOff(next);
      setDay((prev) => {
        if (!prev || !dayHasActivity(prev)) return prev;
        const arr = [...next];
        const updated: DayLog = { ...prev, date, ...(arr.length ? { travelOff: arr } : { travelOff: [] }) };
        scheduleSave(updated);
        return updated;
      });
    },
    [date, scheduleSave, offForDay]
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
  // The per-exercise travel control shown in the open log sheet: offered only
  // while the day is in travel mode and this exercise has a travel replacement.
  const sheetBase = dayExercises.find((e) => e.id === sheetFor) ?? null;
  const sheetTravel = useTravel && sheetBase?.travel?.name
    ? {
        isTravel: travelFor(sheetBase.id),
        normalName: sheetBase.name,
        travelName: sheetBase.travel.name,
        onToggle: () => toggleExerciseTravel(sheetBase.id),
      }
    : undefined;
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

      {!legacy && orderedDays.length > 0 && (
        <div className="day-switch">
          <div className="day-switch-head">
            <span className="slot-title">Workout</span>
            {selectedDay && !day?.workoutDay && !override && <span className="tiny muted">next up</span>}
          </div>
          <div className="day-select-wrap">
            <select
              className="day-select"
              value={selectedDay ?? ""}
              onChange={(e) => chooseDay(e.target.value)}
              aria-label="Workout day"
            >
              {orderedDays.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span className="day-select-chev" aria-hidden>▾</span>
          </div>
        </div>
      )}

      {travelCount > 0 && (
        <label className={`travel-bar ${useTravel ? "on" : ""}`}>
          <span className="tb-ic" aria-hidden>✈</span>
          <span className="tb-txt">
            <span className="tb-title">Travel mode</span>
            <span className="tb-sub">
              {!useTravel
                ? `${travelCount} exercise${travelCount === 1 ? "" : "s"} have a travel version`
                : swappedCount === travelCount
                  ? `${travelCount} exercise${travelCount === 1 ? "" : "s"} on the travel version`
                  : `${swappedCount} of ${travelCount} on the travel version`}
            </span>
          </span>
          <span className="tb-switch" aria-hidden><span className="tb-knob" /></span>
          <input
            type="checkbox"
            className="tb-input"
            checked={useTravel}
            onChange={(e) => chooseTravel(e.target.checked)}
            aria-label="Travel mode"
          />
        </label>
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
                travel={travelFor(ex.id) && !!ex.travel?.name}
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
          travel={sheetTravel}
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
  exercise, log, active, travel, onOpen,
}: { exercise: Exercise; log: ExerciseLog; active: boolean; travel?: boolean; onOpen: () => void }) {
  const pct = exerciseCompletion(log);
  return (
    <button className={`card ex ${active ? "active" : ""}`} onClick={onOpen} style={{ width: "100%", textAlign: "left" }}>
      <div className="ex-top">
        <div>
          <div className="ex-name">{travel && <span className="ex-plane" aria-hidden>✈ </span>}{exercise.name}</div>
          <div className="ex-meta">
            {exercise.plannedSets} × {exercise.plannedAmount} {exercise.unit === "reps" ? "" : exercise.unit === "seconds" ? "s" : "min"}
            {exercise.perSide ? " · per side" : ""}
            {exercise.note ? ` · ${exercise.note}` : ""}
            {travel ? " · travel version" : ""}
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
