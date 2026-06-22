"""Resolves bundled sidecar binaries (ffmpeg / ffprobe / yt-dlp).

Mirrors the old Tauri `jobs/bin.rs`. Looks for the binary next to the app (when
frozen) or in a ``binaries/`` dir, and otherwise falls back to the bare name on
PATH. yt-dlp later gets a writable managed copy in app-data for self-update; that
override is registered via :func:`set_managed`.
"""

from __future__ import annotations

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


def set_managed(name: str, path: str) -> None:
    """Point future ``resolve(name)`` calls at a specific path (e.g. the writable
    self-updating yt-dlp copy in app-data)."""
    _managed[name] = path


def resolve(name: str) -> str:
    """Absolute path to the bundled binary, or the bare name to use PATH.

    Search order: a managed override, then next to the app / a ``binaries`` dir
    beside it (production), then a repo-root ``binaries`` dir (dev convenience),
    then the bare name so PATH is used as a last resort.
    """
    if name in _managed:
        return _managed[name]
    exe = _exe(name)
    candidates = (
        app_dir() / exe,
        app_dir() / "binaries" / exe,
        app_dir().parent / "binaries" / exe,  # dev: <repo>/binaries
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return name
