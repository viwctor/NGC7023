"""Pure builders + read-only host probes.

This mirrors `src-tauri/src/core` from the old Tauri app: everything here is
unit-testable without launching a job or touching the GUI. The UI never builds a
command string — it fills a typed object and these modules produce the exact
argv for ffmpeg / yt-dlp.
"""
