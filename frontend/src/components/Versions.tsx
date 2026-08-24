import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { RoutineVersion, VersionAssignment, VersionStatus } from "../types";
import { firstOfMonth, todayISO } from "../format";
import { toast } from "../toast";
import { useOnline } from "../useOnline";
import { ConfirmDialog, Modal } from "./Modal";
import { IconVersions } from "./icons";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// A version's display name: its note, or its save date if unnamed.
const versionName = (v: RoutineVersion) => v.note?.trim() || fmtDate(v.createdAt);

// A short "3 days · 6 exercises" line for a version snapshot.
const versionShape = (v: RoutineVersion) => {
  const days = new Set(v.exercises.map((e) => e.timeSlot)).size;
  const n = v.exercises.length;
  return `${days} day${days === 1 ? "" : "s"} · ${n} exercise${n === 1 ? "" : "s"}`;
};

// fmtBoundary shows a schedule start date, collapsing a month's 1st to just the
// month (the common monthly case) and showing the full date otherwise.
const fmtBoundary = (iso: string) => {
  const d = new Date(iso);
  if (iso.endsWith("-01")) return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return fmtDate(iso);
};

// The three status buckets, in the order they appear on screen.
const GROUPS: { status: VersionStatus; title: string }[] = [
  { status: "current", title: "In use" },
  { status: "future", title: "Planned" },
  { status: "past", title: "Past" },
];

export function Versions() {
  // Like the routine editor, version changes hit the server directly and can't
  // be queued, so the whole screen is read-only while offline.
  const online = useOnline();
  const offline = !online;
  const [versions, setVersions] = useState<RoutineVersion[]>([]);
  const [schedule, setSchedule] = useState<VersionAssignment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [activateFor, setActivateFor] = useState<RoutineVersion | null>(null);
  const [deleteFor, setDeleteFor] = useState<RoutineVersion | null>(null);
  const [copyFor, setCopyFor] = useState<RoutineVersion | null>(null);
  const [renameFor, setRenameFor] = useState<RoutineVersion | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editAssign, setEditAssign] = useState<VersionAssignment | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listVersions(), api.listSchedule()])
      .then(([vs, sch]) => { setVersions(vs); setSchedule(sch); })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const doSaveVersion = async (note: string, status: VersionStatus) => {
    if (offline) return;
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
    if (offline) return;
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
    if (offline) return;
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
    if (offline) return;
    try {
      await api.setVersionStatus(v.id, status);
      toast(status === "future" ? "Moved to planned" : "Archived to past");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  // Load a copy of a version into the live routine so the user can tweak a few
  // exercises and save it as a new version — no re-entering everything.
  const doEditCopy = async (v: RoutineVersion) => {
    if (offline) return;
    setBusy(true);
    try {
      await api.loadVersion(v.id);
      setCopyFor(null);
      toast(`Loaded a copy of "${versionName(v)}" into Routine — edit, then Save version`);
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doRename = async (v: RoutineVersion, note: string) => {
    if (offline) return;
    setBusy(true);
    try {
      await api.renameVersion(v.id, note);
      setRenameFor(null);
      toast(note ? "Version renamed" : "Version name cleared");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  const doAssign = async (startDate: string, versionId: string) => {
    if (offline) return;
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
    if (offline) return;
    try {
      await api.deleteAssignment(startDate);
      toast("Removed from schedule");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  // Update an existing schedule entry. If the start date moved, the old entry
  // (keyed by its date) is removed and the new one created; otherwise the
  // version is simply reassigned for that date.
  const doEditAssign = async (prev: VersionAssignment, startDate: string, versionId: string) => {
    if (offline) return;
    setBusy(true);
    try {
      if (startDate !== prev.startDate) await api.deleteAssignment(prev.startDate);
      await api.setAssignment(startDate, versionId);
      setEditAssign(null);
      toast("Schedule updated");
      load();
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="app-head">
        <div>
          <div className="subt">Library</div>
          <div className="title">Versions</div>
        </div>
      </div>

      {offline && (
        <div className="offline-banner" role="status">
          <span className="dot" />
          <div>
            <div className="ob-title">You're offline</div>
            <div className="ob-msg">Saving and switching versions is paused until you're back online. Daily logging still works offline.</div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button className="save-cta" onClick={() => setSaveOpen(true)} disabled={offline}>
        <span className="ico"><IconVersions /></span>
        <span className="tx">
          <span className="t">Save current routine as a version</span>
          <span className="d">Snapshot today's plan — switch back anytime</span>
        </span>
      </button>

      {loading && <p className="empty">Loading…</p>}

      {!loading && versions.length === 0 && (
        <div className="card" style={{ padding: 15, marginTop: 12 }}>
          <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>
            No versions yet. Save one to snapshot your current routine — then keep past, current and planned versions side by side and switch between them anytime.
          </p>
        </div>
      )}

      {GROUPS.map(({ status, title }) => {
        const items = versions.filter((v) => v.status === status);
        if (items.length === 0) return null;
        return (
          <div key={status}>
            <div className="sec-head">
              <span className="slot-title">{title}</span>
              <span className="sec-count num">{items.length}</span>
            </div>
            {items.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                disabled={offline}
                onActivate={() => setActivateFor(v)}
                onEditCopy={() => setCopyFor(v)}
                onRename={() => setRenameFor(v)}
                onRelabel={(s) => relabel(v, s)}
                onDelete={() => setDeleteFor(v)}
              />
            ))}
          </div>
        );
      })}

      <div className="sec-head" style={{ marginTop: 22 }}>
        <span className="slot-title">Schedule</span>
        {versions.length > 0 && <button className="link" onClick={() => setAssignOpen(true)} disabled={offline}>Assign</button>}
      </div>
      <ScheduleList
        schedule={schedule}
        versions={versions}
        disabled={offline}
        onEdit={setEditAssign}
        onUnassign={doUnassign}
      />

      <div className="scroll-pad" />

      {saveOpen && (
        <SaveVersionDialog busy={busy} onSave={doSaveVersion} onCancel={() => setSaveOpen(false)} />
      )}
      {activateFor && (
        <ConfirmDialog
          title="Use this version?"
          message={`Your routine will be replaced with this version (${versionShape(activateFor)})${activateFor.note ? ` — “${activateFor.note}”` : ""}. Your logged history is untouched.`}
          confirmLabel="Use it"
          busy={busy}
          onConfirm={() => doActivate(activateFor)}
          onCancel={() => setActivateFor(null)}
        />
      )}
      {deleteFor && (
        <ConfirmDialog
          title="Delete version?"
          message={`This permanently removes the version "${versionName(deleteFor)}". Your routine and logged history are not affected.`}
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
          message={`Loads a copy of "${versionName(copyFor)}" (${versionShape(copyFor)}) into your Routine so you can change a few and Save as a new version. This replaces what's currently in the routine editor.`}
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
          onSave={doAssign}
          onCancel={() => setAssignOpen(false)}
        />
      )}
      {editAssign && (
        <AssignVersionDialog
          versions={versions}
          busy={busy}
          initial={editAssign}
          onSave={(sd, vid) => doEditAssign(editAssign, sd, vid)}
          onCancel={() => setEditAssign(null)}
        />
      )}
      {renameFor && (
        <RenameVersionDialog
          version={renameFor}
          busy={busy}
          onSave={(note) => doRename(renameFor, note)}
          onCancel={() => setRenameFor(null)}
        />
      )}
    </div>
  );
}

function RenameVersionDialog({
  version, busy, onSave, onCancel,
}: {
  version: RoutineVersion;
  busy: boolean;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(version.note ?? "");
  return (
    <Modal title="Rename version" onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">Give this workout version a name. Leave it empty to show its save date instead.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(note.trim()); }}>
        <label>Name
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Winter block, deload week" autoFocus />
        </label>
      </form>
      <div className="modal-btns">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(note.trim())} disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </Modal>
  );
}

function ScheduleList({
  schedule, versions, disabled, onEdit, onUnassign,
}: {
  schedule: VersionAssignment[];
  versions: RoutineVersion[];
  disabled?: boolean;
  onEdit: (a: VersionAssignment) => void;
  onUnassign: (startDate: string) => void;
}) {
  const byId = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  if (schedule.length === 0) {
    return (
      <div className="card" style={{ padding: 15 }}>
        <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0" }}>
          No schedule yet. Assign a version a start date (usually the 1st of a month) — it becomes the routine used for tracking every day from then until the next scheduled version.
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
                {v ? ` · ${versionShape(v)}` : ""}
              </div>
            </div>
            <button className="link" onClick={() => onEdit(a)} disabled={disabled}>Edit</button>
            <button className="link danger" onClick={() => onUnassign(a.startDate)} disabled={disabled}>Remove</button>
          </div>
        );
      })}
    </>
  );
}

function AssignVersionDialog({
  versions, busy, initial, onSave, onCancel,
}: {
  versions: RoutineVersion[];
  busy: boolean;
  initial?: VersionAssignment;
  onSave: (startDate: string, versionId: string) => void;
  onCancel: () => void;
}) {
  const editing = !!initial;
  const [startDate, setStartDate] = useState(initial?.startDate ?? firstOfMonth(todayISO()));
  const [versionId, setVersionId] = useState(initial?.versionId ?? versions[0]?.id ?? "");
  return (
    <Modal title={editing ? "Edit schedule entry" : "Schedule a version"} onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">Sets which version is in effect from a given date — the routine used for tracking every day from then until the next scheduled version. Pick the 1st of a month for a monthly plan, or any day for a mid-month change. Move the date earlier to cover more history.</p>
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
        <button className="btn primary" onClick={() => versionId && onSave(startDate, versionId)} disabled={busy || !versionId}>
          {busy ? "Saving…" : editing ? "Save" : "Schedule"}
        </button>
      </div>
    </Modal>
  );
}

function VersionCard({
  version, disabled, onActivate, onEditCopy, onRename, onRelabel, onDelete,
}: {
  version: RoutineVersion;
  disabled?: boolean;
  onActivate: () => void;
  onEditCopy: () => void;
  onRename: () => void;
  onRelabel: (status: "future" | "past") => void;
  onDelete: () => void;
}) {
  const isCurrent = version.status === "current";
  const meta: Record<VersionStatus, { label: string; cls: string }> = {
    current: { label: "In use", cls: "current" },
    future: { label: "Planned", cls: "future" },
    past: { label: "Past", cls: "past" },
  };
  const m = meta[version.status] ?? meta.past;
  return (
    <div className={`card version ${isCurrent ? "is-current" : ""}`}>
      <div className="version-top">
        <button className="version-title" onClick={onRename} aria-label="Rename version" disabled={disabled}>
          <div className="version-name">{versionName(version)}</div>
          <div className="tiny muted">
            {versionShape(version)}{version.note?.trim() ? ` · saved ${fmtDate(version.createdAt)}` : ""}
          </div>
        </button>
        <span className={`pillbadge ${m.cls}`}>{m.label}</span>
      </div>
      <div className="version-actions">
        <div className="version-actions-l">
          {isCurrent ? (
            <span className="tiny muted">Currently in use</span>
          ) : (
            <button className="link" onClick={onActivate} disabled={disabled}>Set as current</button>
          )}
          <button className="link" onClick={onEditCopy} disabled={disabled}>Edit a copy</button>
          <button className="link" onClick={onRename} disabled={disabled}>Rename</button>
        </div>
        <div className="version-actions-r">
          {version.status !== "future" && !isCurrent && (
            <button className="link" onClick={() => onRelabel("future")} disabled={disabled}>Plan</button>
          )}
          {version.status !== "past" && !isCurrent && (
            <button className="link" onClick={() => onRelabel("past")} disabled={disabled}>Archive</button>
          )}
          <button className="link danger" onClick={onDelete} disabled={disabled}>Delete</button>
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
            <b>Planned</b><span>A plan for later</span>
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
