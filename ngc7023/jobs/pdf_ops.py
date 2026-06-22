"""PDF / image-to-PDF operations (the side-effecting half of the PDF tool).

Ported from the old Tauri ``jobs/run.rs`` PDF paths, but using Python libraries
instead of hand-writing PDF bytes:

- image(s) -> PDF via Pillow (pages sized to the image at 72 dpi),
- merge / page-edit via :mod:`pypdf`,
- PDF -> images via :mod:`pypdfium2` (which bundles its own ``pdfium`` binary, so
  no external renderer needs to ship — this mirrors the Rust version's pdfium).

These do real IO, so — like the rest of :mod:`ngc7023.jobs` — they live outside
``core``. Each raises ``PdfError`` with a user-facing message on failure; the job
engine turns that into a clean ``job:done`` error line.
"""

from __future__ import annotations

import os
from typing import Callable, Sequence


class PdfError(Exception):
    """A PDF operation failed; the message is shown to the user verbatim."""


# Progress callback: receives a 0..100 percentage. Defaults to a no-op.
Progress = Callable[[float], None]


def _noop(_percent: float) -> None:
    pass


def _load_rgb(path: str):
    """Opens an image and flattens it to RGB (PDF has no alpha channel)."""
    from PIL import Image

    img = Image.open(path)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")
    return img


def image_to_pdf(input_path: str, output: str) -> None:
    """One image -> a single-page PDF sized to the image."""
    images_to_pdf([input_path], output)


def images_to_pdf(inputs: Sequence[str], output: str, progress: Progress = _noop) -> None:
    """Several images -> one PDF, one page per image (in order)."""
    if not inputs:
        raise PdfError("no images given")
    try:
        first = _load_rgb(inputs[0])
        rest = []
        for i, path in enumerate(inputs[1:], start=1):
            rest.append(_load_rgb(path))
            progress((i / len(inputs)) * 100.0)
        # 72 dpi => 1 PDF point per pixel, so the page matches the image size.
        first.save(output, "PDF", resolution=72.0, save_all=True, append_images=rest)
        progress(100.0)
    except PdfError:
        raise
    except FileNotFoundError as e:
        raise PdfError(f"image not found: {e}") from e
    except OSError as e:
        raise PdfError(f"could not read image: {e}") from e


def merge_pdfs(inputs: Sequence[str], output: str) -> None:
    """Concatenate several PDFs into one (in the given order)."""
    if not inputs:
        raise PdfError("no PDFs given")
    from pypdf import PdfWriter

    writer = PdfWriter()
    try:
        for path in inputs:
            writer.append(path)
        with open(output, "wb") as fh:
            writer.write(fh)
    except FileNotFoundError as e:
        raise PdfError(f"PDF not found: {e}") from e
    except Exception as e:  # pypdf raises various read/parse errors
        raise PdfError(f"merge failed: {e}") from e
    finally:
        writer.close()


def edit_pdf_pages(input_path: str, output: str, pages: Sequence[int], keep: bool) -> None:
    """Extract (``keep=True``: keep only ``pages``) or delete (``keep=False``)
    the given 1-based page numbers, writing the rest to ``output``."""
    from pypdf import PdfReader, PdfWriter

    try:
        reader = PdfReader(input_path)
    except FileNotFoundError as e:
        raise PdfError(f"PDF not found: {e}") from e
    except Exception as e:
        raise PdfError(f"could not read PDF: {e}") from e

    total = len(reader.pages)
    if total == 0:
        raise PdfError("empty pdf")

    wanted = {p for p in pages if 1 <= p <= total}
    if keep:
        selected = [n for n in range(1, total + 1) if n in wanted]
    else:
        selected = [n for n in range(1, total + 1) if n not in wanted]

    if not selected:
        raise PdfError("that would remove every page")

    writer = PdfWriter()
    try:
        for n in selected:
            writer.add_page(reader.pages[n - 1])
        with open(output, "wb") as fh:
            writer.write(fh)
    except Exception as e:
        raise PdfError(f"page edit failed: {e}") from e
    finally:
        writer.close()


def pdf_to_images(
    input_path: str, stem: str, image_format: str, progress: Progress = _noop
) -> list[str]:
    """Render each PDF page to ``{stem}-{n}.{image_format}``; returns the paths.

    ~200 dpi (72pt * 2.78) keeps pages sharp with little size penalty — the same
    factor the Rust version used.
    """
    import pypdfium2 as pdfium

    try:
        doc = pdfium.PdfDocument(input_path)
    except FileNotFoundError as e:
        raise PdfError(f"PDF not found: {e}") from e
    except Exception as e:
        raise PdfError(f"could not open PDF: {e}") from e

    out: list[str] = []
    try:
        n = len(doc)
        if n == 0:
            raise PdfError("empty pdf")
        for i in range(n):
            page = doc[i]
            bitmap = page.render(scale=2.78)
            pil = bitmap.to_pil()
            if pil.mode in ("RGBA", "P") and image_format.lower() in ("jpg", "jpeg"):
                pil = pil.convert("RGB")
            path = f"{stem}-{i + 1}.{image_format}"
            pil.save(path)
            out.append(path)
            progress(((i + 1) / n) * 100.0)
    except PdfError:
        raise
    except Exception as e:
        raise PdfError(f"render failed: {e}") from e
    finally:
        doc.close()
    return out


def safe_output_dir(output: str) -> None:
    """Ensures the parent directory of ``output`` exists (best-effort)."""
    parent = os.path.dirname(output)
    if parent:
        os.makedirs(parent, exist_ok=True)
