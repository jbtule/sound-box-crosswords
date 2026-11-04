# Sound it out, step 1: candidate recordings of each single sound, to pick by ear.
#   python lab.py <model-dir> <out-dir>      (run.sh runs it in a Linux container)
# Writes <out-dir>/<sound>-<method>.mp3 and <out-dir>/index.html, a page to play them side by
# side. picks.json records the method chosen for each sound by ear; render() makes that one,
# and ../generate.py uses it for the build's "sound" clips (Sound it out).
#
# Sounds are clipped, the way teachers say them: "k" not "kuh", "mmm" held briefly.
# Methods (misaki phonemes, what Kokoro was trained on; see ../generate.py):
#   alone  the sound by itself in the carrier ("and next, æ.") and cut out
#   word   an example word in the carrier, cutting out only the target sound's tokens
#   slow   "word" at a slower speed (vowels and sounds you can hold)
#   held   (holds only) the sound written three times, slow: "sss"
#   stretch (holds only) "word", with its steady middle repeated to about HOLD_MS
#   burst  (stops) just the release from the start of the example word, before the vowel
#   final  (stops) the stop at the end of a word (FINAL), released into silence
#   core   (EXTRA, vowels) a vowel's steady middle cut from a word, both ends trimmed
# Every candidate is scaled to the same peak so they compare fairly.
import html
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import kokoro_core as g  # noqa: E402

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
    # (said alone, a stop is silent: the voice makes nothing for a bare "k")
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
# A stop at the end of a word is released on its own (no vowel after it): "t" from "cat".
FINAL = {"b": ("cab", "kˈæ[b]"), "d": ("bed", "bˈɛ[d]"), "g": ("dog", "dˈɔ[ɡ]"), "k": ("book", "bˈʊ[k]"),
         "p": ("cap", "kˈæ[p]"), "t": ("cat", "kˈæ[t]"), "ch": ("much", "mˈʌ[ʧ]"), "j": ("badge", "bˈæ[ʤ]")}
# More tries for sounds the first round didn't get right (g and j: voiced stops are barely
# released at the end of a word). Each: (label, word with the target in [brackets],
# "final", "mid" (between vowels), "onset" (plus ms of the next vowel) or "burst", speed,
# and ms (burst length, or how much vowel for onset).
EXTRA = {
    # Short i said alone starts breathy, and cut from a word it keeps a trace of the
    # consonants around it, so: the vowel's steady middle, 70 ms trimmed off each end (core).
    # Picked by ear from it, in, sit, fish and kid, 40 or 70 ms, held or not.
    "i": [("core70-kid-slow", "k[ˈɪ]d", "core", SLOW, 70)],
    "g": [(f"final-{w}{'-slow' if sp < SPEED else ''}", ps, "final", sp, 0)
          for w, ps in [("bag", "bˈæ[ɡ]"), ("big", "bˈɪ[ɡ]"), ("leg", "lˈɛ[ɡ]"), ("egg", "ˈɛ[ɡ]")] for sp in (SPEED, SLOW)]
         + [(f"burst{ms}-{w}", ps, "burst", SPEED, ms) for w, ps in [("go", "[ɡ]ˈO"), ("get", "[ɡ]ˈɛt"), ("gum", "[ɡ]ˈʌm")] for ms in (40, 50)],
    # At the end of a word j loses its voicing and sounds like "ch"; between vowels it keeps it.
    "j": [(f"mid-{w}{'-slow' if sp < SPEED else ''}", ps, "mid", sp, 0)
          for w, ps in [("magic", "mˈæ[ʤ]ɪk"), ("agent", "ˈA[ʤ]ənt"), ("budget", "bˈʌ[ʤ]ɪt")] for sp in (SPEED, SLOW)]
         + [("jam+20", "[ʤ]ˈæm", "onset", SPEED, 20), ("jet+20", "[ʤ]ˈɛt", "onset", SPEED, 20)],
}
# Sounds made of two picked sounds in a row: label -> (first, its method, second, its
# method, second's length in ms (0 = as is), and gap ms, or a crossfade when negative).
COMBOS = {
    "kw": {"k+w": ("k", "final", "w", "held", 0, 0), "k+w-gap60": ("k", "final", "w", "held", 0, 60),
           "k+w-short": ("k", "final", "w", "held", 180, 0),
           "k+w-short-xf20": ("k", "final", "w", "held", 180, -20), "k+w-short-xf40": ("k", "final", "w", "held", 180, -40),
           "k+w-fast-xf20": ("k", "final", "w", "held", 120, -20), "k+w-fast-xf40": ("k", "final", "w", "held", 120, -40)},
    "j": {"d+zh": ("d", "final", "zh", "held", 0, 0), "d+zh-short": ("d", "final", "zh", "held", 180, 0),
          "d+zh100-xf20": ("d", "final", "zh", "held", 100, -20), "d+zh140-xf20": ("d", "final", "zh", "held", 140, -20),
          "dburst+zh100-xf20": ("d", "burst", "zh", "held", 100, -20), "dburst+zh140-xf20": ("d", "burst", "zh", "held", 140, -20)},
}
PEAK = 0.3  # every candidate is scaled to this peak, about the vowels' natural level
HOLD_MS = 350
# Lead and tail around the cut (ms): a stop needs its burst and a little breath after it
# but none of the next vowel; held sounds and vowels can be cut close.
EDGES = {"stop": (15, 45), "hold": (10, 20), "vowel": (10, 20)}


def candidates(name, word_ps, kind, combos=True, only=None):
    """Every candidate for a sound, or just `only` (one method name)."""
    def want(label):
        return only is None or only == label
    a = word_ps.index("[")
    b = word_ps.index("]") - 1
    ps = word_ps.replace("[", "").replace("]", "")
    target = ps[a:b]
    lead, tail = EDGES[kind]
    out = {}
    if want("alone"):
        out["alone"] = g.cut_phonemes(target if kind != "vowel" or "ˈ" in target else "ˈ" + target, VOICE, SPEED)
    if want("word") or (kind == "hold" and want("stretch")):
        out["word"] = g.cut_phonemes(ps, VOICE, SPEED, a, b, lead, tail)
    if kind != "stop" and want("slow"):
        out["slow"] = g.cut_phonemes(ps, VOICE, SLOW, a, b, lead, tail)
    if name in FINAL:
        # burst: the end of the stop at the start of a word (its release), stopping before
        # the vowel; final: the stop at the end of a word, released into silence.
        if want("burst"):
            out["burst"] = g.cut_phonemes(ps, VOICE, SPEED, a, b, 0, 30)[-int(0.07 * g.SR):]
        if want("final"):
            fw, fps = FINAL[name]
            fa, fb = fps.index("["), fps.index("]") - 1
            out["final"] = g.cut_phonemes(fps.replace("[", "").replace("]", ""), VOICE, SPEED, fa, fb, 0, 150)
    for label, xps, mode, sp, ms in EXTRA.get(name, []):
        if not want(label):
            continue
        xa, xb = xps.index("["), xps.index("]") - 1
        plain = xps.replace("[", "").replace("]", "")
        if mode == "final":
            out[label] = g.cut_phonemes(plain, VOICE, sp, xa, xb, 0, 150)
        elif mode == "mid":  # between vowels: stop where the next vowel starts
            out[label] = g.cut_phonemes(plain, VOICE, sp, xa, xb, 0, 0)
        elif mode == "core":  # a vowel's steady middle: ms cut off each end
            out[label] = g.cut_phonemes(plain, VOICE, sp, xa, xb, -ms, -ms)
        elif mode == "onset":  # the sound and the first ms of the vowel after it
            out[label] = g.cut_phonemes(plain, VOICE, sp, xa, xb, 10, ms)
        else:
            out[label] = g.cut_phonemes(plain, VOICE, sp, xa, xb, 0, 30)[-int(ms / 1000 * g.SR):]
    for label, (first, m1, second, m2, length, gap) in (COMBOS.get(name, {}).items() if combos else []):
        if want(label):
            out[label] = join(part(first, m1), part(second, m2, length), gap)
    if kind == "hold":
        if want("held"):
            out["held"] = g.cut_phonemes(target * 3, VOICE, SLOW)
        if want("stretch"):
            out["stretch"] = stretch(out["word"], HOLD_MS)
    if only is not None:
        if only not in out:
            raise KeyError(f"{name} has no method {only}")
        return {only: out[only]}
    return out


PICKS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "picks.json")))


def finish(audio):
    """Trimmed and at the common peak: how every candidate and every final sound is saved."""
    audio = g.trim(audio, g.SR, threshold=0.004, pad=0.02)
    if np.abs(audio).max() > 0.001:
        audio = audio * (PEAK / np.abs(audio).max())
    return audio


def render(name):
    """The recording for one sound, made the way picks.json says (used by ../generate.py)."""
    row = next(r for r in SOUNDS if r[0] == name)
    method = PICKS[name]
    return finish(candidates(row[0], row[2], row[3], only=method)[method])


# Blends (js/phonics.js, blendsIn): the two picked sounds, the first cut to BLEND_HOLD_MS
# when it's one you can hold (f, s, l…; a stop is short already), overlapped by
# BLEND_OVERLAP_MS. Picked by ear ("f220+r-xf30") from 150/220 ms, 0/30 ms, the second
# shortened or not, and the pair cut from a word. When the second is a stop (n+d in hand),
# overlapping fades out its burst, so it comes BLEND_STOP_GAP_MS after the first instead, the
# way a stop starts with a moment's closure (picked by ear from overlap 30, 0, gap 30/60/90).
BLEND_HOLD_MS, BLEND_OVERLAP_MS, BLEND_STOP_GAP_MS = 220, 30, 90


def blend(name):
    """A blend ("f+r") and where its second sound starts, in samples from the start."""
    a, b = name.split("+")
    hold = next(r for r in SOUNDS if r[0] == a)[3] == "hold"
    x = part(a, PICKS[a], BLEND_HOLD_MS if hold else 0)
    y = part(b, PICKS[b])
    if next(r for r in SOUNDS if r[0] == b)[3] == "stop":
        audio = join(x, y, BLEND_STOP_GAP_MS)
        split = len(x) + BLEND_STOP_GAP_MS * g.SR // 1000  # where the stop starts
    else:
        audio = join(x, y, -BLEND_OVERLAP_MS)
        split = len(x) - BLEND_OVERLAP_MS * g.SR // 1000 // 2  # the middle of the overlap
    # finish() trims leading quiet (keeping 20 ms); move the split with it.
    loud = np.flatnonzero(np.abs(audio) > 0.004)
    cut = max(0, loud[0] - int(0.02 * g.SR)) if len(loud) else 0
    return finish(audio), split - cut


def part(name, method, length_ms=0):
    """One sound's candidate, trimmed, cut to length_ms (with a fade) and at the common peak."""
    row = next(r for r in SOUNDS if r[0] == name)
    a = g.trim(candidates(row[0], row[2], row[3], combos=False, only=method)[method], g.SR, threshold=0.004, pad=0.0).copy()
    if length_ms:
        a = a[: length_ms * g.SR // 1000]
        f = min(len(a) // 3, 30 * g.SR // 1000)
        a[-f:] *= np.linspace(1, 0, f)
    return a * (PEAK / max(np.abs(a).max(), 1e-6))


def join(a, b, gap_ms):
    """a then b: with a silent gap, or overlapping (crossfaded) when gap_ms is negative."""
    if gap_ms >= 0:
        return np.concatenate([a, np.zeros(gap_ms * g.SR // 1000, np.float32), b])
    x = min(-gap_ms * g.SR // 1000, len(a), len(b))
    mid = a[-x:] * np.linspace(1, 0, x) + b[:x] * np.linspace(0, 1, x)
    return np.concatenate([a[:-x], mid, b[x:]])


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
    only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None  # e.g. "i,e": just those sounds
    g.load(model_dir)
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for name, word, word_ps, kind in SOUNDS:
        if only and name not in only:
            continue
        cells = []
        for method, audio in candidates(name, word_ps, kind).items():
            audio = finish(audio)
            fname = f"{name}-{method}.mp3"
            with open(os.path.join(out_dir, fname), "wb") as f:
                f.write(g.mp3(audio, g.SR))
            ms = int(1000 * len(audio) / g.SR)
            cells.append(f'<span class="cand"><button data-src="{fname}">▶ {method}</button><small>{ms} ms</small>'
                         f'<label><input type="radio" name="{name}" value="{method}"> pick</label></span>')
        cells.append(f'<span class="cand"><label><input type="radio" name="{name}" value="none"> none good</label></span>')
        label = word + (f" / {FINAL[name][0]}" if name in FINAL else "")
        rows.append(f"<tr><th>{html.escape(name)}</th><td>{html.escape(label)}</td><td>{kind}</td><td>{''.join(cells)}</td></tr>")
        print(f"{name}: {len(cells)} candidates", flush=True)
    with open(os.path.join(out_dir, "index.html"), "w") as f:
        f.write("""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Sound candidates</title>
<style>body{font:16px system-ui;margin:16px}table{border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
button{font:inherit;padding:8px 12px;margin-right:6px;border-radius:8px;border:1px solid #bbb;background:#f6f8fb}small{color:#777;margin-right:6px}label{white-space:nowrap;font-size:14px}.cand{display:inline-block;margin:3px 8px 3px 0;padding:4px 6px;border:1px solid #e3e7ee;border-radius:10px}td,th{vertical-align:top}</style>
<h1>Sound candidates</h1><p>Each sound several ways: <b>alone</b> (said by itself), <b>word</b> (cut from the example word), <b>slow</b> (the same, slower), and for sounds you can hold, <b>held</b> (written three times) and <b>stretch</b> (the word's cut, held longer). Pick the clearest one for each sound: stops clipped ("k", not "kuh"), held sounds held briefly ("mmm").</p>
<table><tr><th>sound</th><th>as in</th><th>type</th><th>candidates</th></tr>
""" + "\n".join(rows) + """</table>
<p><button id="copy">Copy picks</button> <span id="msg"></span></p>
<script>
// iPad Safari won't play media from a server without byte ranges (python -m http.server),
// so every clip is fetched once into memory and played from there, straight from the tap.
// A few at a time, retrying any that come back empty (the simple server drops some
// under 160 at once); a button works once its clip is in.
const player = new Audio(), clips = {};
const queue = [...document.querySelectorAll("button[data-src]")];
queue.forEach((b) => {
  b.disabled = true;
  b.onclick = () => { player.src = clips[b.dataset.src]; player.play(); };
});
async function load(b, tries = 4) {
  try {
    const r = await fetch(b.dataset.src, { cache: "no-store" });
    const blob = await r.blob();
    if (!r.ok || !blob.size) throw new Error("empty");
    clips[b.dataset.src] = URL.createObjectURL(new Blob([blob], { type: "audio/mpeg" }));
    b.disabled = false;
  } catch (e) { if (tries > 1) return load(b, tries - 1); b.title = "couldn't load"; }
}
for (let i = 0; i < 6; i++) (async function worker() { for (let b; (b = queue.shift()); ) await load(b); })();
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
