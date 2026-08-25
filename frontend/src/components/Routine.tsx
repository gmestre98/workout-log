import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Exercise, Unit } from "../types";
import { MUSCLE_GROUPS, EQUIPMENT_OPTIONS, UNITS } from "../types";
import { dayOf, orderedParts, orderedWorkoutDays, slotColor } from "../format";
import { toast } from "../toast";
import { useOnline } from "../useOnline";
import { ConfirmDialog, Modal } from "./Modal";
import { ReorderList } from "./Reorder";
import { DayBody } from "./DayBody";
import { ComboBox, ChipSelect } from "./Combo";
import { IconPlus } from "./icons";

type Draft = Omit<Exercise, "id"> & { id?: string };

// parseList splits a stored comma-joined field (muscleGroup / equipment) into
// the chip list. It breaks on top-level commas only, so a legacy parenthetical
// stays whole: "Back, Biceps" → ["Back", "Biceps"] but
// "Legs (Quads, Glutes)" → ["Legs (Quads, Glutes)"].
const parseList = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { const t = cur.trim(); if (t) out.push(t); cur = ""; }
    else cur += ch;
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
};

// distinctFrom collects the distinct entries used across the routine for a
// comma-joined field, so muscles/equipment you've added before resurface as
// suggestions on the next exercise.
const distinctFrom = (exercises: Exercise[], pick: (e: Exercise) => string): string[] => {
  const seen: string[] = [];
  for (const e of exercises) for (const v of parseList(pick(e))) if (!seen.includes(v)) seen.push(v);
  return seen;
};

// A blank exercise. workoutDay and timeSlot carry no baked-in default — the day
// is chosen (or created) in the form, and an empty timeSlot means the day has no
// time-of-day parts (a single flat workout).
const blank = (sortOrder: number, workoutDay = "", timeSlot = ""): Draft => ({
  workoutDay, timeSlot, name: "", plannedSets: 3, plannedAmount: 10,
  unit: "reps", note: "", restSeconds: 30, muscleGroup: "", equipment: "",
  sortOrder, active: true, perSide: false,
});

// A drag grip (six dots). Spread the reorder handle props onto it.
function Grip(props: React.HTMLAttributes<HTMLSpanElement> & { style?: React.CSSProperties }) {
  return <span className="grip" aria-hidden {...props}>⠿</span>;
}

export function Routine() {
  // Routine edits hit the server directly and can't be queued like day logs, so
  // while offline the whole editor is disabled to avoid making a change that
  // would be silently lost. `offline` gates every mutating control below.
  const online = useOnline();
  const offline = !online;
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [menuForDay, setMenuForDay] = useState<string | null>(null);
  const [renameDay, setRenameDay] = useState<string | null>(null);
  const [deleteDay, setDeleteDay] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listExercises()
      // Keep the array in sortOrder so display order == the drag order we persist.
      .then((exs) => setExercises([...exs].sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!draft || offline) return;
    try {
      if (draft.id) await api.updateExercise(draft as Exercise);
      else await api.createExercise({ ...draft, sortOrder: exercises.length });
      setDraft(null);
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  const remove = async (ex: Exercise) => {
    if (offline) return;
    try { await api.deleteExercise(ex.id); load(); }
    catch (e: any) { setError(String(e.message ?? e)); }
  };

  const days = useMemo(() => orderedWorkoutDays(exercises), [exercises]);
  const exsOfDay = (d: string) => exercises.filter((e) => dayOf(e) === d);

  // Persist a fully re-flattened order: renumber sortOrder to array position and
  // push every exercise whose position OR grouping (part/day) changed. State
  // updates optimistically so the list doesn't flicker while writes are in
  // flight.
  const applyOrder = (flat: Exercise[]) => {
    if (offline) return;
    const renumbered = flat.map((e, i) => ({ ...e, sortOrder: i }));
    const prev = new Map(exercises.map((e) => [e.id, e]));
    const changed = renumbered.filter((e) => {
      const p = prev.get(e.id);
      return !p || p.sortOrder !== e.sortOrder || p.timeSlot !== e.timeSlot || p.workoutDay !== e.workoutDay;
    });
    setExercises(renumbered);
    if (changed.length === 0) return;
    Promise.all(changed.map((e) => api.updateExercise(e)))
      .catch((err) => { setError(String(err.message ?? err)); load(); });
  };

  const reorderDays = (newDays: string[]) => applyOrder(newDays.flatMap((d) => exsOfDay(d)));

  // Replace one day's exercises (new order + parts from DayBody), keeping the
  // other days untouched.
  const reorderDayExercises = (day: string, newExs: Exercise[]) =>
    applyOrder(days.flatMap((d) => (d === day ? newExs : exsOfDay(d))));

  // Rename a workout day: retag every exercise in it. Past day logs keep the old
  // label they were stamped with, so history is unaffected.
  const doRenameDay = async (from: string, to: string) => {
    if (offline || !to.trim() || to === from) { setRenameDay(null); return; }
    setBusy(true);
    try {
      await Promise.all(exsOfDay(from).map((e) => api.updateExercise({ ...e, workoutDay: to })));
      setRenameDay(null);
      toast("Workout day renamed");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doDeleteDay = async (day: string) => {
    if (offline) return;
    setBusy(true);
    try {
      await Promise.all(exsOfDay(day).map((e) => api.deleteExercise(e.id)));
      setDeleteDay(null);
      toast("Workout day deleted");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const activeCount = exercises.filter((e) => e.active).length;

  if (draft) {
    return (
      <ExerciseForm
        draft={draft}
        setDraft={setDraft}
        knownDays={days}
        knownParts={orderedParts(exercises)}
        knownMuscles={distinctFrom(exercises, (e) => e.muscleGroup)}
        knownEquipment={distinctFrom(exercises, (e) => e.equipment)}
        onSave={save}
        onCancel={() => setDraft(null)}
        onDelete={draft.id ? async () => { await remove(draft as Exercise); setDraft(null); } : undefined}
        error={error}
        offline={offline}
      />
    );
  }

  return (
    <div>
      <div className="app-head">
        <div>
          <div className="subt">Plan · rotating</div>
          <div className="title">Routine</div>
        </div>
        <button className="iconbtn primary" onClick={() => setDraft(blank(exercises.length))} aria-label="Add workout day" disabled={offline}><IconPlus /></button>
      </div>

      {offline && (
        <div className="offline-banner" role="status">
          <span className="dot" />
          <div>
            <div className="ob-title">You're offline</div>
            <div className="ob-msg">Editing your routine is paused until you're back online, so no change gets lost. Daily logging still works offline.</div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <p className="empty">Loading…</p>}
      {!loading && exercises.length === 0 && <p className="empty">No workout days yet. Tap + to add your first.</p>}

      {days.length > 0 && (
        <div className="card plan-summary">
          <div className="figs">
            <div className="fig"><span className="n num">{days.length}</span><span className="l">Workout {days.length === 1 ? "day" : "days"}</span></div>
            <div className="fig"><span className="n num">{activeCount}</span><span className="l">Exercises</span></div>
          </div>
          {days.length > 1 && (
            <div className="rotation">
              <span className="rlabel">Rotation</span>
              {days.map((d, i) => (
                <span key={d} className="rot-item">
                  <span className="rchip">{d.split(" — ")[0]}</span>
                  {i < days.length - 1 && <span className="rarrow">→</span>}
                </span>
              ))}
              <span className="rloop" aria-hidden>↻</span>
            </div>
          )}
          {days.length > 1 && <div className="tiny muted" style={{ marginTop: -3 }}>Drag the ⠿ handles to reorder days, parts and exercises.</div>}
        </div>
      )}

      <ReorderList
        items={days}
        getKey={(d) => d}
        onReorder={reorderDays}
        disabled={offline || days.length < 2}
        renderItem={(day, { handleProps }) => {
          const dayExs = exsOfDay(day);
          const color = slotColor(day, days);
          return (
            <div className="card day-card">
              <div className="day-head">
                {days.length > 1 && <Grip {...handleProps} />}
                <span className="day-dot" style={{ color: `var(--${color})` }} />
                <span className="day-name">{day}</span>
                <span className="day-spacer" />
                <span className="day-count num">{dayExs.length}</span>
                <button className="day-menu" onClick={() => setMenuForDay(day)} aria-label={`Manage ${day}`} disabled={offline}>⋯</button>
              </div>
              <DayBody
                exercises={dayExs}
                disabled={offline}
                onReorder={(next) => reorderDayExercises(day, next)}
                onEdit={(ex) => setDraft({ ...ex })}
                onAddExercise={(part) => setDraft(blank(exercises.length, day, part))}
                onAddPart={() => setDraft(blank(exercises.length, day, ""))}
              />
            </div>
          );
        }}
      />

      {days.length > 0 && (
        <button className="add-day" onClick={() => setDraft(blank(exercises.length))} disabled={offline}>
          <IconPlus /> Add workout day
        </button>
      )}

      <div className="scroll-pad" />

      {menuForDay && (
        <Modal title={menuForDay} onClose={() => setMenuForDay(null)}>
          <p className="modal-msg">Manage this workout day.</p>
          <div className="form" style={{ gap: 10 }}>
            <button className="btn block" onClick={() => { setRenameDay(menuForDay); setMenuForDay(null); }}>Rename workout day</button>
            <button className="btn danger block" onClick={() => { setDeleteDay(menuForDay); setMenuForDay(null); }}>Delete workout day</button>
          </div>
          <div className="modal-btns">
            <button className="btn ghost" onClick={() => setMenuForDay(null)}>Close</button>
          </div>
        </Modal>
      )}
      {renameDay !== null && (
        <RenameDayDialog day={renameDay} busy={busy} onSave={(to) => doRenameDay(renameDay, to)} onCancel={() => setRenameDay(null)} />
      )}
      {deleteDay !== null && (
        <ConfirmDialog
          title="Delete workout day?"
          message={`“${deleteDay}” and its ${exsOfDay(deleteDay).length} exercise${exsOfDay(deleteDay).length === 1 ? "" : "s"} will be removed from your routine. Logged history stays intact.`}
          confirmLabel="Delete day"
          danger
          busy={busy}
          onConfirm={() => doDeleteDay(deleteDay)}
          onCancel={() => setDeleteDay(null)}
        />
      )}
    </div>
  );
}

function RenameDayDialog({
  day, busy, onSave, onCancel,
}: { day: string; busy: boolean; onSave: (to: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(day);
  return (
    <Modal title="Rename workout day" onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">Renames the day everywhere in your routine. A descriptive name like “Day 1 — Push” reads best.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(name.trim()); }}>
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 1 — Push" autoFocus />
        </label>
      </form>
      <div className="modal-btns">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(name.trim())} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </Modal>
  );
}

function ExerciseForm({
  draft, setDraft, knownDays, knownParts, knownMuscles, knownEquipment, onSave, onCancel, onDelete, error, offline,
}: { draft: Draft; setDraft: (d: Draft) => void; knownDays: string[]; knownParts: string[]; knownMuscles: string[]; knownEquipment: string[]; onSave: () => void; onCancel: () => void; onDelete?: () => void; error: string; offline?: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  // muscleGroup and equipment are stored comma-joined; expose them to the
  // chip selects as lists (top-level commas only, so a legacy
  // "Legs (Quads, Glutes)" stays one chip).
  const muscles = parseList(draft.muscleGroup);
  const equipment = parseList(draft.equipment);
  // Predefined options first, then anything used elsewhere in the routine.
  const muscleOptions = [...new Set([...MUSCLE_GROUPS, ...knownMuscles])];
  const equipmentOptions = [...new Set([...EQUIPMENT_OPTIONS, ...knownEquipment])];
  return (
    <div>
      <div className="app-head">
        <div><div className="subt">{draft.id ? "Edit" : "New"}</div><div className="title">{draft.id ? "Edit exercise" : "New exercise"}</div></div>
        <button className="iconbtn" onClick={onCancel} aria-label="Close">✕</button>
      </div>
      {offline && (
        <div className="offline-banner" role="status">
          <span className="dot" />
          <div>
            <div className="ob-title">You're offline</div>
            <div className="ob-msg">Reconnect to save this exercise — routine changes can't be saved offline.</div>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <label>Name<input value={draft.name} onChange={(e) => set("name", e.target.value)} required /></label>
        <label>Workout day
          <ComboBox
            value={draft.workoutDay}
            onChange={(v) => set("workoutDay", v)}
            options={knownDays}
            placeholder="Select a workout day…"
            newLabel="＋ New workout day…"
            required
          />
          <span className="tiny muted" style={{ fontWeight: 500 }}>The rotation unit. Each session does one workout day, rotating through them in order.</span>
        </label>
        <label>Time of day <span className="muted" style={{ fontWeight: 500 }}>(optional)</span>
          <ComboBox
            value={draft.timeSlot}
            onChange={(v) => set("timeSlot", v)}
            options={knownParts.filter(Boolean)}
            placeholder="No time of day — single workout"
            newLabel="＋ New time of day…"
          />
          <span className="tiny muted" style={{ fontWeight: 500 }}>Leave empty for one flat workout, or split the day into blocks (e.g. Wake up, Main, Mobility).</span>
        </label>
        <div className="row">
          <label>Sets<input type="number" min={1} value={draft.plannedSets} onChange={(e) => set("plannedSets", Number(e.target.value))} /></label>
          <label>Amount / set<input type="number" min={1} value={draft.plannedAmount} onChange={(e) => set("plannedAmount", Number(e.target.value))} /></label>
          <label>Unit
            <select value={draft.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <label>Note (e.g. "per leg")<input value={draft.note} onChange={(e) => set("note", e.target.value)} /></label>
        <label>Rest between sets (seconds)<input type="number" min={0} value={draft.restSeconds} onChange={(e) => set("restSeconds", Number(e.target.value))} /></label>
        <label>Equipment <span className="muted" style={{ fontWeight: 500 }}>(tap to select — several allowed)</span>
          <ChipSelect
            values={equipment}
            onChange={(v) => set("equipment", v.join(", "))}
            options={equipmentOptions}
            addPlaceholder="Add other equipment…"
          />
        </label>
        <label>Trained parts <span className="muted" style={{ fontWeight: 500 }}>(tap to select — several allowed)</span>
          <ChipSelect
            values={muscles}
            onChange={(v) => set("muscleGroup", v.join(", "))}
            options={muscleOptions}
            addPlaceholder="Add another part…"
          />
        </label>
        <label className="check"><input type="checkbox" checked={draft.perSide} onChange={(e) => set("perSide", e.target.checked)} />Left / right sides (e.g. side plank, split squats)</label>
        {draft.perSide && <p className="tiny muted" style={{ margin: "-6px 2px 0" }}>Each set is logged for both sides — {draft.plannedSets} × {draft.plannedAmount} {draft.unit === "reps" ? "reps" : draft.unit === "seconds" ? "s" : "min"} per side.</p>}
        <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />Active (shown in daily tracking)</label>
        <div className="formbtns">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={offline}>Save</button>
        </div>
        {onDelete && <button type="button" className="btn danger block" style={{ marginTop: 4 }} onClick={() => setConfirmDelete(true)} disabled={offline}>Delete exercise</button>}
      </form>
      <div className="scroll-pad" />
      {confirmDelete && onDelete && (
        <ConfirmDialog
          title="Delete exercise?"
          message={`“${draft.name}” will be removed from your routine. Logged history for it stays intact.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
