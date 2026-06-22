// Custom OS titlebar (the native one is removed via `decorations: false`). It's
// themed like the terminal and carries only minimize + close — no maximize,
// since the window can't be maximized anyway. The bar is draggable
// (`data-tauri-drag-region`); the buttons sit on top and stay clickable. An
// icon slot loads /branding/icon.png if present (drop your logo there).

import { getCurrentWindow } from "@tauri-apps/api/window";

function win() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <img
          className="tb-icon"
          src="/branding/icon.svg"
          alt=""
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
        <span className="tb-name" data-tauri-drag-region>
          ngc7023
        </span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn" title="minimize" onClick={() => win()?.minimize()?.catch(() => {})}>
          –
        </button>
        <button className="tb-btn tb-close" title="close" onClick={() => win()?.close()?.catch(() => {})}>
          ×
        </button>
      </div>
    </div>
  );
}
