"""Resolves bundled sidecar binaries (ffmpeg / ffprobe / yt-dlp).

Looks for the binary next to the app (when
frozen) or in a ``binaries/`` dir, and otherwise falls back to the bare name on
PATH. yt-dlp later gets a writable managed copy in app-data for self-update; that
override is registered via :func:`set_managed`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

_managed: dict[str, str] = {}


def _exe(name: str) -> str:
    return f"{name}.exe" if sys.platform == "win32" else name


def app_dir() -> Path:
    """Directory the app runs from: the frozen exe's folder, or the package dir."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def resource_path(*parts: str) -> Path:
    """Absolute path to a bundled data resource (the built ``web/`` assets, the
    tray icon, …). A PyInstaller build unpacks data under ``sys._MEIPASS``; in
    dev the same files live inside the package directory. Use this — not
    ``__file__`` — for anything bundled as data, so it resolves in both."""
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    else:
        base = Path(__file__).resolve().parent
    return base.joinpath(*parts)


def set_managed(name: str, path: str) -> None:
    """Point future ``resolve(name)`` calls at a specific path (e.g. the writable
    self-updating yt-dlp copy in app-data)."""
    _managed[name] = path


def data_dir() -> Path:
    """Per-user writable app-data dir (settings stamps, the self-updating yt-dlp
    copy, the webview storage). ``%LOCALAPPDATA%\\ngc7023`` on Windows;
    ``$XDG_DATA_HOME`` (``~/.local/share``) ``/ngc7023`` elsewhere — so we don't
    drop a stray ``~/ngc7023`` folder in the user's home on Linux."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(
            os.path.expanduser("~"), ".local", "share"
        )
    return Path(base) / "ngc7023"


def bundled(name: str) -> Optional[str]:
    """Path to the binary shipped with the app (ignoring any managed override):
    next to the exe, a ``binaries`` dir beside it (production), or a repo-root
    ``binaries`` dir (dev). ``None`` if not found."""
    exe = _exe(name)
    for candidate in (
        app_dir() / exe,
        app_dir() / "binaries" / exe,
        app_dir().parent / "binaries" / exe,  # dev: <repo>/binaries
    ):
        if candidate.exists():
            return str(candidate)
    return None


def resolve(name: str) -> str:
    """Absolute path to the binary, or the bare name to use PATH.

    Order: a managed override (e.g. the self-updating yt-dlp copy), then the
    bundled sidecar, then the bare name so PATH is the last resort.
    """
    if name in _managed:
        return _managed[name]
    return bundled(name) or name
