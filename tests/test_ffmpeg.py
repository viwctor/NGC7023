"""Unit tests for the FFmpeg argument builder (MediaJob)."""

from ngc7023.core.ffmpeg import Crop, HwAccel, MediaJob, Trim, _atempo_chain


def test_audio_only_drops_video():
    job = MediaJob(
        input="in.mp4",
        output="out.mp3",
        audio_only=True,
        audio_codec="libmp3lame",
        overwrite=True,
    )
    args = job.build_args()
    assert "-vn" in args
    assert args[-1] == "out.mp3"


def test_amd_hardware_encoder_is_selected():
    job = MediaJob(
        input="in.mkv",
        output="out.mp4",
        video_codec="hevc",
        hw_accel=HwAccel.AMF,
    )
    args = job.build_args()
    idx = args.index("-c:v")
    assert args[idx + 1] == "hevc_amf"


def test_hardware_encoder_uses_cqp_not_crf():
    base = dict(input="in.mkv", output="out.mp4", video_codec="h264", crf=23)
    # Software: -crf is passed, no -hwaccel.
    sw = MediaJob(**base).build_args()
    assert "-crf" in sw
    assert "-hwaccel" not in sw  # software decode needs no hwaccel
    # Hardware (amf): -crf dropped (the encoder rejects it), constant-QP instead
    # (without it AMF defaults to a huge bitrate), and GPU decode on.
    hw = MediaJob(**base, hw_accel=HwAccel.AMF).build_args()
    assert "h264_amf" in hw
    assert "-crf" not in hw
    assert "cqp" in hw and hw[hw.index("-qp_i") + 1] == "23"
    assert hw[hw.index("-hwaccel") + 1] == "auto"


def test_hevc_in_mp4_gets_hvc1_tag():
    job = MediaJob(input="in.mkv", output="out.mp4", video_codec="hevc")
    args = job.build_args()
    assert args[args.index("-tag:v") + 1] == "hvc1"
    # mkv output should not get the mp4-specific tag.
    mkv = MediaJob(input="in.mkv", output="out.mkv", video_codec="hevc")
    assert "-tag:v" not in mkv.build_args()


def test_atempo_chains_above_2x():
    stages = _atempo_chain(4.0)
    assert len(stages) == 2
    assert stages[0] == "atempo=2.0"


def test_still_image_output_grabs_one_frame_without_codec():
    job = MediaJob(
        input="in.mp4",
        output="frame.png",
        video_codec="h264",  # should be ignored for an image
        audio_codec="aac",
        crf=23,
    )
    args = job.build_args()
    assert "-c:v" not in args  # image must not force a video codec
    assert "-c:a" not in args  # image must not set an audio codec
    assert "-crf" not in args  # image must not pass crf
    assert "-an" in args       # image carries no audio
    assert args[args.index("-frames:v") + 1] == "1"


def test_vp9_gets_bv0_for_true_crf():
    job = MediaJob(input="in.mp4", output="out.webm", video_codec="vp9", crf=31)
    args = job.build_args()
    assert args[args.index("-b:v") + 1] == "0"


def test_gif_uses_palette_filtercomplex():
    job = MediaJob(
        input="in.mp4",
        output="out.gif",
        video_codec="h264",
        audio_codec="aac",
        crf=23,
        fps=15.0,
    )
    args = job.build_args()
    assert "-c:v" not in args
    assert "-crf" not in args
    assert "-c:a" not in args
    assert "-an" in args
    assert "-vf" not in args  # GIF goes through filter_complex (palette) now
    fc = args[args.index("-filter_complex") + 1]
    assert "palettegen" in fc and "paletteuse" in fc
    assert "fps=15" in fc
    assert args[args.index("-map") + 1] == "[v]"
    assert args[-1] == "out.gif"


def test_gif_two_pass_builders():
    """The engine runs GIF as two passes (palette -> encode) to avoid the
    single-pass split's frame buffering / stalled progress."""
    job = MediaJob(input="in.mp4", output="out.gif", fps=15.0, scale_height=480)
    assert job.is_gif()

    # Pass 1: palettegen writes to the temp PNG; same editing filters; -vf form.
    p1 = job.build_gif_palettegen_args("pal.png")
    assert p1[-1] == "pal.png"
    vf = p1[p1.index("-vf") + 1]
    assert vf.endswith("palettegen=stats_mode=diff")
    assert "scale=-2:480" in vf and "fps=15" in vf
    assert "paletteuse" not in vf

    # Pass 2: two inputs (video + palette), paletteuse, maps the labeled stream.
    p2 = job.build_gif_encode_args("pal.png")
    assert p2.count("-i") == 2 and "pal.png" in p2
    fc = p2[p2.index("-filter_complex") + 1]
    assert "paletteuse" in fc and "palettegen" not in fc
    assert "[1:v]" in fc  # the palette input feeds paletteuse
    assert p2[p2.index("-map") + 1] == "[v]"
    assert "-an" in p2 and p2[-1] == "out.gif"


def test_from_dict_maps_camelcase_bridge_payload():
    job = MediaJob.from_dict(
        {
            "input": "in.mkv",
            "output": "out.mp4",
            "videoCodec": "hevc",
            "hwAccel": "amf",
            "scaleHeight": 720,
            "crop": {"width": 1280, "height": 720, "x": 0, "y": 0},
            "trim": {"startSec": 1.0, "endSec": 5.0},
            "overwrite": True,
        }
    )
    assert job.hw_accel is HwAccel.AMF
    assert job.scale_height == 720
    assert isinstance(job.crop, Crop) and job.crop.width == 1280
    assert isinstance(job.trim, Trim) and job.trim.end_sec == 5.0
    args = job.build_args()
    assert "hevc_amf" in args
    assert "scale=-2:720" in args[args.index("-vf") + 1]
    assert args[args.index("-ss") + 1] == "1.000"
