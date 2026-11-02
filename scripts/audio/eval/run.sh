#!/bin/sh
# Runs a command in a Linux python:3.12 container (Kokoro's espeak only works on Linux):
#   sh scripts/audio/eval/run.sh <work-dir> <command...>
# <work-dir> is mounted at /work (venvs, models, clips, results); this folder at /src and
# scripts/audio at /audio (for the app's pinned requirements.txt).
set -eu
work=$(cd "$1" && pwd); shift
src=$(cd "$(dirname "$0")" && pwd)
exec container run --rm --cpus 4 --memory 6g \
  --mount type=virtiofs,source="$work",target=/work \
  --mount type=virtiofs,source="$src",target=/src,readonly \
  --mount type=virtiofs,source="$src/..",target=/audio,readonly \
  --workdir /work docker.io/library/python:3.12 "$@"
