#!/bin/sh
# Generates MP3 clips with Kokoro: sh scripts/audio/kokoro.sh <missing.json> <out-dir>
# Called by build.mjs only when clips are missing. Linux only (the macOS espeak-ng wheel
# looks for its data at its build machine's path); locally, run it with Apple's
# `container` in a python:3.12 image.
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
work=${RUNNER_TEMP:-/tmp}/kokoro
mkdir -p "$work"

# Exact versions with hashes (requirements.txt), in a throwaway venv.
python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet --disable-pip-version-check --require-hashes -r "$dir/requirements.txt"

# Model files from the kokoro-onnx release, checked against known hashes.
release=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
curl -fsSL -o "$work/kokoro-v1.0.onnx" "$release/kokoro-v1.0.onnx"
curl -fsSL -o "$work/voices-v1.0.bin" "$release/voices-v1.0.bin"
(cd "$work" && sha256sum -c - <<EOF
7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5  kokoro-v1.0.onnx
bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin
EOF
)

"$work/venv/bin/python" -I "$dir/generate.py" "$work" "$1" "$2"
