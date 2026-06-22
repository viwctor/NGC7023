// Shared keyboard helpers so global shortcuts behave consistently and never
// hijack normal typing.

/** True when focus is in an editable field (input/textarea/select/contenteditable). */
export function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/** Heuristic: looks like a local file path (Windows drive, posix, or path+ext). */
export function isFilePath(text: string): boolean {
  const t = text.trim();
  if (!t || isUrl(t)) return false;
  return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("/") || /[\\/].+\.[a-z0-9]{2,5}$/i.test(t);
}
