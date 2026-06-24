"""Spawns ffmpeg / yt-dlp for a job and streams progress via the event bus.

One job runs per thread: it emits
``job:progress`` events while running (with optional speed/ETA for downloads) and
a ``job:done`` event at the end. Running children are tracked so a cancel can kill
them; a cancelled job reports ``cancelled`` instead of ``error``.

Concurrency note: the frontend queue (`useJobs.ts`) caps how many jobs start at
once, so this engine deliberately does not implement its own queue.
"""

from __future__ import annotations

import itertools
import os
import shutil
import subprocess
import tempfile
import threading
from typing import Callable, Optional

from . import progress
from .progress import hms_to_secs

# Hide the console window when spawning children from a windowed app (Windows).
from ..core.proc import _CREATE_NO_WINDOW

# Type aliases for clarity.
Emit = Callable[[str, dict], None]
Resolve = Callable[[str], str]

# Shared flags that make FFmpeg print machine-readable progress to stdout.
_FFMPEG_PROGRESS_FLAGS = ["-hide_banner", "-nostats", "-progress", "pipe:1"]

# Keep this many trailing stderr lines for error reporting.
_STDERR_TAIL = 20


class JobEngine:
    """Runs media/download jobs as child processes and reports progress.

    ``emit`` pushes ``(event, payload)`` to the frontend; ``resolve`` maps a tool
    name ("ffmpeg" / "yt-dlp") to its executable path.
    """

    def __init__(self, emit: Emit, resolve: Resolve) -> None:
        self._emit = emit
        self._resolve = resolve
        self._ids = itertools.count(1)
        self._lock = threading.Lock()
        self._procs: dict[int, subprocess.Popen] = {}
        self._cancelled: set[int] = set()

    # ── public API (called from the Api bridge) ────────────────────────────
    def start_media_job(self, job) -> int:
        return self._spawn_thread(self._run_media, job)

    def start_download_job(self, job) -> int:
        return self._spawn_thread(self._run_download, job)

    def start_subtitle_job(
        self,
        video: str,
        subtitle: str,
        output: str,
        burn: bool,
        delay: float,
        overwrite: bool,
        video_codec=None,
        hw_accel=None,
    ) -> int:
        job_id = next(self._ids)
        threading.Thread(
            target=self._run_subtitle,
            args=(job_id, video, subtitle, output, burn, delay, overwrite, video_codec, hw_accel),
            daemon=True,
        ).start()
        return job_id

    def start_cover_job(self, job) -> int:
        return self._spawn_thread(self._run_cover, job)

    # ── PDF jobs (run a pure-Python op on a thread, then report done/error) ──
    def start_image_pdf_job(self, input_path: str, output: str) -> int:
        from . import pdf_ops

        return self._spawn_pdf(lambda _p: pdf_ops.image_to_pdf(input_path, output))

    def start_images_pdf_job(self, inputs: list[str], output: str) -> int:
        from . import pdf_ops

        return self._spawn_pdf(lambda p: pdf_ops.images_to_pdf(inputs, output, p))

    def start_merge_pdf_job(self, inputs: list[str], output: str) -> int:
        from . import pdf_ops

        return self._spawn_pdf(lambda _p: pdf_ops.merge_pdfs(inputs, output))

    def start_pdf_pages_job(self, input_path: str, output: str, pages: list[int], keep: bool) -> int:
        from . import pdf_ops

        return self._spawn_pdf(lambda _p: pdf_ops.edit_pdf_pages(input_path, output, pages, keep))

    def start_pdf_images_job(self, input_path: str, stem: str, image_format: str) -> int:
        from . import pdf_ops

        return self._spawn_pdf(lambda p: pdf_ops.pdf_to_images(input_path, stem, image_format, p))

    def cancel(self, job_id: int) -> None:
        """Kills a running job (no-op if it already finished or never started)."""
        with self._lock:
            self._cancelled.add(job_id)
            proc = self._procs.get(job_id)
        if proc is not None:
            try:
                proc.kill()
            except Exception:
                pass

    # ── job runners ────────────────────────────────────────────────────────
    def _run_media(self, job_id: int, job) -> None:
        # GIF runs as two passes (palette -> encode): the single-pass split filter
        # buffers every frame and never reports progress until the very end.
        if getattr(job, "is_gif", None) and job.is_gif():
            self._run_gif(job_id, job)
            return
        duration = self._probe_duration(job.input) or 0.0
        args = [*_FFMPEG_PROGRESS_FLAGS, *job.build_args()]
        self._run_ffmpeg(job_id, args, duration)

    def _run_gif(self, job_id: int, job) -> None:
        """Two-pass GIF: pass 1 writes an optimal palette to a temp PNG (low
        memory, streams the input once); pass 2 applies it with paletteuse, which
        streams frame-by-frame so progress advances normally."""
        duration = self._probe_duration(job.input) or 0.0
        workdir = tempfile.mkdtemp(prefix="ngc7023-gif-")
        palette = os.path.join(workdir, "palette.png")
        try:
            ok, tail = self._run_palettegen(
                job_id, ["-hide_banner", *job.build_gif_palettegen_args(palette)]
            )
            if not ok or not os.path.exists(palette):
                cancelled = self._unregister(job_id)
                if cancelled:
                    self._emit_done(job_id, False, True, "cancelled")
                else:
                    self._emit_done(job_id, False, False,
                                    f"ffmpeg palette pass failed. {tail}".strip())
                return
            # Pass 2 registers itself, streams progress, and emits job:done.
            args = [*_FFMPEG_PROGRESS_FLAGS, *job.build_gif_encode_args(palette)]
            self._run_ffmpeg(job_id, args, duration)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _run_palettegen(self, job_id: int, args: list[str]) -> tuple[bool, str]:
        """Runs the palette pass as a tracked child (so a cancel can kill it) and
        returns (succeeded, stderr_tail). Emits no events — the caller decides."""
        try:
            proc = subprocess.Popen(
                [self._resolve("ffmpeg"), *args],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,  # palettegen output is the PNG file
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=_CREATE_NO_WINDOW,
            )
        except OSError as e:
            return False, f"failed to start ffmpeg: {e}"
        self._register(job_id, proc)
        tail: list[str] = []
        if proc.stderr is not None:
            for line in proc.stderr:
                tail.append(line.rstrip("\n"))
                if len(tail) > _STDERR_TAIL:
                    tail.pop(0)
        proc.wait()
        return proc.returncode == 0, "\n".join(tail)

    def _run_cover(self, job_id: int, job) -> None:
        # Progress is measured against the audio length (the image loops to it).
        duration = self._probe_duration(job.audio) or 0.0
        args = [*_FFMPEG_PROGRESS_FLAGS, *job.build_args()]
        self._run_ffmpeg(job_id, args, duration)

    def _spawn_pdf(self, op: Callable[[Callable[[float], None]], object]) -> int:
        """Runs a PDF op (a callable taking a progress callback) on a thread and
        reports a clean ``job:done`` (success line or the error message)."""
        job_id = next(self._ids)

        def runner() -> None:
            from .pdf_ops import PdfError

            try:
                op(lambda pct: self._emit_progress(job_id, pct))
            except PdfError as e:
                self._emit_done(job_id, False, False, str(e))
                return
            except Exception as e:  # defensive: never let a thread die silently
                self._emit_done(job_id, False, False, f"pdf error: {e}")
                return
            self._emit_progress(job_id, 100.0)
            self._emit_done(job_id, True, False, "done")

        threading.Thread(target=runner, daemon=True).start()
        return job_id

    def _run_subtitle(
        self,
        job_id: int,
        video: str,
        subtitle: str,
        output: str,
        burn: bool,
        delay: float,
        overwrite: bool,
        video_codec=None,
        hw_accel=None,
    ) -> None:
        from ..core.ffmpeg import SubtitleJob

        # Stage the subtitle in a temp dir under a safe name. If there's a time
        # shift, write the shifted copy; otherwise copy as-is. Burn-in then runs
        # with cwd = that dir and references the bare filename (no path escaping).
        workdir = tempfile.mkdtemp(prefix="ngc7023-sub-")
        ext = os.path.splitext(subtitle)[1] or ".srt"
        staged = os.path.join(workdir, f"sub{ext}")
        try:
            if abs(delay) > 1e-9:
                shifted = subprocess.run(
                    [self._resolve("ffmpeg"), "-y", "-itsoffset", f"{delay:.3f}",
                     "-i", subtitle, "-c", "copy", staged],
                    capture_output=True, timeout=30.0, creationflags=_CREATE_NO_WINDOW,
                )
                if shifted.returncode != 0 or not os.path.exists(staged):
                    shutil.copyfile(subtitle, staged)  # fall back to no shift
            else:
                shutil.copyfile(subtitle, staged)

            sub_arg = os.path.basename(staged) if burn else staged
            job = SubtitleJob(
                video=video, subtitle=sub_arg, output=output, burn=burn, overwrite=overwrite,
                video_codec=video_codec, hw_accel=hw_accel,
            )
            duration = self._probe_duration(video) or 0.0
            args = [*_FFMPEG_PROGRESS_FLAGS, *job.build_args()]
            self._run_ffmpeg(job_id, args, duration, cwd=workdir if burn else None)
        except OSError as e:
            self._emit_done(job_id, False, False, f"subtitle prep failed: {e}")
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _run_ffmpeg(self, job_id: int, args: list[str], duration: float, cwd: str | None = None) -> None:
        try:
            proc = subprocess.Popen(
                [self._resolve("ffmpeg"), *args],
                stdin=subprocess.DEVNULL,  # FFmpeg reads stdin as key commands
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                cwd=cwd,
                creationflags=_CREATE_NO_WINDOW,
            )
        except OSError as e:
            self._emit_done(job_id, False, False, f"failed to start ffmpeg: {e}")
            return

        self._register(job_id, proc)
        read_tail = self._drain_stderr(proc)

        if proc.stdout is not None:
            for line in proc.stdout:
                secs = progress.parse_out_time_secs(line.strip())
                if secs is not None:
                    percent = (
                        max(0.0, min(100.0, secs / duration * 100.0))
                        if duration > 0
                        else 0.0
                    )
                    self._emit_progress(job_id, percent)

        proc.wait()
        self._finish(job_id, proc.returncode, read_tail(), "ffmpeg")

    def _run_download(self, job_id: int, job) -> None:
        try:
            proc = subprocess.Popen(
                [self._resolve("yt-dlp"), *job.build_args()],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=_CREATE_NO_WINDOW,
            )
        except OSError as e:
            self._emit_done(job_id, False, False, f"failed to start yt-dlp: {e}")
            return

        self._register(job_id, proc)
        read_tail = self._drain_stderr(proc)

        if proc.stdout is not None:
            for line in proc.stdout:
                parsed = progress.parse_ytdlp_progress(line.strip())
                if parsed is not None:
                    percent, speed, eta = parsed
                    self._emit_progress(job_id, percent, speed, eta)

        proc.wait()
        self._finish(job_id, proc.returncode, read_tail(), "yt-dlp")

    # ── shared finishing / bookkeeping ─────────────────────────────────────
    def _finish(self, job_id: int, returncode: Optional[int], tail: str, tool: str) -> None:
        cancelled = self._unregister(job_id)
        if cancelled:
            self._emit_done(job_id, False, True, "cancelled")
            return
        if returncode == 0:
            self._emit_progress(job_id, 100.0)
            self._emit_done(job_id, True, False, "done")
        else:
            msg = f"{tool} exited ({returncode}). {tail}".strip()
            self._emit_done(job_id, False, False, msg)

    def _spawn_thread(self, target, job) -> int:
        job_id = next(self._ids)
        threading.Thread(target=target, args=(job_id, job), daemon=True).start()
        return job_id

    def _register(self, job_id: int, proc: subprocess.Popen) -> None:
        with self._lock:
            self._procs[job_id] = proc
            already_cancelled = job_id in self._cancelled
        # A cancel that arrived before the process existed would otherwise be
        # lost (the job would run to completion yet report "cancelled"). Kill it
        # right away so the cancellation actually takes effect.
        if already_cancelled:
            try:
                proc.kill()
            except Exception:
                pass

    def _unregister(self, job_id: int) -> bool:
        """Removes the job; returns whether it had been cancelled."""
        with self._lock:
            self._procs.pop(job_id, None)
            was_cancelled = job_id in self._cancelled
            self._cancelled.discard(job_id)
            return was_cancelled

    def _drain_stderr(self, proc: subprocess.Popen) -> Callable[[], str]:
        """Drains stderr on its own thread (so the pipe can't fill and block the
        tool), keeping the last ~20 lines. Returns a function to join + read them.
        """
        lines: list[str] = []

        def reader() -> None:
            if proc.stderr is None:
                return
            for line in proc.stderr:
                lines.append(line.rstrip("\n"))
                if len(lines) > _STDERR_TAIL:
                    lines.pop(0)

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()

        def read_tail() -> str:
            thread.join(timeout=2.0)
            return "\n".join(lines)

        return read_tail

    def _probe_duration(self, input_path: str) -> Optional[float]:
        """Reads the input duration from ffmpeg's stderr ("Duration: HH:MM:SS.ss")
        so a separate ffprobe binary doesn't need to ship."""
        try:
            result = subprocess.run(
                [self._resolve("ffmpeg"), "-hide_banner", "-i", input_path],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30.0,
                creationflags=_CREATE_NO_WINDOW,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        stderr = result.stderr or ""
        idx = stderr.find("Duration:")
        if idx < 0:
            return None
        token = stderr[idx + len("Duration:"):].lstrip().split(",")[0].strip()
        return hms_to_secs(token)

    # ── event emission ─────────────────────────────────────────────────────
    def _emit_progress(
        self,
        job_id: int,
        percent: float,
        speed: Optional[str] = None,
        eta: Optional[str] = None,
    ) -> None:
        payload: dict = {"id": job_id, "percent": percent}
        if speed:
            payload["speed"] = speed
        if eta:
            payload["eta"] = eta
        self._emit("job:progress", payload)

    def _emit_done(
        self, job_id: int, success: bool, cancelled: bool, message: str
    ) -> None:
        self._emit(
            "job:done",
            {
                "id": job_id,
                "success": success,
                "cancelled": cancelled,
                "message": message,
            },
        )
