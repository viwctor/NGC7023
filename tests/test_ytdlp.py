"""Unit tests for the yt-dlp argument builder (DownloadJob)."""

from ngc7023.core.ytdlp import DownloadJob, DownloadKind


def base(**over) -> DownloadJob:
    defaults = dict(
        url="https://example.com/v",
        output_dir="C:/dl",
        kind=DownloadKind.VIDEO,
    )
    defaults.update(over)
    return DownloadJob(**defaults)


def test_audio_with_bitrate_sets_format_and_quality():
    job = base(kind=DownloadKind.AUDIO, format="mp3", audio_quality=320)
    args = job.build_args()
    assert "-x" in args
    assert args[args.index("--audio-format") + 1] == "mp3"
    assert args[args.index("--audio-quality") + 1] == "320K"


def test_audio_auto_with_format_converts_at_best_quality():
    # Regression: picking mp3 with "auto" quality must still produce mp3 (not the
    # native opus), at best quality.
    job = base(kind=DownloadKind.AUDIO, format="mp3", audio_quality=None)
    args = job.build_args()
    assert "bestaudio/best" in args
    assert args[args.index("--audio-format") + 1] == "mp3"
    assert args[args.index("--audio-quality") + 1] == "0"


def test_audio_no_format_keeps_native_lossless():
    # No container chosen => keep the source stream as-is (no re-encode).
    job = base(kind=DownloadKind.AUDIO, format=None, audio_quality=None)
    args = job.build_args()
    assert "bestaudio/best" in args
    assert "-x" in args
    assert "--audio-format" not in args
    assert "--audio-quality" not in args


def test_height_cap_is_applied():
    job = base(max_height=1080)
    assert "height<=?1080" in job._video_format_selector()


def test_from_dict_maps_camelcase_bridge_payload():
    job = DownloadJob.from_dict(
        {
            "url": "https://example.com/v",
            "outputDir": "C:/dl",
            "kind": "audio",
            "format": "opus",
            "audioQuality": 192,
            "embedThumbnail": True,
        }
    )
    assert job.kind is DownloadKind.AUDIO
    assert job.audio_quality == 192
    assert job.embed_thumbnail is True
    args = job.build_args()
    assert args[args.index("--audio-quality") + 1] == "192K"
    assert "--embed-thumbnail" in args
