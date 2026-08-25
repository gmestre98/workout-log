import { useEffect, useRef, useState } from "react";
import type { Exercise, Unit } from "../types";
import { orderedParts, primaryMuscle } from "../format";
import { IconPlus } from "./icons";

// DayBody renders one workout day's exercises grouped by part (the within-day
// section, an exercise's timeSlot) and makes the whole day one drag surface:
// - drag an exercise anywhere in the day — dropping it under a part header moves
//   it into that part (so even a one-exercise part can be reorganised);
// - drag a part header to move that whole part (header + its exercises).
// Reordering is a dependency-free Pointer Events drag (touch + mouse); the moved
// unit follows the finger while the other rows slide out of the way. On release
// onReorder fires with the day's exercises in their new order and parts.

type Row =
  | { kind: "header"; part: string; key: string }
  | { kind: "ex"; ex: Exercise; part: string; key: string };

const unitSuffix = (u: Unit) => (u === "reps" ? "" : u === "seconds" ? "s" : "min");

interface Drag {
  lo: number; hi: number;      // inclusive row-index range of the moving unit
  kind: "ex" | "part";
  startY: number; dy: number;  // pointer delta
  ti: number;                  // insertion index among rows outside the unit
  unitH: number;               // pixel height the unit occupies (incl. gap)
  mids: number[];              // each row's centre-Y at grab time
  bounds: number[] | null;     // for a part: the only valid insertion indices
                               // (part boundaries), so it can't split another part
}

function buildRows(exercises: Exercise[]): { rows: Row[]; parts: string[] } {
  const parts = orderedParts(exercises);
  const rows: Row[] = [];
  for (const part of parts) {
    // The unnamed part ("") is the day's flat/unsorted section — its exercises
    // render as a plain list with no header, so a day with no time-of-day blocks
    // reads as a single workout.
    if (part !== "") rows.push({ kind: "header", part, key: `h:${part}` });
    for (const ex of exercises.filter((e) => e.timeSlot === part)) {
      rows.push({ kind: "ex", ex, part, key: ex.id });
    }
  }
  return { rows, parts };
}

export function DayBody({
  exercises, disabled, onReorder, onEdit, onAddExercise, onAddPart,
}: {
  exercises: Exercise[];
  disabled?: boolean;
  onReorder: (next: Exercise[]) => void;
  onEdit: (ex: Exercise) => void;
  onAddExercise: (part: string) => void;
  onAddPart: () => void;
}) {
  const { rows, parts } = buildRows(exercises);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef(false);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear any stale drag when the underlying data changes (e.g. after a drop
  // persists) so transforms don't linger against a new row set.
  const sig = rows.map((r) => r.key).join("\n");
  useEffect(() => { if (!dragging.current) setDrag(null); }, [sig]);

  const canDragEx = exercises.length > 1;
  const canDragPart = parts.length > 1;

  const rowEls = () =>
    containerRef.current
      ? [...containerRef.current.querySelectorAll<HTMLElement>(":scope > [data-idx]")]
      : [];

  // Activation. A row is picked up either immediately from its ⠿ grip, or from
  // anywhere on the row by press-and-hold (touch) / click-and-move (mouse) — so a
  // quick tap still edits and a quick swipe still scrolls the list.
  const HOLD_MS = 200;   // touch hold before a row is picked up
  const MOVE_TOL = 8;    // px of movement during the hold that means "scrolling"
  const MOUSE_DIST = 5;  // px of mouse movement that starts a drag
  const pending = useRef<
    { el: HTMLElement; pointerId: number; mouse: boolean; startX: number; startY: number; lo: number; hi: number; kind: "ex" | "part"; timer: number } | null
  >(null);
  const justDragged = useRef(false);
  // Non-passive so it can cancel the page scroll while a drag is active. The row
  // was held still, so no scroll has begun and the touchmove is still cancelable.
  const preventScroll = useRef((e: TouchEvent) => { if (dragging.current) e.preventDefault(); });
  useEffect(() => () => document.removeEventListener("touchmove", preventScroll.current), []);

  // The draggable unit for a row: an exercise moves alone; a part header moves
  // the whole part block. Null when there's nothing to reorder (so taps edit).
  const unitFor = (i: number): { lo: number; hi: number; kind: "ex" | "part" } | null => {
    const rws = rowsRef.current;
    if (rws[i].kind === "header") {
      if (!canDragPart) return null;
      let hi = i;
      while (hi + 1 < rws.length && rws[hi + 1].kind === "ex") hi++;
      return { lo: i, hi, kind: "part" };
    }
    if (!canDragEx) return null;
    return { lo: i, hi: i, kind: "ex" };
  };

  const beginDrag = (lo: number, hi: number, kind: "ex" | "part", startY: number, el: HTMLElement, pointerId: number, touch: boolean) => {
    const rects = rowEls().map((r) => r.getBoundingClientRect());
    if (rects.length !== rowsRef.current.length) { pending.current = null; return; }
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    const unitH = rects[hi].bottom - rects[lo].top + gap;
    // A part may only be dropped at a part boundary (before another part's header
    // or at the ends), never inside a part — that would split header from body.
    let bounds: number[] | null = null;
    if (kind === "part") {
      const rest = rowsRef.current.filter((_, j) => j < lo || j > hi);
      bounds = [0];
      for (let i = 1; i < rest.length; i++) if (rest[i].kind === "header") bounds.push(i);
      bounds.push(rest.length);
    }
    pending.current = null;
    dragging.current = true;
    setDrag({ lo, hi, kind, startY, dy: 0, ti: lo, unitH, bounds, mids: rects.map((r) => r.top + r.height / 2) });
    try { el.setPointerCapture(pointerId); } catch { /* ignore */ }
    if (touch) document.addEventListener("touchmove", preventScroll.current, { passive: false });
  };

  const move = (clientY: number) => {
    setDrag((d) => {
      if (!d) return d;
      const dy = clientY - d.startY;
      const unitMid = (d.mids[d.lo] + d.mids[d.hi]) / 2 + dy;
      let ti = 0;
      for (let j = 0; j < d.mids.length; j++) if ((j < d.lo || j > d.hi) && d.mids[j] < unitMid) ti++;
      // Snap a part to the nearest valid boundary so it can't split another part.
      if (d.bounds) ti = d.bounds.reduce((best, b) => (Math.abs(b - ti) < Math.abs(best - ti) ? b : best), d.bounds[0]);
      return { ...d, dy, ti };
    });
  };

  const end = (commit: boolean) => {
    dragging.current = false;
    setDrag((d) => {
      if (d && commit) {
        const rws = rowsRef.current;
        const unit = rws.slice(d.lo, d.hi + 1);
        const rest = rws.filter((_, j) => j < d.lo || j > d.hi);
        const next = [...rest.slice(0, d.ti), ...unit, ...rest.slice(d.ti)];
        if (next.some((r, i) => r.key !== rws[i].key)) {
          // Walk the new row order; each exercise adopts the part of the header
          // above it, giving a coherent (contiguous) grouping after any move.
          let cur = parts[0] ?? "";
          const result: Exercise[] = [];
          for (const r of next) {
            if (r.kind === "header") cur = r.part;
            else result.push(r.ex.timeSlot === cur ? r.ex : { ...r.ex, timeSlot: cur });
          }
          onReorder(result);
        }
      }
      return null;
    });
  };

  const finish = (commit: boolean) => {
    document.removeEventListener("touchmove", preventScroll.current);
    if (dragging.current) {
      justDragged.current = true; // swallow the click that follows a drag
      window.setTimeout(() => { justDragged.current = false; }, 350);
    }
    end(commit);
  };

  const clearPending = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const onDown = (e: React.PointerEvent, i: number) => {
    if (disabled) return;
    const t = e.target as HTMLElement;
    if (t.closest(".pb-add")) return; // the add-exercise button
    const u = unitFor(i);
    if (!u) return; // nothing to reorder here — leave the tap for editing
    const el = e.currentTarget as HTMLElement;
    const touch = e.pointerType !== "mouse";
    if (t.closest(".grip")) { beginDrag(u.lo, u.hi, u.kind, e.clientY, el, e.pointerId, touch); return; }
    const timer = e.pointerType === "mouse" ? 0 : window.setTimeout(() => {
      const p = pending.current;
      if (p) beginDrag(p.lo, p.hi, p.kind, p.startY, p.el, p.pointerId, true);
    }, HOLD_MS);
    pending.current = { el, pointerId: e.pointerId, mouse: !touch, startX: e.clientX, startY: e.clientY, ...u, timer };
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) { move(e.clientY); return; }
    const p = pending.current;
    if (!p) return;
    const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (p.mouse) { if (dist > MOUSE_DIST) beginDrag(p.lo, p.hi, p.kind, p.startY, p.el, p.pointerId, false); }
    else if (dist > MOVE_TOL) clearPending(); // a swipe: let the list scroll
  };

  const onUp = () => { if (dragging.current) finish(true); else clearPending(); };
  const onCancel = () => { if (dragging.current) finish(false); else clearPending(); };

  const rowHandlers = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => onDown(e, i),
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onCancel,
  });

  const transformFor = (j: number): React.CSSProperties => {
    if (!drag) return {};
    if (j >= drag.lo && j <= drag.hi) {
      return { transform: `translateY(${drag.dy}px)`, transition: "none", position: "relative", zIndex: 6 };
    }
    const reduced = j < drag.lo ? j : j - (drag.hi - drag.lo + 1);
    const shift = (j > drag.hi ? -drag.unitH : 0) + (reduced >= drag.ti ? drag.unitH : 0);
    return { transform: `translateY(${shift}px)`, transition: "transform .18s cubic-bezier(.2,0,0,1)" };
  };

  return (
    <>
      <div className={`day-body${parts.some((p) => p !== "") ? "" : " flat"}`} ref={containerRef}>
        {rows.map((row, i) => {
          const isMoving = !!drag && i >= drag.lo && i <= drag.hi;
          return (
            <div key={row.key} data-idx={i} className={isMoving ? "rdrag" : undefined} style={transformFor(i)}>
              {row.kind === "header" ? (
                <div className={`pb-head${canDragPart ? " draggable" : ""}`} {...(canDragPart ? rowHandlers(i) : {})}>
                  {canDragPart ? <span className="grip" aria-hidden>⠿</span> : <span className="grip-sp" />}
                  <span className="part-title">{row.part || "Unsorted"}</span>
                  <span className="part-count num">{exercises.filter((e) => e.timeSlot === row.part).length}</span>
                  <button className="pb-add" onClick={() => onAddExercise(row.part)} disabled={disabled} aria-label={`Add exercise to ${row.part || "part"}`}><IconPlus /></button>
                </div>
              ) : (
                <div className={`pb-ex${canDragEx ? " draggable" : ""}`} style={row.ex.active ? undefined : { opacity: 0.5 }} {...(canDragEx ? rowHandlers(i) : {})}>
                  {canDragEx ? <span className="grip" aria-hidden>⠿</span> : <span className="grip-sp" />}
                  <button className="day-ex" onClick={() => { if (justDragged.current) return; onEdit(row.ex); }} disabled={disabled}>
                    <span className="dx-body">
                      <span className="dx-name">{row.ex.name}{!row.ex.active && <span className="pillbadge" style={{ marginLeft: 6 }}>off</span>}</span>
                      <span className="dx-meta">{row.ex.plannedSets} × {row.ex.plannedAmount} {unitSuffix(row.ex.unit)}{row.ex.perSide ? " · per side" : ""}{row.ex.restSeconds > 0 ? ` · ${row.ex.restSeconds}s rest` : ""}</span>
                    </span>
                    {row.ex.muscleGroup && <span className="pillbadge">{primaryMuscle(row.ex.muscleGroup)}</span>}
                    <span className="dx-chev">›</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {parts.some((p) => p !== "") ? (
        <button className="add-part" onClick={onAddPart} disabled={disabled}>
          <IconPlus /> Add part
        </button>
      ) : (
        <div className="day-foot">
          <button className="add-part" onClick={() => onAddExercise("")} disabled={disabled}>
            <IconPlus /> Add exercise
          </button>
          <button className="add-part" onClick={onAddPart} disabled={disabled}>
            <IconPlus /> Split into parts
          </button>
        </div>
      )}
    </>
  );
}
