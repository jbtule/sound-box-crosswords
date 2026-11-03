# Renders clips with Kokoro and encodes them as MP3:
#   python generate.py <model-dir> <missing.json> <out-dir>
# missing.json is a list of { key, text, voice, speed, method } from build.mjs.
#
# Methods:
#   text  kokoro.create(text): sentences and phrases.
#   sound a single sound for Sound it out (text = its name, e.g. "sh"), made the way
#         sounds/picks.json says by sounds/lab.py, where the methods were tried by ear.
#   cut   words and Break it down syllables. Said alone, a short word gains sounds ("pub" ->
#         "pubby", "stomp" -> "istampy"), so the target is said at the end of a phrase
#         ("and next, pub.") and cut out using the model's own per-phoneme durations.
#         Phonemes are espeak's, mapped to misaki's alphabet (what Kokoro was trained on).
#         See scripts/audio/eval/README.md for how this was chosen.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # kokoro.sh runs this with -I
import kokoro_core as core  # noqa: E402
from kokoro_core import SR, cut_phonemes, mp3, phonemes, trim  # noqa: E402


def cut(text, voice, speed):
    return cut_phonemes(phonemes(text), voice, speed)


# "lively": the text said alone with the voice style Kokoro uses for a long sentence, which
# sounds brighter on a short line. Picked by ear for "New achievement!".
LIVELY_STYLE = 120


def lively(text, voice, speed):
    return cut_phonemes(phonemes(text), voice, speed, tail_ms=120, carrier=("", ""), style_n=LIVELY_STYLE)


_lab = None


def sound(name):
    """One Sound it out sound, already trimmed and leveled (sounds/lab.py)."""
    global _lab
    if _lab is None:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "sounds"))
        import lab
        _lab = lab
    return _lab.render(name)


def main():
    model_dir, plan_path, out_dir = sys.argv[1:4]
    core.load(model_dir)
    items = json.load(open(plan_path))
    for i, item in enumerate(items, 1):
        if item.get("method") == "sound":
            audio, sr = sound(item["text"]), SR  # trimmed and leveled already
        elif item.get("method") == "cut":
            audio, sr = trim(cut(item["text"], item["voice"], item["speed"]), SR), SR
        elif item.get("method") == "lively":
            audio, sr = trim(lively(item["text"], item["voice"], item["speed"]), SR), SR
        else:
            audio, sr = core.kokoro.create(item["text"], voice=item["voice"], speed=item["speed"], lang="en-us")
            audio = trim(audio, sr)
        with open(os.path.join(out_dir, item["key"] + ".mp3"), "wb") as f:
            f.write(mp3(audio, sr))
        if i % 25 == 0 or i == len(items):
            print(f"generated {i}/{len(items)}", flush=True)


if __name__ == "__main__":
    main()
