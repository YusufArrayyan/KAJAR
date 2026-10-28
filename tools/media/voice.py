"""Generate the Indonesian narration for each scene with edge-tts (Microsoft online voices).

Usage: python tools/media/voice.py [voice]     default voice: id-ID-GadisNeural (alt: id-ID-ArdiNeural)
Only the narration text from tools/media/scenes.json is sent to the speech service.
Writes media/audio/<scene>.mp3 and media/audio/durations.json.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "media" / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)
VOICE = sys.argv[1] if len(sys.argv) > 1 else "id-ID-GadisNeural"
FF = imageio_ffmpeg.get_ffmpeg_exe()

scenes = json.loads((ROOT / "tools" / "media" / "scenes.json").read_text(encoding="utf8"))
durations = {}
for s in scenes:
    mp3 = AUDIO / f"{s['id']}.mp3"
    subprocess.run([sys.executable, "-m", "edge_tts", "--voice", VOICE, "--rate=+4%", "--text", s["voice"], "--write-media", str(mp3)], check=True)
    info = subprocess.run([FF, "-i", str(mp3)], capture_output=True, text=True).stderr
    h, m, sec = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
    durations[s["id"]] = round(int(h) * 3600 + int(m) * 60 + float(sec), 2)
    print(s["id"], durations[s["id"]], "s")
(AUDIO / "durations.json").write_text(json.dumps(durations, indent=1))
print("total", round(sum(durations.values()), 1), "s")
