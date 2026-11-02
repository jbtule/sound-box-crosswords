# Misaki (Kokoro's own G2P) phonemes for every clip in the plan, espeak as fallback.
#   misvenv/bin/python -I /src/mis.py  -> /work/misaki.json { id: phonemes }
import json

from misaki import en, espeak

g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
plan = json.load(open("/work/plan.json"))
out = {c["id"]: g2p(c["text"])[0] for c in plan}
json.dump(out, open("/work/misaki.json", "w"), ensure_ascii=False, indent=0)
for i in ["w:stomp", "w:observe", "s:pub", "s:zurv", "s:ub", "w:publish"]:
    print(i, out.get(i))
