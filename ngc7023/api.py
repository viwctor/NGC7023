"""The pywebview bridge: the thin object exposed to the React frontend.

This is a deliberately
thin layer. All real logic lives in :mod:`ngc7023.core` and the job engine
(:mod:`ngc7023.jobs`); these methods only unpack the params dict and delegate. An
exception raised here is delivered to the frontend by pywebview as a rejected
promise (the UI handles it), so a bad call never takes the window down.

Each method takes a single ``params`` dict because the JS bridge calls
``window.pywebview.api.<method>(paramsObject)`` (see frontend `_bridge.ts`).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Any, Optional

from . import __version__ as APP_VERSION
from . import bin as binmod
from .core import capability, system_info
from .core.cover import CoverVideoJob
from .core.ffmpeg import HwAccel, MediaJob
from .core.proc import _CREATE_NO_WINDOW
from .core.ytdlp import DownloadJob
from .jobs.engine import JobEngine

# GitHub "owner/repo" for update checks (the "verificar atualizações" button
# compares the running version to the latest release tag). Adjust if you name
# the repository differently.
UPDATE_REPO = "viwctor/ngc7023"
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_RUN_NAME = "ngc7023"


class Api:
    """Methods here become ``window.pywebview.api.<name>`` in the frontend."""

    def __init__(self) -> None:
        self._window: Any = None
        # The job engine assigns job ids and runs ffmpeg / yt-dlp. It emits
        # through self.emit (which is safe to call before the window exists).
        self._engine = JobEngine(self.emit, binmod.resolve)
        # Cache host probes for the session (they shell out; UI also caches).
        self._caps: Optional[dict] = None
        self._sysinfo: Optional[dict] = None
        # System-tray state (close hides to tray only when an icon is running).
        self._tray: Any = None
        self._tray_enabled = False

    def bind(self, window: Any) -> None:
        """Called once the pywebview window exists, so we can drive it."""
        self._window = window

    # ── Python -> JS events ────────────────────────────────────────────────
    def emit(self, event: str, payload: dict) -> None:
        """Pushes an event to the frontend bus (job:progress / job:done)."""
        if self._window is None:
            return
        code = f"window.__ngc && window.__ngc.emit({json.dumps(event)}, {json.dumps(payload)})"
        try:
            self._window.evaluate_js(code)
        except Exception:  # the window may be closing
            pass

    # ── host probes ────────────────────────────────────────────────────────
    def detect_capabilities(self, params: dict | None = None) -> dict:
        if self._caps is None:
            caps = capability.detect(binmod.resolve("ffmpeg"), binmod.resolve("yt-dlp"))
            self._caps = caps.to_dict()
        return self._caps

    def get_system_info(self, params: dict | None = None) -> dict:
        if self._sysinfo is None:
            self._sysinfo = system_info.detect().to_dict()
        return self._sysinfo

    def validate_url(self, params: dict | None = None) -> dict:
        """Checks a link with yt-dlp BEFORE the download wizard, so an unsupported
        (or private/unavailable) URL is reported up front instead of after the
        user picks format/quality. ``--simulate`` extracts metadata only; the
        first playlist item is enough to confirm support.

        Returns ``{"ok": bool, "message": str}``. If yt-dlp can't even be launched
        (e.g. binary missing in dev), returns ok=True so the flow isn't blocked —
        the real run will surface that error.
        """
        url = str((params or {}).get("url") or "").strip()
        if not url:
            return {"ok": False, "message": "no url"}
        try:
            result = subprocess.run(
                [
                    binmod.resolve("yt-dlp"), "--no-warnings", "--simulate",
                    "--playlist-items", "1", "--print", "id", url,
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
                creationflags=_CREATE_NO_WINDOW,
            )
        except (OSError, subprocess.SubprocessError):
            return {"ok": True, "message": ""}  # can't probe → don't block
        if result.returncode == 0:
            return {"ok": True, "message": ""}
        tail = "\n".join((result.stderr or "").splitlines()[-5:])
        return {"ok": False, "message": tail}

    # ── dry-run argv previews ──────────────────────────────────────────────
    def preview_ffmpeg_args(self, params: dict | None = None) -> list[str]:
        job = MediaJob.from_dict((params or {}).get("job") or {})
        return job.build_args()

    def preview_ytdlp_args(self, params: dict | None = None) -> list[str]:
        job = DownloadJob.from_dict((params or {}).get("job") or {})
        return job.build_args()

    def preview_cover_video_args(self, params: dict | None = None) -> list[str]:
        job = CoverVideoJob.from_dict((params or {}).get("job") or {})
        return job.build_args()

    # ── clipboard paste -> temp file ───────────────────────────────────────
    def save_pasted_file(self, params: dict | None = None) -> str:
        params = params or {}
        name = str(params.get("name") or "colado")
        data = params.get("bytes") or []
        # Keep only the file name (no directories) to block path traversal.
        safe = os.path.basename(name.replace("\\", "/")) or "colado"
        out_dir = Path(tempfile.gettempdir()) / "ngc7023-colado"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / safe
        path.write_bytes(bytes(bytearray(int(b) & 0xFF for b in data)))
        return str(path)

    # ── job execution (delegated to the job engine) ────────────────────────
    def run_media_job(self, params: dict | None = None) -> int:
        job = MediaJob.from_dict((params or {}).get("job") or {})
        return self._engine.start_media_job(job)

    def run_download_job(self, params: dict | None = None) -> int:
        job = DownloadJob.from_dict((params or {}).get("job") or {})
        return self._engine.start_download_job(job)

    def run_subtitle_job(self, params: dict | None = None) -> int:
        j = (params or {}).get("job") or {}
        hw = j.get("hwAccel")
        return self._engine.start_subtitle_job(
            video=str(j.get("video", "")),
            subtitle=str(j.get("subtitle", "")),
            output=str(j.get("output", "")),
            burn=bool(j.get("burn", False)),
            delay=float(j.get("delaySec") or 0.0),
            overwrite=bool(j.get("overwrite", True)),
            video_codec=j.get("videoCodec"),
            hw_accel=HwAccel(hw) if hw else None,
        )

    # ── subtitle conveniences (v1.1) ───────────────────────────────────────
    def list_subtitle_tracks(self, params: dict | None = None) -> list[dict]:
        """Embedded subtitle tracks of a video, so the UI can offer to extract one."""
        video = str((params or {}).get("video") or "")
        return self._engine.list_subtitle_tracks(video) if video else []

    def run_subtitle_extract_job(self, params: dict | None = None) -> int:
        p = params or {}
        return self._engine.start_subtitle_extract_job(
            str(p.get("video", "")), int(p.get("index", 0)), str(p.get("output", ""))
        )

    def run_subtitle_convert_job(self, params: dict | None = None) -> int:
        p = params or {}
        return self._engine.start_subtitle_convert_job(
            str(p.get("input", "")), str(p.get("output", ""))
        )

    def run_cover_job(self, params: dict | None = None) -> int:
        job = CoverVideoJob.from_dict((params or {}).get("job") or {})
        return self._engine.start_cover_job(job)

    def run_image_pdf_job(self, params: dict | None = None) -> int:
        p = params or {}
        return self._engine.start_image_pdf_job(str(p.get("input", "")), str(p.get("output", "")))

    def run_images_pdf_job(self, params: dict | None = None) -> int:
        p = params or {}
        inputs = [str(x) for x in (p.get("inputs") or [])]
        return self._engine.start_images_pdf_job(inputs, str(p.get("output", "")))

    def run_pdf_pages_job(self, params: dict | None = None) -> int:
        p = params or {}
        pages = [int(x) for x in (p.get("pages") or [])]
        return self._engine.start_pdf_pages_job(
            str(p.get("input", "")), str(p.get("output", "")), pages, bool(p.get("keep", True))
        )

    def run_merge_pdf_job(self, params: dict | None = None) -> int:
        p = params or {}
        inputs = [str(x) for x in (p.get("inputs") or [])]
        return self._engine.start_merge_pdf_job(inputs, str(p.get("output", "")))

    def run_pdf_images_job(self, params: dict | None = None) -> int:
        p = params or {}
        return self._engine.start_pdf_images_job(
            str(p.get("input", "")), str(p.get("stem", "")), str(p.get("format", "png"))
        )

    def cancel_job(self, params: dict | None = None) -> None:
        job_id = (params or {}).get("id")
        if job_id is not None:
            self._engine.cancel(int(job_id))

    # ── window controls ────────────────────────────────────────────────────
    def window_minimize(self, params: dict | None = None) -> None:
        if self._window is not None:
            try:
                self._window.minimize()
            except Exception:
                pass

    def window_close(self, params: dict | None = None) -> None:
        if self._window is None:
            return
        # Hide to the tray only when an icon is actually running; otherwise quit
        # (so a missing/failed tray never traps the window).
        if self._tray_enabled and self._tray is not None:
            try:
                self._window.hide()
                return
            except Exception:
                pass
        try:
            self._window.destroy()
        except Exception:
            pass

    def window_maximize(self, params: dict | None = None) -> None:
        if self._window is not None:
            try:
                self._window.maximize()
            except Exception:
                pass

    # ── shell open / reveal ────────────────────────────────────────────────
    def dialog_open(self, params: dict | None = None) -> Any:
        if self._window is None:
            return None
        import webview

        params = params or {}
        multiple = bool(params.get("multiple"))
        directory = bool(params.get("directory"))
        dialog_type = webview.FOLDER_DIALOG if directory else webview.OPEN_DIALOG

        kwargs: dict[str, Any] = {"allow_multiple": multiple}
        if not directory:
            file_types = _to_file_types(params.get("filters") or [])
            if file_types:
                kwargs["file_types"] = file_types

        result = self._window.create_file_dialog(dialog_type, **kwargs)
        if not result:
            return None
        paths = list(result)
        return paths if multiple else paths[0]

    def open_path(self, params: dict | None = None) -> None:
        _open_in_os(str((params or {}).get("path") or ""))

    def reveal_item(self, params: dict | None = None) -> None:
        _reveal_in_os(str((params or {}).get("path") or ""))

    def open_url(self, params: dict | None = None) -> None:
        import webbrowser

        url = str((params or {}).get("url") or "")
        if url:
            webbrowser.open(url)

    # ── settings / OS integration ──────────────────────────────────────────
    def set_tray(self, params: dict | None = None) -> None:
        """Enable/disable the system-tray icon (close → hide instead of quit)."""
        self._tray_enabled = bool((params or {}).get("enabled"))
        if self._tray_enabled:
            self.ensure_tray()
        elif self._tray is not None:
            try:
                self._tray.stop()
            except Exception:
                pass
            self._tray = None

    def ensure_tray(self) -> bool:
        """Starts the tray icon if not running. Returns whether it's up."""
        if self._tray is not None:
            return True
        try:
            import pystray

            image = _tray_icon_image()

            def _open(icon, item) -> None:
                try:
                    self._window.show()
                except Exception:
                    pass

            def _quit(icon, item) -> None:
                try:
                    icon.stop()
                finally:
                    self._tray = None
                    try:
                        self._window.destroy()
                    except Exception:
                        pass

            menu = pystray.Menu(
                pystray.MenuItem("abrir", _open, default=True),
                pystray.MenuItem("sair", _quit),
            )
            self._tray = pystray.Icon("ngc7023", image, "NGC7023", menu)
            threading.Thread(target=self._tray.run, daemon=True).start()
            return True
        except Exception:
            self._tray = None
            return False

    def set_autostart(self, params: dict | None = None) -> None:
        """Add/remove an HKCU Run entry so the app starts (in the tray) on login."""
        if sys.platform != "win32":
            return
        enabled = bool((params or {}).get("enabled"))
        try:
            import winreg

            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE)
            try:
                if enabled:
                    winreg.SetValueEx(key, _RUN_NAME, 0, winreg.REG_SZ, _autostart_command())
                else:
                    try:
                        winreg.DeleteValue(key, _RUN_NAME)
                    except FileNotFoundError:
                        pass
            finally:
                winreg.CloseKey(key)
        except Exception:
            pass

    def restart_app(self, params: dict | None = None) -> None:
        """Launch a fresh instance, then close this one shortly after."""
        try:
            if getattr(sys, "frozen", False):
                subprocess.Popen([sys.executable], creationflags=_CREATE_NO_WINDOW)
            else:
                subprocess.Popen(
                    [sys.executable, "-m", "ngc7023"],
                    cwd=str(binmod.app_dir().parent),
                    creationflags=_CREATE_NO_WINDOW,
                )
        except Exception:
            return

        def _close() -> None:
            try:
                if self._tray is not None:
                    self._tray.stop()
            except Exception:
                pass
            try:
                self._window.destroy()
            except Exception:
                pass

        threading.Timer(0.7, _close).start()

    def check_updates(self, params: dict | None = None) -> dict:
        """Compares the latest GitHub release tag with the running version."""
        if not UPDATE_REPO:
            return {"configured": False, "available": False}
        try:
            url = f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest"
            req = urllib.request.Request(
                url, headers={"Accept": "application/vnd.github+json", "User-Agent": "ngc7023"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            tag = str(data.get("tag_name", "")).lstrip("vV")
            asset = _platform_asset(data.get("assets") or [])
            return {
                "configured": True,
                "available": _version_gt(tag, APP_VERSION),
                "version": tag,
                "url": data.get("html_url", ""),
                "assetUrl": asset.get("browser_download_url") if asset else None,
                "assetName": asset.get("name") if asset else None,
            }
        except Exception:
            return {"configured": True, "available": False, "error": True}

    def download_update(self, params: dict | None = None) -> None:
        """Download this platform's release asset (emitting ``update:progress``)
        then launch it: on Windows run the installer; on Linux replace the running
        AppImage in place and relaunch. The frontend passes the asset URL/name
        from a prior ``check_updates``."""
        p = params or {}
        url = str(p.get("assetUrl") or "")
        name = str(p.get("assetName") or "ngc7023-update")
        if not url:
            self.emit("update:done", {"success": False, "message": "no asset for this platform"})
            return
        threading.Thread(target=self._download_update, args=(url, name), daemon=True).start()

    def _download_update(self, url: str, name: str) -> None:
        out_dir = Path(tempfile.gettempdir()) / "ngc7023-update"
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            dest = out_dir / os.path.basename(name)
            req = urllib.request.Request(url, headers={"User-Agent": "ngc7023"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                total = int(resp.headers.get("Content-Length") or 0)
                done = 0
                with open(dest, "wb") as fh:
                    while True:
                        chunk = resp.read(262144)
                        if not chunk:
                            break
                        fh.write(chunk)
                        done += len(chunk)
                        if total:
                            self.emit("update:progress", {"percent": min(100.0, done / total * 100.0)})
        except Exception as e:
            self.emit("update:done", {"success": False, "message": f"download failed: {e}"})
            return
        self.emit("update:progress", {"percent": 100.0})
        self._launch_update(str(dest))

    def _launch_update(self, path: str) -> None:
        import shutil

        try:
            if sys.platform == "win32":
                # Run the installer, then close this app so it can overwrite the exe.
                subprocess.Popen([path], creationflags=_CREATE_NO_WINDOW)
                self.emit("update:done", {"success": True, "message": "installing"})
                threading.Timer(0.8, self._close_for_update).start()
            elif sys.platform.startswith("linux") and os.environ.get("APPIMAGE"):
                appimage = os.environ["APPIMAGE"]
                shutil.move(path, appimage)  # replace the running AppImage in place
                os.chmod(appimage, 0o755)
                subprocess.Popen([appimage])
                self.emit("update:done", {"success": True, "message": "updated"})
                threading.Timer(0.8, self._close_for_update).start()
            else:
                # Dev / non-AppImage: just reveal the download for the user.
                _reveal_in_os(path)
                self.emit("update:done", {"success": True, "message": "downloaded"})
        except Exception as e:
            self.emit("update:done", {"success": False, "message": f"launch failed: {e}"})

    def _close_for_update(self) -> None:
        try:
            if self._tray is not None:
                self._tray.stop()
        except Exception:
            pass
        try:
            self._window.destroy()
        except Exception:
            pass


# ── OS helpers ──────────────────────────────────────────────────────────────
def _autostart_command() -> str:
    """The command Windows runs at login (launches minimized to the tray)."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    exe = sys.executable
    pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
    if os.path.exists(pyw):
        exe = pyw
    return f'"{exe}" -m ngc7023 --tray'


def _tray_icon_image():
    """Tray icon = the arrow chevron (``branding/tray.png``), kept distinct from
    the app/window icon so the tray glyph stays the arrow even though the app
    icon is the nebula. Falls back to a drawn chevron if the asset is missing."""
    from PIL import Image

    try:
        path = binmod.resource_path("web", "branding", "tray.png")
        return Image.open(str(path)).convert("RGBA").resize((64, 64), Image.LANCZOS)
    except Exception:
        return _drawn_chevron()


def _drawn_chevron():
    """Fallback tray glyph: a cyan ``❯`` chevron on transparent."""
    from PIL import Image, ImageDraw

    s = 64
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cyan = (106, 215, 255, 255)
    w = 9
    pts = [(23, 15), (47, 32), (23, 49)]
    d.line(pts, fill=cyan, width=w, joint="curve")
    for (cx, cy) in pts:  # round the caps/joins
        r = w / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cyan)
    return img


def _version_gt(a: str, b: str) -> bool:
    """True if version string ``a`` is greater than ``b`` (numeric dotted parts)."""
    def parts(v: str) -> list[int]:
        out: list[int] = []
        for p in v.split("."):
            num = "".join(ch for ch in p if ch.isdigit())
            out.append(int(num) if num else 0)
        return out

    return parts(a) > parts(b)


def _platform_asset(assets: list[dict]) -> Optional[dict]:
    """The release asset for this OS: the Windows ``.exe`` or the Linux
    ``.AppImage`` (``None`` if the release has no matching file)."""
    if sys.platform == "win32":
        exts = (".exe",)
    elif sys.platform.startswith("linux"):
        exts = (".appimage",)
    else:
        exts = (".dmg",)
    for a in assets:
        if str(a.get("name", "")).lower().endswith(exts):
            return a
    return None



def _to_file_types(filters: list[dict]) -> tuple[str, ...]:
    """Converts Tauri-style filters to pywebview file_types, e.g.
    ``{name:'image', extensions:['png','jpg']}`` -> ``'image (*.png;*.jpg)'``."""
    out: list[str] = []
    for flt in filters:
        name = flt.get("name") or "files"
        exts = flt.get("extensions") or []
        if not exts:
            continue
        mask = ";".join(f"*.{e}" for e in exts)
        out.append(f"{name} ({mask})")
    return tuple(out)


def _open_in_os(path: str) -> None:
    if not path:
        return
    try:
        if sys.platform == "win32":
            os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass


def _reveal_in_os(path: str) -> None:
    if not path:
        return
    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", f"/select,{path}"])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", path])
        else:
            parent = str(Path(path).parent)
            subprocess.Popen(["xdg-open", parent])
    except Exception:
        pass
