import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Exercise, RoutineVersion, Unit } from "../types";
import { DEFAULT_TIME_SLOTS, UNITS } from "../types";
import { primaryMuscle, slotColor } from "../format";
import { IconPlus } from "./icons";

type Draft = Omit<Exercise, "id"> & { id?: string };

const blank = (sortOrder: number): Draft => ({
  timeSlot: DEFAULT_TIME_SLOTS[0], name: "", plannedSets: 3, plannedAmount: 10,
  unit: "reps", note: "", restSeconds: 30, muscleGroup: "", equipment: "None",
  sortOrder, active: true,
});

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export function Routine() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [versions, setVersions] = useState<RoutineVersion[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingVersion, setSavingVersion] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.listExercises(), api.listVersions()])
      .then(([exs, vs]) => { setExercises(exs); setVersions(vs); })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!draft) return;
    try {
      if (draft.id) await api.updateExercise(draft as Exercise);
      else await api.createExercise(draft);
      setDraft(null);
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  const remove = async (ex: Exercise) => {
    if (!confirm(`Delete "${ex.name}"?`)) return;
    try { await api.deleteExercise(ex.id); load(); }
    catch (e: any) { setError(String(e.message ?? e)); }
  };

  const saveVersion = async () => {
    const note = prompt("Describe this version (optional):", "") ?? "";
    setSavingVersion(true);
    try { await api.saveVersion(note); load(); }
    catch (e: any) { setError(String(e.message ?? e)); }
    finally { setSavingVersion(false); }
  };

  const orderedSlots = useMemo(() => {
    const seen: string[] = [];
    for (const e of exercises) if (!seen.includes(e.timeSlot)) seen.push(e.timeSlot);
    return seen;
  }, [exercises]);

  if (draft) {
    return (
      <ExerciseForm
        draft={draft}
        setDraft={setDraft}
        onSave={save}
        onCancel={() => setDraft(null)}
        onDelete={draft.id ? async () => { await remove(draft as Exercise); setDraft(null); } : undefined}
        error={error}
      />
    );
  }

  return (
    <div>
      <div className="app-head">
        <div>
          <div className="subt">{exercises.filter((e) => e.active).length} active</div>
          <div className="title">Routine</div>
        </div>
        <button className="iconbtn primary" onClick={() => setDraft(blank(exercises.length))} aria-label="Add exercise"><IconPlus /></button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="empty">Loading…</p>}
      {!loading && exercises.length === 0 && <p className="empty">No exercises yet. Tap + to add your first.</p>}

      {orderedSlots.map((slot) => {
        const slotExs = exercises.filter((e) => e.timeSlot === slot);
        const color = slotColor(slot, orderedSlots);
        return (
          <div key={slot}>
            <div className="slot-head">
              <div className="lft" style={{ color: `var(--${color})` }}>
                <span className="slot-dot" style={{ background: `var(--${color})` }} />
                <span className="slot-title">{slot}</span>
              </div>
              <span className="slot-prog">{slotExs.length} exercises</span>
            </div>
            {slotExs.map((ex) => (
              <div key={ex.id} className="card rl" style={ex.active ? undefined : { opacity: 0.55 }}>
                <div className="body">
                  <div className="n">{ex.name}{!ex.active && <span className="pillbadge" style={{ marginLeft: 6 }}>off</span>}</div>
                  <div className="m">{ex.plannedSets} × {ex.plannedAmount} {ex.unit === "reps" ? "" : ex.unit === "seconds" ? "s" : "min"}{ex.note ? ` · ${ex.note}` : ""}</div>
                </div>
                {ex.muscleGroup && <span className="pillbadge">{primaryMuscle(ex.muscleGroup)}</span>}
                <button className="link" onClick={() => setDraft({ ...ex })}>Edit</button>
              </div>
            ))}
          </div>
        );
      })}

      <div className="slot-head" style={{ marginTop: 20 }}>
        <span className="slot-title">Configuration history</span>
        <button className="link" onClick={saveVersion} disabled={savingVersion}>{savingVersion ? "Saving…" : "Save version"}</button>
      </div>
      <div className="card" style={{ padding: 15 }}>
        {versions.length === 0 ? (
          <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>
            No saved versions yet. Save one to snapshot your current routine — you can look back on past configurations anytime.
          </p>
        ) : (
          <div className="tl">
            {versions.map((v, i) => (
              <div key={v.id} className={`node ${i === 0 ? "" : "old"}`}>
                <div className="vlabel">
                  {fmtDate(v.createdAt)}
                  {i === 0 && <span className="pillbadge done">latest</span>}
                </div>
                <div className="tiny muted">{v.exercises.length} exercises{v.note ? ` · ${v.note}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="scroll-pad" />
    </div>
  );
}

function ExerciseForm({
  draft, setDraft, onSave, onCancel, onDelete, error,
}: { draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void; error: string }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  return (
    <div>
      <div className="app-head">
        <div><div className="subt">{draft.id ? "Edit" : "New"}</div><div className="title">{draft.id ? "Edit exercise" : "New exercise"}</div></div>
        <button className="iconbtn" onClick={onCancel} aria-label="Close">✕</button>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <label>Name<input value={draft.name} onChange={(e) => set("name", e.target.value)} required /></label>
        <label>Time slot
          <input list="slots" value={draft.timeSlot} onChange={(e) => set("timeSlot", e.target.value)} required />
          <datalist id="slots">{DEFAULT_TIME_SLOTS.map((s) => <option key={s} value={s} />)}</datalist>
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
        <div className="row">
          <label>Rest (seconds)<input type="number" min={0} value={draft.restSeconds} onChange={(e) => set("restSeconds", Number(e.target.value))} /></label>
          <label>Equipment<input value={draft.equipment} onChange={(e) => set("equipment", e.target.value)} /></label>
        </div>
        <label>Target muscle group<input value={draft.muscleGroup} onChange={(e) => set("muscleGroup", e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />Active (shown in daily tracking)</label>
        <div className="formbtns">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
        {onDelete && <button type="button" className="btn danger block" style={{ marginTop: 4 }} onClick={onDelete}>Delete exercise</button>}
      </form>
      <div className="scroll-pad" />
    </div>
  );
}
