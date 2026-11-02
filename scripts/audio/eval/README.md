# Pronunciation eval for the Kokoro clips

Some recorded clips say the wrong sounds, mostly *Clap it* syllables: "pub" (from
`pub-lish`) comes out as "pubby". This folder holds the tools to measure that and to
compare ways of generating the clips. It's for investigation only; `build.mjs` and
`generate.py` don't use it.

We can't listen to hundreds of clips, so two recognizers check them:

- **wav2vec2 phoneme recognizer** (`phrec.py`): the sounds actually in the clip, in IPA.
  This is the main signal; syllables aren't words, so Whisper can't judge them.
- **Whisper small.en** (`asr.py`, or `asr_mlx.py` on a Mac GPU): useful for whole words.

## Findings so far (276 clips: 135 words, 141 syllables)

The clips the scripts generate match the live clips, so the issue reproduces locally.

| variant | words exact | words edit sum | syllables exact | syllables edit sum |
|---|---|---|---|---|
| live (deployed) | 49 | 166 | 9 | 318 |
| base (`kokoro.create(text)`, the app today) | 50 | 167 | 8 | 323 |
| dot (text + ".") | 52 | 162 | 7 | 330 |
| e2m (espeak mapped to misaki phonemes) | 49 | 182 | **13** | **297** |
| e2mdot (e2m + ".") | **52** | **158** | 7 | 322 |

"Exact" = recognized phonemes equal the expected ones; edit sum = total phoneme edit
distance (lower is better). The recognizer is noisy on very short clips, so compare
variants with each other rather than reading the counts as absolute.

What goes wrong:

- **Syllables gain sounds at the end**: pub → "pabi", cup → "kabay", ub → "tnabi", it → "ayed".
- **…and at the start**, often "the", "a" or "n": corn → "the corn", bear → "the bear",
  kit → "nkerd", chick → "antchreck", ing → "thing".
- **Whole words too**: stomp → "istampe" (Whisper: "Istanbul"), observe → "tabza",
  scarf → "izgaf", score → "isgo", burger → "bagaret", cupcake, panic, chicken.

Likely causes:

1. **Phoneme alphabet mismatch.** kokoro-onnx 0.4.9 phonemizes with espeak, but Kokoro
   was trained on misaki's phonemes. For example, espeak writes "ur/er" as `ɜː`, which
   Kokoro says without the r: zurv → "zev", burger → "bagaret". Mapping to misaki (e2m)
   fixes observe, stomp, burger and zurv.
2. **Very short inputs.** One syllable is only 2–4 tokens, and the model pads it with
   sounds that read as "the"/"a" before or a vowel after. No change to the text alone
   (period, misaki G2P, e2m) fixes "pub".

## Next step: carrier phrases (generated, not yet scored)

`gen.py` can say the target inside a phrase ("say pub again.", "the word pub is here.")
and cut it out at the boundaries from the model's own per-phoneme durations, exposed from
the ONNX graph (`/encoder/Clip_output_0`). The model then never sees a bare syllable.
Variants: `e2m:say`, `e2m:word`, `e2m:fin`, `e2m:ini`, plus `e2m:say@0.7` (slower) and
`e2m:dot#50` (longer style vector).

To do:

- [ ] Score the carrier variants against base and e2m/e2mdot.
- [ ] Check the cuts for clicks or cut-off final consonants (cut extends 30 ms, fades 10/40 ms).
- [ ] Choose a method per kind (likely e2mdot for words, a carrier cut for syllables), port
      it to `generate.py`, and regenerate. That changes the clip hash inputs, so every
      affected clip is rebuilt.
- [ ] Check sentence clips (`t`) too; they are longer and probably fine.

## Running it

Kokoro's espeak only works on Linux, so generation and the recognizers run in Apple's
`container` (python:3.12). Everything goes in a work folder outside the repo (about 3 GB
of venvs and models).

```sh
W=/path/to/work; E=scripts/audio/eval
node scripts/audio/build.mjs --plan > $W/plan.json
sh $E/run.sh $W sh /src/setup.sh
sh $E/run.sh $W misvenv/bin/python -I /src/mis.py               # only for mis* variants
sh $E/run.sh $W venv/bin/python -I /src/gen.py base e2m e2mdot e2m:say e2m:word
sh $E/run.sh $W sh -c 'HF_HOME=/work/models misvenv/bin/python /src/phrec.py base e2m e2mdot e2m:say e2m:word'
sh $E/run.sh $W sh -c 'HF_HOME=/work/models asrvenv/bin/python /src/asr.py base e2m e2mdot'   # optional, slow
python3 $E/score.py $W base e2m e2mdot e2m:say e2m:word
```

To score the deployed clips too, download them from the live `audio.json`, convert to
24 kHz mono WAV (`afconvert -f WAVE -d LEI16@24000 -c 1`), and put them in `$W/out/live/`
named `<kind>_<text>.wav` (e.g. `s_pub.wav`).
