#!/bin/sh
# One-time setup inside the container (via run.sh): venvs and model files under /work.
#   venv     the app's pinned Kokoro deps (+ onnx, to expose per-phoneme durations)
#   misvenv  misaki (Kokoro's own G2P) and the wav2vec2 phoneme recognizer
#   asrvenv  faster-whisper
set -eu
cd /work
[ -d venv ] || {
  python3 -m venv venv
  venv/bin/pip install -q --disable-pip-version-check --require-hashes -r /audio/requirements.txt
  venv/bin/pip install -q --disable-pip-version-check onnx
}
[ -d misvenv ] || {
  python3 -m venv misvenv
  misvenv/bin/pip install -q --disable-pip-version-check "misaki[en]" transformers torch soundfile phonemizer-fork espeakng-loader
  misvenv/bin/python -m spacy download en_core_web_sm -q
}
[ -d asrvenv ] || {
  python3 -m venv asrvenv
  asrvenv/bin/pip install -q --disable-pip-version-check faster-whisper soundfile
}
mkdir -p kokoro
release=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -f kokoro/kokoro-v1.0.onnx ] || curl -fsSL -o kokoro/kokoro-v1.0.onnx "$release/kokoro-v1.0.onnx"
[ -f kokoro/voices-v1.0.bin ] || curl -fsSL -o kokoro/voices-v1.0.bin "$release/voices-v1.0.bin"
(cd kokoro && sha256sum -c - <<EOF
7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5  kokoro-v1.0.onnx
bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin
EOF
)
echo setup done
