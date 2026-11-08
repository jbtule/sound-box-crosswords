# Quip takes for picking by ear (run by quips.sh): /o/takes.txt ("word | Quip!") -> one MP3 per
# take, made like generate.py's "text" method, and /o/index.html, which plays the word's live
# recording (from /o/audio.json), a beat, then the take.
import html
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
audio = json.load(open(os.path.join(out, "audio.json")))
base, clips = audio.get("base", ""), audio.get("clips", {})
rows, last, n = [], None, 0
for i, (word, quip) in enumerate(takes):
    a, sr = core.kokoro.create(quip, voice=voice, speed=speed, lang="en-us")
    name = f"take{i}.mp3"
    with open(os.path.join(out, name), "wb") as f:
        f.write(core.mp3(core.trim(a, sr), sr))
    if word != last:
        rows.append(f"<h2>{html.escape(word)}</h2>")
        last, n = word, 0
    n += 1
    key = clips.get("w:" + word)
    src = base + key + ".mp3" if key else ""
    rows.append(f'<li><button data-w="{src}" data-q="{name}">▶</button> {n}. “{html.escape(quip)}”</li>')
    print(f"recorded {i + 1}/{len(takes)}", flush=True)
page = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Quip takes</title><style>body{font:18px system-ui;margin:24px;max-width:560px}h2{margin:24px 0 4px}
ul{padding:0}li{margin:10px 0;list-style:none}button{font-size:18px;margin-right:8px;padding:6px 12px}</style>
<h1>Quip takes</h1><p>Each plays the word, a beat, then the quip.</p><ul>""" + "\n".join(rows) + """</ul>
<script>
const a = new Audio();
const play = (s) => new Promise((r) => { if (!s) return r(); a.src = s; a.onended = r; a.onerror = r; a.play().catch(r); });
document.querySelectorAll("button").forEach((b) => b.onclick = async () => { await play(b.dataset.w); await new Promise((r) => setTimeout(r, 350)); await play(b.dataset.q); });
</script>"""
with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
    f.write(page)
