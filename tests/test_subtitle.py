"""Subtitle builder: soft embed vs burn-in, plus the v1.1 extract/convert tools."""

from ngc7023.core.ffmpeg import (
    HwAccel,
    SubtitleJob,
    build_subtitle_convert_args,
    build_subtitle_extract_args,
    parse_subtitle_streams,
)


def test_soft_embed_mp4_uses_mov_text():
    job = SubtitleJob(video="v.mp4", subtitle="s.srt", output="out.mp4", burn=False, overwrite=True)
    args = job.build_args()
    # two inputs (video + subtitle), both streams mapped, copy, mov_text track.
    assert args.count("-i") == 2
    assert args[args.index("-c:s") + 1] == "mov_text"
    assert "-map" in args
    assert "-vf" not in args  # soft embed never re-renders the picture


def test_soft_embed_mkv_uses_srt():
    job = SubtitleJob(video="v.mkv", subtitle="s.srt", output="out.mkv", burn=False)
    assert job.build_args()[job.build_args().index("-c:s") + 1] == "srt"


def test_burnin_uses_subtitles_filter_with_bare_name():
    # The engine passes a cwd-relative bare filename, so no path escaping needed.
    job = SubtitleJob(video="v.mp4", subtitle="sub.srt", output="out.mp4", burn=True, overwrite=True)
    args = job.build_args()
    assert args[args.index("-vf") + 1] == "subtitles=sub.srt"
    assert args[args.index("-c:a") + 1] == "copy"
    assert args.count("-i") == 1  # the subtitle is read by the filter, not muxed


def test_burnin_no_codec_lets_ffmpeg_pick_software():
    # No codec/GPU chosen → no explicit -c:v (FFmpeg defaults to software).
    job = SubtitleJob(video="v.mp4", subtitle="sub.srt", output="out.mp4", burn=True)
    assert "-c:v" not in job.build_args()


def test_burnin_uses_hardware_encoder():
    # Burn-in re-encodes, so a GPU family maps the base codec to its HW encoder.
    job = SubtitleJob(
        video="v.mp4", subtitle="sub.srt", output="out.mp4", burn=True,
        video_codec="h264", hw_accel=HwAccel.AMF, overwrite=True,
    )
    args = job.build_args()
    assert args[args.index("-c:v") + 1] == "h264_amf"
    assert "cqp" in args  # quality must be capped or the file balloons (the 6 GB bug)


def test_burnin_hevc_gets_hvc1_tag_in_mp4():
    job = SubtitleJob(
        video="v.mkv", subtitle="sub.srt", output="out.mp4", burn=True,
        video_codec="hevc", hw_accel=HwAccel.NVENC,
    )
    args = job.build_args()
    assert args[args.index("-c:v") + 1] == "hevc_nvenc"
    assert args[args.index("-tag:v") + 1] == "hvc1"


def test_soft_embed_ignores_codec_and_gpu():
    # Soft embed copies the video stream untouched, regardless of codec/GPU.
    job = SubtitleJob(
        video="v.mp4", subtitle="s.srt", output="out.mp4", burn=False,
        video_codec="h264", hw_accel=HwAccel.AMF,
    )
    args = job.build_args()
    assert "-c:v" not in args
    assert args[args.index("-c") + 1] == "copy"


# ── v1.1: extract embedded subtitles / convert subtitle formats ─────────────

_FFMPEG_STDERR = """
  Duration: 00:21:00.00, start: 0.000000, bitrate: 1500 kb/s
  Stream #0:0(eng): Video: h264 (High), yuv420p, 1920x1080
  Stream #0:1(eng): Audio: aac, 48000 Hz, stereo
  Stream #0:2(eng): Subtitle: subrip (default)
  Stream #0:3(por): Subtitle: ass
  Stream #0:4: Subtitle: hdmv_pgs_subtitle
"""


def test_parse_subtitle_streams_finds_tracks_and_marks_image_subs():
    tracks = parse_subtitle_streams(_FFMPEG_STDERR)
    assert [t["index"] for t in tracks] == [2, 3, 4]
    assert tracks[0] == {"index": 2, "lang": "eng", "codec": "subrip", "text": True}
    assert tracks[1]["lang"] == "por" and tracks[1]["codec"] == "ass" and tracks[1]["text"]
    # image-based subs (PGS) can't become text → text=False so the UI can hide them
    assert tracks[2]["index"] == 4 and tracks[2]["text"] is False


def test_parse_subtitle_streams_empty_when_none():
    assert parse_subtitle_streams("Stream #0:0: Video: h264\n") == []


def test_build_subtitle_extract_maps_absolute_stream_index():
    args = build_subtitle_extract_args("movie.mkv", 2, "out.srt")
    assert args == ["-y", "-i", "movie.mkv", "-map", "0:2", "out.srt"]
    # FFmpeg infers the encoder from the .srt extension (no explicit -c:s).
    assert "-c:s" not in args


def test_build_subtitle_convert_is_input_to_output():
    assert build_subtitle_convert_args("a.srt", "b.vtt") == ["-y", "-i", "a.srt", "b.vtt"]
    assert build_subtitle_convert_args("a.srt", "b.vtt", overwrite=False)[0] == "-n"
