"""PDF operations: image->PDF, merge, page edit, PDF->images.

Self-contained: builds its own test images/PDFs with Pillow and round-trips them.
Skips cleanly if a PDF library is missing (so a bare checkout still runs).
"""

import pytest

pypdf = pytest.importorskip("pypdf")
PIL = pytest.importorskip("PIL")

from ngc7023.jobs import pdf_ops  # noqa: E402


def _make_image(path, size=(120, 80), color=(200, 30, 30)):
    from PIL import Image

    Image.new("RGB", size, color).save(path)


def _page_count(path) -> int:
    return len(pypdf.PdfReader(str(path)).pages)


def test_image_to_pdf_single_page(tmp_path):
    img = tmp_path / "a.png"
    out = tmp_path / "a.pdf"
    _make_image(img)
    pdf_ops.image_to_pdf(str(img), str(out))
    assert out.exists()
    assert _page_count(out) == 1


def test_images_to_pdf_one_page_each(tmp_path):
    imgs = []
    for i in range(3):
        p = tmp_path / f"i{i}.png"
        _make_image(p, color=(i * 40, 100, 200))
        imgs.append(str(p))
    out = tmp_path / "multi.pdf"
    seen = []
    pdf_ops.images_to_pdf(imgs, str(out), seen.append)
    assert _page_count(out) == 3
    assert seen and seen[-1] == 100.0


def test_rgba_image_is_flattened(tmp_path):
    from PIL import Image

    img = tmp_path / "alpha.png"
    Image.new("RGBA", (50, 50), (10, 20, 30, 128)).save(img)
    out = tmp_path / "alpha.pdf"
    pdf_ops.image_to_pdf(str(img), str(out))  # must not raise on alpha
    assert _page_count(out) == 1


def test_merge_pdfs(tmp_path):
    a, b = tmp_path / "a.pdf", tmp_path / "b.pdf"
    ia, ib = tmp_path / "ia.png", tmp_path / "ib.png"
    _make_image(ia)
    _make_image(ib)
    pdf_ops.images_to_pdf([str(ia), str(ia)], str(a))  # 2 pages
    pdf_ops.image_to_pdf(str(ib), str(b))               # 1 page
    out = tmp_path / "merged.pdf"
    pdf_ops.merge_pdfs([str(a), str(b)], str(out))
    assert _page_count(out) == 3


def test_pdf_pages_keep_and_delete(tmp_path):
    imgs = [tmp_path / f"p{i}.png" for i in range(4)]
    for p in imgs:
        _make_image(p)
    src = tmp_path / "src.pdf"
    pdf_ops.images_to_pdf([str(p) for p in imgs], str(src))  # 4 pages

    keep_out = tmp_path / "keep.pdf"
    pdf_ops.edit_pdf_pages(str(src), str(keep_out), [1, 3], keep=True)
    assert _page_count(keep_out) == 2

    del_out = tmp_path / "del.pdf"
    pdf_ops.edit_pdf_pages(str(src), str(del_out), [2], keep=False)
    assert _page_count(del_out) == 3


def test_pdf_pages_cannot_remove_everything(tmp_path):
    img = tmp_path / "x.png"
    _make_image(img)
    src = tmp_path / "one.pdf"
    pdf_ops.image_to_pdf(str(img), str(src))
    with pytest.raises(pdf_ops.PdfError):
        pdf_ops.edit_pdf_pages(str(src), str(tmp_path / "o.pdf"), [1], keep=False)


def test_pdf_to_images_round_trip(tmp_path):
    pytest.importorskip("pypdfium2")
    imgs = [tmp_path / f"s{i}.png" for i in range(2)]
    for p in imgs:
        _make_image(p)
    src = tmp_path / "doc.pdf"
    pdf_ops.images_to_pdf([str(p) for p in imgs], str(src))
    stem = str(tmp_path / "page")
    out = pdf_ops.pdf_to_images(str(src), stem, "png")
    assert len(out) == 2
    assert all(__import__("os").path.exists(p) for p in out)


def test_missing_image_raises_pdf_error(tmp_path):
    with pytest.raises(pdf_ops.PdfError):
        pdf_ops.image_to_pdf(str(tmp_path / "nope.png"), str(tmp_path / "o.pdf"))
