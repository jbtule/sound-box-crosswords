# Sound Box Crosswords

Picture crosswords for targeted spelling practice. Live at
https://tools.tuley.name/sound-box-crosswords/ (GitHub Pages from `main`, root folder).
Pushing to `main` redeploys.

## Who it's for

Kids roughly **ages 7–10** who read well (often above grade level) but spell well below it,
playing on an iPad. Their spelling errors are mostly **omissions**:

- **Middle consonants in blends** dropped: "sop" for *stop*, "fog" for *frog*.
- **Vowels and whole syllables** dropped: "rember" for *remember*.
- **Word endings lost**: "expl" for *explore*. The hard `pl` blend is right, then the rest of
  the word fades, and a strong reader often doesn't notice because reading fills in the gap.

Common contributors are working memory, attention, and phonological segmentation (hearing
and holding every sound in order). This tool is home practice, not diagnosis or treatment.

## Goals (use these to judge any change)

1. **Make every sound and syllable visible.** One box per letter, so a missing letter is an
   obvious empty box. Syllables are color-banded in the grid. This is the core mechanic;
   don't weaken it.
2. **Practice by spelling pattern, not by theme.** Packs target these error types: blends,
   bossy-R (r-controlled vowels), 2-syllable and 3-syllable words, plus a custom list for
   school words and word families (e.g. the `-ore` family: explore, store, before).
3. **Recall, not recognition.** The player must produce the spelling from a picture and the spoken
   word. Never show the written word as a clue. Avoid features that let the player guess their way
   through (e.g. offering only the letters in the word).
4. **Attention-friendly.** Short puzzles (5–6 words), immediate feedback, quick wins, low
   friction, no timers, no penalties or lost progress, minimal reading of instructions.
5. **Scaffolds the player can use on their own:** *Hear it* (whole word), *Clap it* (syllable by
   syllable with the boxes lighting up), *Show a letter*. These model the strategies
   practiced offline: clap syllables, tap sounds, say the word slowly while writing.
6. **Not babyish.** Players are strong readers, not toddlers. Friendly, but not toddler styling, voices or
   rewards.
7. **A grown-up can tune it** without code: check-each-letter vs whole-word mode, syllable
   colors on/off, auto-speak, A–Z vs QWERTY pad, custom word list.

When a request is ambiguous, prefer the option that better serves goals 1–4.

## Ideas that fit the goals (not built yet)

- Packs for ending blends (`-nd`, `-st`, `-mp`, `-nt`) and common suffixes (`-ing`, `-ed`).
- A "read it back" step: after a word is finished, the word is spoken and the player confirms it.
- Tracking which words are missed most and resurfacing them (spaced review).
- Word-part / morphology packs (prefix + root: `ex` + `plore`).

## Technical constraints

- **Plain static files, no build step.** No framework, no bundler. Browser ES modules
  loaded straight from `index.html`; GitHub Pages serves the repo as-is.
- **Dependencies are fine** when they earn their place. Browser deps load from a CDN via
  the import map in `index.html`, pinned to an exact version that matches `package.json`
  (the check enforces this), so the same bare import works in the browser and Node.
  Currently just `smol-toml`. Fonts from Google Fonts (Fredoka for display, Lexend for body).
- **Target: iPad Safari**, also phones and desktop. Touch first; physical keyboards work too.
  Must fit ~380px wide; the grid sizes cells to fit (`sizeBoard`, 24–50px).
- **Speech** uses the Web Speech API (`speechSynthesis`), en-US voice, slowed rates. It only
  works after a user tap on iOS. Fail quietly if unavailable.
- **Pictures are emoji**, which keeps it offline-friendly and license-free. Don't add
  copyrighted characters or images.
- **State** (settings, custom list, stars, selected pack) lives in `localStorage` under the
  `sbx:` prefix, always wrapped in try/catch. It's per device; no accounts or server.
- Light and dark themes via CSS custom properties on `:root`, with
  `prefers-color-scheme` and `[data-theme]` overrides. Define new colors as tokens.
- Respect `prefers-reduced-motion`.

## Code map

- `index.html`: markup only (board, clue bar, letter pad, grown-ups sheet).
- `styles.css`: all styles. Color tokens on `:root` with dark overrides at the top.
  `--cell` is the box color token; `--cell-size` is the box size set by `sizeBoard`.
- `packs.toml`: the word packs, in display order. Each `[[pack]]` has `id` (saved progress
  is keyed by it; don't rename), `name`, `note` (shown under the chips), and `words`;
  `[custom] words` is the starter "My words" list. **Word list format** (packs and the custom list share it): one entry per
  line, `syl-la-bles emoji`, e.g. `but-ter-fly 🦋`. Dashes mark syllables and drive the
  coloring and *Clap it*. Letters only, 2–12 letters. Syllable splits should match how a
  teacher would clap the word.
- `js/words.js`: `loadPacks` fetches and parses `packs.toml`; `readPacks` turns TOML text
  into `{ packs, starter }` and appends the built-in `mine` pack.
- `js/crossword.js`: no DOM, runs in Node. `parseList` reads word lists. `makePuzzle(pool,
  recent)` builds a crossword: greedy placement with crossing checks, many random attempts,
  keeps the layout with the most words and smallest area, max 11 columns × 12 rows so it
  fits a phone, avoids `recent` words. Returns `P` (`words`, `cells`, `rows`, `cols`); each
  word has `cells`, `chunks` (syllables) and `sylOf` (syllable index per letter).
- `js/speech.js`: `speak`, `stopSpeech`, `hasSpeech`.
- `js/app.js`: everything on screen.
  - Play state: `fill`, `locked`, `doneW`, `cur` (word), `pos` (letter index), `misses`, `hints`.
  - `input` / `checkWord` / `complete` / `settleCrossings`: letter vs whole-word checking.
    In letter mode, wrong letters wiggle and are rejected; in word mode, wrong letters flash
    and clear once all boxes are full. Finishing one word can finish a crossing word.
  - `clap`, `hint`, `back`: scaffolds.
  - `renderBoard`, `update`, `renderClues`, `renderKeyboard`, `renderPacks`: UI.
  - Grown-ups sheet: `openSheet` / `closeSheet` and the change handlers below them.

## Working on it

- Run locally with any static server, e.g. `python3 -m http.server`, then open
  http://localhost:8000. Opening `index.html` as a file won't work (modules need http).
- After editing, run `npm run check` (needs `npm install` once): syntax-checks `js/`,
  checks local links in `index.html`, validates `packs.toml` and every word list, checks
  the import map matches `package.json`, and builds 50 puzzles per pack. CI runs it too.
- GitHub Actions workflows must pass `zizmor .`: SHA-pinned actions, minimal `permissions`,
  `persist-credentials: false`.
- Test in a narrow viewport (~380px) and in dark mode. Make sure long words (9+ letters)
  still fit and the letter pad stays tappable (keys ≥ 44px tall).
- When adding words, check that the emoji clearly shows that word, and that the spelling
  fits the pack's pattern.
- Keep the copy short and plain; players are young and some text is read by a grown-up.
- This repo is public. Keep it about the general learner profile; don't add personal details
  about any specific child (name, school, diagnoses).
