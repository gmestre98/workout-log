import { useEffect, type ReactNode } from "react";

// Modal is a centered dialog with a dimmed backdrop, scoped to the app column.
// It replaces the browser's native confirm()/prompt(), which render as jarring
// system dialogs (e.g. Android's default popup) outside the app's design.
export function Modal({
  title,
  children,
  onClose,
  labelledBy = "modal-title",
}: {
  title?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  labelledBy?: string;
}) {
  // Close on Escape for keyboard/desktop use.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={title ? labelledBy : undefined}>
        {title && <div className="modal-title" id={labelledBy}>{title}</div>}
        {children}
      </div>
    </>
  );
}

// ConfirmDialog is a titled yes/no modal. `danger` styles the confirm button as
// destructive (used for sign out and deletes).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={busy ? undefined : onCancel}>
      <p className="modal-msg">{message}</p>
      <div className="modal-btns">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button className={`btn ${danger ? "danger-solid" : "primary"}`} onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
