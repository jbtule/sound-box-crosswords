# Pronunciation eval for the Kokoro clips

Some recorded clips said the wrong sounds, mostly *Clap it* syllables: "pub" (from
`pub-lish`) came out as "pubby". This folder holds the tools that measured it and chose
the fix now in `generate.py` (the `cut` method). The build doesn't use this folder.

We can't listen to hundreds of clips, so two recognizers check them:

- **wav2vec2 phoneme recognizer** (`phrec.py`): the sounds actually in the clip, in IPA.
  This is the main signal; syllables aren't words, so Whisper can't judge them.
- **Whisper small.en** (`asr.py`, or `asr_mlx.py` on a Mac GPU): useful for whole words.

## Results (276 clips: 135 words, 141 syllables)

| variant | words exact | words edit sum | syllables exact | syllables edit sum |
|---|---|---|---|---|
| live (deployed before this fix) | 49 | 166 | 9 | 318 |
| base (`kokoro.create(text)`, same as live) | 50 | 167 | 8 | 323 |
| e2m (espeak mapped to misaki phonemes) | 48 | 175 | 12 | 297 |
| e2m:dot (e2m + ".") | 53 | 170 | 6 | 325 |
| e2m:fin ("the word is ___.", cut) | 27 | 224 | 20 | 218 |
| e2m:finc+100 ("the word is, ___.", cut 100 ms early) | 74 | 100 | 52 | 114 |
| **e2m:next+60** ("and next, ___.", cut 60 ms early): **shipped** | **82** | **92** | **60** | **104** |
| e2m:okay+60~120 ("okay, ___.") | 74 | 111 | 51 | 117 |
| e2m:mid+60 ("and next, ___, okay.") | 63 | 159 | 36 | 156 |
| e2m:say / word / ini (target mid-phrase) | 0–12 | 323–462 | 1–11 | 314–378 |

"Exact" = recognized phonemes equal the expected ones; edit sum = total phoneme edit
distance (lower is better). The recognizer is noisy on very short clips (it often hears
"pub" as "pab"), so compare variants with each other rather than reading counts as absolute.

Against base, `e2m:next+60` is better on 172 clips and worse on 17.

What went wrong before:

- **Syllables gained sounds at the end**: pub → "pabi", cup → "kabay", ub → "tnabi", it → "ayed".
- **…and at the start**, often "the", "a" or "n": corn → "the corn", bear → "the bear",
  kit → "nkerd", chick → "antchreck", ing → "thing".
- **Whole words too**: stomp → "istampe" (Whisper: "Istanbul"), observe → "tabza",
  scarf → "izgaf", score → "isgo", burger → "bagaret", cupcake, panic, chicken.

Why, and what fixed it:

1. **Phoneme alphabet mismatch.** kokoro-onnx 0.4.9 phonemizes with espeak, but Kokoro
   was trained on misaki's phonemes. For example, espeak writes "ur/er" as `ɜː`, which
   Kokoro says without the r: zurv → "zev". Mapping to misaki (e2m) fixes that.
2. **Very short inputs.** Said alone, a syllable is only 2–4 tokens, and the model pads
   it with sounds before and after. No text-only change (period, misaki G2P, e2m) fixed
   "pub". Saying it at the end of a phrase and cutting it out does: the model's
   per-phoneme durations (exposed from the ONNX graph, `/encoder/Clip_output_0`) give the
   cut points. Lessons from the variants:
   - The target must be **last** in the phrase. Anything after it leaks into the cut as an
     extra vowel (say/word/ini/mid).
   - A **comma pause before** it gives a clean start, and the cut must start **~60 ms
     early**: the duration boundary falls after a stop consonant's burst, so cutting
     exactly on it turned pub into "hub" (e2m:fin).
   - Ending the cut later (`~120`) changes nothing; the phrase ends in silence.

## Known gaps

- **Final -ore** is still unreliable, as it was before: more, store, sore, score and
  dinosaur often lose the final r (before, fore, fork, corn, form and storm are now right).
  Kokoro seems to soften a phrase-final r. A pause after the target (mid) fixes some
  but adds a trailing vowel to most other clips.
- A few onsets pick up the "t" of "next": hel → "thel", tuh, shy, chore. Rare.
- Not checked by ear yet. Listen to a sample before merging.
- Custom words still use the device voice; this only affects the pre-generated clips.

## Running it

Kokoro's espeak only works on Linux, so generation and the recognizers run in Apple's
`container` (python:3.12). Everything goes in a work folder outside the repo (about 3 GB
of venvs and models).

```sh
W=/path/to/work; E=scripts/audio/eval
node scripts/audio/build.mjs --plan > $W/plan.json
sh $E/run.sh $W sh /src/setup.sh
sh $E/run.sh $W misvenv/bin/python -I /src/mis.py               # only for mis* variants
sh $E/run.sh $W venv/bin/python -I /src/gen.py base e2m e2m:next+60
sh $E/run.sh $W sh -c 'HF_HOME=/work/models misvenv/bin/python /src/phrec.py base e2m e2m:next+60'
sh $E/run.sh $W sh -c 'HF_HOME=/work/models asrvenv/bin/python /src/asr.py base e2m e2m:dot'   # optional, slow
python3 $E/score.py $W base e2m e2m:next+60
```

To score the deployed clips too, download them from the live `audio.json`, convert to
24 kHz mono WAV (`afconvert -f WAVE -d LEI16@24000 -c 1`), and put them in `$W/out/live/`
named `<kind>_<text>.wav` (e.g. `s_pub.wav`).
