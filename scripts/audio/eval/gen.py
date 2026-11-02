# Renders word (w) and syllable (s) clips several ways, for scoring:
#   venv/bin/python -I /src/gen.py <variant>... [--kinds=ws] [--ids=s:pub,w:stomp]
#   -> /work/out/<variant>/<id>.wav + meta.json
#
# Variant = <phonemes>[:<how>][@speed][#style-len]
#   phonemes  base  the app today: kokoro.create(text), espeak G2P inside kokoro-onnx
#             esp   same espeak phonemes, fed through the raw session below
#             e2m   espeak phonemes mapped to misaki's alphabet (what Kokoro was trained on)
#             mis   misaki G2P (needs /work/misaki.json from mis.py)
#   how       (none) as is | dot  add "." | excl  add "!"
#             say/word/fin/ini  speak it inside a carrier phrase and cut it out using the
#             model's per-phoneme durations (exposed from the ONNX graph)
#   @speed    override the plan's speed;  #N  use style vector N instead of len(tokens)
#   +N, ~N    carrier cuts: start N ms before the target / end N ms after it (default 30)
import json
import os
import re
import sys
import wave

import numpy as np
import onnx
import onnxruntime as rt
import phonemizer
from kokoro_onnx import Kokoro
from onnx import TensorProto, helper

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opt = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
kinds = opt.get("kinds", "ws")
ids = set(opt["ids"].split(",")) if "ids" in opt else None
plan = [c for c in json.load(open("/work/plan.json")) if c["kind"] in kinds and (ids is None or c["id"] in ids)]

MODEL, VOICES = "/work/kokoro/kokoro-v1.0.onnx", "/work/kokoro/voices-v1.0.bin"
k = Kokoro(MODEL, VOICES)
m = onnx.load(MODEL)
# Rounded, clipped per-token durations (frames). Found by walking the graph from Round.
m.graph.output.append(helper.make_tensor_value_info("/encoder/Clip_output_0", TensorProto.FLOAT, None))
so = rt.SessionOptions()
so.intra_op_num_threads = 4
sess = rt.InferenceSession(m.SerializeToString(), so, providers=["CPUExecutionProvider"])
VOICE = k.voices["af_heart"]
be = phonemizer.backend.EspeakBackend(language="en-us", preserve_punctuation=True, with_stress=True, tie="^")

# espeak -> misaki symbols (after misaki's own espeak fallback), plus fixes for r-colored
# vowels: espeak gives "ɜː" for "ur/er", which Kokoro says without the r ("zurv" -> "zev").
E2M = sorted({
    'ʔˌn̩': 'ʔn', 'ʔn̩': 'ʔn', 'a^ɪ': 'I', 'a^ʊ': 'W', 'd^ʒ': 'ʤ', 'e^ɪ': 'A', 'e': 'A', 't^ʃ': 'ʧ',
    'ɔ^ɪ': 'Y', 'ə^l': 'ᵊl', 'ʲo': 'jo', 'ʲə': 'jə', 'ʲ': '', 'ɚ': 'əɹ', 'r': 'ɹ', 'x': 'k', 'ç': 'k',
    'ɐ': 'ə', 'ɬ': 'l', '̃': '',
}.items(), key=lambda kv: -len(kv[0]))


def e2m(text):
    ps = be.phonemize([text])[0].strip()
    for o, n in E2M:
        ps = ps.replace(o, n)
    ps = re.sub(r'(\S)̩', r'ᵊ\1', ps).replace(chr(809), '')
    ps = ps.replace('o^ʊ', 'O').replace('ɜːɹ', 'ɜɹ').replace('ɜː', 'ɜɹ').replace('ɪə', 'iə').replace('ː', '')
    return ps.replace('o', 'ɔ').replace('ɾ', 'T').replace('ʔ', 't').replace('^', '')


_mis = None


def mis(c):
    global _mis
    if _mis is None:
        _mis = json.load(open("/work/misaki.json"))
    return _mis[c["id"]].rstrip(".")


def synth(ps, speed, style_len=None):
    toks = k.tokenizer.tokenize(ps)
    style = VOICE[style_len if style_len is not None else len(toks)]
    audio, dur = sess.run(None, {"tokens": [[0, *toks, 0]], "style": style, "speed": np.array([speed], np.float32)})
    return audio, dur.reshape(-1).astype(int)


def trim(audio, sr=24000, threshold=0.01, pad=0.05):  # same as generate.py
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if not len(loud):
        return audio
    p = int(sr * pad)
    return audio[max(0, loud[0] - p): loud[-1] + p]


def fade(a, ms_in, ms_out):
    a = a.copy()
    n, o = int(24 * ms_in), int(24 * ms_out)
    if n:
        a[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    if o:
        a[-o:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, o))
    return a


CARRIERS = {  # misaki phonemes; W = target
    "say": "sˈA W əɡˈɛn.",
    "word": "ðə wˈɜɹd W ɪz hˈɪɹ.",
    "fin": "ðə wˈɜɹd ɪz W.",
    "ini": "W ɪz ðə wˈɜɹd.",
    "finc": "ðə wˈɜɹd ɪz, W.",  # comma: a pause before the target, so its onset stands alone
    "next": "ənd nˈɛkst, W.",
    "then": "ənd ðˈɛn, W.",
    "okay": "ˈOkA, W.",
    "mid": "ənd nˈɛkst, W, ˈOkA.",  # pauses on both sides; the target isn't phrase-final
}


def carrier_cut(ps, tmpl, speed, ext_ms=(0, 30), fades=(10, 40)):
    pre, post = tmpl.split("W")
    full = pre + ps + post
    a, dur = synth(full, speed)
    spf = len(a) / dur.sum()  # samples per duration frame
    i0 = 1 + len(k.tokenizer.tokenize(pre))
    i1 = i0 + len(k.tokenizer.tokenize(ps))
    s0 = int(dur[:i0].sum() * spf - ext_ms[0] * 24)
    s1 = int(dur[:i1].sum() * spf + ext_ms[1] * 24)
    return fade(a[max(0, s0):s1], *fades), dict(spf=spf, full=full)


def run(variant, c):
    v, spd, sl, info = variant, c["speed"], None, {}
    mm = re.search(r"@(\d\.\d+)", v)
    if mm:
        spd, v = float(mm.group(1)), v[:mm.start()] + v[mm.end():]
    mm = re.search(r"#(\d+)", v)
    if mm:
        sl, v = int(mm.group(1)), v[:mm.start()] + v[mm.end():]
    pre, post = 0, 30
    mm = re.search(r"\+(\d+)", v)  # +N: start the cut N ms earlier
    if mm:
        pre, v = int(mm.group(1)), v[:mm.start()] + v[mm.end():]
    mm = re.search(r"~(\d+)", v)  # ~N: end the cut N ms after the target (default 30)
    if mm:
        post, v = int(mm.group(1)), v[:mm.start()] + v[mm.end():]
    t = c["text"]
    v = re.sub(r"^(base|esp|e2m|mis)dot$", r"\1:dot", v)  # e2mdot = e2m:dot
    src, _, how = v.partition(":")
    if src == "base":
        text = t + {"": "", "dot": ".", "excl": "!"}[how]
        a, _ = k.create(text, voice=c["voice"], speed=spd, lang="en-us")
        return trim(a), {"ps": k.tokenizer.phonemize(text, "en-us")}
    ps = {"esp": lambda: k.tokenizer.phonemize(t, "en-us"), "e2m": lambda: e2m(t), "mis": lambda: mis(c)}[src]()
    if how == "":
        a, _ = synth(ps, spd, sl)
    elif how in ("dot", "excl"):
        a, _ = synth(ps + {"dot": ".", "excl": "!"}[how], spd, sl)
    elif how in CARRIERS:
        a, info = carrier_cut(ps, CARRIERS[how], spd, ext_ms=(pre, post))
    else:
        raise SystemExit("bad variant " + variant)
    info["ps"] = ps
    return trim(a), info


for variant in args:
    od = f"/work/out/{variant}"
    os.makedirs(od, exist_ok=True)
    meta = {}
    for c in plan:
        a, info = run(variant, c)
        pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
        with wave.open(f"{od}/{c['id'].replace(':', '_')}.wav", "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(pcm.tobytes())
        info["dur"] = len(a) / 24000
        meta[c["id"]] = info
    json.dump(meta, open(f"{od}/meta.json", "w"), ensure_ascii=False, indent=0)
    print("gen", variant, len(meta), flush=True)
