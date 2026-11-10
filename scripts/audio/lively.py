# Livelier phrases and quips, picked by ear (Nov 2026). Kept apart from kokoro_core.py so
# changing these doesn't touch the Sound it out sounds (SOUND_INPUTS in build.mjs).
#
#   lift     the line in our spelling (phonemes(): misaki symbols, what Kokoro was trained
#            on, which already sounds brighter than Kokoro's own spelling; spell()), with its pitch
#            edited: higher, a wider range, and the last ~150 ms of voicing lifted, so it
#            sounds pleased rather than flat. Every phrase and quip.
#   excited  the line after an excited lead-in ("Wow, look at that!") and before a long tail,
#            then cut out: for lines with pauses inside, where lift alone sounded stiff.
#
# Both run the model with its pitch (F0) and energy, or its durations, exposed: the ONNX graph
# gets those tensors as outputs, or takes them as inputs in place of the nodes that make them.
# Everything is deterministic, so the same text always makes the same clip.
import re

import numpy as np
import onnx
import onnxruntime as rt
from onnx import TensorProto, helper

import kokoro_core as core
from kokoro_core import SR, phonemes, trim

DUR, F0, NN = "/encoder/Clip_output_0", "/encoder/Reshape_output_0", "/encoder/Reshape_1_output_0"
# The pitch edit: F0 = mean * HIGHER + (F0 - mean) * WIDER on voiced frames (12.5 ms each),
# then the last LIFT_FRAMES voiced frames ramp up to * LIFT.
HIGHER, WIDER, LIFT, LIFT_FRAMES = 1.12, 1.45, 1.2, 12
EXCITED = "Wow, look at that!"
TAIL = ("and then we keep on going for a little while longer, just like before, "
        "and on and on we go, all the way to the end.")

_probe = _with_f0 = None


def _session(remove, add_out):
    m = onnx.load(core.model_path)
    for name in add_out:
        m.graph.output.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, None))
    for name in remove:
        node = next(n for n in m.graph.node if name in n.output)
        m.graph.node.remove(node)
        m.graph.input.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, None))
    return rt.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])


def _run(sess, toks, style, speed, extra=None):
    feed = {"tokens": [[0, *toks, 0]], "style": style, "speed": np.array([speed], np.float32)}
    feed.update(extra or {})
    return sess.run(None, feed)


def _sessions():
    global _probe, _with_f0
    if _probe is None:
        _probe = _session([], [DUR, F0, NN])  # audio, durations, F0, energy
        _with_f0 = _session([F0, NN], [])     # F0 and energy as inputs
    return _probe, _with_f0


def spell(text):
    """Our spelling, except the word "I" as Kokoro's own spelling has it (aɪ): misaki's single
    "I" symbol came out too faint to hear at the start of a line ("I hear the ocean!")."""
    return re.sub(r"(?<![^\s.,!?;:…—\"(])I(?![^\W\d_])", "aɪ", phonemes(text))


def lift(text, voice, speed):
    probe, with_f0 = _sessions()
    toks = core.kokoro.tokenizer.tokenize(spell(text))
    style = core.kokoro.voices[voice][len(toks)]
    _, _, f0, nn = _run(probe, toks, style, speed)
    f0 = f0.copy()
    voiced = f0 > 50
    if voiced.any():
        mu = f0[voiced].mean()
        f0[voiced] = mu * HIGHER + (f0[voiced] - mu) * WIDER
        end = np.where(voiced.reshape(-1))[0][-LIFT_FRAMES:]
        f0.reshape(-1)[end] *= np.linspace(1, LIFT, len(end))
    return trim(_run(with_f0, toks, style, speed, {F0: f0.astype(np.float32), NN: nn})[0], SR)


def excited(text, voice, speed):
    probe, _ = _sessions()
    tok = core.kokoro.tokenizer.tokenize
    pre, ps = phonemes(EXCITED) + " ", phonemes(text)
    toks = tok(pre + ps + ". " + phonemes(TAIL))
    audio, dur, _, _ = _run(probe, toks, core.kokoro.voices[voice][len(toks)], speed)
    dur = dur.reshape(-1)
    spf = len(audio) / dur.sum()  # samples per duration frame
    i0, i1 = 1 + len(tok(pre)), 1 + len(tok(pre + ps))  # +1 for the start token
    a = audio[max(0, int(dur[:i0].sum() * spf) - 60 * SR // 1000): int(dur[:i1].sum() * spf) + 40 * SR // 1000].copy()
    n, o = core.FADE_MS[0] * SR // 1000, core.FADE_MS[1] * SR // 1000
    a[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    a[-o:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, o))
    return trim(a, SR)
