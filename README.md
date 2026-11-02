# Sound Box Crosswords

Picture crosswords for targeted spelling practice: consonant blends, bossy-R vowels,
and 2- and 3-syllable words, plus a custom word list.

- Syllables are color-coded in the grid so a dropped chunk stands out.
- **Hear it** / **Clap it** read the word aloud whole or one syllable at a time.
- Grown-up settings: check each letter or the whole word, letter pad layout, custom list
  (`ex-plore 🧭` — dashes mark syllables, an emoji becomes the picture).

Live: https://tools.tuley.name/sound-box-crosswords/

Single self-contained `index.html`, no build step. Progress and settings are saved in the
browser's localStorage.

## Developing

- Open `index.html` in a browser. That's the whole app.
- Run `node scripts/check.mjs` before pushing. It checks that the script parses and that every
  word list follows the `syl-la-bles emoji` format. CI runs it on every push and PR.
- Workflows are kept clean under [zizmor](https://docs.zizmor.sh/): `zizmor .`
- Pushing to `main` publishes to GitHub Pages (Settings → Pages → Deploy from a branch →
  `main`, `/ (root)`).

See `CLAUDE.md` for the goals behind the design and a map of the code.
