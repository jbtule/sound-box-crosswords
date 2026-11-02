# Whisper on the Mac GPU (no container):  python -I asr_mlx.py <out-dir> <variant...>
# Setup: python3.12 -m venv v && v/bin/pip install mlx-whisper
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlx_whisper  # noqa: E402
from load16 import load16  # noqa: E402

M = "mlx-community/whisper-small.en-mlx"
root = sys.argv[1]
for v in sys.argv[2:]:
    res = {}
    for f in sorted(glob.glob(f"{root}/{v}/*.wav")):
        r = mlx_whisper.transcribe(load16(f), path_or_hf_repo=M, language="en", word_timestamps=True,
                                   condition_on_previous_text=False, temperature=0.0, verbose=None)
        words = [(w["word"], round(w["probability"], 3), round(w["start"], 2), round(w["end"], 2))
                 for s in r["segments"] for w in s.get("words", [])]
        res[os.path.basename(f)[:-4].replace("_", ":", 1)] = {"text": r["text"].strip(), "words": words}
    json.dump(res, open(f"{root}/{v}/whisper.json", "w"), ensure_ascii=False, indent=0)
    print("whisper", v, len(res), flush=True)
