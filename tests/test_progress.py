"""Unit tests for the tool progress-line parsers."""

from ngc7023.jobs.progress import (
    hms_to_secs,
    is_progress_end,
    parse_out_time_secs,
    parse_ytdlp_percent,
    parse_ytdlp_progress,
)


def test_parses_out_time():
    assert parse_out_time_secs("out_time=00:00:12.340000") == 12.34
    assert parse_out_time_secs("frame=10") is None


def test_hms_variants():
    assert hms_to_secs("01:02:03") == 3723.0
    assert hms_to_secs("12.5") == 12.5
    assert hms_to_secs("nope") is None


def test_detects_end():
    assert is_progress_end("progress=end")
    assert not is_progress_end("progress=continue")


def test_ytdlp_percent():
    assert parse_ytdlp_percent("[download]  42.0% of 10.00MiB") == 42.0
    assert parse_ytdlp_percent("[download] 100% of 1.0MiB") == 100.0
    assert parse_ytdlp_percent("[info] no percent here") is None


def test_ytdlp_progress_speed_eta():
    p, speed, eta = parse_ytdlp_progress(
        "[download]  42.0% of 10.00MiB at 1.50MiB/s ETA 00:07"
    )
    assert p == 42.0
    assert speed == "1.50MiB/s"
    assert eta == "00:07"
    # No speed/eta on a bare percentage line.
    p2, speed2, eta2 = parse_ytdlp_progress("[download] 100% of 1.0MiB")
    assert p2 == 100.0
    assert speed2 is None and eta2 is None
    assert parse_ytdlp_progress("[info] nope") is None


def test_ytdlp_unknown_eta_is_dropped():
    p, speed, eta = parse_ytdlp_progress(
        "[download]   0.0% of ~1.00MiB at Unknown B/s ETA Unknown"
    )
    assert p == 0.0
    assert speed is None
    assert eta is None
