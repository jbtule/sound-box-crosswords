# The listening page for quip takes (quips.sh runs it after recording; run it again on its own to
# rebuild a page): python3 quips_page.py <out-dir>. Reads <out-dir>/takes.json and audio.json and
# writes index.html: each take plays the word's live recording, a beat, then the take, and has a
# checkbox; the picks gather in a box as "word | quip" lines to copy and paste back. (A plain
# box, since over a Tailscale address the page isn't a secure context, so the clipboard API may
# be missing: the button falls back to selecting the text.)
import html
import json
import os
import sys

out = sys.argv[1]
takes = json.load(open(os.path.join(out, "takes.json"), encoding="utf-8"))
try:
    audio = json.load(open(os.path.join(out, "audio.json"), encoding="utf-8"))
except (OSError, ValueError):
    audio = {}
base, clips = audio.get("base", ""), audio.get("clips", {})
rows, last, n = [], None, 0
for i, t in enumerate(takes):
    if t["word"] != last:
        rows.append(f"<h2>{html.escape(t['word'])}</h2>")
        last, n = t["word"], 0
    n += 1
    key = clips.get("w:" + t["word"])
    src = base + key + ".mp3" if key else ""
    at = "" if t.get("usual", True) else f" | {t['speed']}"
    line = html.escape(f"{t['word']} | {t['quip']}{at}", quote=True)
    slow = "" if t.get("usual", True) else f' <small>(speed {t["speed"]})</small>'
    rows.append(f'<li><button type="button" data-w="{src}" data-q="{html.escape(t["file"])}" aria-label="Play">▶</button>'
                f'<label title="Works"><input type="checkbox" class="ok" value="{line}"> ✓</label>'
                f'<label title="Close: good line, not quite right yet"><input type="checkbox" class="close" value="{line}"> ~</label>'
                f'<span>{n}. “{html.escape(t["quip"])}”{slow}</span>'
                f'<input type="text" class="note" placeholder="What\'s off? (slower, a word sounds wrong…)" hidden></li>')
page = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Quip takes</title>
<style>
body{font:18px system-ui;margin:24px;max-width:600px;padding-bottom:220px}h2{margin:24px 0 4px}
ul{padding:0}li{margin:10px 0;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.note{flex-basis:100%;font:16px system-ui;padding:6px 8px;margin-left:52px}
button{font-size:18px;padding:6px 12px}label{display:flex;align-items:center;gap:8px}
input[type=checkbox]{width:22px;height:22px}
.picks{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #ccc;padding:10px 24px;box-shadow:0 -2px 8px #0002}
.picks textarea{width:100%;height:90px;font:15px ui-monospace,monospace;box-sizing:border-box}
.picks .row{display:flex;gap:10px;align-items:center}
@media (prefers-color-scheme: dark){body{background:#111;color:#eee}.picks{background:#1b1b1b;border-color:#333}.picks textarea{background:#000;color:#eee}}
</style>
<h1>Quip takes</h1><p>▶ plays the word, a beat, then the quip. Tick ✓ for the ones that work, ~ for good lines that don't sound right yet (and say what's off in its note); they gather below to copy.</p>
<ul>""" + "\n".join(rows) + """</ul>
<div class="picks"><div class="row"><b>Picks</b> <span id="n">0</span>
<button type="button" id="copy">Copy</button> <span id="msg"></span></div>
<textarea id="out" readonly placeholder="Ticked takes show here, one per line"></textarea></div>
<script>
const a = new Audio();
const play = (s) => new Promise((r) => { if (!s) return r(); a.src = s; a.onended = r; a.onerror = r; a.play().catch(r); });
document.querySelectorAll("button[data-q]").forEach((b) => b.onclick = async () => { await play(b.dataset.w); await new Promise((r) => setTimeout(r, 350)); await play(b.dataset.q); });
const out = document.getElementById("out"), n = document.getElementById("n"), msg = document.getElementById("msg");
function gather() {
  const ok = [...document.querySelectorAll("input.ok:checked")].map((c) => c.value);
  const close = [...document.querySelectorAll("input.close:checked")].map((c) => {
    const note = c.closest("li").querySelector(".note").value.trim();
    return c.value + (note ? "  # " + note : "");
  });
  out.value = (ok.length ? "Picks:\\n" + ok.join("\\n") : "") + (ok.length && close.length ? "\\n\\n" : "") + (close.length ? "Close, try again:\\n" + close.join("\\n") : "");
  n.textContent = ok.length + " ✓ · " + close.length + " ~";
}
// One mark per take: ticking ✓ clears ~ and the other way round.
document.querySelectorAll("li").forEach((li) => li.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", () => {
  if (c.checked) li.querySelectorAll("input[type=checkbox]").forEach((o) => { if (o !== c) o.checked = false; });
  const note = li.querySelector(".note");
  note.hidden = !li.querySelector("input.close").checked;
  if (!note.hidden && c.classList.contains("close") && c.checked) note.focus();
  gather();
})));
document.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", gather));
document.querySelectorAll(".note").forEach((n) => n.addEventListener("input", gather));
document.getElementById("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(out.value); msg.textContent = "Copied"; }
  catch (e) { out.focus(); out.setSelectionRange(0, out.value.length); try { document.execCommand("copy"); msg.textContent = "Copied"; } catch (e2) { msg.textContent = "Selected: copy it"; } }
};
gather();
</script>"""
with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
    f.write(page)
print("Listening page: " + os.path.join(out, "index.html"))
