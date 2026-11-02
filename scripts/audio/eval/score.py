# Scores variants against the expected phonemes (host Python, no deps):
#   python3 score.py <work-dir> <variant...>  -> summary per variant and kind, <work-dir>/scores.json
# Expected = the e2m phonemes (misaki-style, from espeak), so out/e2m/meta.json must exist.
# ph_exact: recognized phonemes match exactly; ph_ed_sum: total edit distance (lower is better);
# tailvowel: an extra vowel after a final consonant ("pub" -> "pubby"); asr_ok: Whisper heard
# the text (rarely true for syllables, which aren't words).
import json
import os
import re
import sys

W = sys.argv[1]
plan = {c["id"]: c for c in json.load(open(f"{W}/plan.json")) if c["kind"] in "ws"}
ref = json.load(open(f"{W}/out/e2m/meta.json"))
VOW = set("aeiouæɑɐɒɔəɛɜɪʊʌɚɝᵻ")


def norm(p):
    p = p.replace(" ", "")
    for a, b in [("A", "eɪ"), ("I", "aɪ"), ("O", "oʊ"), ("W", "aʊ"), ("Y", "ɔɪ"), ("ʤ", "dʒ"), ("ʧ", "tʃ"), ("T", "t"),
                 ("ᵊ", "ə"), ("ɚ", "əɹ"), ("ɝ", "ɜɹ"), ("ː", ""), ("ˈ", ""), ("ˌ", ""), ("ɾ", "t"), ("ɐ", "ə"), ("ᵻ", "ɪ"),
                 ("ɡ", "g"), ("r", "ɹ"), ("ɫ", "l"), ("ɜɹ", "əɹ"), ("ɜ", "əɹ"), ("əɹɹ", "əɹ"), ("ɒ", "ɑ"), ("e", "eɪ"),
                 ("eɪɪ", "eɪ"), ("o", "oʊ"), ("oʊʊ", "oʊ"), (".", ""), ("ʔ", "t")]:
        p = p.replace(a, b)
    return re.sub(r"ɔ(?![ɪɹ])", "ɑ", p)  # cot-caught


def ed(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (x != y))
    return d[-1]


def load(p):
    return json.load(open(p)) if os.path.exists(p) else {}


res = {}
for v in sys.argv[2:]:
    Wh, P = load(f"{W}/out/{v}/whisper.json"), load(f"{W}/out/{v}/phrec.json")
    rows = {}
    for i, c in plan.items():
        e, g = norm(ref[i]["ps"]), norm(P.get(i, ""))
        w = Wh.get(i, {}).get("text", "")
        rows[i] = dict(exp=e, got=g, ped=ed(e, g),
                       tail=bool(e and g and e[-1] not in VOW and g[-1] in VOW), asr=w,
                       asr_ok=re.sub(r"[^a-z']", "", w.lower()) == re.sub(r"[^a-z']", "", c["text"].lower()))
    res[v] = rows
json.dump(res, open(f"{W}/scores.json", "w"), ensure_ascii=False)
for v, rows in res.items():
    for kind in "ws":
        R = [r for i, r in rows.items() if i[0] == kind]
        print(f"{v:12s} {kind} n={len(R)} asr_ok={sum(r['asr_ok'] for r in R)} ph_exact={sum(r['ped'] == 0 for r in R)} "
              f"ph_ed_sum={sum(r['ped'] for r in R)} tailvowel={sum(r['tail'] for r in R)}")
