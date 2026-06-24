"""Cover -> video builder (still image + audio)."""

from ngc7023.core.cover import CoverLayout, CoverVideoJob


def base(**over) -> CoverVideoJob:
    job = CoverVideoJob(
        image="cover.jpg",
        audio="song.m4a",
        output="out.mp4",
        layout=CoverLayout.SQUARE,
        blurred_background=False,
        copy_audio=True,
        normalize_audio=False,
        overwrite=True,
    )
    for k, v in over.items():
        setattr(job, k, v)
    return job


def test_square_pads_to_1080():
    args = base().build_args()
    vf = args[args.index("-vf") + 1]
    assert "pad=1080:1080" in vf
    assert "-shortest" in args
    # the image is looped into a video stream
    assert args[args.index("-loop") + 1] == "1"


def test_wide_pads_to_1920x1080():
    vf = base(layout=CoverLayout.WIDE).build_args()
    idx = vf.index("-vf")
    assert "1920:1080" in vf[idx + 1]


def test_fit_image_only_evens_dimensions():
    args = base(layout=CoverLayout.FIT_IMAGE).build_args()
    assert args[args.index("-vf") + 1] == "scale=trunc(iw/2)*2:trunc(ih/2)*2"


def test_copy_audio_passthrough():
    args = base().build_args()
    assert args[args.index("-c:a") + 1] == "copy"


def test_blurred_background_uses_filter_complex_and_maps():
    args = base(blurred_background=True).build_args()
    assert "-filter_complex" in args
    fc = next(a for a in args if "boxblur" in a)
    assert "overlay" in fc
    assert "[v]" in args
    assert "1:a" in args


def test_normalize_forces_reencode():
    args = base(normalize_audio=True).build_args()
    assert args[args.index("-c:a") + 1] == "aac"
    assert "loudnorm" in args


def test_overwrite_flag():
    assert base(overwrite=False).build_args()[0] == "-n"
    assert base(overwrite=True).build_args()[0] == "-y"


def test_from_dict_camel_case():
    job = CoverVideoJob.from_dict(
        {
            "image": "c.png",
            "audio": "a.mp3",
            "output": "o.mp4",
            "layout": "wide",
            "blurredBackground": True,
            "copyAudio": False,
            "normalizeAudio": True,
            "overwrite": True,
        }
    )
    assert job.layout == CoverLayout.WIDE
    assert job.blurred_background is True
    assert job.copy_audio is False
    assert job.normalize_audio is True
