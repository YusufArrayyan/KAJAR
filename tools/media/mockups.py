"""Phone mockups of KAJAR for the essay (run after record.py, against the same server).

Usage: python tools/media/mockups.py http://localhost:3300
Writes media/mockup/<screen>.png (transparent, phone frame) and two figures on white:
  media/mockup/gambar-1-siswa.png   Masuk, Beranda, Tanya KAJAR, Latihan
  media/mockup/gambar-2-peninjau-guru.png   Peninjau, Dasbor guru, Mutu AI
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3300"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "media" / "mockup"
OUT.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("CHROME_PATH") or str(Path(os.environ["LOCALAPPDATA"]) / "ms-playwright" / "chromium-1234" / "chrome-win64" / "chrome.exe")
STAFF_PASSWORD = "kajar-demo-2026"
DSF = 3  # 1170 x 2532 screenshots

SCREEN = (780, 1688)  # drawn size inside the frame
BEZEL = 28
RADIUS_OUT, RADIUS_IN = 112, 86
PHONE = (SCREEN[0] + 2 * BEZEL, SCREEN[1] + 2 * BEZEL)


def capture():
    shots = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=DSF, is_mobile=True,
                                  has_touch=True, locale="id-ID", color_scheme="light", bypass_csp=True)
        ctx.add_init_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.spellcheck = false; });")
        page = ctx.new_page()

        def login(body, path):
            page.evaluate("""async ([body, path]) => {
                await fetch('/api/auth/logout', { method: 'POST' });
                await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            }""", [body, path])

        def shot(name):
            page.wait_for_timeout(700)
            shots[name] = Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")

        page.goto(f"{BASE}/masuk")
        page.evaluate("fetch('/api/auth/logout', { method: 'POST' })")
        page.goto(f"{BASE}/masuk")
        page.wait_for_selector("#nick")
        shot("masuk")

        login({"nickname": "Rani", "pin": "246810"}, "/api/auth/student/login")
        page.goto(f"{BASE}/beranda")
        page.wait_for_selector(".hero")
        shot("beranda")

        conv = page.evaluate("(async () => (await (await fetch('/api/chat/conversations')).json()).conversations.find(c => c.title && c.title.includes('suku ke-3'))?.id)()")
        page.goto(f"{BASE}/tanya/{conv}")
        page.wait_for_selector(".bubble.reviewer")
        # Frame the last AI hint and the reviewer note together.
        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        shot("tanya")

        page.goto(f"{BASE}/latihan/logaritma")
        page.wait_for_selector("#answer")
        page.get_by_role("button", name="Minta petunjuk").click()
        page.wait_for_selector(".hint-box")
        page.get_by_role("button", name="Minta petunjuk").click()
        page.wait_for_function("document.querySelectorAll('.hint-box').length >= 2")
        shot("latihan")

        login({"email": "bima@kajar.test", "password": STAFF_PASSWORD}, "/api/auth/staff/login")
        flag = page.evaluate("(async () => (await (await fetch('/api/review/queue')).json()).items[0]?.id)()")
        page.goto(f"{BASE}/peninjau/item/{flag}")
        page.wait_for_selector("[name=kebenaran]")
        page.mouse.wheel(0, 120)
        shot("peninjau")

        login({"email": "sari@kajar.test", "password": STAFF_PASSWORD}, "/api/auth/staff/login")
        page.goto(f"{BASE}/dasbor")
        page.wait_for_selector(".stat")
        shot("dasbor")
        page.goto(f"{BASE}/dasbor/mutu")
        page.wait_for_selector(".stackbar")
        shot("mutu")
        browser.close()
    return shots


def mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def framed(screen):
    phone = Image.new("RGBA", PHONE, (0, 0, 0, 0))
    phone.paste(Image.new("RGBA", PHONE, (11, 18, 32, 255)), (0, 0), mask(PHONE, RADIUS_OUT))
    scr = screen.resize(SCREEN, Image.LANCZOS)
    phone.paste(scr, (BEZEL, BEZEL), mask(SCREEN, RADIUS_IN))
    ImageDraw.Draw(phone).rounded_rectangle((2, 2, PHONE[0] - 3, PHONE[1] - 3), radius=RADIUS_OUT - 2, outline=(64, 76, 100, 255), width=3)
    return phone


def figure(names, labels, path, title=None):
    gap, pad = 120, 140
    label_h = 150
    w = pad * 2 + len(names) * PHONE[0] + (len(names) - 1) * gap
    h = pad + PHONE[1] + label_h + pad // 2
    im = Image.new("RGB", (w, h), (255, 255, 255))
    shadow = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(shadow)
    for i in range(len(names)):
        x = pad + i * (PHONE[0] + gap)
        sd.rounded_rectangle((x + 20, pad + 50, x + PHONE[0] - 20, pad + PHONE[1] + 40), radius=RADIUS_OUT, fill=90)
    im.paste((15, 23, 42), (0, 0), shadow.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(im)
    f_label = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 54)
    f_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 40)
    for i, n in enumerate(names):
        x = pad + i * (PHONE[0] + gap)
        ph = Image.open(OUT / f"{n}.png")
        im.paste(ph, (x, pad), ph)
        head, sub = labels[i]
        cx = x + PHONE[0] / 2
        d.text((cx - d.textlength(head, font=f_label) / 2, pad + PHONE[1] + 40), head, font=f_label, fill=(15, 23, 42))
        d.text((cx - d.textlength(sub, font=f_sub) / 2, pad + PHONE[1] + 108), sub, font=f_sub, fill=(71, 85, 105))
    im.save(path, dpi=(300, 300))


def main():
    shots = capture()
    for name, img in shots.items():
        img.save(OUT / f"layar-{name}.png")
        framed(img).save(OUT / f"{name}.png")
    figure(["masuk", "beranda", "tanya", "latihan"],
           [("(a) Masuk", "nama panggilan + PIN"), ("(b) Beranda", "kemajuan dan catatan"),
            ("(c) Tanya KAJAR", "tangga petunjuk"), ("(d) Latihan", "petunjuk bertahap")],
           OUT / "gambar-1-siswa.png")
    figure(["peninjau", "dasbor", "mutu"],
           [("(a) Peninjau", "rubrik, tanpa nama siswa"), ("(b) Dasbor guru", "keaktifan kelas"), ("(c) Mutu AI", "vonis peninjau per minggu")],
           OUT / "gambar-2-peninjau-guru.png")
    print("mockups", sorted(p.name for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
