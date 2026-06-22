"""Real end-to-end tests of the job engine (spawns the bundled ffmpeg).

Skipped automatically if ffmpeg can't be resolved, so the pure-unit suite still
runs anywhere. These verify the full path: spawn -> stream progress -> done, and
that cancellation kills the process and reports `cancelled`.
"""

from __future__ import annotations

import os
import subprocess
import threading

import pytest

from ngc7023 import bin as binmod
from ngc7023.core.ffmpeg import MediaJob
from ngc7023.jobs.engine import JobEngine


def _ffmpeg_ok() -> bool:
    try:
        subprocess.run(
            [binmod.resolve("ffmpeg"), "-version"],
            capture_output=True,
            timeout=10,
        )
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _ffmpeg_ok(), reason="ffmpeg not available")


class Collector:
    """Captures emitted events; signals when a job:done arrives."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict]] = []
        self.done = threading.Event()
        self.first_progress = threading.Event()

    def emit(self, event: str, payload: dict) -> None:
        self.events.append((event, payload))
        if event == "job:progress":
            self.first_progress.set()
        elif event == "job:done":
            self.done.set()

    def done_payload(self) -> dict:
        return [p for e, p in self.events if e == "job:done"][-1]

    def progress_payloads(self) -> list[dict]:
        return [p for e, p in self.events if e == "job:progress"]


def _make_source(path: str, *, duration: int = 2, size: str = "320x240", rate: int = 15) -> None:
    subprocess.run(
        [
            binmod.resolve("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", f"testsrc=duration={duration}:size={size}:rate={rate}",
            "-pix_fmt", "yuv420p", path,
        ],
        capture_output=True,
        check=True,
    )


def test_real_media_conversion(tmp_path):
    src = str(tmp_path / "src.mp4")
    out = str(tmp_path / "out.mkv")
    _make_source(src)

    col = Collector()
    engine = JobEngine(col.emit, binmod.resolve)
    job = MediaJob(input=src, output=out, video_codec="h264", crf=28, overwrite=True)
    job_id = engine.start_media_job(job)

    assert col.done.wait(timeout=60), "job never finished"
    done = col.done_payload()
    assert done["id"] == job_id
    assert done["success"] is True, done
    assert done["cancelled"] is False
    assert os.path.exists(out) and os.path.getsize(out) > 0
    # We probed a real duration, so we should have seen a final 100% tick.
    assert any(p["percent"] >= 100.0 for p in col.progress_payloads())


def _make_srt(path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("1\n00:00:00,000 --> 00:00:01,500\nhello\n\n2\n00:00:01,500 --> 00:00:02,500\nworld\n")


def test_subtitle_soft_embed(tmp_path):
    src = str(tmp_path / "v.mp4")
    sub = str(tmp_path / "s.srt")
    out = str(tmp_path / "soft.mp4")
    _make_source(src)
    _make_srt(sub)

    col = Collector()
    engine = JobEngine(col.emit, binmod.resolve)
    job_id = engine.start_subtitle_job(src, sub, out, burn=False, delay=0.0, overwrite=True)
    assert col.done.wait(timeout=60)
    done = col.done_payload()
    assert done["id"] == job_id
    assert done["success"] is True, done
    assert os.path.exists(out) and os.path.getsize(out) > 0


def test_subtitle_burn_in_with_delay(tmp_path):
    src = str(tmp_path / "v.mp4")
    sub = str(tmp_path / "s.srt")
    out = str(tmp_path / "burn.mp4")
    _make_source(src)
    _make_srt(sub)

    col = Collector()
    engine = JobEngine(col.emit, binmod.resolve)
    # burn-in + a delay exercises the cwd-relative filter path + the itsoffset shift.
    job_id = engine.start_subtitle_job(src, sub, out, burn=True, delay=0.5, overwrite=True)
    assert col.done.wait(timeout=60)
    done = col.done_payload()
    assert done["success"] is True, done
    assert os.path.exists(out) and os.path.getsize(out) > 0


def test_cancellation_reports_cancelled(tmp_path):
    # A longer, heavier source so the encode lasts long enough to cancel.
    src = str(tmp_path / "long.mp4")
    out = str(tmp_path / "long_out.mp4")
    _make_source(src, duration=30, size="1280x720", rate=30)

    col = Collector()
    engine = JobEngine(col.emit, binmod.resolve)
    # A slow preset makes sure it doesn't finish before we cancel.
    job = MediaJob(input=src, output=out, video_codec="h264", crf=18, overwrite=True)
    job_id = engine.start_media_job(job)

    # Wait until it's actually running, then cancel.
    assert col.first_progress.wait(timeout=30), "job never started progressing"
    engine.cancel(job_id)

    assert col.done.wait(timeout=30), "cancelled job never reported done"
    done = col.done_payload()
    assert done["id"] == job_id
    assert done["cancelled"] is True
    assert done["success"] is False
