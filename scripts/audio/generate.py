# Renders clips with Kokoro and encodes them as MP3:
#   python generate.py <model-dir> <missing.json> <out-dir>
# missing.json is a list of { key, text, voice, speed } from build.mjs.
import json
import os
import sys

import lameenc
import numpy as np
from kokoro_onnx import Kokoro

model_dir, plan_path, out_dir = sys.argv[1:4]
kokoro = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))


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


items = json.load(open(plan_path))
for i, item in enumerate(items, 1):
    audio, sr = kokoro.create(item["text"], voice=item["voice"], speed=item["speed"], lang="en-us")
    with open(os.path.join(out_dir, item["key"] + ".mp3"), "wb") as f:
        f.write(mp3(trim(audio, sr), sr))
    if i % 25 == 0 or i == len(items):
        print(f"generated {i}/{len(items)}", flush=True)
