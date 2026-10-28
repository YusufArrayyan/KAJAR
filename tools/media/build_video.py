"""Assemble media/kajar-demo.mp4 (1920x1080, 30 fps, AAC narration) from the recorded frames.

Usage: python tools/media/build_video.py
Inputs: media/raw/capture.json, media/audio/*.mp3, tools/media/scenes.json. Needs imageio-ffmpeg and Pillow.
Also writes media/kajar-demo.srt (narration subtitles).
"""
import json
import os
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / "media"
RAW = Path(os.environ.get("MEDIA_RAW") or MEDIA / "raw")
BUILD = MEDIA / os.environ.get("MEDIA_BUILD", "build")
BUILD.mkdir(parents=True, exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1920, 1080
BLUE = (29, 78, 216)
NAVY = (15, 23, 42)
BG = (245, 247, 251)
INK = (15, 23, 42)
INK2 = (51, 65, 85)
INK3 = (71, 85, 105)
YELLOW = (249, 177, 21)
LINE = (227, 232, 240)
PANEL_W = 880
SCREEN = (432, 935)
BEZEL = 16
PHONE = (SCREEN[0] + 2 * BEZEL, SCREEN[1] + 2 * BEZEL)
PHONE_XY = ((PANEL_W - PHONE[0]) // 2, (H - PHONE[1]) // 2)
TX = PANEL_W + 100  # text column left
TW = W - TX - 110  # text column width
OUTRO = 3.5
AUDIO_LEAD = 0.25

FONTS = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(FONTS + name, size)


F_TITLE = font("segoeuib.ttf", 58)
F_CAP = font("seguisb.ttf", 30)
F_BODY = font("segoeui.ttf", 27)
F_SMALL = font("seguisb.ttf", 22)
F_BRAND = font("segoeuib.ttf", 34)


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def logo_disc(d):
    icon = Image.open(ROOT / "public" / "icon-512.png").convert("RGBA").resize((d, d), Image.LANCZOS)
    disc = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    disc.paste(icon, (0, 0), rounded_mask((d, d), d // 2))
    return disc


def background():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, PANEL_W, H), fill=BLUE)
    # Soft shadow under the phone.
    shadow = Image.new("L", (W, H), 0)
    x, y = PHONE_XY
    ImageDraw.Draw(shadow).rounded_rectangle((x + 10, y + 34, x + PHONE[0] - 10, y + PHONE[1] + 22), radius=70, fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    im.paste((10, 25, 70), (0, 0), shadow)
    # Brand line top-right.
    im.paste(logo_disc(64), (TX, 70), logo_disc(64))
    d.text((TX + 84, 74), "KAJAR", font=F_BRAND, fill=INK)
    d.text((TX + 84, 114), "Kawan Belajar · tutor AI hemat data", font=F_SMALL, fill=INK3)
    d.text((TX, H - 92), "Prototipe untuk esai. Semua data di video ini data contoh.", font=F_SMALL, fill=INK3)
    im.save(BUILD / "bg.png")


def phone_frame():
    im = Image.new("RGBA", PHONE, (0, 0, 0, 0))
    outer = rounded_mask(PHONE, 64)
    body = Image.new("RGBA", PHONE, (11, 18, 32, 255))
    im.paste(body, (0, 0), outer)
    hole = rounded_mask(SCREEN, 48)
    clear = Image.new("RGBA", SCREEN, (0, 0, 0, 0))
    im.paste(clear, (BEZEL, BEZEL), hole)
    # Thin highlight on the rim.
    ImageDraw.Draw(im).rounded_rectangle((1, 1, PHONE[0] - 2, PHONE[1] - 2), radius=63, outline=(60, 72, 96, 255), width=2)
    im.save(BUILD / "frame.png")


def caption_card(i, total, scene):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = 300
    # Step indicator: a real sequence, so a numbered step plus segments.
    d.text((TX, y), f"{i + 1} / {total}", font=F_SMALL, fill=BLUE)
    seg_w, gap = 36, 8
    sx = TX + 90
    for k in range(total):
        fill = BLUE if k <= i else LINE
        d.rounded_rectangle((sx + k * (seg_w + gap), y + 10, sx + k * (seg_w + gap) + seg_w, y + 18), radius=4, fill=fill)
    y += 64
    for line in wrap(d, scene["title"], F_TITLE, TW):
        d.text((TX, y), line, font=F_TITLE, fill=INK)
        y += 72
    y += 12
    for line in wrap(d, scene["caption"], F_CAP, TW):
        d.text((TX, y), line, font=F_CAP, fill=INK2)
        y += 44
    y += 28
    d.line((TX, y, TX + TW, y), fill=LINE, width=2)
    y += 28
    for line in wrap(d, f"“{scene['voice']}”", F_BODY, TW):
        d.text((TX, y), line, font=F_BODY, fill=INK3)
        y += 40
    im.save(BUILD / f"cap-{i:02d}.png")


def outro_card():
    im = Image.new("RGB", (W, H), BLUE)
    d = ImageDraw.Draw(im)
    disc = logo_disc(180)
    im.paste(disc, ((W - 180) // 2, 250), disc)
    def center(text, fnt, y, fill):
        d.text(((W - d.textlength(text, font=fnt)) / 2, y), text, font=fnt, fill=fill)
    center("KAJAR · Kawan Belajar", font("segoeuib.ttf", 72), 470, (255, 255, 255))
    center("Tutor AI hemat data, ditemani Kakak Mahasiswa peninjau", F_CAP, 580, (226, 232, 255))
    d.rounded_rectangle(((W - 120) / 2, 650, (W + 120) / 2, 658), radius=4, fill=YELLOW)
    center("Esai IMMSSAC 2026 · prototipe, data contoh", F_SMALL, 700, (200, 212, 245))
    im.save(BUILD / "outro.png")


def fmt_srt(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    cap = json.loads((RAW / "capture.json").read_text())
    scenes = json.loads((ROOT / "tools" / "media" / "scenes.json").read_text(encoding="utf8"))
    durs = json.loads((MEDIA / "audio" / "durations.json").read_text())
    marks = cap["marks"]
    t0 = marks[scenes[0]["id"]]
    t_end = marks["_end"] - t0
    total = t_end + OUTRO
    starts = [marks[s["id"]] - t0 for s in scenes]

    background()
    phone_frame()
    outro_card()
    for i, s in enumerate(scenes):
        caption_card(i, len(scenes), s)

    # Frame list with exact display durations (concat demuxer).
    # Frames live next to capture.json, whatever path the recorder stored.
    frames = [{**f, "file": str(RAW.resolve() / "frames" / Path(f["file"]).name)} for f in cap["frames"] if f["t"] >= t0 - 0.05]
    lines = []
    for a, b in zip(frames, frames[1:]):
        lines.append(f"file '{Path(a['file']).as_posix()}'\nduration {max(0.001, b['t'] - a['t']):.4f}")
    last = frames[-1]
    lines.append(f"file '{Path(last['file']).as_posix()}'\nduration {max(0.04, marks['_end'] - last['t']):.4f}")
    lines.append(f"file '{Path(last['file']).as_posix()}'")
    (BUILD / "frames.txt").write_text("\n".join(lines))

    args = [FF, "-y", "-loglevel", "error", "-stats"]
    args += ["-loop", "1", "-framerate", "30", "-t", f"{total:.3f}", "-i", str(BUILD / "bg.png")]  # 0
    args += ["-f", "concat", "-safe", "0", "-i", str(BUILD / "frames.txt")]  # 1
    args += ["-loop", "1", "-framerate", "30", "-t", f"{total:.3f}", "-i", str(BUILD / "frame.png")]  # 2
    for i in range(len(scenes)):
        args += ["-loop", "1", "-framerate", "30", "-t", f"{total:.3f}", "-i", str(BUILD / f"cap-{i:02d}.png")]
    outro_idx = 3 + len(scenes)
    args += ["-loop", "1", "-framerate", "30", "-t", f"{total:.3f}", "-i", str(BUILD / "outro.png")]
    audio_base = outro_idx + 1
    for s in scenes:
        args += ["-i", str(MEDIA / "audio" / f"{s['id']}.mp3")]

    x, y = PHONE_XY
    fc = [f"[1:v]fps=30,scale={SCREEN[0]}:{SCREEN[1]}:flags=lanczos,format=rgb24,setpts=PTS-STARTPTS[scr]",
          f"[0:v][scr]overlay=x={x + BEZEL}:y={y + BEZEL}:eof_action=repeat:format=rgb[v0]",
          f"[v0][2:v]overlay={x}:{y}:format=rgb[v1]"]
    cur = "v1"
    for i in range(len(scenes)):
        a = starts[i]
        b = starts[i + 1] if i + 1 < len(scenes) else t_end
        nxt = f"c{i}"
        fc.append(f"[{cur}][{3 + i}:v]overlay=0:0:format=rgb:enable='between(t,{a:.3f},{b:.3f})'[{nxt}]")
        cur = nxt
    fc.append(f"[{cur}][{outro_idx}:v]overlay=0:0:format=rgb:enable='gte(t,{t_end:.3f})',scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[vout]")
    amix = []
    for i in range(len(scenes)):
        delay = int((starts[i] + AUDIO_LEAD) * 1000)
        fc.append(f"[{audio_base + i}:a]aresample=48000,adelay={delay}|{delay}[a{i}]")
        amix.append(f"[a{i}]")
    fc.append(f"{''.join(amix)}amix=inputs={len(scenes)}:normalize=0,apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]")

    out = MEDIA / "kajar-demo.mp4"
    args += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
             "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)]
    subprocess.run(args, check=True)

    srt = []
    for i, s in enumerate(scenes):
        a = starts[i] + AUDIO_LEAD
        srt.append(f"{i + 1}\n{fmt_srt(a)} --> {fmt_srt(a + durs[s['id']])}\n{s['voice']}\n")
    (MEDIA / "kajar-demo.srt").write_text("\n".join(srt), encoding="utf8")
    print("video", out, f"{total:.1f}s")


main()
