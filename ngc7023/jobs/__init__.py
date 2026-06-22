"""Job engine: spawns ffmpeg / yt-dlp, streams progress, manages cancellation.

This has side effects (it launches processes), so it lives outside ``core``,
which stays pure. The frontend (`useJobs.ts`) owns the queue + concurrency; the
engine runs one process per job and reports via the event bus.
"""
