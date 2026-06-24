# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for NGC7023 (one-dir build, Windows + Linux).

Build:
    Windows:  .venv\\Scripts\\pyinstaller ngc7023.spec --noconfirm
    Linux:    .venv/bin/pyinstaller ngc7023.spec --noconfirm

Produces ``dist/ngc7023/ngc7023[.exe]`` plus an ``_internal/`` folder. For a
debug build with a console (so startup tracebacks are visible), set
``NGC_BUILD_CONSOLE=1`` before running.

The ffmpeg / ffprobe / yt-dlp sidecars are deliberately NOT bundled here — the
platform installer drops them next to the exe (Windows: Inno Setup; Linux: the
AppImage AppRun), where ``bin.resolve()`` finds them, so the PyInstaller build
stays small and quick to rebuild.
"""

import os
import sys

from PyInstaller.utils.hooks import collect_all

IS_WIN = sys.platform == "win32"

# Built frontend (HTML/CSS/JS + branding/icon). resource_path() reads it from
# sys._MEIPASS at runtime, so it must land at the bundle root as "web/".
datas = [("ngc7023/web", "web")]
binaries = []
hiddenimports = []

if IS_WIN:
    # Windows: pywebview's EdgeChromium/WebView2 backend rides on pythonnet/clr.
    hiddenimports += ["clr"]
    collect_pkgs = ("webview", "clr_loader", "pythonnet", "pystray", "pypdfium2", "pypdfium2_raw")
else:
    # Linux: pywebview's GTK backend imports gi.repository.{Gtk,WebKit2,...}
    # *dynamically*, so PyInstaller's static graph never sees them. Gtk/Gdk/etc.
    # have built-in pre-safe-import hooks, so naming them as hidden imports is
    # enough; WebKit2/JavaScriptCore/Soup do NOT (they resolve to "not found"),
    # so pull their typelibs + libs directly with get_gi_typelibs — the
    # canonical workaround for GI namespaces PyInstaller doesn't know.
    import glob

    from PyInstaller.utils.hooks.gi import get_gi_typelibs

    hiddenimports += [
        "gi",
        "gi.repository.Gtk",
        "gi.repository.Gdk",
        "gi.repository.GLib",
        "gi.repository.Gio",
        "gi.repository.GObject",
    ]
    collect_pkgs = ("webview", "gi", "pystray", "pypdfium2", "pypdfium2_raw")

    for _ns, _ver in (
        ("WebKit2", "4.1"),
        ("JavaScriptCore", "4.1"),
        ("Soup", "3.0"),
        ("WebKit2WebExtension", "4.1"),
    ):
        _b, _d, _h = get_gi_typelibs(_ns, _ver)
        binaries += _b
        datas += _d
        hiddenimports += _h

    # WebKit2 launches separate helper executables + loads an injected bundle;
    # get_gi_typelibs pulls the libs but not these. Drop them under
    # "webkit2gtk-4.1/" — rthook-webkit.py sets WEBKIT_EXEC_PATH to find them.
    _libexec = next(iter(glob.glob("/usr/lib/*/webkit2gtk-4.1")), None)
    if _libexec:
        for _helper in ("WebKitWebProcess", "WebKitNetworkProcess", "WebKitGPUProcess"):
            _p = os.path.join(_libexec, _helper)
            if os.path.exists(_p):
                binaries.append((_p, "webkit2gtk-4.1"))
        _ib = os.path.join(_libexec, "injected-bundle", "libwebkit2gtkinjectedbundle.so")
        if os.path.exists(_ib):
            binaries.append((_ib, "webkit2gtk-4.1/injected-bundle"))
    # GIO TLS module so https works inside the web view.
    for _gio in glob.glob("/usr/lib/*/gio/modules/libgiognutls.so"):
        binaries.append((_gio, "gio_modules"))

# These backends ship submodules / data / native libs the automatic hooks don't
# fully cover — collect them explicitly.
for pkg in collect_pkgs:
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

console = os.environ.get("NGC_BUILD_CONSOLE") == "1"

# Linux needs a runtime hook that points WebKit at the bundled helper
# processes (WEBKIT_EXEC_PATH). Windows uses none.
runtime_hooks = [] if IS_WIN else ["packaging/pyinstaller-hooks/rthook-webkit.py"]

a = Analysis(
    ["packaging/entry.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=runtime_hooks,
    excludes=["tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe_kwargs = dict(
    name="ngc7023",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=console,
    disable_windowed_traceback=False,
)
if IS_WIN:
    exe_kwargs["icon"] = "packaging/ngc7023.ico"  # embedded only on Windows

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    **exe_kwargs,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="ngc7023",
)
