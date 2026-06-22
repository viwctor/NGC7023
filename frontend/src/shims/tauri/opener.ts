// Replaces `@tauri-apps/plugin-opener`. Opens a file/folder, reveals an item in
// the OS file manager, or opens a URL in the default browser — handled in Python.

import { call } from "./_bridge";

export function openPath(path: string): Promise<void> {
  return call<void>("open_path", { path });
}

export function revealItemInDir(path: string): Promise<void> {
  return call<void>("reveal_item", { path });
}

export function openUrl(url: string): Promise<void> {
  return call<void>("open_url", { url });
}
