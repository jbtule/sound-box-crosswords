# Sound Box Crosswords

Sound crosswords for targeted spelling practice: consonant blends, bossy-R vowels,
and 2- and 3-syllable words, plus a custom word list.

- Syllables are color-coded in the grid so a dropped chunk stands out.
- **Hear it** / **Break it down** read the word aloud whole or one syllable at a time.
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
| `js/speech.js` | Plays recorded clips, falls back to the device voice |
| `scripts/audio/` | Generates recorded audio with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) at deploy |
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
- The same push first builds the recorded audio and deploys it to Cloudflare Pages
  (`sound-box-crosswords.asset-data.stream`); only new or changed words are generated.
  Setup and details are in the comment at the top of `ci.yml`.

See `CLAUDE.md` for the goals behind the design and a map of the code.

## License

Copyright © 2026 Jay Tuley. Licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md): free to use, change and share for
any noncommercial purpose, including personal use, families, schools and other
educational or charitable organizations. Commercial use needs separate permission.

This covers the code, the word packs and the recordings. Third-party parts keep their
own licenses:

- [smol-toml](https://github.com/squirrelchat/smol-toml) (BSD-3-Clause), the TOML parser, loaded
  from jsDelivr.
- [Fredoka](https://fonts.google.com/specimen/Fredoka) and
  [Lexend](https://fonts.google.com/specimen/Lexend) (SIL Open Font License 1.1), from
  Google Fonts.
- The recorded voice is generated with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
  (Apache 2.0), voice `af_heart`, run with [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx).
- Pictures are emoji drawn by each device's own font; none are bundled.
- Build-time tools (`qrcode`, Playwright, the speech runtime) are under their own
  licenses and aren't part of the site.
