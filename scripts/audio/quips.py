# Quip takes for picking by ear (run by quips.sh): /o/takes.txt ("word | Quip!") -> one MP3 per
# take, made like the build's quips (lively.py's lift), listed in /o/takes.json (quips_page.py then
# builds the listening page from it).
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kokoro_core as core  # noqa: E402
import lively  # noqa: E402

model_dir, out, voice, speed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
core.load(model_dir)
takes = []
for line in open(os.path.join(out, "takes.txt"), encoding="utf-8"):
    # "word | Quip!", or "word | Quip! | 0.9" for a take at its own speed (build.mjs SPEED_FOR).
    parts = [s.strip() for s in line.split("|")]
    if len(parts) >= 2 and parts[0] and parts[1]:
        takes.append((parts[0], parts[1], float(parts[2]) if len(parts) > 2 and parts[2] else speed))
made = []
for i, (word, quip, at) in enumerate(takes):
    a = lively.lift(quip, voice, at)
    name = f"take{i}.mp3"
    with open(os.path.join(out, name), "wb") as f:
        f.write(core.mp3(a, core.SR))
    made.append({"word": word, "quip": quip, "file": name, "speed": at, "usual": at == speed})
    print(f"recorded {i + 1}/{len(takes)}", flush=True)
with open(os.path.join(out, "takes.json"), "w", encoding="utf-8") as f:
    json.dump(made, f, ensure_ascii=False)
