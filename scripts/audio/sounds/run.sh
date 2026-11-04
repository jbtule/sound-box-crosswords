#!/bin/sh
# Makes the sound candidates and their listening page in a Linux container (Kokoro's
# espeak doesn't work on macOS): sh scripts/audio/sounds/run.sh <model-dir> <out-dir>
# Optional third argument: just those sounds, e.g. "i,e".
# <model-dir> needs kokoro-v1.0.onnx and voices-v1.0.bin (see ../kokoro.sh for the URLs and
# checksums); a Python venv is made there on the first run. Then open <out-dir>/index.html.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
models=$(cd "$1" && pwd)
mkdir -p "$2"; out=$(cd "$2" && pwd)
container run --rm --memory 4G \
  --mount type=virtiofs,source="$here",target=/a \
  --mount type=virtiofs,source="$models",target=/w \
  --mount type=virtiofs,source="$out",target=/o \
  docker.io/library/python:3.12-slim sh -c '
    cd /w && { [ -x venv/bin/python ] || python3 -m venv venv; } &&
    venv/bin/pip install --quiet --disable-pip-version-check --require-hashes -r /a/requirements.txt &&
    venv/bin/python -I /a/sounds/lab.py /w /o $1' sh "${3:-}"
