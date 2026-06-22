// Replaces `@tauri-apps/api/window`. Only the methods the titlebar / exit command
// use are wired (minimize, close); the rest are harmless stubs so any stray call
// resolves instead of throwing.

import { call } from "./_bridge";

class AppWindow {
  minimize(): Promise<void> {
    return call<void>("window_minimize");
  }
  close(): Promise<void> {
    return call<void>("window_close");
  }
  maximize(): Promise<void> {
    return call<void>("window_maximize");
  }
  startDragging(): Promise<void> {
    // Dragging is handled by CSS drag regions (see _bridge); nothing to do.
    return Promise.resolve();
  }
}

const current = new AppWindow();

export function getCurrentWindow(): AppWindow {
  return current;
}
