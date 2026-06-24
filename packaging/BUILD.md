# Building NGC7023 (Windows + Linux)

Two targets share one PyInstaller spec (`ngc7023.spec`, which branches on
`sys.platform`): **Windows** → a per-user Inno Setup installer; **Linux** → a
self-contained AppImage. macOS is deferred.

## Windows

The Windows build turns the Python app into a standalone, no-Python-required
installer: **PyInstaller** freezes the app into `dist\ngc7023\` (a folder with
`ngc7023.exe` + an `_internal\` payload), then **Inno Setup** wraps that folder —
plus the ffmpeg/yt-dlp sidecars — into `NGC7023-Setup-<version>.exe`.

The installer is **per-user** (installs to `%LOCALAPPDATA%\Programs\NGC7023`, no
admin / UAC), which matches the app's per-user "start with Windows" autostart.

## One-time setup

- **Python deps** (in the venv): `pip install -e ".[dev]"` (includes PyInstaller).
- **Node** for the frontend.
- **Inno Setup 6** for the installer step: `winget install JRSoftware.InnoSetup`.
- **Sidecars**: put `ffmpeg.exe` and `yt-dlp.exe` in `.\binaries\` (not in git —
  bundled into the installer, not the repo). `ffprobe.exe` is optional (unused —
  durations are probed via `ffmpeg -i`); it's bundled too if present.

## Build

From the repo root:

```powershell
.\packaging\build-windows.ps1
```

That script: closes any running instance (so the rebuild isn't blocked), builds
the frontend, runs PyInstaller, checks the sidecars are present, and — if Inno
Setup is installed — compiles the installer to `dist\installer\`.

### Manual steps (what the script does)

```powershell
# 1. frontend  ->  ngc7023\web
cd frontend; npm run build; cd ..

# 2. exe  ->  dist\ngc7023\
.\.venv\Scripts\pyinstaller ngc7023.spec --noconfirm

# 3. installer  ->  dist\installer\NGC7023-Setup-0.1.0.exe
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\ngc7023.iss
```

## Debugging the frozen app

The release exe is windowed (no console), so startup errors are invisible. To get
a console build that prints tracebacks:

```powershell
$env:NGC_BUILD_CONSOLE = "1"
.\.venv\Scripts\pyinstaller ngc7023.spec --noconfirm
$env:NGC_BUILD_CONSOLE = ""
.\dist\ngc7023\ngc7023.exe          # run it; watch the console
```

Notes / gotchas:

- **"file in use" on rebuild** — a previous run leaves `ngc7023.exe` and its
  `msedgewebview2.exe` children holding `dist\ngc7023`. Close them first
  (`Get-Process ngc7023, msedgewebview2 | Stop-Process -Force`); the build
  script already does this.
- **WebView2 runtime** — the Evergreen runtime ships with Windows 10/11. We bundle
  only pywebview's managed loader DLLs, not the runtime itself.
- **Version bump** — update `__version__` in `ngc7023\__init__.py` *and*
  `MyAppVersion` in `packaging\ngc7023.iss` (they should match the release tag).
- **What's bundled where** — PyInstaller bundles the app + `web\` + Python/.NET
  libs (~50 MB). ffmpeg + yt-dlp (~90 MB) are added by Inno Setup from
  `.\binaries`, landing at `<app>\binaries` where `bin.resolve()` finds them.
  The finished installer is ~63 MB.

## Linux (AppImage)

`packaging/build-linux.sh` freezes the app with PyInstaller and packs it into a
**fully self-contained** `dist/NGC7023-x86_64.AppImage` (~170 MB) — bundled
Python, GTK3 + WebKit2GTK, ffmpeg, and yt-dlp. It needs **no system webkit** at
runtime (verified by hiding the host's webkit and confirming the app still
renders from its own copy).

### One-time setup

Build on the **oldest** distro you intend to support (glibc is forward- but not
backward-compatible). On Ubuntu/Debian:

```bash
sudo apt install -y \
  build-essential python3-dev python3-venv python3-pip patchelf \
  gir1.2-gtk-3.0 gir1.2-webkit2-4.1 libwebkit2gtk-4.1-0 \
  python3-gi python3-gi-cairo libfuse2t64 wget
python3 -m venv --system-site-packages .venv   # --system-site-packages: see below
.venv/bin/pip install -e ".[dev]"
```

- **`--system-site-packages`** lets the venv see the distro's PyGObject (`gi`) +
  the GTK/WebKit typelibs, which is what the spec collects. pip then layers the
  pure-Python deps on top.
- **Sidecars**: put a Linux `ffmpeg` and `yt-dlp` (plain names, executable) in
  `./binaries/`. Grab a static ffmpeg (e.g. johnvansickle.com) and the
  `yt-dlp_linux` standalone binary.

### Build

```bash
SIDECAR_DIR=./binaries ./packaging/build-linux.sh
```

Env knobs: `VENV=` (default `./.venv`), `SIDECAR_DIR=` (default `./binaries`),
`NGC_SKIP_FRONTEND=1`, `NGC_SKIP_PYINSTALLER=1` (reuse prior stages while
iterating on packaging). The script fetches `appimagetool` into `dist/` and runs
it with `--appimage-extract-and-run` (no FUSE needed to *build*).

### The WebKitGTK helper-path patch (the hard part)

Modern WebKitGTK (2.44+) **removed `WEBKIT_EXEC_PATH`** and resolves its helper
executables (`WebKitWebProcess`, `WebKitNetworkProcess`) + injected bundle from a
path **compiled absolutely into `libwebkit2gtk`** (e.g.
`/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1`). A frozen build can't override it, so
without help the bundled helpers are ignored and the app needs the host's webkit.

Fix, in two pieces:

1. **Build-time** — `packaging/patch-webkit-libexec.py` byte-rewrites that path
   inside the bundled `libwebkit2gtk-4.1.so.0` to a fixed `/tmp/ngc7023-webkit`
   (null-padded, length-preserving, so no ELF offsets shift). Only the two
   `…/webkit2gtk-4.1` strings under `/usr/lib` are touched.
2. **Runtime** — `packaging/pyinstaller-hooks/rthook-webkit.py` symlinks
   `/tmp/ngc7023-webkit` → the bundle's `_internal/webkit2gtk-4.1` before
   pywebview starts, so webkit spawns the bundled helpers. It also disables the
   DMABUF renderer (which blanks/crashes on many GPUs/VMs/WSL).

The webkit helper executables themselves are copied into the bundle by the spec
and RPATH-patched (`$ORIGIN/..`) by the build script so they find
`libwebkit2gtk` in `_internal/`.

> Caveat: `/tmp/ngc7023-webkit` is a fixed path, so on a *shared multi-user*
> machine two simultaneous users race over the symlink (benign — both bundles
> are identical). Fine for the single-user desktop case.

### Debugging the frozen app

`NGC_BUILD_CONSOLE=1 .venv/bin/pyinstaller ngc7023.spec --noconfirm` then run
`./dist/ngc7023/ngc7023` from a terminal to see tracebacks / GTK warnings.

> Built + tested under **WSL2 (Ubuntu 24.04 + WSLg)** from a Windows host — WSLg
> provides the X/Wayland display, so the app window actually renders for testing.
> The Linux AppImage build is **TODO → done**; an AppImage equivalent of
> `build-windows.ps1`'s automation lives in `build-linux.sh`.
