// Shared pywebview bridge used by every Tauri compat shim.
//
// Responsibilities:
//  - resolve when `window.pywebview.api` is ready (it appears asynchronously),
//  - `call()` a Python `Api` method as an RPC (replaces Tauri's `invoke`),
//  - a Python -> JS event bus (`window.__ngc.emit`) so the job engine can push
//    `job:progress` / `job:done` (replaces Tauri's event system),
//  - turn `data-tauri-drag-region` elements into pywebview drag regions so the
//    frameless window can be moved by the custom titlebar.

type Listener = (payload: unknown) => void;

interface PyWebview {
  api: Record<string, (params?: unknown) => Promise<unknown>>;
}

interface EventBus {
  listeners: Map<string, Set<Listener>>;
  emit: (event: string, payload: unknown) => void;
}

declare global {
  interface Window {
    pywebview?: PyWebview;
    __ngc?: EventBus;
  }
}

// ── readiness ──────────────────────────────────────────────────────────────
let markReady: () => void;
export const ready: Promise<void> = new Promise((resolve) => {
  markReady = resolve;
});

if (typeof window !== "undefined") {
  if (window.pywebview?.api) markReady!();
  else window.addEventListener("pywebviewready", () => markReady!(), { once: true });
}

// ── event bus (Python -> JS) ───────────────────────────────────────────────
function makeBus(): EventBus {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    emit(event, payload) {
      listeners.get(event)?.forEach((cb) => {
        try {
          cb(payload);
        } catch {
          /* a bad listener must not break the others */
        }
      });
    },
  };
}

const bus: EventBus =
  typeof window !== "undefined" ? (window.__ngc ??= makeBus()) : makeBus();

export function on(event: string, cb: Listener): () => void {
  let set = bus.listeners.get(event);
  if (!set) {
    set = new Set();
    bus.listeners.set(event, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

// ── RPC ────────────────────────────────────────────────────────────────────
export async function call<T>(method: string, params?: unknown): Promise<T> {
  await ready;
  const api = window.pywebview?.api;
  if (!api || typeof api[method] !== "function") {
    throw new Error(`ngc7023 bridge: method unavailable: ${method}`);
  }
  return api[method](params ?? {}) as Promise<T>;
}

// ── drag regions ───────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const tag = () =>
    document
      .querySelectorAll("[data-tauri-drag-region]")
      .forEach((el) => el.classList.add("pywebview-drag-region"));
  const start = () => {
    tag();
    // The titlebar mounts after React commits, so keep tagging new nodes.
    new MutationObserver(tag).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
