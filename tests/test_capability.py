"""Mirrors the Rust unit test in core/capability.rs for hw-family parsing."""

from ngc7023.core.capability import detect_hw_families, order_by_gpu


def test_parses_amd_and_nvidia_families():
    sample = (
        " V....D h264_amf             AMD AMF H.264 Encoder\n"
        " V....D hevc_nvenc           NVIDIA NVENC hevc encoder\n"
        " V....D h264_videotoolbox    VideoToolbox H.264\n"
        " V....D libx264              libx264 H.264"
    )
    fams = detect_hw_families(sample)
    assert "amf" in fams
    assert "nvenc" in fams
    # FFmpeg's `videotoolbox` suffix maps to the `video_toolbox` family id.
    assert "video_toolbox" in fams
    assert "qsv" not in fams


# A full ffmpeg build lists every family; "auto" takes the first, so the family
# matching the real GPU must be moved to the front (no family is ever dropped).
ALL = ["amf", "nvenc", "qsv", "vaapi"]


def test_nvidia_gpu_puts_nvenc_first():
    assert order_by_gpu(ALL, ["NVIDIA GeForce RTX 4070"])[0] == "nvenc"


def test_amd_gpu_puts_amf_first(monkeypatch):
    monkeypatch.setattr("ngc7023.core.capability.sys.platform", "win32")
    out = order_by_gpu(ALL, ["AMD Radeon RX 7600"])
    assert out[0] == "amf"
    assert set(out) == set(ALL)  # nothing dropped


def test_intel_gpu_puts_qsv_first_on_windows(monkeypatch):
    monkeypatch.setattr("ngc7023.core.capability.sys.platform", "win32")
    assert order_by_gpu(ALL, ["Intel(R) UHD Graphics 770"])[0] == "qsv"


def test_amd_on_linux_prefers_vaapi(monkeypatch):
    monkeypatch.setattr("ngc7023.core.capability.sys.platform", "linux")
    assert order_by_gpu(ALL, ["AMD Radeon RX 7600"])[0] == "vaapi"


def test_unknown_gpu_keeps_order():
    assert order_by_gpu(ALL, ["Some Mystery Adapter"]) == ALL
    assert order_by_gpu(ALL, []) == ALL


def test_preferred_family_absent_keeps_order():
    # NVIDIA GPU but the build has no nvenc → unchanged (don't invent a family).
    assert order_by_gpu(["amf", "vaapi"], ["NVIDIA RTX 4070"]) == ["amf", "vaapi"]
