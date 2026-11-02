# Sound Box Crosswords

Picture crosswords for targeted spelling practice: consonant blends, bossy-R vowels,
and 2- and 3-syllable words, plus a custom word list.

- Syllables are color-coded in the grid so a dropped chunk stands out.
- **Hear it** / **Clap it** read the word aloud whole or one syllable at a time.
- Settings: syllable colors, auto-speak, voice, letter pad layout, custom list
  (`ex-plore 🧭` — dashes mark syllables, an emoji becomes the picture).

Live: https://tools.tuley.name/sound-box-crosswords/

Plain HTML, CSS and JavaScript modules, with no build step. Progress and
settings are saved in the browser's localStorage.

| File | What's in it |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Styles and light/dark color tokens |
| `packs.toml` | Word packs, one word per line. **Edit this to add words or packs.** |
| `js/words.js` | Loads `packs.toml` (parsed with [smol-toml](https://github.com/squirrelchat/smol-toml) from a CDN) |
| `js/crossword.js` | Puzzle generator (no DOM; tested by the check script) |
| `js/speech.js` | Text-to-speech helpers |
| `js/app.js` | Game play, rendering, settings |

## Developing

- Serve the folder and open it: `python3 -m http.server`, then http://localhost:8000.
  (Opening `index.html` directly from disk won't load the modules.)
- `npm install` once, then `npm run check` before pushing. It checks syntax and
  links, validates every word list, and builds test puzzles from each pack. CI runs it on
  every push and PR.
- Upgrading smol-toml: change the version in both `package.json` and the import map in
  `index.html`. The check fails if they differ.
- Workflows are kept clean under [zizmor](https://docs.zizmor.sh/): `zizmor .`
- Pushing to `main` deploys to GitHub Pages through `.github/workflows/ci.yml`, but only if
  the check passes. `scripts/stamp.mjs` copies the site files to `_site/` and stamps the
  commit into them: `?v=<sha>` on every local file for cache busting, and the footer badge.

See `CLAUDE.md` for the goals behind the design and a map of the code.
