# Quip takes for picking by ear (run by quips.sh): /o/takes.txt ("word | Quip!") -> one MP3 per
# take, made like generate.py's "text" method, listed in /o/takes.json (quips_page.py then
# builds the listening page from it).
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kokoro_core as core  # noqa: E402

model_dir, out, voice, speed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
core.load(model_dir)
takes = []
for line in open(os.path.join(out, "takes.txt"), encoding="utf-8"):
    if "|" in line:
        word, quip = (s.strip() for s in line.split("|", 1))
        if word and quip:
            takes.append((word, quip))
made = []
for i, (word, quip) in enumerate(takes):
    a, sr = core.kokoro.create(quip, voice=voice, speed=speed, lang="en-us")
    name = f"take{i}.mp3"
    with open(os.path.join(out, name), "wb") as f:
        f.write(core.mp3(core.trim(a, sr), sr))
    made.append({"word": word, "quip": quip, "file": name})
    print(f"recorded {i + 1}/{len(takes)}", flush=True)
with open(os.path.join(out, "takes.json"), "w", encoding="utf-8") as f:
    json.dump(made, f, ensure_ascii=False)
