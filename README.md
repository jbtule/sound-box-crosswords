# Sound Box Crosswords

Picture crosswords for targeted spelling practice: consonant blends, bossy-R vowels,
and 2- and 3-syllable words, plus a custom word list.

- Syllables are color-coded in the grid so a dropped chunk stands out.
- **Hear it** / **Clap it** read the word aloud whole or one syllable at a time.
- Grown-up settings: check each letter or the whole word, letter pad layout, custom list
  (`ex-plore 🧭` — dashes mark syllables, an emoji becomes the picture).

Live: https://tools.tuley.name/sound-box-crosswords/

Plain HTML, CSS and JavaScript modules, with no build step or dependencies. Progress and
settings are saved in the browser's localStorage.

| File | What's in it |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Styles and light/dark color tokens |
| `js/words.js` | Word packs, one word per line. **Edit this to add words.** |
| `js/crossword.js` | Puzzle generator (no DOM; tested by the check script) |
| `js/speech.js` | Text-to-speech helpers |
| `js/app.js` | Game play, rendering, grown-up settings |

## Developing

- Serve the folder and open it: `python3 -m http.server`, then http://localhost:8000.
  (Opening `index.html` directly from disk won't load the modules.)
- Run `node scripts/check.mjs` (or `npm run check`) before pushing. It checks syntax and
  links, validates every word list, and builds test puzzles from each pack. CI runs it on
  every push and PR.
- Workflows are kept clean under [zizmor](https://docs.zizmor.sh/): `zizmor .`
- Pushing to `main` publishes to GitHub Pages (Settings → Pages → Deploy from a branch →
  `main`, `/ (root)`).

See `CLAUDE.md` for the goals behind the design and a map of the code.
