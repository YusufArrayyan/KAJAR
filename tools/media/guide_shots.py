"""Extra screenshots for the PDF guide (demo-mode server), plus downsized framed copies of all screens.

Usage: python tools/media/guide_shots.py http://localhost:3301
Needs the screens from mockups.py in media/mockup/. Writes media/guide/img/*.png.
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from mockups import CHROME, framed  # noqa: E402

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3301"
ROOT = Path(__file__).resolve().parents[2]
MOCK = ROOT / "media" / "mockup"
IMG = ROOT / "media" / "guide" / "img"
IMG.mkdir(parents=True, exist_ok=True)
SCALE = 0.8  # framed phones ~670 px wide: sharp at ~55 mm in print


def capture():
    shots = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True,
                                  has_touch=True, locale="id-ID", color_scheme="light", bypass_csp=True)
        page = ctx.new_page()

        def shot(name):
            page.wait_for_timeout(700)
            shots[name] = Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")

        page.goto(f"{BASE}/masuk")
        page.wait_for_selector(".card.demo")
        shot("masuk-juri")

        page.evaluate("""async () => {
            await fetch('/api/auth/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'siswa_baru' }) });
            await fetch('/api/me/onboarded', { method: 'POST' });
        }""")
        page.goto(f"{BASE}/tes/awal?no=2")
        page.wait_for_selector(".opt")
        page.locator(".opt").nth(1).click()
        shot("tes")

        page.goto(f"{BASE}/profil")
        page.wait_for_selector(".switch")
        shot("profil")
        browser.close()
    return shots


def main():
    for name, img in capture().items():
        img.save(MOCK / f"layar-{name}.png")
        framed(img).save(MOCK / f"{name}.png")
    for f in MOCK.glob("*.png"):
        if f.name.startswith(("layar-", "gambar-")):
            continue
        im = Image.open(f)
        im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS).save(IMG / f.name, optimize=True)
    print("guide images", sorted(p.name for p in IMG.glob("*.png")))


if __name__ == "__main__":
    main()
