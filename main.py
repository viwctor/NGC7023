"""Application entry point: creates the pywebview window and starts the GUI.

Run with ``python -m ngc7023`` (see ``__main__.py``). The window is frameless to
match the custom terminal titlebar (no native window decorations), sized
like the original app. The React build lives in ``ngc7023/web`` and is loaded
from disk — there is no dev server in production.
"""

from __future__ import annotations

import os
import sys

import webview
from webview.dom import DOMEventHandler

from . import bin as binmod
from .api import Api
from .jobs import updater
from .single_instance import SingleInstance

WINDOW_TITLE = "NGC7023"
BG_COLOR = "#04060a"  # matches the terminal --bg so there's no white flash


def _web_index() -> str:
    """Location of the built frontend (a file path in prod, dev server in dev)."""
    dev_url = os.environ.get("NGC_DEV_URL")
    if dev_url:
        return dev_url
    index = binmod.resource_path("web", "index.html")
    if not index.exists():
        raise SystemExit(
            "Frontend not built. Run `npm install && npm run build` in ./frontend "
            f"(expected {index})."
        )
    return str(index)


def _setup_dnd(window, api: Api) -> None:
    """Registers a native file-drop handler and forwards absolute paths to the
    frontend over the event bus.

    pywebview only captures dropped-file paths when a drop handler is registered
    through its DOM pipeline, so this must exist for drag-and-drop to work.
    """

    def on_drop(event: dict) -> None:
        try:
            files = (event.get("dataTransfer") or {}).get("files") or []
            paths = [f.get("pywebviewFullPath") for f in files]
            paths = [p for p in paths if p]
        except Exception:
            paths = []
        if paths:
            api.emit("ngc:drop", {"paths": paths})

    try:
        window.dom.document.events.drop += DOMEventHandler(on_drop, prevent_default=True)
    except Exception:
        pass  # drag-drop just stays inactive if the DOM API shape changes


def main() -> None:
    # Single instance: if the app is already running (e.g. minimized to the
    # tray), tell it to show its window and exit — otherwise relaunching would
    # spawn a second process and a duplicate tray icon. A `--relaunch` (from
    # restart_app) waits for the old instance's port instead of deferring.
    instance = SingleInstance()
    if not instance.acquire(wait="--relaunch" in sys.argv):
        return

    api = Api()
    # Keep yt-dlp current (writable app-data copy + throttled self-update).
    updater.init()
    # Launched by autostart with --tray: start hidden, living in the tray.
    minimized = "--tray" in sys.argv or "--minimized" in sys.argv
    window = webview.create_window(
        WINDOW_TITLE,
        _web_index(),
        js_api=api,
        width=520,
        height=720,
        min_size=(440, 560),
        resizable=True,
        frameless=True,
        easy_drag=False,  # only the titlebar's drag region moves the window
        background_color=BG_COLOR,
        hidden=minimized,
    )
    api.bind(window)

    def _activate() -> None:
        # A second launch pinged us: surface the window (it may be hidden in the
        # tray or minimized) instead of letting that launch start a new process.
        try:
            window.show()
            window.restore()
        except Exception:
            pass

    instance.on_activate = _activate

    def on_loaded() -> None:
        _setup_dnd(window, api)
        if minimized:
            api._tray_enabled = True
            if not api.ensure_tray():
                # Tray unavailable → never leave the window hidden/unreachable.
                try:
                    window.show()
                except Exception:
                    pass

    window.events.loaded += on_loaded

    debug = bool(os.environ.get("NGC_DEBUG"))
    # pywebview defaults to private_mode=True (ephemeral) — that wiped the app's
    # localStorage every launch (the language picker kept reappearing, themes/
    # prefs reset). Persist to a stable per-user folder instead.
    storage = binmod.data_dir() / "webview"
    try:
        storage.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    webview.start(debug=debug, private_mode=False, storage_path=str(storage))


if __name__ == "__main__":
    sys.exit(main())  # type: ignore[func-returns-value]
