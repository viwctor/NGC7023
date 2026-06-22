// Keyboard shortcuts. Every binding is fixed — there is no rebinding. The
// terminal's global handler checks `matchesBinding`; the shortcuts modal just
// renders the list for reference.

import type { TKey } from "./i18n";

export type ActionId =
  | "submit"
  | "newline"
  | "history"
  | "paste"
  | "clear"
  | "focus"
  | "clearPresets";

export interface Binding {
  /** event.key (single char lowercased, or a symbolic label for display). */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}

export const ACTION_LABELS: Record<ActionId, TKey> = {
  submit: "sc.submit",
  newline: "sc.newline",
  history: "sc.history",
  paste: "sc.paste",
  clear: "sc.clear",
  focus: "sc.focus",
  clearPresets: "sc.clearPresets",
};

export const DEFAULTS: Record<ActionId, Binding> = {
  submit: { key: "Enter" },
  newline: { key: "Enter", shift: true },
  history: { key: "↑ ↓" },
  paste: { key: "v", ctrl: true },
  clear: { key: "Backspace", shift: true },
  focus: { key: "/" },
  clearPresets: { key: "Backspace", ctrl: true },
};

export const ACTION_ORDER: ActionId[] = [
  "submit",
  "newline",
  "history",
  "paste",
  "clear",
  "focus",
];

/** Caps to draw for a binding, e.g. ["ctrl", "v"] or ["↑ ↓"]. */
export function caps(b: Binding): string[] {
  const out: string[] = [];
  if (b.ctrl) out.push("ctrl");
  if (b.shift) out.push("shift");
  out.push(b.key);
  return out;
}

/** Whether a keyboard event matches a fixed binding. */
export function matchesBinding(b: Binding, e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === b.key.toLowerCase() &&
    !!b.ctrl === (e.ctrlKey || e.metaKey) &&
    !!b.shift === e.shiftKey
  );
}
