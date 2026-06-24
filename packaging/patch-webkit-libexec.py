#!/usr/bin/env python3
"""Byte-patch libwebkit2gtk's compiled-in libexec path (Linux build step).

Modern WebKitGTK hardcodes an absolute path to its helper executables +
injected bundle (e.g. ``/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1``) and offers
no env override, so a frozen/AppImage build can't redirect it to its bundled
copies. We rewrite that path in-place to a fixed runtime location
(``/tmp/ngc7023-webkit``) that rthook-webkit.py symlinks to the bundled
helpers. The replacement is null-padded to the original length, so nothing in
the ELF shifts.

Usage:  python patch-webkit-libexec.py <path-to-libwebkit2gtk-4.1.so.0>
Idempotent and safe to run on an already-patched lib (replaces 0 occurrences).
"""
import sys

# Keep _LINK in rthook-webkit.py in sync with this.
WK_RUNTIME_PATH = b"/tmp/ngc7023-webkit"

# The compiled-in paths to rewrite. The bare "/usr/lib/<triplet>" libdir also
# exists as its own string and must NOT be touched, so we only match the two
# webkit2gtk-4.1 path strings (and replace the longer one first, since the
# libexecdir string is a prefix of the injected-bundle one).
SUFFIX = b"/webkit2gtk-4.1"


def _padded(replacement: bytes, original_len: int) -> bytes:
    if len(replacement) > original_len:
        raise ValueError(f"replacement {replacement!r} longer than {original_len}")
    return replacement + b"\x00" * (original_len - len(replacement))


def patch(path: str) -> int:
    data = open(path, "rb").read()
    triplets = set()
    # Discover the multiarch libdir(s) actually present, so this isn't pinned
    # to x86_64 (works for arm64 etc. too).
    idx = 0
    needle = SUFFIX
    while True:
        i = data.find(needle, idx)
        if i == -1:
            break
        start = data.rfind(b"\x00", 0, i) + 1
        triplets.add(data[start:i])  # the "/usr/lib/<triplet>" part
        idx = i + 1

    replaced = 0
    for libdir in triplets:
        # The helper executables live under the *lib* dir; never touch a
        # data path like /usr/share/webkit2gtk-4.1.
        if not libdir.startswith(b"/usr/lib"):
            continue
        a_old = libdir + SUFFIX                       # .../webkit2gtk-4.1
        b_old = a_old + b"/injected-bundle/"          # .../webkit2gtk-4.1/injected-bundle/
        b_new = _padded(WK_RUNTIME_PATH + b"/injected-bundle/", len(b_old))
        a_new = _padded(WK_RUNTIME_PATH, len(a_old))
        n_b = data.count(b_old)
        data = data.replace(b_old, b_new)             # longer/more specific first
        n_a = data.count(a_old)
        data = data.replace(a_old, a_new)
        replaced += n_a + n_b
    if replaced:
        open(path, "wb").write(data)
    return replaced


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    n = patch(sys.argv[1])
    print(f"patch-webkit-libexec: rewrote {n} path string(s) in {sys.argv[1]}")
