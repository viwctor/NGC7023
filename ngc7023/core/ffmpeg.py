"""Translates a structured media-conversion request into FFmpeg arguments.

The UI never builds a command
string: it fills a :class:`MediaJob` and this module produces the exact argv.
Every interactive button maps to a typed field here, and the mapping is
unit-testable without ever launching FFmpeg.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class HwAccel(str, Enum):
    """Hardware encoder family selected by the user (or auto-detected).

    AMD shows up as ``AMF`` on Windows and ``VAAPI`` on Linux, which is why the
    user's AMD card needs different handling per OS. Values are ``snake_case`` to
    match what the JS bridge sends (e.g. ``"video_toolbox"``).
    """

    NONE = "none"
    AMF = "amf"            # AMD on Windows
    VAAPI = "vaapi"        # AMD / Intel on Linux
    NVENC = "nvenc"        # NVIDIA
    QSV = "qsv"            # Intel QuickSync
    VIDEO_TOOLBOX = "video_toolbox"  # Apple Silicon / macOS

    def encoder_for(self, base_codec: str) -> Optional[str]:
        """Encoder name for a base codec on this family, e.g. ``(AMF, "h264")``
        -> ``"h264_amf"``. ``None`` means "use FFmpeg's default software encoder".
        """
        suffix = {
            HwAccel.AMF: "amf",
            HwAccel.VAAPI: "vaapi",
            HwAccel.NVENC: "nvenc",
            HwAccel.QSV: "qsv",
            HwAccel.VIDEO_TOOLBOX: "videotoolbox",
        }.get(self)
        if suffix is None:  # HwAccel.NONE
            return None
        return f"{base_codec}_{suffix}"


@dataclass
class Trim:
    """Optional time range to keep from the input (seconds)."""

    start_sec: float
    end_sec: float


@dataclass
class Crop:
    """Rectangular crop in pixels."""

    width: int
    height: int
    x: int
    y: int


# Output extensions FFmpeg treats as a single still image: it infers the encoder
# from the extension, so we skip the codec/CRF and grab one frame.
_STILL_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "avif"}

# Default quality (CRF/QP) for subtitle burn-in re-encodes.
_BURN_CRF = 23


@dataclass
class MediaJob:
    """A single media conversion / edit, fully described by UI selections."""

    input: str = ""
    output: str = ""

    # Base video codec the user picked, e.g. "h264", "hevc", "av1". The actual
    # encoder is derived from this plus ``hw_accel``.
    video_codec: Optional[str] = None
    audio_codec: Optional[str] = None

    hw_accel: Optional[HwAccel] = None

    fps: Optional[float] = None           # target frame rate (e.g. 30.0)
    scale_height: Optional[int] = None    # target height; width auto (scale=-2:h)
    speed: Optional[float] = None         # playback multiplier (2.0 = 2x faster)

    crop: Optional[Crop] = None
    trim: Optional[Trim] = None

    audio_only: bool = False              # drop the video stream (mp4 -> mp3)
    crf: Optional[int] = None             # constant-quality (x264/x265/vp9); lower = better

    overwrite: bool = False               # overwrite output without prompting

    # --- argv construction --------------------------------------------------

    def build_args(self) -> list[str]:
        """Builds the full FFmpeg argument vector for this job."""
        args: list[str] = []

        args.append("-y" if self.overwrite else "-n")

        # Hardware-accelerated decode (an input option, so before -i) when a
        # hardware encoder is selected, so the whole transcode runs off the CPU.
        # `auto` falls back to software decode and survives CPU filters.
        if self._uses_hardware_encoder():
            args += ["-hwaccel", "auto"]

        # Fast seek: -ss before -i lets FFmpeg seek by keyframe quickly.
        if self.trim is not None:
            args += ["-ss", _format_secs(self.trim.start_sec)]

        args += ["-i", self.input]

        if self.trim is not None:
            dur = max(self.trim.end_sec - self.trim.start_sec, 0.0)
            args += ["-t", _format_secs(dur)]

        gif = self._is_gif()
        # A still image is a single frame with no audio/codec — like GIF, FFmpeg
        # picks the encoder from the extension. We add `-frames:v 1` so a video
        # -> image grabs one frame instead of erroring.
        still = self._is_still_image()

        if self.audio_only:
            args.append("-vn")
        elif gif:
            # GIF: a single-pass palettegen/paletteuse (via split) gives far
            # better color + dithering than ffmpeg's default quantizer, in ONE
            # process (no leftover palette file). filter_complex disables auto
            # stream-select, so the labeled output is mapped explicitly.
            args += self._gif_filter_complex()
        else:
            vf = self._video_filters()
            if vf:
                args += ["-vf", ",".join(vf)]
            # A still image carries no codec/CRF — forcing `-c:v h264` would break
            # the mux. Real video gets the codec + rate control.
            if not still:
                codec = self._resolved_video_codec()
                if codec is not None:
                    args += ["-c:v", codec]
                    # Tag HEVC in mp4/mov as hvc1 so Apple/QuickTime accept it
                    # (the default hev1 tag won't play in some apps).
                    if self.video_codec == "hevc" and self._output_ext() in ("mp4", "mov"):
                        args += ["-tag:v", "hvc1"]
                    args += _quality_args(self.video_codec, self.hw_accel, self.crf)
            if still:
                args += ["-frames:v", "1"]

        if gif or still:
            args.append("-an")  # GIF / still image carry no audio stream
        else:
            af = self._audio_filters()
            if af:
                args += ["-af", ",".join(af)]
            if self.audio_codec is not None:
                args += ["-c:a", self.audio_codec]

        args.append(self.output)
        return args

    # --- helpers ------------------------------------------------------------

    def _uses_hardware_encoder(self) -> bool:
        """True when a hardware family is selected for a real base codec."""
        return (
            self.video_codec is not None
            and self.hw_accel is not None
            and self.hw_accel != HwAccel.NONE
        )

    def _resolved_video_codec(self) -> Optional[str]:
        """Concrete encoder: hardware encoder if a family is selected, else the
        user's base codec as-is."""
        return _resolve_encoder(self.video_codec, self.hw_accel)

    def _video_filters(self) -> list[str]:
        vf: list[str] = []
        if self.crop is not None:
            c = self.crop
            vf.append(f"crop={c.width}:{c.height}:{c.x}:{c.y}")
        if self.scale_height is not None:
            vf.append(f"scale=-2:{self.scale_height}")
        if self.fps is not None:
            vf.append(f"fps={_format_num(self.fps)}")
        if self.speed is not None and self.speed > 0.0 and abs(self.speed - 1.0) > 1e-9:
            # setpts shrinks/stretches presentation timestamps (< 1 = slow motion).
            vf.append(f"setpts={1.0 / self.speed:.6f}*PTS")
        return vf

    def _gif_filter_complex(self) -> list[str]:
        """High-quality GIF in one pass: the editing filters, then a split into a
        palettegen branch and a paletteuse branch (no temp palette file).

        Used only for the argv *preview*. The single-pass split must buffer every
        frame of the paletteuse branch until palettegen has consumed the whole
        input, which both stalls progress at 0% and blows up memory on real-length
        videos — so the job engine runs the two-pass builders below instead."""
        pre = ",".join(self._video_filters())
        chain = f"{pre}," if pre else ""
        fc = (
            f"[0:v]{chain}split[s0][s1];"
            f"[s0]palettegen=stats_mode=diff[p];"
            f"[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]"
        )
        return ["-filter_complex", fc, "-map", "[v]"]

    def _gif_input_args(self) -> list[str]:
        """The overwrite + trim + input options shared by both GIF passes. Trim is
        applied as INPUT options (-ss/-t before -i) so the palette and the encode
        see exactly the same frames."""
        args: list[str] = ["-y" if self.overwrite else "-n"]
        if self.trim is not None:
            args += [
                "-ss", _format_secs(self.trim.start_sec),
                "-t", _format_secs(max(self.trim.end_sec - self.trim.start_sec, 0.0)),
            ]
        args += ["-i", self.input]
        return args

    def build_gif_palettegen_args(self, palette_path: str) -> list[str]:
        """Pass 1: generate an optimal palette to ``palette_path`` (a temp PNG).
        Streams the input once with low memory; the engine discards the file."""
        chain = ",".join(self._video_filters())
        vf = f"{chain},palettegen=stats_mode=diff" if chain else "palettegen=stats_mode=diff"
        # -y here is for the temp palette regardless of the job's overwrite flag.
        args = self._gif_input_args()
        args[0] = "-y"
        return [*args, "-vf", vf, palette_path]

    def build_gif_encode_args(self, palette_path: str) -> list[str]:
        """Pass 2: apply the palette with paletteuse. With the palette ready up
        front, this streams frame-by-frame — real progress, no buffering."""
        chain = ",".join(self._video_filters())
        if chain:
            fc = (
                f"[0:v]{chain}[x];"
                f"[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]"
            )
        else:
            fc = "[0:v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]"
        return [*self._gif_input_args(), "-i", palette_path,
                "-filter_complex", fc, "-map", "[v]", "-an", self.output]

    def _audio_filters(self) -> list[str]:
        if self.speed is not None and self.speed > 0.0 and abs(self.speed - 1.0) > 1e-9:
            return _atempo_chain(self.speed)
        return []

    def _output_ext(self) -> str:
        """Lowercased output file extension (e.g. "mp4"), or "" if none."""
        if "." not in self.output:
            return ""
        return self.output.rsplit(".", 1)[-1].lower()

    def _is_gif(self) -> bool:
        return self._output_ext() == "gif"

    def is_gif(self) -> bool:
        """Public: the job engine runs GIF output as a two-pass palette job."""
        return self._is_gif()

    def _is_still_image(self) -> bool:
        return self._output_ext() in _STILL_IMAGE_EXTS

    # --- deserialization from the JS bridge ---------------------------------

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "MediaJob":
        """Builds a job from the camelCase dict the webview bridge delivers."""
        crop = d.get("crop")
        trim = d.get("trim")
        hw = d.get("hwAccel")
        return cls(
            input=d.get("input", ""),
            output=d.get("output", ""),
            video_codec=d.get("videoCodec"),
            audio_codec=d.get("audioCodec"),
            hw_accel=HwAccel(hw) if hw else None,
            fps=d.get("fps"),
            scale_height=d.get("scaleHeight"),
            speed=d.get("speed"),
            crop=Crop(crop["width"], crop["height"], crop["x"], crop["y"]) if crop else None,
            trim=Trim(trim["startSec"], trim["endSec"]) if trim else None,
            audio_only=d.get("audioOnly", False),
            crf=d.get("crf"),
            overwrite=d.get("overwrite", False),
        )


@dataclass
class SubtitleJob:
    """Attaches a subtitle file to a video: soft embed (a selectable track) or
    burn-in (hardsub, rendered into the picture).

    The optional time shift is applied by the job engine (it rewrites the
    subtitle first), and burn-in is run with the process cwd set to the
    subtitle's folder so the filter takes a bare filename — that avoids the
    Windows drive-colon escaping that historically broke subtitles.
    """

    video: str = ""
    subtitle: str = ""  # soft: any path; burn: a bare filename (cwd-relative)
    output: str = ""
    burn: bool = False
    overwrite: bool = False
    # Burn-in re-encodes the picture, so it honours the video codec + GPU family
    # (h264_amf etc.) instead of always falling back to software libx264. Soft
    # embed ignores these — it copies the video stream untouched.
    video_codec: Optional[str] = None
    hw_accel: Optional[HwAccel] = None

    def build_args(self) -> list[str]:
        args: list[str] = ["-y" if self.overwrite else "-n", "-i", self.video]
        if self.burn:
            args += ["-vf", f"subtitles={self.subtitle}"]
            encoder = _resolve_encoder(self.video_codec, self.hw_accel)
            if encoder is not None:
                args += ["-c:v", encoder]
                if self.video_codec == "hevc" and self._output_ext() in ("mp4", "mov"):
                    args += ["-tag:v", "hvc1"]
            # Without rate control the re-encode bloats hugely (esp. on hardware
            # encoders — that produced a 6 GB file). Cap quality at a sane CRF/QP.
            args += _quality_args(self.video_codec, self.hw_accel, _BURN_CRF)
            args += ["-c:a", "copy"]
        else:
            args += [
                "-i", self.subtitle,
                "-map", "0", "-map", "1",
                "-c", "copy", "-c:s", _soft_sub_codec(self._output_ext()),
            ]
        args.append(self.output)
        return args

    def _output_ext(self) -> str:
        if "." not in self.output:
            return ""
        return self.output.rsplit(".", 1)[-1].lower()


# ── subtitle extract / convert (v1.1 conveniences) ──────────────────────────
# Matches e.g. "Stream #0:2(eng): Subtitle: subrip (default)" in `ffmpeg -i`.
_SUB_STREAM_RE = re.compile(r"Stream #0:(\d+)(?:\[[^\]]*\])?(?:\((\w+)\))?: Subtitle: (\w+)")

# Text subtitle codecs we can transcode to srt/vtt/ass. Image subs (PGS, VobSub)
# can't become text, so the UI marks them text=False and hides them from extract.
TEXT_SUB_CODECS = frozenset(
    {"subrip", "srt", "ass", "ssa", "webvtt", "vtt", "mov_text", "text", "stl"}
)


def parse_subtitle_streams(ffmpeg_stderr: str) -> list[dict]:
    """Subtitle tracks found in ``ffmpeg -i <video>`` stderr, in file order:
    ``[{"index": 2, "lang": "eng", "codec": "subrip", "text": True}]``. ``index``
    is the absolute stream index (used as ``-map 0:<index>``)."""
    tracks: list[dict] = []
    for m in _SUB_STREAM_RE.finditer(ffmpeg_stderr):
        codec = m.group(3)
        tracks.append(
            {
                "index": int(m.group(1)),
                "lang": m.group(2) or "",
                "codec": codec,
                "text": codec in TEXT_SUB_CODECS,
            }
        )
    return tracks


def build_subtitle_extract_args(
    video: str, stream_index: int, output: str, overwrite: bool = True
) -> list[str]:
    """Extract one embedded subtitle track to a standalone file. FFmpeg picks the
    encoder from the output extension (``.srt`` → subrip, ``.vtt`` → webvtt, …)."""
    return [("-y" if overwrite else "-n"), "-i", video, "-map", f"0:{stream_index}", output]


def build_subtitle_convert_args(input_path: str, output: str, overwrite: bool = True) -> list[str]:
    """Convert a standalone subtitle file between formats (srt / vtt / ass). The
    target format is implied by the output extension."""
    return [("-y" if overwrite else "-n"), "-i", input_path, output]


def _resolve_encoder(base_codec: Optional[str], hw: Optional[HwAccel]) -> Optional[str]:
    """Concrete encoder for a base codec ("h264") + a hardware family, e.g.
    ``("h264", AMF)`` -> ``"h264_amf"``. ``None`` base means "let FFmpeg infer the
    encoder from the extension" (used by GIF/still/audio outputs)."""
    if base_codec is None:
        return None
    if hw is not None and hw != HwAccel.NONE:
        return hw.encoder_for(base_codec) or base_codec
    return base_codec


def _quality_args(base_codec: Optional[str], hw: Optional[HwAccel], crf: Optional[int]) -> list[str]:
    """Rate-control flags for the resolved encoder.

    Software encoders take ``-crf``. Hardware encoders REJECT ``-crf`` and, left
    unconstrained, default to an enormous bitrate (a 250 MB clip ballooned to
    6+ GB) — so the CRF is mapped to each vendor's constant-quantizer mode. A
    hardware encode always gets a quality cap (defaulting to 23) for this reason.
    """
    software = hw is None or hw == HwAccel.NONE
    if software:
        if crf is None:
            return []
        # libvpx-vp9 needs `-b:v 0` for -crf to act as true constant quality.
        prefix = ["-b:v", "0"] if base_codec == "vp9" else []
        return prefix + ["-crf", str(crf)]

    q = str(crf if crf is not None else 23)
    if hw == HwAccel.AMF:  # AMD (Windows) — h264/hevc/av1_amf all accept these
        return ["-rc", "cqp", "-qp_i", q, "-qp_p", q, "-qp_b", q]
    if hw == HwAccel.NVENC:
        return ["-rc", "constqp", "-qp", q]
    if hw == HwAccel.QSV:
        return ["-global_quality", q]
    if hw == HwAccel.VAAPI:
        return ["-rc_mode", "CQP", "-qp", q]
    if hw == HwAccel.VIDEO_TOOLBOX:  # 1..100 scale, higher = better
        return ["-q:v", str(max(1, min(100, 100 - (crf if crf is not None else 23) * 2)))]
    return []


def _soft_sub_codec(ext: str) -> str:
    """Subtitle codec a container can mux for a soft-embedded track."""
    if ext in ("mp4", "mov", "m4v"):
        return "mov_text"
    if ext == "webm":
        return "webvtt"
    return "srt"  # mkv and the rest


def _atempo_chain(speed: float) -> list[str]:
    """FFmpeg's ``atempo`` only accepts factors in [0.5, 2.0]; larger changes are
    achieved by chaining multiple ``atempo`` stages."""
    remaining = speed
    stages: list[str] = []
    while remaining > 2.0:
        stages.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        stages.append("atempo=0.5")
        remaining /= 0.5
    stages.append(f"atempo={remaining:.6f}")
    return stages


def _format_secs(secs: float) -> str:
    """Formats seconds without scientific notation, FFmpeg-friendly."""
    return f"{secs:.3f}"


def _format_num(n: float) -> str:
    """Renders a float without a trailing ``.0`` (so ``fps=15`` not ``fps=15.0``)."""
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)
