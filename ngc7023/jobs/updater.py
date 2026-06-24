"""Keeps yt-dlp current.

yt-dlp breaks whenever sites change their layout, so a bundled-and-frozen copy
would rot fast. ``yt-dlp -U`` rewrites its own exe, which can fail if the sidecar
sits in a read-only location — so on startup we keep a *writable* copy in the
app-data dir, point the resolver at it (``bin.set_managed``), and run a throttled
self-update on a background thread. All best-effort: any failure just leaves the
current copy in place.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

from .. import bin as binmod
from ..core.proc import _CREATE_NO_WINDOW

# Don't hit the network for an update more than once per this window.
_CHECK_INTERVAL_SECS = 12 * 3600


def init() -> None:
    """Seed the writable yt-dlp copy and kick off a throttled ``yt-dlp -U``.

    Cheap and non-blocking: the copy only happens on first run; the update runs
    on its own daemon thread.
    """
    try:
        data = binmod.data_dir()
        data.mkdir(parents=True, exist_ok=True)
    except Exception:
        return

    name = "yt-dlp.exe" if sys.platform == "win32" else "yt-dlp"
    managed = data / name

    # First run (or a wiped app-data): seed from the bundled sidecar.
    if not managed.exists():
        src = binmod.bundled("yt-dlp")
        if src:
            try:
                shutil.copy(src, managed)  # copy() preserves the exec bit
            except OSError:
                pass
    if not managed.exists():
        return  # nothing to manage (dev without a bundled copy) — resolver falls back

    binmod.set_managed("yt-dlp", str(managed))

    stamp = data / "yt-dlp.lastcheck"
    threading.Thread(target=_update_if_due, args=(managed, stamp), daemon=True).start()


def _update_if_due(managed: Path, stamp: Path) -> None:
    if not _due(stamp):
        return
    try:
        result = subprocess.run(
            [str(managed), "-U"],
            capture_output=True,
            timeout=120,
            creationflags=_CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return
    if result.returncode == 0:
        try:
            stamp.write_text(str(int(time.time())))
        except OSError:
            pass


def _due(stamp: Path) -> bool:
    try:
        last = int(stamp.read_text().strip())
    except (OSError, ValueError):
        return True  # never checked (or unreadable) → due
    return (int(time.time()) - last) >= _CHECK_INTERVAL_SECS
