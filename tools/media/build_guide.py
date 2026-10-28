"""Render the visual PDF guide: media/panduan-kajar.pdf (A4) plus PNG previews of each page.

Usage: python tools/media/build_guide.py [site-url]      default: https://kajar.onrender.com
Needs media/guide/img/ from guide_shots.py and the segno QR library.
"""
import sys
from pathlib import Path

import pypdfium2 as pdfium
import segno
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from mockups import CHROME  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "media" / "guide"
IMG = GUIDE / "img"
URL = sys.argv[1] if len(sys.argv) > 1 else "https://kajar.onrender.com"


def main():
    html = (Path(__file__).parent / "guide_template.html").read_text(encoding="utf8")
    images = {p.stem: p.resolve().as_uri() for p in IMG.glob("*.png")}
    images["logo"] = (ROOT / "public" / "logo.svg").resolve().as_uri()
    for name, uri in images.items():
        html = html.replace(f"{{IMG:{name}}}", uri)
    qr = segno.make(URL, error="m").svg_inline(scale=4, border=0, dark="#0f172a")
    html = html.replace("{QR}", qr).replace("{URL}", URL.replace("https://", ""))
    if "{IMG:" in html:
        raise SystemExit("missing image: " + html[html.index("{IMG:"):][:40])
    page_file = GUIDE / "panduan.html"
    page_file.write_text(html, encoding="utf8")

    out = ROOT / "media" / "panduan-kajar.pdf"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        page = browser.new_page()
        page.goto(page_file.resolve().as_uri())
        page.wait_for_load_state("networkidle")
        page.pdf(path=str(out), format="A4", print_background=True, prefer_css_page_size=True)
        browser.close()

    pdf = pdfium.PdfDocument(str(out))
    for i in range(len(pdf)):
        pdf[i].render(scale=1.4).to_pil().save(GUIDE / f"preview-{i + 1}.png")
    print("pdf", out, len(pdf), "pages", round(out.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
