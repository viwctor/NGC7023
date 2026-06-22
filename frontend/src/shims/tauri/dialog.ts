// Replaces `@tauri-apps/plugin-dialog`. Only `open` is used. Returns a single
// path (or null) unless `multiple` is set, mirroring the Tauri contract the UI
// relies on (`typeof res === "string"` vs `Array.isArray(res)`).

import { call } from "./_bridge";

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: DialogFilter[];
  title?: string;
}

export function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  return call<string | string[] | null>("dialog_open", {
    multiple: options.multiple ?? false,
    directory: options.directory ?? false,
    filters: options.filters ?? [],
  });
}
