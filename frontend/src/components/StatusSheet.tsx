import { useState } from "react";
import type { DayStatus } from "../types";
import { CROSS_ACTIVITIES, SKIP_REASONS } from "../types";
import { dayHeader } from "../format";
import { ChipSelect } from "./Combo";

// StatusSheet records what happened on a day the routine wasn't done: either the
// user trained a different sport ("cross") or skipped/missed it ("skipped"),
// with the type(s) picked as chips and an optional note. It is the counterpart
// to LogSheet — same bottom-sheet chrome — for the negative/alternative space.
//
// Tag selections are kept per status so flipping the toggle doesn't lose what
// was picked. knownTags resurfaces types used on earlier days (like the exercise
// form resurfaces equipment), so the user's own vocabulary grows over time.
export function StatusSheet({
  date,
  current,
  initialStatus,
  knownCross,
  knownSkip,
  onSave,
  onClear,
  onClose,
}: {
  date: string;
  current: { status?: DayStatus; statusTags?: string[]; statusNote?: string };
  // Which tab to open on when there is no existing status (the sport-first
  // action opens "cross", the tucked-away link opens "skipped").
  initialStatus?: DayStatus;
  knownCross: string[];
  knownSkip: string[];
  onSave: (status: DayStatus, tags: string[], note: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<DayStatus>(current.status ?? initialStatus ?? "cross");
  const [crossTags, setCrossTags] = useState<string[]>(
    current.status === "cross" ? current.statusTags ?? [] : []
  );
  const [skipTags, setSkipTags] = useState<string[]>(
    current.status === "skipped" ? current.statusTags ?? [] : []
  );
  const [note, setNote] = useState(current.statusNote ?? "");

  const h = dayHeader(date);
  const tags = status === "cross" ? crossTags : skipTags;
  const setTags = status === "cross" ? setCrossTags : setSkipTags;
  const options = status === "cross"
    ? [...new Set([...CROSS_ACTIVITIES, ...knownCross])]
    : [...new Set([...SKIP_REASONS, ...knownSkip])];

  const save = () => {
    onSave(status, tags, note.trim());
    onClose();
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Log what happened">
        <div className="sheet-grabber" />
        <div style={{ margin: "8px 2px 14px" }}>
          <div className="ex-name" style={{ fontSize: 18 }}>What happened?</div>
          <div className="ex-meta">{h.dow} · {h.label} — no routine logged</div>
        </div>

        <div className="ls-seg" role="group" aria-label="Day type" style={{ display: "flex", width: "100%" }}>
          <button type="button" className={status === "cross" ? "active" : ""} style={{ flex: 1 }} onClick={() => setStatus("cross")}>
            🏃 Sport + stretch
          </button>
          <button type="button" className={status === "skipped" ? "active" : ""} style={{ flex: 1 }} onClick={() => setStatus("skipped")}>
            ⏸ Couldn't train
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="tiny muted" style={{ marginBottom: 8, fontWeight: 650 }}>
            {status === "cross"
              ? "Which sport? (tap or add your own — then check off your stretches)"
              : "Why did you miss it? (tap or add your own)"}
          </div>
          <ChipSelect
            values={tags}
            onChange={setTags}
            options={options}
            addPlaceholder={status === "cross" ? "Add a sport…" : "Add a reason…"}
          />
        </div>

        <label style={{ display: "block", marginTop: 16 }}>
          <span className="tiny muted" style={{ fontWeight: 650 }}>Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={status === "cross" ? "e.g. 2h bouldering session" : "e.g. slept badly, back to it tomorrow"}
            rows={2}
            style={{
              width: "100%", marginTop: 6, resize: "vertical", font: "inherit",
              padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12,
              background: "var(--bg)", color: "var(--ink)", boxSizing: "border-box",
            }}
          />
        </label>

        <button className="btn primary block" style={{ marginTop: 16 }} onClick={save}>Save</button>
        {current.status && (
          <button className="link" style={{ marginTop: 12, display: "block", width: "100%", textAlign: "center", color: "var(--ink-2)" }} onClick={() => { onClear(); onClose(); }}>
            Clear this entry
          </button>
        )}
      </div>
    </>
  );
}
