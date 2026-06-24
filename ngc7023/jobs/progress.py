"""Pure parsers for tool progress output.

Kept separate from the
spawning code so they can be unit-tested without launching anything.
"""

from __future__ import annotations

from typing import Optional


def parse_out_time_secs(line: str) -> Optional[float]:
    """Parses an FFmpeg ``-progress`` line like ``out_time=00:00:12.340000`` into
    seconds. Returns ``None`` for any other line."""
    if not line.startswith("out_time="):
        return None
    return hms_to_secs(line[len("out_time="):].strip())


def is_progress_end(line: str) -> bool:
    """True when FFmpeg's ``-progress`` stream signals the final line."""
    return line.strip() == "progress=end"


def hms_to_secs(s: str) -> Optional[float]:
    """Converts ``HH:MM:SS.ms``, ``MM:SS``, or plain ``SS.ms`` to seconds."""
    secs = 0.0
    for part in s.split(":"):
        try:
            value = float(part)
        except ValueError:
            return None
        secs = secs * 60.0 + value
    return secs


def parse_ytdlp_percent(line: str) -> Optional[float]:
    """Parses a yt-dlp progress line like ``[download]  42.0% of 10.00MiB`` into
    the percentage. Returns ``None`` if no percentage is present."""
    idx = line.find("%")
    if idx < 0:
        return None
    start = idx
    while start > 0 and (line[start - 1].isdigit() or line[start - 1] == "."):
        start -= 1
    token = line[start:idx]
    if not token:
        return None
    try:
        return float(token)
    except ValueError:
        return None


def parse_ytdlp_progress(
    line: str,
) -> Optional[tuple[float, Optional[str], Optional[str]]]:
    """Parses a yt-dlp ``--newline`` progress line into ``(percent, speed, eta)``,
    e.g. ``[download]  42.0% of 10.00MiB at 1.50MiB/s ETA 00:07`` ->
    ``(42.0, "1.50MiB/s", "00:07")``. Speed/eta are absent on lines without them.
    """
    percent = parse_ytdlp_percent(line)
    if percent is None:
        return None
    speed = _between(line, " at ", " ETA")
    eta: Optional[str] = None
    if "ETA " in line:
        after = line.split("ETA ", 1)[1].split()
        if after and after[0] != "Unknown":
            eta = after[0]
    return (percent, speed, eta)


def _between(s: str, start: str, end: str) -> Optional[str]:
    """Trimmed text between ``start`` and ``end`` (or end-of-line if ``end`` is
    missing). ``None`` when empty, "Unknown", or ``start`` isn't present."""
    i = s.find(start)
    if i < 0:
        return None
    rest = s[i + len(start):]
    j = rest.find(end)
    val = (rest if j < 0 else rest[:j]).strip()
    # Drop empty or unknown values (yt-dlp prints "Unknown" / "Unknown B/s" early
    # in a download before it has a rate estimate).
    if not val or val.startswith("Unknown"):
        return None
    return val
