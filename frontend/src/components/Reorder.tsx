import { useEffect, useRef, useState, type ReactNode } from "react";

// ReorderList is a small dependency-free sortable list built on Pointer Events,
// so it works with both mouse and touch (the app is a mobile PWA and ships only
// react/react-dom). Dragging starts from a handle — spread `handleProps` onto
// the grip element inside renderItem.
//
// Feel: the dragged row follows the finger 1:1 while the other rows slide out of
// its way with a short transition (rather than the list snapping between slots).
// The order only actually changes on release, when onReorder fires with the new
// item order. Rows are matched by getKey.
export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
}

interface DragState {
  key: string;
  di: number;      // index of the dragged row
  h: number;       // its height (the size of the gap that moves around)
  startY: number;  // pointer Y at grab
  dy: number;      // current pointer delta
  ti: number;      // target insertion index among the other rows
  centers: number[]; // viewport-Y centre of every row at grab time
}

export function ReorderList<T>({
  items, getKey, onReorder, disabled, renderItem, className,
}: {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (next: T[]) => void;
  disabled?: boolean;
  renderItem: (item: T, opts: { dragging: boolean; handleProps: HandleProps }) => ReactNode;
  className?: string;
}) {
  const [order, setOrder] = useState<string[]>(() => items.map(getKey));
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-sync with the parent's items when they change and we're not mid-drag
  // (adds, removes, renames, or the post-drop persisted order).
  const itemsKey = items.map(getKey).join("\n");
  useEffect(() => {
    if (!dragging.current) setOrder(items.map(getKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const byKey = new Map(items.map((i) => [getKey(i), i]));
  const ordered = order.map((k) => byKey.get(k)).filter((x): x is T => x !== undefined);

  const rowEls = () =>
    containerRef.current
      ? [...containerRef.current.querySelectorAll<HTMLElement>(":scope > [data-rk]")]
      : [];

  const start = (e: React.PointerEvent, key: string) => {
    if (disabled) return;
    const di = order.indexOf(key);
    if (di < 0) return;
    const rects = rowEls().map((el) => el.getBoundingClientRect());
    if (rects.length !== order.length) return;
    // The space the dragged row occupies = its own height + the inter-row gap
    // (a uniform margin within a list). Displaced rows shift by exactly this, so
    // rows of differing heights — e.g. day cards — line up whichever way it moves.
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    const h = rects[di].height + gap;
    dragging.current = true;
    setDrag({
      key, di, h, startY: e.clientY, dy: 0, ti: di,
      centers: rects.map((r) => r.top + r.height / 2),
    });
    // Capture so pointer moves keep reaching the grip even past its bounds. Wrap
    // it: a failed capture must not abort the drag we've already begun.
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const move = (e: React.PointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const dy = e.clientY - d.startY;
      const draggedCenter = d.centers[d.di] + dy;
      // Insertion index = how many *other* rows sit above the dragged centre.
      let ti = 0;
      for (let j = 0; j < d.centers.length; j++) {
        if (j !== d.di && d.centers[j] < draggedCenter) ti++;
      }
      return { ...d, dy, ti };
    });
  };

  const end = (commit: boolean) => {
    dragging.current = false;
    setDrag((d) => {
      if (d && commit && d.ti !== d.di) {
        const next = [...order];
        const [m] = next.splice(d.di, 1);
        next.splice(d.ti, 0, m);
        setOrder(next);
        const before = items.map(getKey);
        if (next.length !== before.length || next.some((k, i) => k !== before[i])) {
          onReorder(next.map((k) => byKey.get(k)).filter((x): x is T => x !== undefined));
        }
      }
      return null;
    });
  };

  const handleProps = (key: string): HandleProps => ({
    onPointerDown: (e) => start(e, key),
    onPointerMove: move,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    style: { touchAction: "none", cursor: disabled ? "default" : "grab" },
  });

  // Transform for the row at index j: the dragged row follows the finger; every
  // other row shifts by exactly the dragged row's height as the gap moves — one
  // slot down if it now sits at/after the insertion point, one slot up if it was
  // below the dragged row's old spot. Exact regardless of differing row heights.
  const transformFor = (j: number): React.CSSProperties => {
    if (!drag) return {};
    if (j === drag.di) {
      return { transform: `translateY(${drag.dy}px)`, transition: "none", zIndex: 5, position: "relative" };
    }
    const reduced = j < drag.di ? j : j - 1;
    const shift = (j > drag.di ? -drag.h : 0) + (reduced >= drag.ti ? drag.h : 0);
    return { transform: `translateY(${shift}px)`, transition: "transform .18s cubic-bezier(.2,0,0,1)" };
  };

  return (
    <div ref={containerRef} className={className}>
      {ordered.map((item, j) => {
        const key = getKey(item);
        const isDragged = drag?.key === key;
        return (
          <div key={key} data-rk={key} className={isDragged ? "rdrag" : undefined} style={transformFor(j)}>
            {renderItem(item, { dragging: isDragged, handleProps: handleProps(key) })}
          </div>
        );
      })}
    </div>
  );
}
