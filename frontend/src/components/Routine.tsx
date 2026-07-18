import { useEffect, useState } from "react";
import { api } from "../api";
import type { Exercise, Unit } from "../types";
import { DEFAULT_TIME_SLOTS, UNITS } from "../types";
import { unitLabel } from "../format";

type Draft = Omit<Exercise, "id"> & { id?: string };

const blank = (sortOrder: number): Draft => ({
  timeSlot: DEFAULT_TIME_SLOTS[0],
  name: "",
  plannedSets: 3,
  plannedAmount: 10,
  unit: "reps",
  note: "",
  restSeconds: 30,
  muscleGroup: "",
  equipment: "None",
  sortOrder,
  active: true,
});

export function Routine() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .listExercises()
      .then(setExercises)
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
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const remove = async (ex: Exercise) => {
    if (!confirm(`Delete "${ex.name}"?`)) return;
    try {
      await api.deleteExercise(ex.id);
      load();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  if (draft) {
    return <ExerciseForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} error={error} />;
  }

  return (
    <div className="routine">
      <div className="routine-head">
        <h2>Routine</h2>
        <button className="btn primary" onClick={() => setDraft(blank(exercises.length))}>
          + Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && exercises.length === 0 && <p className="muted">No exercises yet. Add your first one.</p>}
      <ul className="exlist">
        {exercises.map((ex) => (
          <li key={ex.id} className={ex.active ? "" : "inactive"}>
            <div>
              <strong>{ex.name}</strong> <span className="tag">{ex.timeSlot}</span>
              {!ex.active && <span className="tag muted">inactive</span>}
              <div className="muted small">
                {ex.plannedSets} × {ex.plannedAmount} {unitLabel(ex.unit)}
                {ex.muscleGroup ? ` · ${ex.muscleGroup}` : ""}
              </div>
            </div>
            <div className="rowbtns">
              <button className="link" onClick={() => setDraft({ ...ex })}>
                Edit
              </button>
              <button className="link danger" onClick={() => remove(ex)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExerciseForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  return (
    <form
      className="exform"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2>{draft.id ? "Edit exercise" : "New exercise"}</h2>
      {error && <p className="error">{error}</p>}

      <label>
        Name
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} required />
      </label>

      <label>
        Time slot
        <input list="slots" value={draft.timeSlot} onChange={(e) => set("timeSlot", e.target.value)} required />
        <datalist id="slots">
          {DEFAULT_TIME_SLOTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <div className="row">
        <label>
          Sets
          <input
            type="number"
            min={1}
            value={draft.plannedSets}
            onChange={(e) => set("plannedSets", Number(e.target.value))}
          />
        </label>
        <label>
          Amount / set
          <input
            type="number"
            min={1}
            value={draft.plannedAmount}
            onChange={(e) => set("plannedAmount", Number(e.target.value))}
          />
        </label>
        <label>
          Unit
          <select value={draft.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Note (e.g. "per leg")
        <input value={draft.note} onChange={(e) => set("note", e.target.value)} />
      </label>

      <div className="row">
        <label>
          Rest (seconds)
          <input
            type="number"
            min={0}
            value={draft.restSeconds}
            onChange={(e) => set("restSeconds", Number(e.target.value))}
          />
        </label>
        <label>
          Equipment
          <input value={draft.equipment} onChange={(e) => set("equipment", e.target.value)} />
        </label>
      </div>

      <label>
        Target muscle group
        <input value={draft.muscleGroup} onChange={(e) => set("muscleGroup", e.target.value)} />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
        Active (shown in daily tracking)
      </label>

      <div className="formbtns">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Save
        </button>
      </div>
    </form>
  );
}
