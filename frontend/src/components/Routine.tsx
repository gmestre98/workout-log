import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Exercise, RoutineVersion, VersionAssignment, Unit, VersionStatus } from "../types";
import { DEFAULT_TIME_SLOTS, UNITS } from "../types";
import { firstOfMonth, primaryMuscle, slotColor, todayISO } from "../format";
import { toast } from "../toast";
import { ConfirmDialog, Modal } from "./Modal";
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

// A version's display name: its note, or its save date if unnamed.
const versionName = (v: RoutineVersion) => v.note?.trim() || fmtDate(v.createdAt);

// fmtBoundary shows a schedule start date, collapsing a month's 1st to just the
// month (the common monthly case) and showing the full date otherwise.
const fmtBoundary = (iso: string) => {
  const d = new Date(iso);
  if (iso.endsWith("-01")) return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return fmtDate(iso);
};

const STATUS_META: Record<VersionStatus, { label: string; cls: string }> = {
  current: { label: "In use", cls: "current" },
  future: { label: "Planned", cls: "future" },
  past: { label: "Past", cls: "past" },
};

export function Routine() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [versions, setVersions] = useState<RoutineVersion[]>([]);
  const [schedule, setSchedule] = useState<VersionAssignment[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Version dialogs.
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activateFor, setActivateFor] = useState<RoutineVersion | null>(null);
  const [deleteFor, setDeleteFor] = useState<RoutineVersion | null>(null);
  const [copyFor, setCopyFor] = useState<RoutineVersion | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.listExercises(), api.listVersions(), api.listSchedule()])
      .then(([exs, vs, sch]) => { setExercises(exs); setVersions(vs); setSchedule(sch); })
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
    try { await api.deleteExercise(ex.id); load(); }
    catch (e: any) { setError(String(e.message ?? e)); }
  };

  const doSaveVersion = async (note: string, status: VersionStatus) => {
    setBusy(true);
    try {
      await api.saveVersion(note, status);
      setSaveOpen(false);
      toast(status === "future" ? "Saved as a future version" : "Version saved");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doActivate = async (v: RoutineVersion) => {
    setBusy(true);
    try {
      await api.activateVersion(v.id);
      setActivateFor(null);
      toast("Now using this version");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doDeleteVersion = async (v: RoutineVersion) => {
    setBusy(true);
    try {
      await api.deleteVersion(v.id);
      setDeleteFor(null);
      toast("Version deleted");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const relabel = async (v: RoutineVersion, status: "future" | "past") => {
    try {
      await api.setVersionStatus(v.id, status);
      toast(status === "future" ? "Moved to future plans" : "Archived to past");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  // Load a copy of a version into the live routine so the user can tweak a few
  // exercises and save it as a new version — no re-entering everything.
  const doEditCopy = async (v: RoutineVersion) => {
    setBusy(true);
    try {
      await api.loadVersion(v.id);
      setCopyFor(null);
      toast(`Loaded a copy of "${versionName(v)}" — edit, then Save version`);
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doAssign = async (startDate: string, versionId: string) => {
    setBusy(true);
    try {
      await api.setAssignment(startDate, versionId);
      setAssignOpen(false);
      toast("Version scheduled");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doUnassign = async (startDate: string) => {
    try {
      await api.deleteAssignment(startDate);
      toast("Removed from schedule");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  const orderedSlots = useMemo(() => {
    const seen: string[] = [];
    for (const e of exercises) if (!seen.includes(e.timeSlot)) seen.push(e.timeSlot);
    return seen;
  }, [exercises]);

  // Slots offered as quick-pick chips: the defaults plus any the user already
  // has, in order — so adding a 4th/5th block is one tap once it exists.
  const knownSlots = useMemo(() => {
    const seen: string[] = [...DEFAULT_TIME_SLOTS];
    for (const e of exercises) if (!seen.includes(e.timeSlot)) seen.push(e.timeSlot);
    return seen;
  }, [exercises]);

  if (draft) {
    return (
      <ExerciseForm
        draft={draft}
        setDraft={setDraft}
        knownSlots={knownSlots}
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
                  <div className="m">{ex.plannedSets} × {ex.plannedAmount} {ex.unit === "reps" ? "" : ex.unit === "seconds" ? "s" : "min"}{ex.restSeconds > 0 ? ` · ${ex.restSeconds}s rest` : ""}{ex.note ? ` · ${ex.note}` : ""}</div>
                </div>
                {ex.muscleGroup && <span className="pillbadge">{primaryMuscle(ex.muscleGroup)}</span>}
                <button className="link" onClick={() => setDraft({ ...ex })}>Edit</button>
              </div>
            ))}
          </div>
        );
      })}

      <div className="slot-head" style={{ marginTop: 22 }}>
        <span className="slot-title">Workout versions</span>
        <button className="link" onClick={() => setSaveOpen(true)}>Save version</button>
      </div>
      {versions.length === 0 ? (
        <div className="card" style={{ padding: 15 }}>
          <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>
            No versions yet. Save one to snapshot your current routine — then keep past, current and future plans side by side and switch between them anytime.
          </p>
        </div>
      ) : (
        versions.map((v) => (
          <VersionCard
            key={v.id}
            version={v}
            onActivate={() => setActivateFor(v)}
            onEditCopy={() => setCopyFor(v)}
            onRelabel={(s) => relabel(v, s)}
            onDelete={() => setDeleteFor(v)}
          />
        ))
      )}

      <div className="slot-head" style={{ marginTop: 22 }}>
        <span className="slot-title">Schedule</span>
        {versions.length > 0 && <button className="link" onClick={() => setAssignOpen(true)}>Assign</button>}
      </div>
      <ScheduleList
        schedule={schedule}
        versions={versions}
        onUnassign={doUnassign}
      />

      <div className="scroll-pad" />

      {saveOpen && (
        <SaveVersionDialog busy={busy} onSave={doSaveVersion} onCancel={() => setSaveOpen(false)} />
      )}
      {activateFor && (
        <ConfirmDialog
          title="Use this version?"
          message={`Your routine will be replaced with this ${activateFor.exercises.length}-exercise version${activateFor.note ? ` (“${activateFor.note}”)` : ""}. Your logged history is untouched.`}
          confirmLabel="Use it"
          busy={busy}
          onConfirm={() => doActivate(activateFor)}
          onCancel={() => setActivateFor(null)}
        />
      )}
      {deleteFor && (
        <ConfirmDialog
          title="Delete version?"
          message={`This permanently removes the saved version from ${fmtDate(deleteFor.createdAt)}. Your routine and logged history are not affected.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={() => doDeleteVersion(deleteFor)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
      {copyFor && (
        <ConfirmDialog
          title="Edit a copy?"
          message={`Loads a copy of "${versionName(copyFor)}" (${copyFor.exercises.length} exercises) into your routine so you can change a few and Save as a new version. This replaces what's currently in the routine editor.`}
          confirmLabel="Load copy"
          busy={busy}
          onConfirm={() => doEditCopy(copyFor)}
          onCancel={() => setCopyFor(null)}
        />
      )}
      {assignOpen && (
        <AssignVersionDialog
          versions={versions}
          busy={busy}
          onAssign={doAssign}
          onCancel={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}

function ScheduleList({
  schedule, versions, onUnassign,
}: {
  schedule: VersionAssignment[];
  versions: RoutineVersion[];
  onUnassign: (startDate: string) => void;
}) {
  const byId = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  if (schedule.length === 0) {
    return (
      <div className="card" style={{ padding: 15 }}>
        <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>
          No schedule yet. Assign a version a start date (usually the 1st of a month) to record which routine you followed when. This is a label only — it doesn't change your daily tracking.
        </p>
      </div>
    );
  }
  return (
    <>
      {schedule.map((a, i) => {
        const v = byId.get(a.versionId);
        const next = schedule[i + 1];
        return (
          <div key={a.startDate} className="card sched">
            <div className="sched-body">
              <div className="sched-range num">
                {fmtBoundary(a.startDate)}{next ? ` → ${fmtBoundary(next.startDate)}` : " onward"}
              </div>
              <div className="tiny muted">
                {v ? versionName(v) : "Deleted version — remove this entry"}
                {v ? ` · ${v.exercises.length} exercises` : ""}
              </div>
            </div>
            <button className="link danger" onClick={() => onUnassign(a.startDate)}>Remove</button>
          </div>
        );
      })}
    </>
  );
}

function AssignVersionDialog({
  versions, busy, onAssign, onCancel,
}: {
  versions: RoutineVersion[];
  busy: boolean;
  onAssign: (startDate: string, versionId: string) => void;
  onCancel: () => void;
}) {
  const [startDate, setStartDate] = useState(firstOfMonth(todayISO()));
  const [versionId, setVersionId] = useState(versions[0]?.id ?? "");
  return (
    <Modal title="Schedule a version" onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">Record which version was in effect from a given date. It stays in effect until the next scheduled date. Pick the 1st of a month for a monthly plan, or any day for a mid-month change.</p>
      <div className="form" style={{ gap: 14 }}>
        <label>In effect from
          <input type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
        </label>
        <label>Version
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{versionName(v)} ({v.status})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal-btns">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={() => versionId && onAssign(startDate, versionId)} disabled={busy || !versionId}>
          {busy ? "Saving…" : "Schedule"}
        </button>
      </div>
    </Modal>
  );
}

function VersionCard({
  version, onActivate, onEditCopy, onRelabel, onDelete,
}: {
  version: RoutineVersion;
  onActivate: () => void;
  onEditCopy: () => void;
  onRelabel: (status: "future" | "past") => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[version.status] ?? STATUS_META.past;
  const isCurrent = version.status === "current";
  return (
    <div className={`card version ${isCurrent ? "is-current" : ""}`}>
      <div className="version-top">
        <div>
          <div className="version-date num">{fmtDate(version.createdAt)}</div>
          <div className="tiny muted">{version.exercises.length} exercises{version.note ? ` · ${version.note}` : ""}</div>
        </div>
        <span className={`pillbadge ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="version-actions">
        <div className="version-actions-l">
          {isCurrent ? (
            <span className="tiny muted">Currently in use</span>
          ) : (
            <button className="link" onClick={onActivate}>Set as current</button>
          )}
          <button className="link" onClick={onEditCopy}>Edit a copy</button>
        </div>
        <div className="version-actions-r">
          {version.status !== "future" && !isCurrent && (
            <button className="link" onClick={() => onRelabel("future")}>Future</button>
          )}
          {version.status !== "past" && !isCurrent && (
            <button className="link" onClick={() => onRelabel("past")}>Archive</button>
          )}
          <button className="link danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function SaveVersionDialog({
  busy, onSave, onCancel,
}: {
  busy: boolean;
  onSave: (note: string, status: VersionStatus) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<VersionStatus>("current");
  return (
    <Modal title="Save workout version" onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">Snapshots your current routine so you can look back on it or switch to it later.</p>
      <div className="form" style={{ gap: 14 }}>
        <label>Name / note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Winter block, deload week" autoFocus />
        </label>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${status === "current" ? "active" : ""}`}
            onClick={() => setStatus("current")}
          >
            <b>Current</b><span>Using it now</span>
          </button>
          <button
            type="button"
            className={`seg ${status === "future" ? "active" : ""}`}
            onClick={() => setStatus("future")}
          >
            <b>Future</b><span>A plan for later</span>
          </button>
        </div>
      </div>
      <div className="modal-btns">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(note.trim(), status)} disabled={busy}>
          {busy ? "Saving…" : "Save version"}
        </button>
      </div>
    </Modal>
  );
}

function ExerciseForm({
  draft, setDraft, knownSlots, onSave, onCancel, onDelete, error,
}: { draft: Draft; setDraft: (d: Draft) => void; knownSlots: string[]; onSave: () => void; onCancel: () => void; onDelete?: () => void; error: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  // Show every known slot as a chip, plus the current value if it's brand new.
  const slotOptions = knownSlots.includes(draft.timeSlot) || !draft.timeSlot
    ? knownSlots
    : [...knownSlots, draft.timeSlot];
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
          <div className="slotchips">
            {slotOptions.map((s) => (
              <button type="button" key={s} className={`chip ${s === draft.timeSlot ? "active" : ""}`} onClick={() => set("timeSlot", s)}>{s}</button>
            ))}
          </div>
          <input value={draft.timeSlot} onChange={(e) => set("timeSlot", e.target.value)} placeholder="Type a new block, e.g. Afternoon" required />
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
          <label>Rest between sets (seconds)<input type="number" min={0} value={draft.restSeconds} onChange={(e) => set("restSeconds", Number(e.target.value))} /></label>
          <label>Equipment<input value={draft.equipment} onChange={(e) => set("equipment", e.target.value)} /></label>
        </div>
        <label>Target muscle group<input value={draft.muscleGroup} onChange={(e) => set("muscleGroup", e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />Active (shown in daily tracking)</label>
        <div className="formbtns">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
        {onDelete && <button type="button" className="btn danger block" style={{ marginTop: 4 }} onClick={() => setConfirmDelete(true)}>Delete exercise</button>}
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
