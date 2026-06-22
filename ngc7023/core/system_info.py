"""Read-only host introspection for the Settings screen (OS, CPU, RAM, GPU).

Ported from the old Tauri `core/system_info.rs`. OS/CPU/RAM come from stdlib +
``psutil``; GPU names are pulled per-OS since there is no portable, dependency-
light way to enumerate adapters by name. Every query is best-effort: failures
yield empty/"unknown" rather than raising.
"""

from __future__ import annotations

import platform
import sys
from dataclasses import dataclass, field

from .proc import run_capture

try:
    import psutil
except ImportError:  # keep import-safe even if the dep is missing
    psutil = None  # type: ignore[assignment]


@dataclass
class SystemInfo:
    os: str = ""
    os_version: str = ""
    cpu: str = "unknown"
    cpu_threads: int = 0
    total_memory_gb: float = 0.0
    gpus: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """camelCase payload for the JS bridge (mirrors the TS SystemInfo)."""
        return {
            "os": self.os,
            "osVersion": self.os_version,
            "cpu": self.cpu,
            "cpuThreads": self.cpu_threads,
            "totalMemoryGb": self.total_memory_gb,
            "gpus": self.gpus,
        }


def detect() -> SystemInfo:
    info = SystemInfo()
    info.os = platform.system() or sys.platform
    info.os_version = platform.platform() or platform.version()
    info.cpu = _cpu_name()
    info.cpu_threads = _cpu_threads()
    info.total_memory_gb = _total_memory_gb()
    info.gpus = detect_gpus()
    return info


def _cpu_name() -> str:
    # On Windows, platform.processor() returns a cryptic family string
    # ("AMD64 Family 25 Model 33 ..."), so prefer the marketing name from WMI
    # ("AMD Ryzen 5 5600X 6-Core Processor").
    if sys.platform == "win32":
        out = run_capture(
            "powershell",
            ["-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
        )
        if out:
            for line in out.splitlines():
                if line.strip():
                    return line.strip()

    name = (platform.processor() or "").strip()
    if name:
        return name

    # platform.processor() is often empty on Linux; read the model name.
    if sys.platform.startswith("linux"):
        try:
            with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if line.lower().startswith("model name"):
                        return line.split(":", 1)[1].strip()
        except OSError:
            pass

    return "unknown"


def _cpu_threads() -> int:
    if psutil is not None:
        count = psutil.cpu_count(logical=True)
        if count:
            return int(count)
    import os

    return os.cpu_count() or 0


def _total_memory_gb() -> float:
    if psutil is not None:
        gb = psutil.virtual_memory().total / (1024**3)
        return round(gb * 10.0) / 10.0
    return 0.0


def detect_gpus() -> list[str]:
    """Best-effort GPU name list. Empty if the per-OS query fails."""
    if sys.platform == "win32":
        out = run_capture(
            "powershell",
            [
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | "
                "Select-Object -ExpandProperty Name",
            ],
        )
    elif sys.platform.startswith("linux"):
        out = run_capture(
            "sh",
            ["-c", "lspci | grep -iE 'vga|3d|display' | sed 's/.*: //'"],
        )
    elif sys.platform == "darwin":
        out = run_capture(
            "sh",
            [
                "-c",
                "system_profiler SPDisplaysDataType | "
                "grep -i 'Chipset Model' | sed 's/.*: //'",
            ],
        )
    else:
        out = None

    if not out:
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]
