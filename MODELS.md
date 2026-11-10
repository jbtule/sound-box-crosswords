# Models

Sound Box Crosswords' recorded voice is made ahead of time, when the site is deployed. No
model runs in the app or on a player's device: the app plays MP3 clips, and when a clip
isn't there (Custom words, no connection) it uses the device's own built-in voice.

## The voice: Kokoro

| Part | What it is | License |
| --- | --- | --- |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | The text-to-speech model, v1.0, voice `af_heart` | Apache 2.0 |
| [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | Runs the model, and provides the ONNX weights and voices file used here | MIT |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime), [onnx](https://github.com/onnx/onnx) | Run the model; read its per-sound timings and pitch | MIT, Apache 2.0 |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) (through [phonemizer-fork](https://pypi.org/project/phonemizer-fork/) and [espeakng-loader](https://github.com/thewh1teagle/espeakng-loader)) | Turns text into the speech sounds Kokoro reads | GPL-3.0 (espeakng-loader: MIT) |
| [lameenc](https://pypi.org/project/lameenc/) | Encodes the clips as MP3 | LGPL-3.0 or later |

These run only in the deploy's build step (`scripts/audio/`, hash-pinned in
`requirements.txt`, model files checked against known checksums in `kokoro.sh`). None of
them is part of the site; the site ships only the finished clips.

What gets recorded: every pack word, each *Break it down* syllable, the context sentences,
fixed phrases ("You solved it!", achievement titles), and the 46 single sounds and the
blends for *Sound it out*. Words and syllables are said at the end of a short phrase and cut
out, because the model mispronounces some of them alone; `scripts/audio/generate.py` and
`scripts/audio/eval/README.md` explain how that was chosen. Phrases and
quips are made livelier by editing the model's own pitch before it speaks, and the dragon's quip
is said after an excited lead-in and cut out (`scripts/audio/lively.py`). Both were picked by ear. The clips are part of this
project and covered by its license (see the [README](README.md#license)).

## For testing only

[Whisper](https://github.com/openai/whisper) small.en (MIT) is used in `scripts/audio/eval/`
to check whether recorded words are understood. It doesn't make or change any clip.
