import { useEffect, useRef, useState, type ReactNode } from "react";

// ReorderList is a small dependency-free sortable list built on Pointer Events,
// so it works with both mouse and touch (the app is a mobile PWA and ships only
// react/react-dom). Dragging is started from a handle — spread `handleProps`
// onto the grip element inside renderItem. As the pointer moves the list
// reorders live around the dragged row (no drag ghost); on release it fires
// onReorder with the new item order. Rows are matched by getKey.
export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
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
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-sync with the parent's items whenever they change and we're not mid-drag
  // (adds, removes, renames, or the post-drop persisted order).
  const itemsKey = items.map(getKey).join("\n");
  useEffect(() => {
    if (!dragging.current) setOrder(items.map(getKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const byKey = new Map(items.map((i) => [getKey(i), i]));
  const ordered = order.map((k) => byKey.get(k)).filter((x): x is T => x !== undefined);

  const start = (e: React.PointerEvent, key: string) => {
    if (disabled) return;
    dragging.current = key;
    setDragKey(key);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const key = dragging.current;
    const container = containerRef.current;
    if (!key || !container) return;
    const rows = [...container.querySelectorAll<HTMLElement>(":scope > [data-rk]")]
      .filter((el) => el.dataset.rk !== key);
    const y = e.clientY;
    let insert = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { insert = i; break; }
    }
    const others = order.filter((k) => k !== key);
    const next = [...others.slice(0, insert), key, ...others.slice(insert)];
    setOrder((prev) => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
  };

  const end = () => {
    const key = dragging.current;
    if (!key) return;
    dragging.current = null;
    setDragKey(null);
    const before = items.map(getKey);
    if (order.length !== before.length || order.some((k, i) => k !== before[i])) {
      onReorder(order.map((k) => byKey.get(k)).filter((x): x is T => x !== undefined));
    }
  };

  const handleProps = (key: string): HandleProps => ({
    onPointerDown: (e) => start(e, key),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    style: { touchAction: "none", cursor: disabled ? "default" : "grab" },
  });

  return (
    <div ref={containerRef} className={className}>
      {ordered.map((item) => {
        const key = getKey(item);
        return (
          <div key={key} data-rk={key} className={dragKey === key ? "rdrag" : undefined}>
            {renderItem(item, { dragging: dragKey === key, handleProps: handleProps(key) })}
          </div>
        );
      })}
    </div>
  );
}
