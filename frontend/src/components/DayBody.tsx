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
    rows.push({ kind: "header", part, key: `h:${part}` });
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

  const startUnit = (e: React.PointerEvent, lo: number, hi: number, kind: "ex" | "part") => {
    if (disabled) return;
    const rects = rowEls().map((el) => el.getBoundingClientRect());
    if (rects.length !== rowsRef.current.length) return;
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
    dragging.current = true;
    setDrag({ lo, hi, kind, startY: e.clientY, dy: 0, ti: lo, unitH, bounds, mids: rects.map((r) => r.top + r.height / 2) });
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const startEx = (e: React.PointerEvent, rowIndex: number) => startUnit(e, rowIndex, rowIndex, "ex");

  // A part header grabs the whole part block: the header plus every exercise row
  // until the next header (or the end).
  const startPart = (e: React.PointerEvent, headerIndex: number) => {
    const rws = rowsRef.current;
    let hi = headerIndex;
    while (hi + 1 < rws.length && rws[hi + 1].kind === "ex") hi++;
    startUnit(e, headerIndex, hi, "part");
  };

  const move = (e: React.PointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const dy = e.clientY - d.startY;
      const unitMid = (d.mids[d.lo] + d.mids[d.hi]) / 2 + dy;
      let ti = 0;
      for (let j = 0; j < d.mids.length; j++) {
        if ((j < d.lo || j > d.hi) && d.mids[j] < unitMid) ti++;
      }
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

  const handle = (onDown: (e: React.PointerEvent) => void) => ({
    onPointerDown: onDown,
    onPointerMove: move,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    style: { touchAction: "none" as const, cursor: disabled ? "default" : "grab" },
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
      <div className="day-body" ref={containerRef}>
        {rows.map((row, i) => {
          const isMoving = !!drag && i >= drag.lo && i <= drag.hi;
          return (
            <div key={row.key} data-idx={i} className={isMoving ? "rdrag" : undefined} style={transformFor(i)}>
              {row.kind === "header" ? (
                <div className="pb-head">
                  {canDragPart ? <span className="grip" aria-hidden {...handle((e) => startPart(e, i))}>⠿</span> : <span className="grip-sp" />}
                  <span className="part-title">{row.part || "Unsorted"}</span>
                  <span className="part-count num">{exercises.filter((e) => e.timeSlot === row.part).length}</span>
                  <button className="pb-add" onClick={() => onAddExercise(row.part)} disabled={disabled} aria-label={`Add exercise to ${row.part || "part"}`}><IconPlus /></button>
                </div>
              ) : (
                <div className="pb-ex" style={row.ex.active ? undefined : { opacity: 0.5 }}>
                  {canDragEx ? <span className="grip" aria-hidden {...handle((e) => startEx(e, i))}>⠿</span> : <span className="grip-sp" />}
                  <button className="day-ex" onClick={() => onEdit(row.ex)} disabled={disabled}>
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
      <button className="add-part" onClick={onAddPart} disabled={disabled}>
        <IconPlus /> Add part
      </button>
    </>
  );
}
