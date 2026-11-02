#!/bin/sh
# Lists how the recording voice will say each word's (how-it-sounds) hint parts, beside the
# whole word, across every edition: sh scripts/audio/hints.sh <model-dir>
# Read the right-hand column for a part whose vowel doesn't match the word's (a long "I"
# where the word has a short "ɪ", say), then pick a spelling that comes out right. Runs in a
# Linux container like sounds/run.sh; <model-dir> is the same one (models and a venv).
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
models=$(cd "$1" && pwd)
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { readPacks, readEditions } from '$root/js/words.js';
import { parseList } from '$root/js/crossword.js';
const out = [];
for (const ed of readEditions(readFileSync('$root/editions.toml', 'utf8'))) {
  const { packs, starter } = readPacks(readFileSync('$root/' + ed.file, 'utf8'));
  for (const list of [...Object.values(packs).map((p) => p.list), starter])
    for (const e of parseList(list)) if (e.say) out.push({ file: ed.file, w: e.w, syll: e.syll, say: e.say });
}
process.stdout.write(JSON.stringify(out));
" | container run --rm -i --memory 4G \
  --mount type=virtiofs,source="$root/scripts/audio",target=/a \
  --mount type=virtiofs,source="$models",target=/w \
  docker.io/library/python:3.12-slim sh -c '
    cd /w && { [ -x venv/bin/python ] || python3 -m venv venv; } &&
    venv/bin/pip install --quiet --disable-pip-version-check --require-hashes -r /a/requirements.txt &&
    venv/bin/python -I /a/hints.py /w' 2>&1 | grep -v '^\['
