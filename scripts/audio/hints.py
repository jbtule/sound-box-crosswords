# Prints how the recording voice will pronounce every (how-it-sounds) hint, next to the
# whole word, so a misread shows before it's recorded: "ick" comes out "Ike" (ˈIk), not
# "ick" (ˈɪk). Phonemes are misaki's (see generate.py): ɪ i (short/long i), æ A (short/long
# a), ɛ, ʌ, ɑ, O (oh), I (eye), ɜɹ (er). Run it with hints.sh.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate as g  # noqa: E402

g.load(sys.argv[1])
for e in json.load(sys.stdin):
    parts = "  ".join(f"{s}={g.phonemes(s)}" for s in e["say"])
    print(f'{e["file"]:28} {e["syll"]:16} {g.phonemes(e["w"]):18} {parts}')
