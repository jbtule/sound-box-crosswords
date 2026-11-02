# Sound it out, step 1: candidate recordings of each single sound, to pick by ear.
#   python lab.py <model-dir> <out-dir>      (run.sh runs it in a Linux container)
# Writes <out-dir>/<sound>-<method>.mp3 and <out-dir>/index.html, a page to play them side by
# side. Nothing here is used by the build yet; the chosen method per sound comes later.
#
# Sounds are clipped, the way teachers say them: "k" not "kuh", "mmm" held briefly.
# Methods (misaki phonemes, what Kokoro was trained on; see ../generate.py):
#   alone  the sound by itself in the carrier ("and next, æ.") and cut out
#   word   an example word in the carrier, cutting out only the target sound's tokens
#   slow   "word" at a slower speed (vowels and sounds you can hold)
#   held   (holds only) the sound written three times, slow: "sss"
#   stretch (holds only) "word", with its steady middle repeated to about HOLD_MS
import html
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import generate as g  # noqa: E402

# name (as written in word lists), example word, the example in phonemes with the target in
# [brackets], and the type: stop (a burst: clip tight), hold (can be held), vowel.
SOUNDS = [
    # short vowels
    ("a", "cat", "k[ˈæ]t", "vowel"), ("e", "bed", "b[ˈɛ]d", "vowel"), ("i", "pig", "p[ˈɪ]ɡ", "vowel"),
    ("o", "hot", "h[ˈɑ]t", "vowel"), ("u", "sun", "s[ˈʌ]n", "vowel"),
    # long vowels and others
    ("ay", "cake", "k[ˈA]k", "vowel"), ("ee", "see", "s[ˈi]", "vowel"), ("igh", "kite", "k[ˈI]t", "vowel"),
    ("oh", "boat", "b[ˈO]t", "vowel"), ("oo", "moon", "m[ˈu]n", "vowel"), ("uu", "book", "b[ˈʊ]k", "vowel"),
    ("ow", "cow", "k[ˈW]", "vowel"), ("oy", "boy", "b[ˈY]", "vowel"), ("aw", "saw", "s[ˈɔ]", "vowel"),
    ("uh", "about", "[ə]bˈWt", "vowel"),
    # r-controlled
    ("ar", "car", "k[ˈɑɹ]", "vowel"), ("or", "for", "f[ˈɔɹ]", "vowel"), ("er", "her", "h[ˈɜɹ]", "vowel"),
    ("air", "hair", "h[ˈɛɹ]", "vowel"), ("ear", "ear", "[ˈɪɹ]", "vowel"),
    # consonants
    ("b", "bat", "[b]ˈæt", "stop"), ("d", "dog", "[d]ˈɔɡ", "stop"), ("g", "go", "[ɡ]ˈO", "stop"),
    ("k", "kit", "[k]ˈɪt", "stop"), ("p", "pig", "[p]ˈɪɡ", "stop"), ("t", "top", "[t]ˈɑp", "stop"),
    ("ch", "chip", "[ʧ]ˈɪp", "stop"), ("j", "jam", "[ʤ]ˈæm", "stop"),
    ("f", "fan", "[f]ˈæn", "hold"), ("v", "van", "[v]ˈæn", "hold"), ("s", "sun", "[s]ˈʌn", "hold"),
    ("z", "zip", "[z]ˈɪp", "hold"), ("sh", "ship", "[ʃ]ˈɪp", "hold"), ("zh", "vision", "vˈɪ[ʒ]ən", "hold"),
    ("th", "thin", "[θ]ˈɪn", "hold"), ("dh", "this", "[ð]ˈɪs", "hold"), ("h", "hat", "[h]ˈæt", "hold"),
    ("m", "map", "[m]ˈæp", "hold"), ("n", "nut", "[n]ˈʌt", "hold"), ("ng", "sing", "sˈɪ[ŋ]", "hold"),
    ("l", "leg", "[l]ˈɛɡ", "hold"), ("r", "red", "[ɹ]ˈɛd", "hold"), ("w", "web", "[w]ˈɛb", "hold"),
    ("y", "yes", "[j]ˈɛs", "hold"),
    # one letter, two sounds
    ("ks", "box", "bˈɑ[ks]", "stop"), ("kw", "queen", "[kw]ˈin", "stop"),
]

VOICE, SPEED, SLOW = "af_heart", 0.8, 0.55
HOLD_MS = 350
# Lead and tail around the cut (ms): a stop needs its burst and a little breath after it
# but none of the next vowel; held sounds and vowels can be cut close.
EDGES = {"stop": (15, 45), "hold": (10, 20), "vowel": (10, 20)}


def candidates(name, word_ps, kind):
    a = word_ps.index("[")
    b = word_ps.index("]") - 1
    ps = word_ps.replace("[", "").replace("]", "")
    target = ps[a:b]
    lead, tail = EDGES[kind]
    out = {
        "alone": g.cut_phonemes(target if kind != "vowel" or "ˈ" in target else "ˈ" + target, VOICE, SPEED),
        "word": g.cut_phonemes(ps, VOICE, SPEED, a, b, lead, tail),
    }
    if kind != "stop":
        out["slow"] = g.cut_phonemes(ps, VOICE, SLOW, a, b, lead, tail)
    if kind == "hold":
        out["held"] = g.cut_phonemes(target * 3, VOICE, SLOW)
        out["stretch"] = stretch(out["word"], HOLD_MS)
    return out


def stretch(audio, ms):
    """Lengthens a held sound by repeating its middle third with 20 ms crossfades."""
    import numpy as np
    want = ms * g.SR // 1000
    n = len(audio)
    if n >= want or n < 30 * g.SR // 1000:
        return audio
    a, b = n // 3, 2 * n // 3
    head, mid, tail = audio[:a], audio[a:b], audio[b:]
    x = min(20 * g.SR // 1000, len(mid) // 2)
    fade_in, fade_out = np.linspace(0, 1, x), np.linspace(1, 0, x)
    body = mid.copy()
    while len(head) + len(body) + len(tail) < want:
        body = np.concatenate([body[:-x], body[-x:] * fade_out + mid[:x] * fade_in, mid[x:]])
    return np.concatenate([head, body, tail])


def main():
    model_dir, out_dir = sys.argv[1:3]
    g.load(model_dir)
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, word, word_ps, kind in SOUNDS:
        cells = []
        for method, audio in candidates(name, word_ps, kind).items():
            audio = g.trim(audio, g.SR, threshold=0.004, pad=0.02)
            fname = f"{name}-{method}.mp3"
            with open(os.path.join(out_dir, fname), "wb") as f:
                f.write(g.mp3(audio, g.SR))
            ms = int(1000 * len(audio) / g.SR)
            cells.append(f'<td><button onclick="new Audio(\'{fname}\').play()">▶ {method}</button><small>{ms} ms</small>'
                         f'<label><input type="radio" name="{name}" value="{method}"> pick</label></td>')
        cells.append(f'<td><label><input type="radio" name="{name}" value="none"> none good</label></td>')
        rows.append(f"<tr><th>{html.escape(name)}</th><td>{html.escape(word)}</td><td>{kind}</td>{''.join(cells)}</tr>")
        print(f"{name}: {len(cells)} candidates", flush=True)
    with open(os.path.join(out_dir, "index.html"), "w") as f:
        f.write("""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Sound candidates</title>
<style>body{font:16px system-ui;margin:16px}table{border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
button{font:inherit;padding:8px 12px;margin-right:6px;border-radius:8px;border:1px solid #bbb;background:#f6f8fb}small{color:#777;margin-right:6px}label{white-space:nowrap;font-size:14px}</style>
<h1>Sound candidates</h1><p>Each sound several ways: <b>alone</b> (said by itself), <b>word</b> (cut from the example word), <b>slow</b> (the same, slower), and for sounds you can hold, <b>held</b> (written three times) and <b>stretch</b> (the word's cut, held longer). Pick the clearest one for each sound: stops clipped ("k", not "kuh"), held sounds held briefly ("mmm").</p>
<table><tr><th>sound</th><th>as in</th><th>type</th><th colspan="5">candidates</th></tr>
""" + "\n".join(rows) + """</table>
<p><button id="copy">Copy picks</button> <span id="msg"></span></p>
<script>
// Picks are kept in this browser; Copy picks puts them on the clipboard to paste back.
const KEY = "sound-picks";
let picks = {}; try { picks = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
document.querySelectorAll("input[type=radio]").forEach((r) => {
  if (picks[r.name] === r.value) r.checked = true;
  r.addEventListener("change", () => { picks[r.name] = r.value; try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {} });
});
document.getElementById("copy").onclick = () => {
  const all = [...new Set([...document.querySelectorAll("input[type=radio]")].map((r) => r.name))];
  const missing = all.filter((n) => !picks[n]);
  navigator.clipboard.writeText(JSON.stringify(picks)).then(() => {
    document.getElementById("msg").textContent = "Copied " + Object.keys(picks).length + " picks" + (missing.length ? " (not picked yet: " + missing.join(", ") + ")" : "") + ".";
  });
};
</script>""")


if __name__ == "__main__":
    main()
