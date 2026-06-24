"""Pure builders + read-only host probes.

Everything here is
unit-testable without launching a job or touching the GUI. The UI never builds a
command string — it fills a typed object and these modules produce the exact
argv for ffmpeg / yt-dlp.
"""
