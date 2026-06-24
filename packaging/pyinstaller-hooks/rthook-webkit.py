"""Runtime hook (Linux): make the frozen build's bundled WebKitGTK self-contained.

Modern WebKitGTK (2.44+) dropped the WEBKIT_EXEC_PATH override and resolves its
helper executables (WebKitWebProcess / WebKitNetworkProcess) and injected bundle
from a path compiled *absolutely* into libwebkit2gtk. The Linux build byte-patches
that path (see packaging/patch-webkit-libexec.py) to a fixed location,
``/tmp/ngc7023-webkit``; here — before pywebview imports gi — we point that
location at the bundled helpers with a symlink, so webkit spawns OUR copies
instead of the host's (which may be a different version, or absent entirely).

Also disables the DMABUF renderer, which blanks or crashes the web view on many
setups (VMs, NVIDIA proprietary, older Mesa, WSLg); negligible cost for this UI.
"""
import os
import sys

# Keep in sync with WK_RUNTIME_PATH in packaging/patch-webkit-libexec.py.
_LINK = "/tmp/ngc7023-webkit"

_base = getattr(sys, "_MEIPASS", None)
if _base and sys.platform.startswith("linux"):
    os.environ.setdefault("WEBKIT_DISABLE_DMABUF_RENDERER", "1")

    _gio = os.path.join(_base, "gio_modules")
    if os.path.isdir(_gio):
        os.environ.setdefault("GIO_MODULE_DIR", _gio)

    # Point the patched libexec path at the bundled helpers. Best-effort: on a
    # shared /tmp a symlink owned by another user can't be replaced (sticky
    # bit) — then we leave it, since it points at an identical bundled copy.
    _wk = os.path.join(_base, "webkit2gtk-4.1")
    if os.path.isdir(_wk):
        try:
            if os.path.islink(_LINK):
                if os.readlink(_LINK) != _wk:
                    os.unlink(_LINK)
                    os.symlink(_wk, _LINK)
            elif not os.path.exists(_LINK):
                os.symlink(_wk, _LINK)
        except OSError:
            pass
