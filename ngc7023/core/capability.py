"""Probes the host for the tools and hardware encoders NGC7023 can use.

We shell out to the bundled (or
system) ffmpeg / yt-dlp. The results drive the UI: e.g. only offer "AMD (AMF)"
if FFmpeg actually reports an ``*_amf`` encoder on this machine.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Optional

from .proc import run_capture

# Hardware encoder families we map in ffmpeg.py, as
# ``(suffix in `ffmpeg -encoders`, family id sent to the frontend)``.
# The id must match the HwAccel value (snake_case), so the FFmpeg suffix
# ``videotoolbox`` maps to the id ``video_toolbox``.
_HW_FAMILIES: list[tuple[str, str]] = [
    ("amf", "amf"),
    ("nvenc", "nvenc"),
    ("qsv", "qsv"),
    ("vaapi", "vaapi"),
    ("videotoolbox", "video_toolbox"),
]


@dataclass
class Capabilities:
    ffmpeg_available: bool = False
    ffmpeg_version: Optional[str] = None
    ytdlp_available: bool = False
    ytdlp_version: Optional[str] = None
    # Hardware encoder families detected, e.g. ["amf", "nvenc"].
    hw_encoders: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """camelCase payload for the JS bridge (mirrors the TS Capabilities)."""
        return {
            "ffmpegAvailable": self.ffmpeg_available,
            "ffmpegVersion": self.ffmpeg_version,
            "ytdlpAvailable": self.ytdlp_available,
            "ytdlpVersion": self.ytdlp_version,
            "hwEncoders": self.hw_encoders,
        }


def detect(ffmpeg_bin: str, ytdlp_bin: str) -> Capabilities:
    """Runs the probes. ``ffmpeg_bin`` / ``ytdlp_bin`` are resolved paths."""
    caps = Capabilities()

    out = run_capture(ffmpeg_bin, ["-hide_banner", "-version"])
    if out is not None:
        caps.ffmpeg_available = True
        caps.ffmpeg_version = _first_line(out)

    if caps.ffmpeg_available:
        encoders = run_capture(ffmpeg_bin, ["-hide_banner", "-encoders"])
        if encoders is not None:
            families = detect_hw_families(encoders)
            # A typical ffmpeg build advertises every family (amf/nvenc/qsv/…)
            # regardless of the actual card, so "auto" (= the first entry) would
            # always pick AMF. Reorder so the family matching the detected GPU
            # comes first; the menu still lists the rest for manual override.
            try:
                from .system_info import detect_gpus

                caps.hw_encoders = order_by_gpu(families, detect_gpus())
            except Exception:
                caps.hw_encoders = families

    out = run_capture(ytdlp_bin, ["--version"])
    if out is not None:
        caps.ytdlp_available = True
        caps.ytdlp_version = _first_line(out)

    return caps


def detect_hw_families(encoders_output: str) -> list[str]:
    """Scans ``ffmpeg -encoders`` output for hardware-encoder suffixes (e.g. a
    line containing ``h264_amf`` => the "amf" family)."""
    return [
        family_id
        for suffix, family_id in _HW_FAMILIES
        if f"_{suffix}" in encoders_output
    ]


def order_by_gpu(families: list[str], gpu_names: list[str]) -> list[str]:
    """Moves the encoder family matching the detected GPU vendor to the front,
    so a UI "auto" that takes the first entry picks the right one. Returns the
    list unchanged when the vendor is unknown (no family is dropped either way).

    AMD/Intel map differently per OS: on Linux their encoder is VAAPI, on Windows
    it's AMF / QSV respectively.
    """
    if not families or not gpu_names:
        return families
    blob = " ".join(gpu_names).lower()
    linux = sys.platform.startswith("linux")

    if any(k in blob for k in ("nvidia", "geforce", "rtx", "gtx", "quadro", "tesla")):
        prefs = ["nvenc"]
    elif any(k in blob for k in ("amd", "radeon", "rx ")):
        prefs = ["vaapi"] if linux else ["amf"]
    elif "intel" in blob:
        prefs = ["vaapi", "qsv"] if linux else ["qsv"]
    elif "apple" in blob:
        prefs = ["video_toolbox"]
    else:
        return families

    for fam in prefs:
        if fam in families:
            return [fam] + [f for f in families if f != fam]
    return families


def _first_line(text: str) -> Optional[str]:
    for line in text.splitlines():
        return line
    return None
