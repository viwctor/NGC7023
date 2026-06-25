"""Single-instance guard.

The app can keep living in the system tray after its window is closed. Without
this, launching it again (a shortcut, or autostart) would start a *second*
process — and a second tray icon. Here the first instance binds a loopback
socket and listens; a later instance connects, tells the running one to show its
window, and exits. A short magic banner ensures we only ever defer to *our own*
app, never to an unrelated program that happens to hold the port.

``restart_app`` relaunches with ``--relaunch``: that instance must NOT defer (the
old one is about to quit), so it waits for the port to free up and takes over.
"""

from __future__ import annotations

import socket
import threading
import time
from typing import Callable, Optional

_HOST = "127.0.0.1"
_PORT = 49217  # fixed loopback port (private range)
_MAGIC = b"NGC7023"


class SingleInstance:
    def __init__(self) -> None:
        self._sock: Optional[socket.socket] = None
        # Called (on a daemon thread) when another instance asks us to show.
        self.on_activate: Callable[[], None] = lambda: None

    def acquire(self, wait: bool = False) -> bool:
        """Become the primary instance.

        Returns ``True`` if we should keep running (we hold the lock, or the port
        is held by something foreign so we run without dedup). Returns ``False``
        if another NGC7023 instance is already running — it has been told to show
        its window and the caller should exit.

        ``wait=True`` (a ``--relaunch``) skips the defer check and instead waits
        for the previous instance to release the port, so a restart hands off
        cleanly without leaving zero instances.
        """
        if not wait and _tell_existing_to_show():
            return False
        deadline = time.monotonic() + (5.0 if wait else 0.0)
        while True:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.bind((_HOST, _PORT))
                s.listen(1)
            except OSError:
                s.close()
                if time.monotonic() >= deadline:
                    return True  # foreign/stale holder → run anyway, no dedup
                time.sleep(0.15)
                continue
            self._sock = s
            threading.Thread(target=self._serve, daemon=True).start()
            return True

    def _serve(self) -> None:
        sock = self._sock
        if sock is None:
            return
        while True:
            try:
                conn, _ = sock.accept()
            except OSError:
                return  # socket closed → shutting down
            with conn:
                try:
                    conn.sendall(_MAGIC + b"\n")
                    conn.settimeout(2.0)
                    data = conn.recv(32)
                except OSError:
                    data = b""
            if b"show" in data:
                try:
                    self.on_activate()
                except Exception:
                    pass


def _tell_existing_to_show() -> bool:
    """If our app is already listening, send it ``show`` and return ``True``.
    ``False`` if nothing (or something foreign) is on the port."""
    try:
        with socket.create_connection((_HOST, _PORT), timeout=1.0) as c:
            c.settimeout(1.0)
            if c.recv(16).strip() != _MAGIC:
                return False  # not our app — don't defer to it
            c.sendall(b"show\n")
            return True
    except OSError:
        return False
