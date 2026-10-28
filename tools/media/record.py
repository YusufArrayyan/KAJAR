"""Record the KAJAR walkthrough at phone size (390x844 CSS px, 2x = 780x1688 frames).

Usage: python tools/media/record.py http://localhost:3300
Every wait and keystroke goes through a capture loop (~25 fps), so frames are sharp and timed.
Writes media/raw/frames/*.jpg and media/raw/capture.json (frame times + scene start marks, wall clock).
Each scene lasts at least as long as its narration (media/audio/durations.json).
"""
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3300"
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get("MEDIA_RAW") or ROOT / "media" / "raw").resolve()
FRAMES = OUT / "frames"
FRAMES.mkdir(parents=True, exist_ok=True)
DUR = json.loads((ROOT / "media" / "audio" / "durations.json").read_text())
PAD = 0.8  # breathing room after each narration
FRAME_GAP = 0.04  # ~25 fps
STAFF_PASSWORD = "kajar-demo-2026"  # local demo value from server/seed.js
# Reuse the Chromium already on this machine (set CHROME_PATH to override).
CHROME = os.environ.get("CHROME_PATH") or str(Path(os.environ["LOCALAPPDATA"]) / "ms-playwright" / "chromium-1234" / "chrome-win64" / "chrome.exe")


def main():
    frames, marks, state = [], {}, {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="id-ID", color_scheme="light", bypass_csp=True,  # recording harness only; the app keeps its CSP
        )
        # No spell-check squiggles in the footage.
        ctx.add_init_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.spellcheck = false; });")
        page = ctx.new_page()
        recording = {"on": False}

        def snap():
            if not recording["on"]:
                return
            path = FRAMES / f"{len(frames):05d}.jpg"
            path.write_bytes(page.screenshot(type="jpeg", quality=90))
            frames.append({"t": time.time(), "file": str(path)})

        def idle(ms):
            end = time.time() + ms / 1000
            while time.time() < end:
                t = time.time()
                snap()
                rest = FRAME_GAP - (time.time() - t)
                if rest > 0:
                    time.sleep(min(rest, max(0, end - time.time())))

        def wait_for(check, timeout=20):
            end = time.time() + timeout
            while time.time() < end:
                if check():
                    return
                idle(60)
            raise TimeoutError("waited too long")

        def wait_sel(selector, timeout=20):
            wait_for(lambda: page.locator(selector).count() > 0, timeout)

        def type_slow(locator, text, delay=55):
            locator.click()
            for ch in text:
                page.keyboard.type(ch)
                idle(delay)

        def smooth_scroll(dy, steps=14, pause=70):
            for _ in range(steps):
                page.mouse.wheel(0, dy / steps)
                idle(pause)

        def send_chat(text, delay=40):
            type_slow(page.locator("#msg"), text, delay)
            idle(300)
            before = page.locator(".bubble.ai").count()
            page.get_by_role("button", name="Kirim").click()
            wait_for(lambda: page.locator(".bubble.ai").count() > before)
            idle(300)
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")

        def api_login(body, path):
            page.evaluate(
                """async ([body, path]) => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
                }""",
                [body, path],
            )

        scene_start = {}

        def scene(sid, fn):
            start = time.time()
            marks[sid] = start
            scene_start["t"] = start
            fn()
            remaining = DUR[sid] + PAD - (time.time() - start)
            if remaining > 0:
                idle(remaining * 1000)
            print(sid, "done", round(time.time() - start, 1), "s", flush=True)

        def until_before_end(sid, seconds):
            left = scene_start["t"] + DUR[sid] - seconds - time.time()
            if left > 0:
                idle(left * 1000)

        # Warm the service worker cache before the story starts (not recorded).
        page.goto(f"{BASE}/masuk")
        page.wait_for_timeout(1500)
        page.goto(f"{BASE}/masuk")
        page.wait_for_selector("#nick")
        page.wait_for_timeout(500)
        recording["on"] = True

        def s1():
            idle((DUR["01-masuk"] - 6.5) * 1000)
            type_slow(page.locator("#nick"), "Rani", 140)
            type_slow(page.locator("#pin"), "246810", 140)
            idle(400)
            page.get_by_role("button", name="Masuk", exact=True).click()
            wait_for(lambda: page.url.endswith("/beranda") and page.locator(".hero").count() > 0)
        scene("01-masuk", s1)

        def s2():
            idle(3500)
            smooth_scroll(520)
            idle(2500)
            smooth_scroll(-520, 10, 50)
        scene("02-beranda", s2)

        def s3():
            page.get_by_role("link", name="Tanya", exact=True).first.click()
            wait_sel("#msg")
            idle(800)
            send_chat("kak suku ke-3 barisan aritmetika 11, suku ke-7 23. langsung jawab aja U10 berapa", 32)
        scene("03-tanya", s3)
        state["conv"] = page.url.rsplit("/", 1)[-1]

        def s4():
            idle(1200)
            send_chat("4", 120)
            idle(2500)
            send_chat("23 - 11 = 4 x beda?", 70)
        scene("04-mencoba", s4)

        def s5():
            last = page.locator(".bubble.ai").last
            last.scroll_into_view_if_needed()
            idle(1500)
            last.get_by_role("button", name="Salah").click()
            idle(2500)
        scene("05-tandai", s5)

        def s6():
            ctx.set_offline(True)
            idle(1200)
            type_slow(page.locator("#msg"), "kalau rasio barisan geometri gimana nyarinya?", 35)
            page.get_by_role("button", name="Kirim").click()
            idle(300)
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            idle(4200)
            ctx.set_offline(False)
            wait_for(lambda: page.locator(".bubble.ai", has_text="Barisan Geometri").count() > 0)
            idle(500)
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        scene("06-offline", s6)

        def s7():
            page.get_by_role("link", name="Latihan", exact=True).first.click()
            wait_sel(".topic-row")
            idle(1500)
            page.locator(".topic-row", has_text="Logaritma").first.click()
            wait_sel("#answer")
            idle(1500)
            page.get_by_role("button", name="Minta petunjuk").click()
            wait_sel(".hint-box")
            idle(2200)
            type_slow(page.locator("#answer"), "6", 150)
            page.get_by_role("button", name="Periksa").click()
            wait_sel("#result .banner")
        scene("07-latihan", s7)

        def s8():
            api_login({"email": "bima@kajar.test", "password": STAFF_PASSWORD}, "/api/auth/staff/login")
            flag = page.evaluate(
                """async () => {
                    const q = await (await fetch('/api/review/queue?alasan=ditandai')).json();
                    return q.items.sort((a, b) => b.created_at.localeCompare(a.created_at))[0].id;
                }"""
            )
            page.goto(f"{BASE}/peninjau/item/{flag}")
            wait_sel("[name=kebenaran]")
            idle(2500)
            page.locator("form[data-form=review]").scroll_into_view_if_needed()
            for name, value in (("kebenaran", 4), ("kejelasan", 2), ("tingkat", 3), ("keamanan", 4)):
                page.locator(f"label.opt:has(input[name={name}][value='{value}'])").click()
                idle(350)
            corr = page.locator("#correction")
            corr.scroll_into_view_if_needed()
            type_slow(corr, "Langkahmu sudah benar. Dari 23 − 11 = 4 × beda, bedanya 3. Cari suku pertama dulu, baru U10.", 18)
            # Submit at the very end: the app then jumps to the next queue item.
            until_before_end("08-peninjau", 0.6)
            page.get_by_role("button", name="Kirim penilaian").click()
            idle(500)
        scene("08-peninjau", s8)

        def s9():
            api_login({"nickname": "Rani", "pin": "246810"}, "/api/auth/student/login")
            page.goto(f"{BASE}/tanya/{state['conv']}")
            wait_sel(".bubble.reviewer")
            idle(300)
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        scene("09-catatan", s9)

        def s10():
            api_login({"email": "sari@kajar.test", "password": STAFF_PASSWORD}, "/api/auth/staff/login")
            page.goto(f"{BASE}/dasbor")
            wait_sel(".stat")
            idle(4000)
            smooth_scroll(700, 16, 80)
            idle(2500)
            page.goto(f"{BASE}/dasbor/mutu")
            wait_sel(".stackbar")
            idle(2500)
            smooth_scroll(500, 12, 80)
        scene("10-guru", s10)

        marks["_end"] = time.time()
        browser.close()
    (OUT / "capture.json").write_text(json.dumps({"frames": frames, "marks": marks}, indent=1))
    print("frames", len(frames))


main()
