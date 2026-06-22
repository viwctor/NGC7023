"""Translates a download request into ``yt-dlp`` arguments.

Ported 1:1 from the old Tauri `core/ytdlp.rs`. We lean on yt-dlp for the
site-specific extraction logic (YouTube, X/Twitter, Facebook, Instagram, TikTok,
Reddit, ...). Our job is only to express the user's intent — format, quality,
audio-vs-video — as flags, and let yt-dlp + FFmpeg do the heavy lifting.

The app runs yt-dlp as a bundled, self-updating executable (subprocess), so this
builds the argv. ``--newline`` is appended here so the job engine reads stable,
one-per-line ``[download]`` progress (parsed in :mod:`ngc7023.jobs.progress`).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional


class DownloadKind(str, Enum):
    VIDEO = "video"  # best video+audio, merged
    AUDIO = "audio"  # audio only, extracted and converted


@dataclass
class DownloadJob:
    url: str = ""
    output_dir: str = ""
    kind: DownloadKind = DownloadKind.VIDEO

    # Target container/codec: "mp4"/"mkv" for video, "mp3"/"m4a"/"opus" for
    # audio. None keeps yt-dlp's best native format.
    format: Optional[str] = None
    # Cap video height (e.g. 1080). None = best available ("auto").
    max_height: Optional[int] = None
    # Audio bitrate target in kbps. None = best audio kept as-is (lossless, no
    # re-encode — the "auto" option).
    audio_quality: Optional[int] = None
    # Filename template; defaults to "%(title)s.%(ext)s".
    output_template: Optional[str] = None

    embed_thumbnail: bool = False
    embed_metadata: bool = False

    def build_args(self) -> list[str]:
        args: list[str] = []

        args += ["-P", self.output_dir]
        args += ["-o", self.output_template or "%(title)s.%(ext)s"]

        if self.kind == DownloadKind.AUDIO:
            # Always select the best source audio stream, then extract it.
            args += ["-f", "bestaudio/best", "-x"]
            # If the user picked a concrete container (mp3/m4a/opus/...), convert
            # to it. Without this, yt-dlp keeps the source codec — e.g. YouTube's
            # native opus — which is why selecting "mp3" produced a .opus file.
            if self.format is not None:
                args += ["--audio-format", self.format]
            # Quality: an explicit kbps target, or best ("0") when "auto" with a
            # chosen format. Pure "auto" + no format keeps the native stream as-is
            # (lossless, no re-encode).
            if self.audio_quality is not None:
                args += ["--audio-quality", f"{self.audio_quality}K"]
            elif self.format is not None:
                args += ["--audio-quality", "0"]
        else:  # DownloadKind.VIDEO
            args += ["-f", self._video_format_selector()]
            if self.format is not None:
                args += ["--merge-output-format", self.format]

        if self.embed_thumbnail:
            args.append("--embed-thumbnail")
        if self.embed_metadata:
            args.append("--embed-metadata")

        # Stable, machine-parseable progress lines for the job engine to read.
        args.append("--newline")

        args.append(self.url)
        return args

    def _video_format_selector(self) -> str:
        """Prefers a merged best video+audio stream, optionally capped to a max
        height, with graceful fallbacks."""
        if self.max_height is not None:
            h = self.max_height
            return f"bv*[height<=?{h}]+ba/b[height<=?{h}]/bv*+ba/b"
        return "bv*+ba/b"

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DownloadJob":
        """Builds a job from the camelCase dict the webview bridge delivers."""
        kind = d.get("kind", "video")
        return cls(
            url=d.get("url", ""),
            output_dir=d.get("outputDir", ""),
            kind=DownloadKind(kind),
            format=d.get("format"),
            max_height=d.get("maxHeight"),
            audio_quality=d.get("audioQuality"),
            output_template=d.get("outputTemplate"),
            embed_thumbnail=d.get("embedThumbnail", False),
            embed_metadata=d.get("embedMetadata", False),
        )
