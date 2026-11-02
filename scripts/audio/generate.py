# Renders clips with Kokoro and encodes them as MP3:
#   python generate.py <model-dir> <missing.json> <out-dir>
# missing.json is a list of { key, text, voice, speed, method } from build.mjs.
#
# Methods:
#   text  kokoro.create(text): sentences and phrases.
#   cut   words and Clap it syllables. Said alone, a short word gains sounds ("pub" ->
#         "pubby", "stomp" -> "istampy"), so the target is said at the end of a phrase
#         ("and next, pub.") and cut out using the model's own per-phoneme durations.
#         Phonemes are espeak's, mapped to misaki's alphabet (what Kokoro was trained on).
#         See scripts/audio/eval/README.md for how this was chosen.
import json
import os
import re
import sys

import lameenc
import numpy as np
import onnx
import onnxruntime as rt
import phonemizer
from kokoro_onnx import Kokoro
from onnx import TensorProto, helper

model_dir, plan_path, out_dir = sys.argv[1:4]
model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
kokoro = Kokoro(model_path, os.path.join(model_dir, "voices-v1.0.bin"))
SR = 24000


def trim(audio, sr, threshold=0.01, pad=0.05):
    """Drop leading/trailing silence (keeping a little padding) so Clap it beats and
    taps respond quickly."""
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if not len(loud):
        return audio
    p = int(sr * pad)
    return audio[max(0, loud[0] - p): loud[-1] + p]


def mp3(audio, sr):
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


# --- cut method ---------------------------------------------------------------------

_session = None


def session():
    """The Kokoro model with its per-token durations (frames) exposed as a second output."""
    global _session
    if _session is None:
        m = onnx.load(model_path)
        m.graph.output.append(helper.make_tensor_value_info("/encoder/Clip_output_0", TensorProto.FLOAT, None))
        _session = rt.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])
    return _session


_espeak = None
# espeak -> misaki symbols (as in misaki's espeak fallback), plus r-colored vowels: espeak
# writes "ur/er" as "ɜː", which Kokoro says without the r ("zurv" -> "zev").
E2M = sorted({
    'ʔˌn̩': 'ʔn', 'ʔn̩': 'ʔn', 'a^ɪ': 'I', 'a^ʊ': 'W', 'd^ʒ': 'ʤ', 'e^ɪ': 'A', 'e': 'A', 't^ʃ': 'ʧ',
    'ɔ^ɪ': 'Y', 'ə^l': 'ᵊl', 'ʲo': 'jo', 'ʲə': 'jə', 'ʲ': '', 'ɚ': 'əɹ', 'r': 'ɹ', 'x': 'k', 'ç': 'k',
    'ɐ': 'ə', 'ɬ': 'l', '̃': '',
}.items(), key=lambda kv: -len(kv[0]))


def phonemes(text):
    global _espeak
    if _espeak is None:  # after Kokoro(), which points phonemizer at its bundled espeak-ng
        _espeak = phonemizer.backend.EspeakBackend(language="en-us", preserve_punctuation=True, with_stress=True, tie="^")
    ps = _espeak.phonemize([text])[0].strip()
    for o, n in E2M:
        ps = ps.replace(o, n)
    ps = re.sub(r'(\S)̩', r'ᵊ\1', ps).replace(chr(809), '')
    ps = ps.replace('o^ʊ', 'O').replace('ɜːɹ', 'ɜɹ').replace('ɜː', 'ɜɹ').replace('ɪə', 'iə').replace('ː', '')
    return ps.replace('o', 'ɔ').replace('ɾ', 'T').replace('ʔ', 't').replace('^', '')


CARRIER = ("ənd nˈɛkst, ", ".")  # "and next, ___." The comma's pause gives the target a clean start.
LEAD_MS, TAIL_MS = 60, 30  # cut a little before the first phoneme (stop bursts) and after the last
FADE_MS = (10, 40)


def cut(text, voice, speed):
    tok = kokoro.tokenizer.tokenize
    pre, post = CARRIER
    ps = phonemes(text)
    toks = tok(pre + ps + post)
    style = kokoro.voices[voice][len(toks)]
    audio, dur = session().run(None, {"tokens": [[0, *toks, 0]], "style": style, "speed": np.array([speed], np.float32)})
    dur = dur.reshape(-1)
    spf = len(audio) / dur.sum()  # samples per duration frame
    i0 = 1 + len(tok(pre))  # +1 for the start token
    i1 = i0 + len(tok(ps))
    s0 = max(0, int(dur[:i0].sum() * spf) - LEAD_MS * SR // 1000)
    s1 = int(dur[:i1].sum() * spf) + TAIL_MS * SR // 1000
    a = audio[s0:s1].copy()
    n, o = FADE_MS[0] * SR // 1000, FADE_MS[1] * SR // 1000
    a[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    a[-o:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, o))
    return a


items = json.load(open(plan_path))
for i, item in enumerate(items, 1):
    if item.get("method") == "cut":
        audio, sr = cut(item["text"], item["voice"], item["speed"]), SR
    else:
        audio, sr = kokoro.create(item["text"], voice=item["voice"], speed=item["speed"], lang="en-us")
    with open(os.path.join(out_dir, item["key"] + ".mp3"), "wb") as f:
        f.write(mp3(trim(audio, sr), sr))
    if i % 25 == 0 or i == len(items):
        print(f"generated {i}/{len(items)}", flush=True)
