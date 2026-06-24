"""Small subprocess helper shared by the host probes.

Its main job beyond running a command is to
**never pop a console window** on Windows (the app is a GUI), and to never raise:
a failed probe returns ``None`` so the UI degrades gracefully instead of crashing.
"""

from __future__ import annotations

import subprocess
import sys
from typing import Optional, Sequence

# On Windows, suppress the flashing console window when we shell out to
# ffmpeg/yt-dlp/powershell from a windowed (pythonw / frozen) app.
if sys.platform == "win32":
    _CREATE_NO_WINDOW = 0x08000000
else:
    _CREATE_NO_WINDOW = 0


def run_capture(
    bin_path: str,
    args: Sequence[str],
    timeout: float = 20.0,
) -> Optional[str]:
    """Runs ``bin_path args`` and returns stdout on success, else ``None``.

    Never raises: a missing binary, non-zero exit, or timeout all yield ``None``.
    """
    try:
        result = subprocess.run(
            [bin_path, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=_CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout
