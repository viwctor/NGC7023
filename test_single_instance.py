"""Single-instance guard: the second launch defers to the first and asks it to
show its window (the fix for the duplicate tray icon)."""

import threading
import time

from ngc7023.single_instance import SingleInstance


def test_first_instance_is_primary_and_second_defers():
    activated = []
    first = SingleInstance()
    assert first.acquire() is True
    first.on_activate = lambda: activated.append(True)
    try:
        second = SingleInstance()
        # A real second instance must NOT keep running...
        assert second.acquire() is False
        # ...and it must have told the first one to show itself.
        for _ in range(100):
            if activated:
                break
            time.sleep(0.02)
        assert activated == [True]
        assert second._sock is None  # the deferring instance never bound
    finally:
        if first._sock is not None:
            first._sock.close()


def test_relaunch_waits_then_takes_over_when_port_frees():
    first = SingleInstance()
    assert first.acquire() is True
    # Simulate the old instance quitting shortly after the relaunch starts waiting.
    threading.Timer(0.3, lambda: first._sock and first._sock.close()).start()
    relaunch = SingleInstance()
    try:
        # wait=True: doesn't defer; retries the bind until the port frees, then
        # takes over (so a restart never leaves zero instances running).
        assert relaunch.acquire(wait=True) is True
        assert relaunch._sock is not None  # it actually bound (took over the port)
    finally:
        if relaunch._sock is not None:
            relaunch._sock.close()
