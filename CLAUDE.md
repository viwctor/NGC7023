# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NGC7023 is a local-first desktop app with two tools plus a PDF editor:

1. **Downloader** — paste/drop a link (YouTube, X/Twitter, Facebook, Instagram, TikTok, Reddit, …) → download/convert via `yt-dlp` + FFmpeg.
2. **File converter** — media (mp4/mkv/mp3/opus/gif…) via FFmpeg, image→PDF and PDF page tools, video editing (trim/crop/speed/fps/scale), subtitles (planned).

All processing runs **on the end user's machine** — no backend, no hosted compute. The app orchestrates bundled command-line binaries; it does not reimplement codecs.

This is a **Python rewrite of an earlier Tauri/Rust app**. The original still lives at `C:\Users\Usuario\Documents\NGC7023` and is the reference when porting more features — the Rust `core/*.rs` map 1:1 to `ngc7023/core/*.py`. v1 targets **Windows + Linux**; macOS is deferred.

Stack: **Python + pywebview** (native webview shell) on the backend, **React 19 / TypeScript / Vite** on the frontend (reused almost verbatim from the Tauri app).

## Commands

Python is run through the project venv (`.venv`). On Windows the interpreter is `.\.venv\Scripts\python.exe`; substitute `.venv/bin/python` on Linux.

```bash
# Frontend (run inside ./frontend) — outputs straight into ../ngc7023/web
npm install
npm run build        # tsc (strict) + vite build -> ngc7023/web  (REQUIRED before running the app)
npm run dev          # browser-only dev; the pywebview bridge is absent there

# Python (run from the repo root, with the venv active)
python -m ngc7023            # launch the desktop app (loads ngc7023/web/index.html)
python -m pytest -q          # run all unit tests
python -m pytest -q tests/test_ffmpeg.py          # one file
python -m pytest -q -k atempo                      # one test by name
```

The app **will not start unless `ngc7023/web/index.html` exists** — build the frontend first. Env vars: `NGC_DEBUG=1` opens webview devtools; `NGC_DEV_URL=http://localhost:7023` loads a live Vite dev server instead of the built files.

`tests/test_engine_integration.py` spawns real ffmpeg and **auto-skips** if no ffmpeg binary resolves; everything else is pure and runs anywhere.

### Sidecar binaries

`ffmpeg`/`yt-dlp` are not in git (`ffprobe` is unused — durations come from `ffmpeg -i`). For dev, drop them (plain names, `.exe` on Windows) into `<repo>/binaries/` — `ngc7023/bin.resolve()` checks a managed override first, then `bin.bundled()` (next to the exe / `binaries/`), before falling back to PATH. **yt-dlp self-updates** (`ngc7023/jobs/updater.py`, ported from `updater.rs`): on startup it seeds a writable copy in `bin.data_dir()` (`%LOCALAPPDATA%\ngc7023`), registers it via `bin.set_managed`, and runs a throttled (12 h) `yt-dlp -U` on a background thread — `bin.resolve()` then returns the updated copy.

**Persistence gotcha**: pywebview defaults to `private_mode=True` (ephemeral storage), which wipes the app's `localStorage` (language, theme, prefs, the first-run flag) every launch. `main.py` MUST pass `webview.start(private_mode=False, storage_path=bin.data_dir()/"webview")` so settings survive restarts.

## Architecture — the layering rule

The single most important convention, carried over from the Tauri version: **the UI never builds a command string.** It fills a typed options object; a pure builder in `ngc7023/core/` turns that into the exact `argv` for ffmpeg/yt-dlp. This keeps the "no typing" promise and isolates portable logic from platform glue.

Layers, outer → inner:

- **Frontend** (`frontend/src/`) — React. The whole app is one terminal screen: `App.tsx` is the controller; `features/terminal/Terminal.tsx` renders the scrollback + prompt + numbered wizard + free-text `ask`; `lib/studio.tsx` holds the pre-config state; `lib/i18n.tsx` is the pt/en/es dictionary (**all user-facing text is lowercase**); `lib/useJobs.ts` owns the queue + concurrency cap. Format lists live in `lib/formats.ts`.
- **Bridge** (`ngc7023/api.py`) — the thin object exposed to the webview as `window.pywebview.api.*`. The Python equivalent of the old `commands.rs`: no logic, delegates to `core`/`jobs`. Every method takes a single `params` dict.
- **Core** (`ngc7023/core/`) — pure, unit-tested, no side effects: `ffmpeg.py` (`MediaJob.build_args`), `ytdlp.py` (`DownloadJob.build_args`), `capability.py` (probes ffmpeg `-encoders` for hw families), `system_info.py` (psutil + per-OS GPU), `proc.py` (subprocess helper that hides the console window on Windows).
- **Job engine** (`ngc7023/jobs/`) — has side effects, lives outside `core`: `engine.py` spawns one process per job on a thread, streams progress, supports cancel; `progress.py` is the pure progress-line parser (ffmpeg `-progress`, yt-dlp stdout).

Data flow for a conversion: React fills a `MediaJob` → `api.previewFfmpegArgs(job)` (or `runMediaJob`) → `window.pywebview.api.*` → `Api` → `MediaJob.build_args()` → (for run) `JobEngine`.

## The Tauri-compat shim layer (do not edit components to change platform behavior)

The React frontend was copied from the Tauri app **unchanged** — its components still `import` from `@tauri-apps/*`. Those specifiers are redirected to thin pywebview-backed shims in `frontend/src/shims/tauri/` via **Vite `resolve.alias` + tsconfig `paths`** (both must stay in sync). So:

- To change how the UI talks to the OS (RPC, window controls, dialogs, file open, events, drag-drop), edit the **shims**, not the components. `_bridge.ts` is the core: it resolves `window.pywebview` readiness, does the RPC `call()`, runs a Python→JS event bus (`window.__ngc.emit`, used for `job:progress`/`job:done`), and maps `data-tauri-drag-region` → pywebview's `.pywebview-drag-region` class.
- New Python `Api` method → add a shim/wrapper in `frontend/src/lib/api.ts` (or the relevant shim) and a matching method on `Api`.

## Conventions that bite if missed

- **camelCase boundary**: JS sends camelCase dicts; each core dataclass has a `from_dict()` mapping them (`scaleHeight`→`scale_height`, `hwAccel` string→`HwAccel`). Event payloads (`job:progress`/`job:done`) are already JS-shaped. Keep `frontend/src/lib/api.ts` types in sync with the dataclasses.
- **Hardware encoders are per-OS**: AMD = `*_amf` (Win) / `*_vaapi` (Linux); NVIDIA = `*_nvenc`; Intel = `*_qsv`; Apple = `*_videotoolbox`. Never hardcode an encoder — derive it from the detected family + base codec via `HwAccel.encoder_for(base)`. `-c:v h264/hevc/av1` are valid encoder selectors (ffmpeg maps them to the default encoder), so the base codec is passed as-is for software encoding.
- **HW encoders need explicit rate control** (`_quality_args`): they REJECT `-crf` and, left unconstrained, default to an enormous bitrate (a 250 MB clip ballooned to 6+ GB). Map the CRF to each vendor's constant-quantizer: AMF `-rc cqp -qp_i/-qp_p/-qp_b`, NVENC `-rc constqp -qp`, QSV `-global_quality`, VAAPI `-rc_mode CQP -qp`. Software keeps `-crf` (+ vp9 `-b:v 0`). Subtitle burn-in re-encodes too, so it uses the same `_quality_args` (default CRF 23).
- **GIF output** uses a single-pass `palettegen`/`paletteuse` (`_gif_filter_complex`: editing filters → `split` → palettegen → paletteuse), giving far better color/dither than ffmpeg's default quantizer with no temp palette file. It's a `-filter_complex` (no `-vf`/`-c:v`; auto stream-select off → explicit `-map "[v]"`), `-an`. **Still-image** output carries no codec/CRF/audio (forcing `-c:v` breaks the mux). HEVC in mp4/mov gets the `hvc1` tag.
- **pywebview drag-drop** only attaches real file paths when a drop handler is registered on its **Python-side DOM pipeline** (`main.py _setup_dnd`), which forwards paths to the frontend over the bus as `ngc:drop`. A pure-JS `drop` listener never sees the paths.
- **Terminal `ask` vs `wizard`**: the Terminal renders the numbered `wizard` OR the free-text `ask` (wizard wins). Before opening an `ask`, call `setWizard(null)` or the prompt won't show.
- **Conversion UX**: plain drag/attach → quick flow (output method → format → convert). A slash command `/<format>` (e.g. `/gif`) then dropping a file → the **detailed** wizard (resolution/fps/crop/trim/speed). The detailed values go through `buildMediaJob(input, format, tools)` with an explicit tools object, not the menu's `s.tools`.
- **PDF is not FFmpeg**: PDF ops are routed separately (not ffmpeg args) and live in `ngc7023/jobs/pdf_ops.py` (side-effecting, outside `core`): image(s)→PDF via **Pillow** (page sized to the image at 72 dpi), merge / extract / delete pages via **pypdf**, PDF→images via **pypdfium2** (bundles its own pdfium binary — no external renderer ships). They raise `PdfError` with a user-facing message; `JobEngine._spawn_pdf` runs them on a thread and emits `job:done`. OCR is still a later add (PyMuPDF/tesseract).
- **Cover→video** (`/video`, the still-image + audio "music upload" tool) is `ngc7023/core/cover.py` (`CoverVideoJob.build_args`, a pure builder like `MediaJob`): loops the image, `-tune stillimage`, `-shortest`; blurred background uses `-filter_complex` (which disables auto stream-select, so it adds explicit `-map`s); `copy_audio` passthrough unless `normalize_audio` (loudnorm) forces an AAC re-encode. Run via `JobEngine.start_cover_job` (progress measured against the audio length).

## Build / packaging notes

Frontend build output (`ngc7023/web/`) and `binaries/` are gitignored and bundled as data for distribution. The installer weight is dominated by ffmpeg, not Python.

**Windows** (implemented — see `packaging/` + `packaging/BUILD.md`): PyInstaller (one-dir) → Inno Setup. `ngc7023.spec` freezes `packaging/entry.py` (an absolute-import shim — the package's `__main__.py` relative import can't be a PyInstaller entry point) into `dist/ngc7023/` (~50 MB: app + `web/` + Python/.NET libs). `collect_all` covers pywebview/pythonnet(clr)/clr_loader/pystray/pypdfium2(_raw); the WebView2 *runtime* is a system component on Win10/11 (only the managed loader DLLs are bundled). The ffmpeg/ffprobe/yt-dlp sidecars are NOT in the PyInstaller bundle — Inno (`packaging/ngc7023.iss`) copies `binaries/` to `<app>/binaries`, where `bin.resolve()` finds them (frozen `app_dir()` = exe folder). Per-user install (`%LOCALAPPDATA%\Programs`, no UAC), matching the HKCU autostart. Build all-in-one: `packaging/build-windows.ps1`. **Resource paths must use `bin.resource_path()`** (reads `sys._MEIPASS` when frozen), never `__file__`, for `web/`+icon. Debug build: `NGC_BUILD_CONSOLE=1` → console exe that prints tracebacks. Builds fine on the dev Python 3.14 (PyInstaller 6.21). After running the frozen exe, kill `ngc7023.exe`+`msedgewebview2.exe` before rebuilding (they lock `dist/`).

**Linux** (implemented — `packaging/build-linux.sh` → self-contained `dist/NGC7023-x86_64.AppImage`, ~170 MB): same `ngc7023.spec` (branches on `sys.platform`) → PyInstaller one-dir → AppDir → `appimagetool`. The spec collects `gi` + calls `get_gi_typelibs` for WebKit2/JavaScriptCore/Soup/WebKit2WebExtension (no built-in PyInstaller hook covers those — naming them as hidden imports just yields "not found"), and bundles the webkit helper executables (`WebKitWebProcess`/`WebKitNetworkProcess`/`WebKitGPUProcess`) + injected bundle + the GIO gnutls module. Sidecars (Linux `ffmpeg`/`yt-dlp`, plain names) go in `binaries/`, copied next to the exe where `bin.bundled()` finds them. **The hard part — fully self-contained webkit**: modern WebKitGTK (2.44+) dropped `WEBKIT_EXEC_PATH` and resolves its helper processes from a path *compiled absolutely* into `libwebkit2gtk`; `packaging/patch-webkit-libexec.py` byte-rewrites that path (null-padded, length-preserving) to a fixed `/tmp/ngc7023-webkit`, and `packaging/pyinstaller-hooks/rthook-webkit.py` symlinks that → the bundle's `_internal/webkit2gtk-4.1` at startup (also sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` for GPU/VM robustness). Verified self-contained by hiding the host's webkit and confirming the app still renders. Built + tested under **WSL2 Ubuntu 24.04 + WSLg** (build everything as root in the WSL-native fs; `/proc/<pid>/exe` of the spawned `WebKit*Process` confirms bundled vs system). See `packaging/BUILD.md`.
