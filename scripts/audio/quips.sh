#!/bin/sh
# Records quip takes the way the audio build will (the quip voice and speed, "text" method) and
# writes a listening page (quips_page.py) that plays each word's live recording, a beat, then the
# take, as the app does, with a checkbox per take to gather the picks. For picking quips by ear (the write-quips skill):
#   sh scripts/audio/quips.sh <model-dir> <out-dir> < takes.txt
# takes.txt: one take per line, "word | Quip text!" (the word as spelled, no dashes). Then serve
# <out-dir> (python3 -m http.server, or over Tailscale for an iPad) and open it. Runs in a Linux
# container like hints.sh; <model-dir> is the same one (models and a venv).
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
models=$(cd "$1" && pwd)
mkdir -p "$2"
out=$(cd "$2" && pwd)
cat > "$out/takes.txt"
voice=$(cd "$root" && node --input-type=module -e "import { VOICE_FOR } from './scripts/audio/build.mjs'; console.log(VOICE_FOR.q)")
speed=$(cd "$root" && node --input-type=module -e "import { SPEED } from './scripts/audio/build.mjs'; console.log(SPEED.q)")
curl -fsS "https://tools.tuley.name/sound-box-crosswords/audio.json" -o "$out/audio.json" || echo '{"clips":{}}' > "$out/audio.json"
container run --rm --memory 4G \
  --mount type=virtiofs,source="$root/scripts/audio",target=/a \
  --mount type=virtiofs,source="$models",target=/w \
  --mount type=virtiofs,source="$out",target=/o \
  docker.io/library/python:3.12-slim sh -c "
    cd /w && { [ -x venv/bin/python ] || python3 -m venv venv; } &&
    venv/bin/pip install --quiet --disable-pip-version-check --require-hashes -r /a/requirements.txt &&
    venv/bin/python -I /a/quips.py /w /o $voice $speed" 2>&1 | grep -v '^\['
python3 -I "$root/scripts/audio/quips_page.py" "$out"
