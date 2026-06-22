// Replaces `@tauri-apps/api/event`. Backed by the Python -> JS event bus in
// _bridge; the Python job engine calls `window.__ngc.emit(name, payload)`.

import { on } from "./_bridge";

export type UnlistenFn = () => void;

export interface Event<T> {
  event: string;
  payload: T;
}

export function listen<T>(
  event: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  const off = on(event, (payload) => handler({ event, payload: payload as T }));
  return Promise.resolve(off);
}
