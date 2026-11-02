# Phoneme recognizer (wav2vec2, espeak IPA): what sounds are actually in each clip.
#   HF_HOME=/work/models misvenv/bin/python /src/phrec.py <variant...> -> /work/out/<v>/phrec.json
import glob
import json
import os
import sys

import espeakng_loader
import torch
from phonemizer.backend.espeak.wrapper import EspeakWrapper
from transformers import AutoModelForCTC, AutoProcessor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load16 import load16  # noqa: E402

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
name = "facebook/wav2vec2-lv-60-espeak-cv-ft"
proc = AutoProcessor.from_pretrained(name, cache_dir="/work/models")
model = AutoModelForCTC.from_pretrained(name, cache_dir="/work/models").eval()
torch.set_num_threads(4)
for v in sys.argv[1:]:
    res = {}
    for f in sorted(glob.glob(f"/work/out/{v}/*.wav")):
        x = proc(load16(f), sampling_rate=16000, return_tensors="pt").input_values
        with torch.no_grad():
            ids = model(x).logits.argmax(-1)
        res[os.path.basename(f)[:-4].replace("_", ":", 1)] = proc.batch_decode(ids)[0]
    json.dump(res, open(f"/work/out/{v}/phrec.json", "w"), ensure_ascii=False, indent=0)
    print("phrec", v, len(res), flush=True)
