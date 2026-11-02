# Sound Box Crosswords

Sound crosswords for targeted spelling practice (clues are spoken, with a picture, a sentence, or both). Live at
https://tools.tuley.name/sound-box-crosswords/ (GitHub Pages, deployed by
`.github/workflows/ci.yml`). Pushing to `main` redeploys once the check passes.

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
   through (e.g. offering only the letters in the word). On-screen text (pack notes, help) must never
   spell a pack word, even split into syllables; the check enforces this for notes.
   One exception, per pack: `words_in_text = true` (kindergarten high-frequency words), where
   spotting a word printed nearby is part of learning to read it. A clue's own word is
   always blanked.
4. **Attention-friendly.** Short puzzles (5–6 words), immediate feedback, quick wins, low
   friction, no timers, no penalties or lost progress, minimal reading of instructions.
5. **Scaffolds the player can use on their own:** *Hear it* (whole word) and *Break it down*
   (syllable by syllable with the boxes lighting up; shown only for multi-syllable words;
   it was once "Clap it", which a player took as an instruction to clap, so name buttons for
   what they do). These model the strategies practiced
   offline: clap syllables, tap sounds, say the word slowly while writing. Scaffolds help
   the player *hear* the word; they never reveal letters. (A "Show a letter" hint was
   removed for that reason.) *Sound it out* (editions with `sound_it_out`, e.g. Kindergarten;
   only words that list their sounds, `{c a t}`, not sight words) says each single sound while
   the letters that make it light up, then the word. Lighting a two-letter sound (sh, ee)
   together shows that it takes two boxes; that's accepted as part of the skill.
6. **Not babyish.** Players are strong readers, not toddlers. Friendly, but not toddler styling, voices or
   rewards.
7. **A grown-up can tune it** without code, in Settings: syllable colors on/off, auto-speak,
   voice, QWERTY (default) vs A–Z pad, custom word list. Nothing in Settings makes the game easier,
   so it needs no lock. Keep it that way: don't add settings that weaken recall.

When a request is ambiguous, prefer the option that better serves goals 1–4.

## Ideas that fit the goals (not built yet)

- Packs for ending blends (`-nd`, `-st`, `-mp`, `-nt`) and common suffixes (`-ing`, `-ed`).
- A "read it back" step: after a word is finished, the word is spoken and the player confirms it.
- Tracking which words are missed most and resurfacing them (spaced review).
- Word-part / morphology packs (prefix + root: `ex` + `plore`).

## Technical constraints

- **Plain static files, no build step.** No framework, no bundler. Browser ES modules
  loaded straight from `index.html`; the source runs as-is with any static server. The
  deploy only runs `scripts/stamp.mjs`, which copies `index.html`, `styles.css`,
  `packs.toml` and `js/` to `_site/` and stamps the commit: `?v=<sha>` cache busting (JS
  modules via the import map, `packs.toml` via `words.js`) and the footer GitHub badge.
  New top-level site files must be added to `SITE` in `stamp.mjs`.
- **Dependencies are fine** when they earn their place. Browser deps load from a CDN via
  the import map in `index.html`, pinned to an exact version that matches `package.json`
  (the check enforces this), so the same bare import works in the browser and Node.
  Currently `smol-toml` and `qrcode` (the share sheet's QR code, loaded when it opens),
  plus dev-only `playwright` (renders `social-card.png`). Fonts from Google Fonts (Fredoka for display, Lexend for body).
- **Keep the custom letter pad; don't use the system keyboard** (no focused text input for
  play). The iPad keyboard's predictive text, autocorrect and dictation would hand over the
  spelling (goal 3), and it covers half the screen. Physical keyboards are handled directly.
- **Target: iPad Safari**, also phones and desktop. Touch first; physical keyboards work too.
  Must fit ~380px wide; the grid sizes cells to fit (`sizeBoard`, 24–50px).
- **Recorded audio** for pack words, Break it down syllables, sentences, "You solved it!",
  and the 46 single sounds for Sound it out (kind `f`; each made the way
  `scripts/audio/sounds/picks.json` says, picked by ear from the candidates
  `scripts/audio/sounds/run.sh` makes with `lab.py`; their clip names hash those files, so a
  new pick re-records just the sounds; never the device voice, which can't say "k"):
  Kokoro (open-source neural TTS, voice `af_heart`), pre-generated at deploy by
  `scripts/audio/build.mjs` and served from Cloudflare Pages
  (`sound-box-crosswords.asset-data.stream`, project `sound-box-crosswords-audio`). Words
  and syllables are said at the end of a phrase ("and next, ___.") and cut out, since
  Kokoro mispronounces them alone (`generate.py`; how that was chosen and how to re-test:
  `scripts/audio/eval/`). Clip names hash model + voice + speed + method (`METHOD` in
  `build.mjs`) + text, so only new or changed text is generated; the
  rest is downloaded from the live host. The site ships `audio.json` (`"kind:text"` → clip);
  `say(kind, text)` in `speech.js` plays a clip or falls back to the device voice (Custom
  words, local dev, network failure). Kokoro runs on Linux only (the macOS espeak wheel is
  broken): locally use Apple's `container` with a python:3.12 image. Python deps are
  hash-pinned in `scripts/audio/requirements.txt` (recompile with the command in
  `requirements.in`); model files are checksum-verified in `kokoro.sh`.
- **Device speech** (fallback) uses the Web Speech API (`speechSynthesis`), slowed rates. It only works after a
  user tap on iOS. Fail quietly if unavailable. Voices are whatever the device has, so the
  app ranks them: downloaded Premium > Enhanced > basic, en-US first, novelty/robotic Apple
  voices excluded. With no downloads it behaves as before; once a grown-up downloads a
  better voice (iPad: Settings → Accessibility → Spoken Content → Voices), "Automatic"
  uses it with no setting change. Voices are identified by `voiceURI`, not name (iOS names
  basic and Enhanced voices the same).
- **Pictures are emoji**, which keeps it offline-friendly and license-free. Don't add
  copyrighted characters or images. A word with no emoji is listen-only: the app draws a
  sound-wave icon (`WAVE` / `setPic` in `app.js`).
- **State** (settings, custom list, stars, selected pack) lives in `localStorage`, always
  wrapped in try/catch. It's per device; no accounts or server. Each edition's data is under
  its own prefix (`storagePrefix` in `words.js`: plain `sbx:` for `packs.toml`'s edition,
  `sbx:<id>:` for others), through `store` in `app.js`; `device` (plain `sbx:`) holds
  what's shared: the chosen edition, the Home Screen tip, and the voice and chime
  (`shared`; `SHARED` in `app.js`).
- Light and dark themes via CSS custom properties on `:root`, with
  `prefers-color-scheme` and `[data-theme]` overrides. Define new colors as tokens.
- Respect `prefers-reduced-motion`.

## Code map

- `index.html`: markup only (board, clue bar, letter pad, settings sheet).
- `favicon.svg` (hand-drawn, simple enough for 16px) and `apple-touch-icon.png` (180px
  home-screen icon, from an Image Playground render): the same idea, a crossing of sound
  boxes with the empty orange box and sound waves.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`: the home-screen / install
  manifest (short name "Sound Box"). Icons are the same render as `apple-touch-icon.png`.
- Share sheet (footer link; `openShare` / `renderShare` in `app.js`): a QR code drawn by
  `qrcode` for the site's fixed address, or with `?edition=<id>` when sharing just this
  grade (the default when there's more than one), plus the link, the share sheet or Copy link.
- `social-card.png`: the link-preview image (`og:image` in `index.html`), 1200×630. Made by
  `npm run card` (`scripts/card.mjs` screenshots `scripts/social-card.html`, which borrows
  `styles.css`); rerun after changing either. Its words must not be pack words.
- `listen/`: the **listen check**, a grown-up tool for hearing every recorded clip and
  marking it ✓ or ✗. Nested: `/listen/` lists the grades (editions), `?edition=<id>` that
  grade's packs (each opens to its words, which jump to their cards), and
  `?edition=<id>&pack=<id>` one pack's page (no `edition` means `packs.toml`'s).
  In editions with Sound it out, a word that lists its sounds also gets a *Sound it out* row
  that plays them with the app's pauses, then the word; one mark for the run. A Sounds card
  lists all 46 single sounds.
  It reads `packs.toml` and `audio.json` like the app (locally it falls back to the live
  `audio.json`), and `clipsFor` in `crossword.js` decides each word's clips for both it and
  the audio build. Marks are per device (`sbx:listen`), keyed by clip, so a changed hint
  shows up as not heard. Report copies the ✗ list or opens a GitHub issue. It spells
  every pack word, so nothing in the app links to it and it's `noindex` (the check
  enforces both).
- `sw.js`: service worker, so a home-screen launch works offline. The page and unstamped
  files are network first (4 s, then the saved copy); `?v=` files, the CDN parser, fonts
  and audio clips are saved copy first. Clips are answered by byte range (Safari's
  `<audio>` asks for ranges). Registered by `app.js`, but not on localhost, so local
  edits always show.
- Updates in a home-screen app: it usually resumes rather than relaunching, so on each
  return to the screen `app.js` compares its `?v=` stamp with the live page's and
  reloads when nothing would be lost (no letters on the board, no sheet or popup open),
  or else at the next new puzzle (`updateReady`).
- `styles.css`: all styles. Color tokens on `:root` with dark overrides at the top.
  `--cell` is the box color token; `--cell-size` is the box size set by `sizeBoard`.
- **Editions** (`editions.toml`): one packs file per grade, e.g. Kindergarten
  (`editions/kindergarten.toml`) and 3rd grade (`packs.toml`). The first visit asks "Which
  grade?" (`pickEdition` in `app.js`), unless there's progress from before editions (then
  `packs.toml`'s) or a `?edition=<id>` link; Settings → Edition (a dropdown) switches. Each
  edition keeps its own progress, achievements, collection, colors, Custom list and settings
  (letter pad, syllable colors, auto-speak); the voice and chime are the device's; an edition
  can set the letter pad default (`keyboard = "abc"`) and turn on Sound it out
  (`sound_it_out = true`). The check, the audio build and the
  listen check cover every edition. Never change an edition's `id` once in use.
- `packs.toml`: the word packs, in display order (the 3rd grade edition; other editions'
  files use the same format). Each `[[pack]]` has `id` (saved progress
  is keyed by it; don't rename), `name`, `note` (shown under the chips), and `words`;
  `[custom] words` is the starter "Custom" list. **Word list format** (packs and the custom list share it): one entry per
  line, `syl-la-bles emoji`, e.g. `but-ter-fly 🦋`. Dashes mark syllables and drive the
  coloring and *Break it down*. Letters (plus apostrophes, e.g. `don't`; the
  player types the apostrophe into its own box with the pad's `'` key), 2–12 characters. `(how-it-sounds)` at the end, one part
  per syllable, e.g. `ba-nan-a 🍌 (buh-nan-uh)`: *Break it down* speaks those instead of the
  spelled syllables, which TTS misreads alone (`vol` → "volume", `ap` → "A P", `to` →
  "too", `ger` → "jer"). **Required for every multi-syllable pack word** (optional in a
  grown-up's own list). Use real words or 3+ letter spellings with a clear vowel; the
  check flags short parts and common abbreviations. The recording voice has misreads of its
  own (`ick` → "Ike", `bass` → "base"): `scripts/audio/hints.sh` lists how it will say every
  hint part beside the whole word. Last, an optional `"context sentence"`
  that uses the word: *Hear it*, the picture, and auto-speak then say word, sentence, word
  (spelling-test style; `sayWord` in `app.js`). **Required for pack words with no emoji**,
  and it tells homophones apart (their/there). Also shown under the clue with the word as a blank of small boxes, one per letter like the grid (`blankSentence` in
  `crossword.js`), so it must not use another word from the same pack; the check enforces this. Syllable splits should match how a
  teacher would clap the word.
- `js/words.js`: `loadPacks` fetches and parses `packs.toml`; `readPacks` turns TOML text
  into `{ packs, starter }` and appends the built-in `mine` pack.
- `js/phonics.js`: no DOM. Sound it out's sounds (`SOUNDS`, kept equal to `picks.json` by the
  check), each letter group's usual sound (`USUAL`: c → k, sh, ee, x → ks, qu → kw), and
  `parseSounds` for a word list's `{c a t}` / `{c=s i t y=ee}` (letters grouped by sound; `=`
  names an unusual sound; groups with no usual sound, like ow, must say which).
- `js/crossword.js`: no DOM, runs in Node. `parseList` reads word lists. `makePuzzle(pool,
  recent)` builds a crossword: greedy placement with crossing checks, many random attempts,
  keeps the layout with the most words and smallest area, max 11 columns × 12 rows so it
  fits a phone, avoids `recent` words. Returns `P` (`words`, `cells`, `rows`, `cols`); each
  word has `cells`, `chunks` (syllables) and `sylOf` (syllable index per letter).
- `js/confetti.js`: `confetti(host)`, the solve celebration (skipped with reduced motion).
- `js/achievements.js`: no DOM. `catalog(state)` lists achievements (pack champion; tiered
  clean solves, comeback words, practice days, showing only the next unmet tier), `award`
  records newly met ones in `sbx:achievements` ({ id: time }); earned ones are never taken
  away (no streaks). Inputs saved by `app.js`: `sbx:counts` { clean, comeback } and
  `sbx:days` (local "YYYY-MM-DD" with a finished puzzle), backfilled from `sbx:log` once.
  Shown on the solved card, as a big card per new achievement (`showAwards`, after the
  solve celebration; achievements awarded quietly at startup never pop up), in the 🏆
  sheet, and as a "You got it this time!" toast.
- Picture collection (🏆 sheet, Collection tab; `renderCollection` in `app.js`): a word's
  picture is collected the first time it's spelled right on the first try (`stats.ok > 0`).
  Pictures only, never words (slots are labeled "collected" / "not yet"); tapping a
  collected picture says the word. Picture-less words get "sound stickers" there
  (`js/stickers.js`: abstract SVG badge + gradient + sound motif, different ones in pack
  order) instead of the in-game sound wave. Never emoji or objects, so they can't be
  mistaken for a pack picture, now or in future packs. The solved card shows "+N pictures".
- `js/palettes.js`: no DOM. `PALETTES`, the grid color schemes (syllable bands, accent,
  selection; light and dark). Classic is everyone's and must match `styles.css`; finishing
  a pack (a `pack:` achievement) unlocks the next (`unlockedCount`). `paletteCSS` makes the
  rules for `:root[data-palette]` and the picker swatches. Picked in the 🏆 sheet's Colors
  tab (`renderColors` in `app.js`), saved as `settings.palette`. Cosmetic only. The check
  holds every scheme to Classic's contrast and keeps the two syllable bands clearly apart.
- `js/sharecard.js`: `renderCard` draws an achievement as a 1080×1350 PNG in the current
  theme (app name, emoji, title, detail, date, up to 6 collected pictures, site address;
  never spelling words or a name); `shareCard` opens the share sheet, or downloads where
  file sharing isn't supported. The big award card shows Share; earned achievements in the
  🏆 sheet reopen in it. The PNG is made when the card shows, since iPad Safari only opens
  the share sheet straight from a tap.
- `js/chime.js`: `chime()`, a soft two-note Web Audio chime on solve (Settings toggle). The
  audio context is unlocked on the first tap for iOS. It doesn't follow the mute switch:
  iOS can only do that for the whole page, which would silence the recorded words too.
- `js/speech.js`: `say(kind, text, rate, cancel)` (recorded clip or device voice, one
  queue; kinds `w` word, `s` syllable, `t` sentence, `p` phrase), `stopSpeech`,
  `speechEpoch`, `speak` (device voice only), `hasSpeech`; voice ranking (`score`), `listVoices`,
  `setVoice` (a `voiceURI`, or "" for Automatic), `onVoicesChanged` (Safari loads voices late).
- `js/app.js`: everything on screen.
  - Play state: `fill`, `locked`, `doneW`, `cur` (word), `pos` (letter index), `misses`,
    `missedW` (words with a wrong try this puzzle).
  - Saved progress (`sbx:progress`, per pack): `done`, `round` (coverage), and
    `stats[word]` = `{ n, ok, miss }` (typed completions, first-try right, wrong tries);
    words finished by a crossing word don't count as typed. `sbx:log`: finished puzzles.
  - `input` / `checkWord` / `complete` / `settleCrossings`: whole-word checking only. Letters
    are accepted until the word is full; then wrong letters flash and clear. Finishing one
    word can finish a crossing word. (A check-each-letter mode was removed: it let a stuck
    player guess letters until one stuck.)
  - `clap`: the Break it down scaffold. `back`: erase.
  - `renderBoard`, `update`, `renderClues`, `renderKeyboard`, `renderPacks`: UI.
  - Settings sheet: `openSheet` / `closeSheet` and the change handlers below them.

## Working on it

- **Every change goes through a pull request.** More than one agent may be working at once,
  so don't push to `main`: `git fetch`, branch from `origin/main`, push the branch, and open
  a PR. CI runs the check on the PR; merging to `main` deploys. Leave merging to Jay.
  Use a separate git worktree per agent (Claude Code keeps them in `.claude/worktrees/`,
  which is gitignored); stage files by name rather than `git add -A`.
- Run locally with any static server, e.g. `python3 -m http.server`, then open
  http://localhost:8000. Opening `index.html` as a file won't work (modules need http).
- After editing, run `npm run check` (needs `npm install` once): syntax-checks `js/`,
  checks local links in `index.html`, validates `packs.toml` and every word list, checks
  the import map matches `package.json`, and builds 50 puzzles per pack. CI runs it too.
- GitHub Actions workflows must pass `zizmor .`: SHA-pinned actions, minimal `permissions`,
  `persist-credentials: false`.
- Test in a narrow viewport (~380px) and in dark mode. Make sure long words (9+ letters)
  still fit and the letter pad stays tappable (keys ≥ 44px tall).
- To add a school unit's spelling list as a pack, use the `add-unit-pack` skill
  (`.claude/skills/add-unit-pack/SKILL.md`): the steps, the word rules, and a PR review table.
- When adding words, check that the emoji clearly shows that word, and that the spelling
  fits the pack's pattern. If no emoji shows it without misleading (their, would, done),
  leave the emoji off rather than picking a loose match.
- Keep the copy short and plain; players are young and some text is read by a grown-up.
- License: PolyForm Noncommercial 1.0.0 (`LICENSE.md`, whose first line is the
  `Required Notice:` copyright that must travel with copies). The README lists the
  third-party parts; add any new dependency, font or asset there with its license.
- This repo is public. Keep it about the general learner profile; don't add personal details
  about any specific child (name, school, diagnoses).
