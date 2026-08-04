import { useSyncExternalStore } from "react";

// A tiny app-wide toast store. Any module can call toast(message) to show a
// brief confirmation (e.g. "Workout saved") without threading state through the
// component tree. Rendered once by <Toaster/>.
export interface ToastItem {
  id: number;
  message: string;
  tone: "ok" | "error";
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function toast(message: string, tone: ToastItem["tone"] = "ok") {
  const id = ++seq;
  items = [...items, { id, message, tone }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 2600);
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items
  );
}
