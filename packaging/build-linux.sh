#!/usr/bin/env bash
# Build the NGC7023 Linux AppImage (one-dir PyInstaller -> AppDir -> AppImage).
#
# Run from anywhere; paths are derived from this script's location. Needs a
# project venv with the deps + pyinstaller, the system GTK3/WebKit2 build
# packages (see packaging/BUILD.md), and the ffmpeg/yt-dlp Linux sidecars.
#
# Env overrides:
#   VENV=...            python venv dir            (default <repo>/.venv)
#   SIDECAR_DIR=...     dir with ffmpeg + yt-dlp   (default <repo>/binaries)
#   NGC_SKIP_FRONTEND=1 reuse an existing ngc7023/web build
#   NGC_SKIP_PYINSTALLER=1  reuse an existing dist/ngc7023
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"   # packaging/
ROOT="$(cd "$HERE/.." && pwd)"          # repo root
cd "$ROOT"

VENV="${VENV:-$ROOT/.venv}"
PY="$VENV/bin/python"
PYINSTALLER="$VENV/bin/pyinstaller"
SIDECAR_DIR="${SIDECAR_DIR:-$ROOT/binaries}"
ARCH="${ARCH:-x86_64}"
DIST="$ROOT/dist/ngc7023"
APPDIR="$ROOT/dist/AppDir"
APPIMAGE="$ROOT/dist/NGC7023-${ARCH}.AppImage"

echo "==> NGC7023 Linux build (arch=$ARCH)"

# 1. Frontend (static output -> ngc7023/web). Reusable across platforms.
if [ "${NGC_SKIP_FRONTEND:-0}" != "1" ]; then
  echo "==> Building frontend"
  (cd frontend && npm install && npm run build)
fi

# 2. Freeze with PyInstaller (one-dir).
if [ "${NGC_SKIP_PYINSTALLER:-0}" != "1" ]; then
  echo "==> Running PyInstaller"
  rm -rf build "$DIST"
  "$PYINSTALLER" ngc7023.spec --noconfirm --clean
fi
[ -x "$DIST/ngc7023" ] || { echo "ERROR: $DIST/ngc7023 not found"; exit 1; }

# 2b. Make the bundled WebKitGTK self-contained: rewrite its hardcoded,
# no-longer-overridable helper-process path to the fixed /tmp/ngc7023-webkit
# (rthook-webkit.py symlinks that to the bundled helpers at startup).
WKLIB="$DIST/_internal/libwebkit2gtk-4.1.so.0"
if [ -f "$WKLIB" ]; then
  echo "==> Patching WebKitGTK libexec path"
  "$PY" "$HERE/patch-webkit-libexec.py" "$WKLIB"
fi

# 3. Assemble the AppDir.
echo "==> Assembling AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/applications" \
         "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp -a "$DIST/." "$APPDIR/usr/bin/"

# The webkit helper executables were copied in raw; point their RPATH at
# _internal/ so they find libwebkit2gtk there (no LD_LIBRARY_PATH footgun).
for h in WebKitWebProcess WebKitNetworkProcess WebKitGPUProcess; do
  f="$APPDIR/usr/bin/_internal/webkit2gtk-4.1/$h"
  if [ -f "$f" ]; then patchelf --set-rpath '$ORIGIN/..' "$f"; fi
done

# ffmpeg + yt-dlp sit next to the exe, where bin.bundled() looks first.
for s in ffmpeg yt-dlp; do
  if [ -f "$SIDECAR_DIR/$s" ]; then
    install -m 0755 "$SIDECAR_DIR/$s" "$APPDIR/usr/bin/$s"
  else
    echo "WARNING: sidecar '$s' not found in $SIDECAR_DIR (app will fall back to PATH)"
  fi
done

# Icon (from the built branding asset) at the three places AppImage wants it.
"$PY" - "$ROOT/ngc7023/web/branding/icon.png" "$APPDIR" <<'PY'
import sys
from PIL import Image
src, appdir = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA").resize((256, 256), Image.LANCZOS)
img.save(f"{appdir}/ngc7023.png")
img.save(f"{appdir}/usr/share/icons/hicolor/256x256/apps/ngc7023.png")
img.save(f"{appdir}/.DirIcon", "PNG")  # no extension -> tell PIL the format
PY

cp "$HERE/linux/ngc7023.desktop" "$APPDIR/ngc7023.desktop"
cp "$HERE/linux/ngc7023.desktop" "$APPDIR/usr/share/applications/ngc7023.desktop"
cp "$HERE/linux/AppRun" "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"

# 4. Pack with appimagetool (cached in dist/).
TOOL="$ROOT/dist/appimagetool-${ARCH}.AppImage"
if [ ! -f "$TOOL" ]; then
  echo "==> Fetching appimagetool"
  wget -q -O "$TOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
  chmod +x "$TOOL"
fi

echo "==> Packing AppImage"
rm -f "$APPIMAGE"
ARCH="$ARCH" "$TOOL" --appimage-extract-and-run "$APPDIR" "$APPIMAGE"

echo "==> Done: $APPIMAGE"
ls -lh "$APPIMAGE"
