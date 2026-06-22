"""Builds the FFmpeg arguments for the "cover → video" tool.

Ported 1:1 from the old Tauri ``core/cover.rs``. The workflow: turn a still
album cover + an audio file into a video ready for upload (e.g. old Brazilian
music on YouTube). Designed around that use case:

- a 1:1 square so there are no black side bars,
- an optional blurred-cover background to fill any bars instead of black,
- audio passthrough (``copy``) to avoid a second lossy re-encode of already
  lossy source audio,
- optional EBU R128 loudness normalization for consistent volume.

Pure (no IO) so it is unit-testable without ever launching FFmpeg, exactly like
:class:`ngc7023.core.ffmpeg.MediaJob`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class CoverLayout(str, Enum):
    """Output frame shape. Values are ``snake_case`` to match the JS bridge."""

    SQUARE = "square"        # 1080x1080 — no side bars (ideal for album art)
    WIDE = "wide"            # 1920x1080 — widescreen
    FIT_IMAGE = "fit_image"  # keep the image's own dimensions (rounded to even)


@dataclass
class CoverVideoJob:
    """A single "still cover + audio → video" render, described by UI choices."""

    image: str = ""
    audio: str = ""
    output: str = ""
    layout: CoverLayout = CoverLayout.SQUARE
    # Fill bars with a blurred copy of the cover instead of black.
    blurred_background: bool = False
    # Copy audio without re-encoding (preserves the source quality).
    copy_audio: bool = True
    # Apply ``loudnorm`` (EBU R128) for consistent loudness across uploads.
    normalize_audio: bool = False
    overwrite: bool = False

    # --- argv construction --------------------------------------------------

    def build_args(self) -> list[str]:
        """Builds the full FFmpeg argument vector for this render."""
        args: list[str] = ["-y" if self.overwrite else "-n"]

        # Loop the still image into a video stream, alongside the audio.
        args += ["-loop", "1", "-i", self.image, "-i", self.audio]

        flag, filter_str, maps = self._video_filter()
        args += [flag, filter_str]

        args += ["-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p"]

        # Re-encoding is forced when we normalize; otherwise copy if asked.
        if self.copy_audio and not self.normalize_audio:
            args += ["-c:a", "copy"]
        else:
            args += ["-c:a", "aac", "-b:a", "320k"]
            if self.normalize_audio:
                args += ["-af", "loudnorm"]

        args += maps

        # Stop when the audio ends (the image would loop forever otherwise).
        args.append("-shortest")

        args.append(self.output)
        return args

    # --- helpers ------------------------------------------------------------

    def _dims(self) -> tuple[int, int] | None:
        if self.layout == CoverLayout.SQUARE:
            return (1080, 1080)
        if self.layout == CoverLayout.WIDE:
            return (1920, 1080)
        return None  # FIT_IMAGE

    def _video_filter(self) -> tuple[str, str, list[str]]:
        """Returns ``(flag, filter, extra_maps)``. The blurred path uses
        ``-filter_complex``, which disables auto stream selection, so it also
        returns explicit ``-map``s."""
        dims = self._dims()
        if dims is None:
            # Fit image: just make dimensions even (required by yuv420p).
            return ("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", [])

        w, h = dims
        if not self.blurred_background:
            # Letterbox/pillarbox with black bars.
            return (
                "-vf",
                f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
                [],
            )
        # Blurred-cover background, sharp cover centered on top.
        return (
            "-filter_complex",
            "[0:v]split=2[bg][fg];"
            f"[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20[bg];"
            f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]",
            ["-map", "[v]", "-map", "1:a"],
        )

    # --- deserialization from the JS bridge ---------------------------------

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "CoverVideoJob":
        """Builds a job from the camelCase dict the webview bridge delivers."""
        layout = d.get("layout") or "square"
        return cls(
            image=d.get("image", ""),
            audio=d.get("audio", ""),
            output=d.get("output", ""),
            layout=CoverLayout(layout),
            blurred_background=d.get("blurredBackground", False),
            copy_audio=d.get("copyAudio", True),
            normalize_audio=d.get("normalizeAudio", False),
            overwrite=d.get("overwrite", False),
        )
