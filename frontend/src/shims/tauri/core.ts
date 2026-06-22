// Replaces `@tauri-apps/api/core`. The UI calls `invoke(cmd, args)` exactly as
// before; we route it to the Python `Api` method of the same name via pywebview.

import { call } from "./_bridge";

export function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return call<T>(cmd, args);
}
