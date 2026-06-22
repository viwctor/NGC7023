// Lightweight floating modal (overlay + centered panel). Keyboard: Esc or Enter
// closes it quickly; ←/→ (and ↑/↓) move focus between its buttons, and Enter on
// a focused button activates that button instead of closing.

import { useEffect, useRef } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissOnAnyKey,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When set, ↑/↓ (and PageUp/Down, Home/End) scroll the panel and ANY other
   *  key closes it. Used by the help window (no close button). */
  dismissOnAnyKey?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const SCROLL: Record<string, number> = { ArrowUp: -48, ArrowDown: 48, PageUp: -240, PageDown: 240, Home: -1e9, End: 1e9 };
    const onKey = (e: KeyboardEvent) => {
      if (dismissOnAnyKey) {
        if (e.key in SCROLL) {
          e.preventDefault();
          if (ref.current) ref.current.scrollTop += SCROLL[e.key];
          return;
        }
        // Any other key dismisses (Esc, Enter, letters, …).
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Enter") {
        // No button focused → Enter just closes. A focused button activates
        // natively (don't preventDefault), so don't also close.
        if (idx < 0) {
          e.preventDefault();
          onClose();
        }
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowUp") && buttons.length) {
        e.preventDefault();
        buttons[idx <= 0 ? buttons.length - 1 : idx - 1].focus();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowDown") && buttons.length) {
        e.preventDefault();
        buttons[idx < 0 || idx >= buttons.length - 1 ? 0 : idx + 1].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissOnAnyKey]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
