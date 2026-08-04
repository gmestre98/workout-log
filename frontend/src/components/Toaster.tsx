import { dismissToast, useToasts } from "../toast";
import { IconCheck } from "./icons";

// Toaster renders the current toast stack near the bottom of the app column.
// Mounted once at the app root.
export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.tone}`} onClick={() => dismissToast(t.id)}>
          <span className="toast-ic">{t.tone === "ok" ? <IconCheck /> : "!"}</span>
          <span>{t.message}</span>
        </button>
      ))}
    </div>
  );
}
