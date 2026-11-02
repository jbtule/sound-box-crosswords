# Whisper transcripts:  asrvenv/bin/python /src/asr.py <variant...> -> /work/out/<v>/whisper.json
# Run with HF_HOME=/work/models. Slow in the container (~10 min per variant); on a Mac,
# asr_mlx.py does the same on the GPU.
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from faster_whisper import WhisperModel  # noqa: E402
from load16 import load16  # noqa: E402

m = WhisperModel("small.en", device="cpu", compute_type="int8", download_root="/work/models")
for v in sys.argv[1:]:
    res = {}
    for f in sorted(glob.glob(f"/work/out/{v}/*.wav")):
        segs, _ = m.transcribe(load16(f), language="en", beam_size=5, word_timestamps=True,
                               condition_on_previous_text=False, vad_filter=False)
        segs = list(segs)
        words = [(w.word, round(w.probability, 3), round(w.start, 2), round(w.end, 2)) for s in segs for w in s.words]
        res[os.path.basename(f)[:-4].replace("_", ":", 1)] = {"text": "".join(s.text for s in segs).strip(), "words": words}
    json.dump(res, open(f"/work/out/{v}/whisper.json", "w"), ensure_ascii=False, indent=0)
    print("whisper", v, len(res), flush=True)
