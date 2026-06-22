// Replaces `@tauri-apps/api/webview`. Only `onDragDropEvent` is used (Terminal).
//
// pywebview only attaches real file paths when a drop handler is registered on
// its own DOM pipeline (Python side, see main.py `_setup_dnd`). That handler
// forwards the absolute paths to us over the event bus as "ngc:drop". The DOM
// drag events here drive only the visual over/leave state — and the `dragover`
// preventDefault is required so a drop event fires at all.

import { on } from "./_bridge";

type DragKind = "enter" | "over" | "leave" | "drop";

interface DragDropPayload {
  type: DragKind;
  paths?: string[];
}

interface DragDropEvent {
  payload: DragDropPayload;
}

type Handler = (event: DragDropEvent) => void;
type UnlistenFn = () => void;

class Webview {
  onDragDropEvent(handler: Handler): Promise<UnlistenFn> {
    const fire = (type: DragKind, paths?: string[]) => handler({ payload: { type, paths } });

    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      fire("enter");
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault(); // required so the drop event fires
      fire("over");
    };
    const onLeave = () => fire("leave");

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);

    // Real dropped-file paths arrive from the Python side over the bus.
    const offBus = on("ngc:drop", (payload) => {
      const paths = (payload as { paths?: string[] })?.paths ?? [];
      fire("drop", paths);
    });

    return Promise.resolve(() => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      offBus();
    });
  }
}

const current = new Webview();

export function getCurrentWebview(): Webview {
  return current;
}
