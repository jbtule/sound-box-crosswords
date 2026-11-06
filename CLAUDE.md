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
   together shows that it takes two boxes; that's accepted as part of the skill. A blend (fr in
   frog, st in nest: two consonant sounds in a row) is two sounds, so its boxes light one after
   the other, but it plays as one recording so the sounds run together (separate clips with a
   pause can't sound blended: the held sounds alone run ~650 ms).
6. **Not babyish.** Players are strong readers, not toddlers. Friendly, but not toddler styling, voices or
   rewards.
7. **A grown-up can tune it** without code, in Settings (the More button's first tab): syllable colors on/off, auto-speak,
   QWERTY (default) vs A–Z pad, a Custom pack with their own word list (off by default:
   `settings.custom`, `packIds()` in `app.js`; on where Custom was used before the switch). Nothing in Settings makes the game easier,
   so it needs no lock (Start over, which erases progress, asks for a typed phrase instead).
   Keep it that way: don't add settings that weaken recall.

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
  `packs.toml` and `js/` to `_site/`, writes each edition's manifest (`editions/<id>.webmanifest`), and stamps the commit: `?v=<sha>` cache busting (JS
  modules via the import map, `packs.toml` via `words.js`; the icons too, favicon, apple-touch-icon and
  the manifests' icons, since Safari keeps an old icon for weeks) and the footer GitHub badge, on the app and the listen check
  (`listen.js` passes the stamp to the word lists and `audio.json`).
  New top-level site files must be added to `SITE` in `stamp.mjs`.
- **Dependencies are fine** when they earn their place. Browser deps load from a CDN via
  the import map in `index.html`, pinned to an exact version that matches `package.json`
  (the check enforces this), so the same bare import works in the browser and Node.
  Currently `smol-toml`, `qrcode` (the share sheet's and Send's QR codes, loaded when they open)
  and `jsqr` (Receive's camera scanner, `js/scan.js`, loaded when it starts),
  plus dev-only `playwright` (renders `social-card.png`). Fonts from Google Fonts (Fredoka for display, Lexend for body).
- **Keep the custom letter pad; don't use the system keyboard** (no focused text input for
  play). The iPad keyboard's predictive text, autocorrect and dictation would hand over the
  spelling (goal 3), and it covers half the screen. Physical keyboards are handled directly.
- **Target: iPad Safari**, also phones and desktop. Touch first; physical keyboards work too.
  Must fit ~380px wide; the grid sizes cells to fit (`sizeBoard`, 24–50px).
- **Recorded audio** for pack words, Break it down syllables, sentences, "You solved it!" and "Way to go!",
  what achievement cards say ("New achievement!", every title and detail: `spokenLines` in
  `achievements.js`, which the check keeps in step with `catalog`),
  and the 46 single sounds for Sound it out (kind `f`; each made the way
  `scripts/audio/sounds/picks.json` says, picked by ear from the candidates
  `scripts/audio/sounds/run.sh` makes with `lab.py` (a third argument, e.g. `"i,e"`, makes just those); their clip names use `SOUND_RECIPE` in
  `build.mjs`, not a code hash, so the grown-up's listen marks survive unrelated edits: the check
  fails when `picks.json`, `lab.py` or `kokoro_core.py` change, and a change that alters the
  sounds gives just the changed ones a value in `SOUND_RECIPE_FOR` (only they re-record and lose their marks), or all 46 a new
  `SOUND_RECIPE`; plus a blend clip (`f:f+r`) for each pair of consonant sounds a word uses
  (`blendsIn` in `phonics.js`), made from the two picked sounds by `blend()` in `lab.py` (a held
  first sound cut to 220 ms, 30 ms overlap; a stop second, as in n+d, comes after a 90 ms gap
  instead, since overlapping hid its burst; picked by ear; `BLEND_RECIPE` / `BLEND_STOP_RECIPE`
  in `build.mjs`, `STOPS` in `phonics.js`), with
  `<key>.json` beside it giving where the second sound starts, which `audio.json` carries as
  `splits` for the app to light that box; never the device voice, which can't say "k"):
  Kokoro (open-source neural TTS, voice `af_heart`), pre-generated at deploy by
  `scripts/audio/build.mjs` and served from Cloudflare Pages
  (`sound-box-crosswords.asset-data.stream`, project `sound-box-crosswords-audio`). Words
  and syllables are said at the end of a phrase ("and next, ___.") and cut out, since
  Kokoro mispronounces them alone (`generate.py`; how that was chosen and how to re-test:
  `scripts/audio/eval/`). Clip names hash model + voice + speed + method (`METHOD` in
  `build.mjs`; `SPEED_FOR` / `METHOD_FOR` for single clips picked by ear, e.g. "New achievement!"
  in Kokoro's long-sentence voice style, which sounds more excited) + text, so only new or changed text is generated; the
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
  better voice (iPad: Settings → Accessibility → Spoken Content → Voices), the app uses it
  with no setting to change. There's no voice picker: the device voice only reads Custom
  words and fills in when clips can't load, so it isn't worth a setting.
- **Pictures are emoji**, which keeps it offline-friendly and license-free. Don't add
  copyrighted characters or images. A word with no emoji is listen-only: the app draws a
  sound-wave icon (`WAVE` / `setPic` in `app.js`).
- **State** (settings, custom list, stars, selected pack) lives in `localStorage`, always
  wrapped in try/catch. No accounts. **Profiles** (one player's progress each) are all kept
  the same way: `sbx:@<id>:` (`profilePrefix`), then each edition's own prefix
  (`storagePrefix` in `words.js`: none for `packs.toml`'s edition, `<id>:` for others;
  together `gradePrefix`), through `store` in `app.js`; `who` holds a profile's own: its grade
  (`edition`), link key and sync time (`OWN_KEYS`; per grade, `GRADE_KEYS`: add a new saved
  key there). `device` (plain `sbx:`) holds what's the device's: `profiles` (id and name),
  `profile` (the one playing), the device id, the storage version and the Home Screen tip.
  Every device starts with one profile, `default`; others only arrive by Receive. Names are
  the device's own and never sync (empty shows as "Default"). Any player but the one playing
  can be removed (`removeProfile` / `wipeProfile`: everything under its prefix).
  **Storage versions** (`upgradeStorage`, device `storage`): 2 moved the first player's data
  from the plain keys (`sbx:` and `sbx:<edition>:`, from before profiles) to `sbx:@default:`,
  one key at a time, so a move cut short carries on at the next launch. **Linking** (More → Link, which says "player",
  one task at a time, `linkView`): Send ("Play on another device too") shows the active
  profile's link code (`linkFor`: the site's address + `#link=<key>`, also as a QR code);
  Receive ("Get a player from another device") starts the camera (`js/scan.js`), or pastes
  the link, then asks "Who is this?": the same player as this device (Replace: its progress
  here goes) or someone else (Add: a new, named profile; the first time, the default is named
  too). A linked profile syncs every grade it has (`syncAll` / `syncProfile`, `sync.js`) at
  launch, on visibility changes, when back online, and shortly after a puzzle, a setting or
  a Custom list change (`syncSoon`); each grade keeps the last merged record as `syncBase`.
  The grade being played is read from and written to the page's variables (`readGrade`,
  `applyLive`; a changed setting shows at the next puzzle). `?sync=<address>` on localhost
  points at `npx wrangler dev` in `sync/`. A page opened with `#link=` drops it from the
  address and opens Link (`welcomeLink`). (The chime was the device's until
  it became each edition's; `moveChime` in `app.js` copied the device's choice into every
  edition once, before the storage upgrade.)
- Light and dark themes via CSS custom properties on `:root`, with
  `prefers-color-scheme` and `[data-theme]` overrides. Define new colors as tokens.
- Respect `prefers-reduced-motion`.

## Code map

- `index.html`: markup only (board, clue bar, letter pad, settings sheet).
- The app icon: a crossing of sound boxes with the empty orange box and sound waves.
  `design/icon/` holds its source (not deployed): flat SVG layers made by `make.py`, and
  `full.icon`, the Icon Composer design (blue, with dark and tinted versions).
  `design/icon/site.py` renders it into `apple-touch-icon.png` (180px, square and opaque, as
  iOS needs), `icon-192.png` and `icon-512.png` (rounded, see-through corners), in sRGB;
  rerun it after changing `full.icon`. `favicon.svg` is hand-drawn, simple enough for 16px, in the icon's
  colors (blue `#2da5ff`, the icon's sRGB blue).
- `manifest.webmanifest`: the home-screen / install manifest (short name "Sound Box"),
  with `icon-192.png` and `icon-512.png`.
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
  that plays them with the app's pauses, then the word; one mark for the run. Sounds and Phrases cards
  hold what every grade shares: the 46 single sounds, and "You solved it!", "Way to go!" and the
  achievement pieces.
  It reads `packs.toml` and `audio.json` like the app (locally it falls back to the live
  `audio.json`), and `clipsFor` in `crossword.js` decides each word's clips for both it and
  the audio build. Marks are per device (`sbx:listen`), keyed by word, part and clip (the same
  recording can be right in one word and wrong in another), so a changed hint shows up as
  not heard. Report copies the ✗ list or opens a GitHub issue. It spells
  every pack word, so nothing in the app links to it and it's `noindex` (the check
  enforces both).
- `sw.js`: service worker, so a home-screen launch works offline. The page and unstamped
  files are network first (4 s, then the saved copy); `?v=` files, the CDN parser, fonts
  and audio clips are saved copy first. Clips are answered by byte range (Safari's
  `<audio>` asks for ranges). Registered by `app.js`, but not on localhost, so local
  edits always show.
- Updates in a home-screen app: it usually resumes rather than relaunching, so on each
  return to the screen `app.js` compares its `?v=` stamp with the live page's and
  reloads unless a sheet or popup is open (the puzzle in progress is saved and comes back),
  or else at the next new puzzle (`updateReady`).
- `styles.css`: all styles. Color tokens on `:root` with dark overrides at the top.
  `--cell` is the box color token; `--cell-size` is the box size set by `sizeBoard`.
- **Editions** (`editions.toml`): one packs file per grade, e.g. Kindergarten
  (`editions/kindergarten.toml`) and 3rd grade (`packs.toml`). Each has a `name` (the grade question and Settings; can be long, e.g. a classroom) and a `short` (achievement cards, shared cards, the 🏆 sheet; up to 16 characters, unique). The first visit asks "Which
  grade?" (`pickEdition` in `app.js`), unless there's progress from before editions (then
  `packs.toml`'s) or a `?edition=<id>` link; More → Edition (a dropdown above the tabs, since Settings and Stats are per edition) switches. A Home Screen
  app starts with empty storage, so the page's address (`?start=<id>`) and manifest
  (`editions/<id>.webmanifest`, written at deploy by `stamp.mjs` from `manifest.webmanifest`
  with that `start_url`) carry the grade in use (`homeScreenEdition` in `app.js`); `?start=` only
  applies when the device hasn't picked one. Each
  edition keeps its own progress, achievements, collection, colors, Custom list and settings
  (letter pad, syllable colors, auto-speak, sound effects, Custom pack on/off); an edition
  can set the letter pad default (`keyboard = "abc"`) and turn on Sound it out
  (`sound_it_out = true`). The check, the audio build and the
  listen check cover every edition. Never change an edition's `id` once in use.
- `packs.toml`: the word packs, in display order (the 3rd grade edition; other editions'
  files use the same format). Each `[[pack]]` has `id` (saved progress
  is keyed by it; don't rename), `name`, `note` (shown under the chips), `words`, and optionally `school = true` (the school's own list, not
  one of the app's phonics packs: its chip shows 🏫; `renderPacks`) or `hard = true` (a hard mode
  pack, any number per edition: its chip shows 🥋 and sits last, locked (dashed, 🔒, a toast on
  tap) until the edition's first Champion of another pack, Custom aside (`hardOpen`); named for its theme, never "Hard mode");
  `[custom] words` is the starter "Custom" list. **Word list format** (packs and the custom list share it): one entry per
  line, `syl-la-bles emoji`, e.g. `but-ter-fly 🦋`. Dashes mark syllables and drive the
  coloring and *Break it down*. Letters (plus apostrophes, e.g. `don't`; the
  player types the apostrophe into its own box with the pad's `'` key), 2–12 characters. `(how-it-sounds)` at the end, one part
  per syllable, e.g. `ba-nan-a 🍌 (buh-nan-uh)`: *Break it down* speaks those instead of the
  spelled syllables, which TTS misreads alone (`vol` → "volume", `ap` → "A P", `to` →
  "too", `ger` → "jer"). **Required for every multi-syllable pack word** (optional in a
  grown-up's own list). Use real words or 3+ letter spellings with a clear vowel; the
  check flags short parts and common abbreviations. The recording voice has misreads of its
  own (`ick` → "Ike"): when one is reported, `scripts/audio/hints.sh` shows how it will say
  each hint part beside the whole word, to find a spelling that works. Fix what's reported
  in the listen check, not guesses. Last, an optional `"context sentence"`
  that uses the word: *Hear it*, the picture, and auto-speak then say word, sentence, word
  (spelling-test style; `sayWord` in `app.js`). **Required for pack words with no emoji**,
  and it tells homophones apart (their/there). Also shown under the clue with the word as a blank of small boxes, one per letter like the grid (`blankSentence` in
  `crossword.js`); a word with a picture and no sentence shows just its blank boxes on that line, with an
  arrow up to the picture (`showSentence` in `app.js`), when the puzzle has the line, so it must not use another word from the same pack; the check enforces this. Syllable splits should match how a
  teacher would clap the word. A word in more than one list (another pack or edition) matches
  everywhere (syllables, emoji, hint, sentence, and sounds between Sound it out editions), so
  one recording and one listen mark cover it; the check enforces this unless the line above
  it says `# differs: <why>` (the app skips `#` lines).
- `js/words.js`: `loadPacks` fetches and parses `packs.toml`; `readPacks` turns TOML text
  into `{ packs, starter }` and appends the built-in `mine` pack.
- `js/phonics.js`: no DOM. Sound it out's sounds (`SOUNDS`, kept equal to `picks.json` by the
  check), each letter group's usual sound (`USUAL`: c → k, sh, ee, x → ks, qu → kw), and
  `parseSounds` for a word list's `{c a t}` / `{c=s i t y=ee}` (letters grouped by sound; `=`
  names an unusual sound; groups with no usual sound, like ow, must say which), and `blendsIn`
  (a word's blends: consonant sounds in pairs, left to right), and `slipSpots` (where wrong
  letters fall, for Stats).
- `js/crossword.js`: no DOM, runs in Node. `parseList` reads word lists. `makePuzzle(pool,
  recent)` builds a crossword: greedy placement with crossing checks, many random attempts,
  keeps the layout with the most words and smallest area (always at least 3 words: covering a
  not-yet-done word never wins over that; the check also fails a word that shares no letter with
  the rest of its pack, since it could never cross in), max 11 columns × 12 rows so it
  fits a phone, avoids `recent` words. Returns `P` (`words`, `cells`, `rows`, `cols`); each
  word has `cells`, `chunks` (syllables) and `sylOf` (syllable index per letter).
- `js/merge.js`: no DOM. Combining two copies of a profile's progress, for syncing (`sync.js`). `toRecord` turns a grade's saved data into a sync record, `merge` combines two
  records (order doesn't matter; merging twice changes nothing), `fromRecord` turns one back.
  Earned things only grow; tallies (word stats, counts, slips, stars) are kept per device in
  the record, each device's share being its total less the others' in the last record it
  merged, so the app keeps saving plain totals; a pack's later round wins (`rounds` in
  `progress`); settings and Custom list words go by an edit counter, never the clock, and a
  removed Custom word stays removed. Tests: `scripts/merge.test.mjs`, run by the check. A
  new saved key must be added there or left out of sync on purpose. **The record's format is
  gated**: every device merges and saves records back, and an older app drops what it doesn't
  know, so changing the format needs a new `RECORD_VERSION` (older apps then leave that grade
  alone until they update: `NewerRecord` in `sync.js`) and its shape in `SHAPES` in the test,
  which fails otherwise. The check also fails on a key saved per grade that isn't in
  `GRADE_KEYS`, or for a player that isn't in `OWN_KEYS` (`app.js`).
- `js/sync.js`: no DOM. `syncGrade`, one sync of one grade: fetch, merge (`merge.js`), save
  from the fetched version (409: again), then keep the result plus anything played meanwhile;
  saves nothing when nothing changed (`canon`). `remoteGrades`. `fetch` is passed in; tested
  against the service in `scripts/sync.test.mjs`.
- `js/scan.js`: the camera QR reader for Receive (jsQR), loaded only when it starts.
- `js/linkqr.js`: no DOM. Send's QR code, drawn from the `qrcode` grid so it isn't mistaken for
  the share sheet's: round dots, rounded corner eyes with an orange box, a key in the middle
  (error correction H). Fixed dark colors on white, so cameras read
  them; after changing it, check that rendered codes still decode.
- `js/seal.js`: no DOM. Seals sync records with the browser's own Web
  Crypto: a profile key (`newKey`, 43 base64url characters, carried only after `#link=` in a
  link: `linkFor` / `keyFromLink`) gives, by HKDF, the lookup ID the server sees and an
  AES-256-GCM key (`keysFor`); `seal` / `unseal` gzip the JSON and bind it to its profile and
  grade. Tests: `scripts/seal.test.mjs`.
- `sync/`: the sync service, a Cloudflare Worker at `sound-box-sync.asset-data.stream`
  (`wrangler.jsonc`; deployed by the `sync-deploy` job, not part of the site). `src/api.js`
  checks requests (CORS to the site and localhost, sealed records up to 64 KB) and routes
  them; `src/profile.js` is one SQLite Durable Object per profile, keeping each grade's latest
  record and refusing a save from an out-of-date version (409: fetch, merge, try again);
  `src/index.js` only exports them (the runtime refuses other exports there). Tests:
  `scripts/sync.test.mjs` (in memory). To try it in the real runtime: `npx wrangler dev`
  in `sync/`. It can't read what it stores and holds no names or accounts.
- `js/confetti.js`: `confetti(host)`, the solve celebration (skipped with reduced motion).
- `js/entrances.js`: new-puzzle entrances, how a fresh puzzle's boxes arrive (designed in the
  Board Entrances spike). `ENTRANCES` (each a `plan` of keyframes per box plus timed sounds;
  `premium` ones are the showpieces), `geometry` (where each box is), `playEntrance` (`{ done,
  skip }`; skip jumps to the finished board and silences its sounds) and `nextEntrance`: every 5th
  turn a premium one (`PREMIUM_EVERY`), otherwise an everyday one, each kind from its own
  shuffled queue, never the same twice in a row (saved per edition as `entrances`). In `app.js`, `runEntrance` plays one for a new
  puzzle (not one restored at launch; at launch it waits for the Start tap, `.board.waiting`),
  but only the new puzzle after a finished one moves the cycle on (`entranceDue`, saved at the solve, so an update's reload in between keeps it); otherwise the same one replays. As it ends, the first word is said (with auto-speak on;
  `sayFirstWord`), unless the player already picked another word or typed. The
  selection is off while one plays (`.board.entering`), so the premium ones can deliver the highlight;
  skipped with reduced motion; the puzzle card scrolls into view
  (`showBoardCard`) and the letter pad is unpinned while it plays (`.keyboard.resting`: it sits in its place below the puzzle, often off a phone's screen) and pinned again after, rising in if it was off screen (`pinPad`); physical keys still type, and nothing
  cuts it short but a new puzzle. Its sounds are
  `js/sfx.js` (`makeSfx`, Web Audio like the chime, through `audioOut()` in `chime.js`) and
  follow the Sound effects setting. To refine them, open the app with `?backstage` (it stays on, on that device, until its
  Exit button; ↻ reloads to pick up code changes) (`js/entrance-tester.js`,
  loaded only then; nothing links to it): a bar replays any entrance on the real board (this
  puzzle or a new shape), at ½× or ¼× (no sound then), looped, with its running time; it leaves
  the cycle, the queue and Front Row Seat alone, and plays even with reduced motion. Each entrance seen to the end is saved (`seenEntrances`,
  `sawEntrance`); all of them earns the secret Front Row Seat, which unlocks the 🏆 sheet's
  Director tab (shown as a locked ??? until then; `renderEntrances`): every entrance (`icon`, ⭐ for premium), tapped into an
  order (`entranceQueue`) that finished puzzles play one each before the usual cycle.
- `js/achievements.js`: no DOM. `catalog(state)` lists achievements (pack champion, then once that's reached a pack
  Legend, every word right on the first try, not for Custom, and unlocking no colors; tiered
  clean solves, comeback words, practice days, showing only the next unmet tier), `award`
  records newly met ones in `sbx:achievements` ({ id: time }); earned ones are never taken
  away (no streaks). Inputs saved by `app.js`: `sbx:counts` { clean, comeback } and
  `sbx:days` (local "YYYY-MM-DD" with a finished puzzle), backfilled from `sbx:log` once.
  Champion of Champions and then Legend of Legends: every pack's Champion / Legend, in grades
  with at least 5 packs (Custom and hard packs don't count). Hard Mode 🥋 (`HARD`, listed in
  grades with a hard pack): a puzzle finished in one (`counts.hard`); its card, and a hard pack's
  Champion and Legend cards, add "Hard mode" to the grade line (`gradeLine` in `app.js`, on the
  big card and the share card). Secret achievements (`SECRETS`: Good Listener,
  Two for One, Triple Digits, Weekend Speller, Touch Typist, Show-Off, New Look, Collector's
  Eye, Front Row Seat) show as ??? in the 🏆 sheet until earned, with no hint, and their card says "Secret
  achievement!"; their counts are in `sbx:counts` too (puzzle ones from `pz`, this puzzle's
  flags in `app.js`).
  Shown on the solved card, as a big card per new achievement (`showAwards`, after the
  solve celebration; achievements awarded quietly at startup never pop up, except secret
  ones), in the 🏆 sheet, and as a "You got it this time!" toast. A secret earned outside a
  puzzle (sharing, colors, the collection) doesn't interrupt: it waits in `sbx:pending` behind
  the 🕵️ pill under the title (`refreshPill`), which stays until tapped and waits while a
  sheet or card is open; a puzzle solved meanwhile shows it with its own.
- Picture collection (🏆 sheet, Collection tab; `renderCollection` in `app.js`): a word's
  picture is collected the first time it's spelled right on the first try (`stats.ok > 0`).
  Pictures only, never words (slots are labeled "collected" / "not yet"); tapping a
  collected picture says the word. Picture-less words get "sound stickers" there
  (`js/stickers.js`: abstract SVG badge + gradient + sound motif, different ones in pack
  order) instead of the in-game sound wave. Never emoji or objects, so they can't be
  mistaken for a pack picture, now or in future packs. The solved card shows "+N pictures".
- `js/palettes.js`: no DOM. `PALETTES`, the grid color schemes (syllable bands, accent,
  selection; light and dark). Classic is everyone's and must match `styles.css`; finishing
  a pack (a `pack:` achievement) unlocks the next (`unlockedCount`, `EVERYDAY` of them). Black
  Belt (`secret`, last) is opened only by a hard pack's Champion, and shows as 🔒 ??? until then
  (only in grades with a hard pack). `paletteCSS` makes the
  rules for `:root[data-palette]` and the picker swatches. Picked in the 🏆 sheet's Colors
  tab (`renderColors` in `app.js`), saved as `settings.palette`. Cosmetic only. The check
  holds every scheme to Classic's contrast and keeps the two syllable bands clearly apart.
- `js/sharecard.js`: `renderCard` draws an achievement as a 1080×1350 PNG in the current
  theme (app name, emoji, title, detail, date, up to 6 collected pictures, site address;
  never spelling words or a name). A pack's Champion or Legend shows that pack's pictures
  plus a "+N" tile for the rest of its words, so a big pack looks big (`sharePics` in
  `app.js`); its detail gives the size ("Cleared all 23 words in Blends"), though what's said
  stays "Cleared every word in this pack"; `shareCard` opens the share sheet, or downloads where
  file sharing isn't supported. The big award card shows Share; earned achievements in the
  🏆 sheet reopen in it. The PNG is made when the card shows, since iPad Safari only opens
  the share sheet straight from a tap.
- `js/chime.js`: Web Audio reward sounds, picked by ear (Settings → Sound effects): `chime()` on solve
  (a quick glitter run of high bells), `sparkle()` before "New achievement!" (a climb into a chord). The
  audio context is unlocked on the first tap for iOS. It doesn't follow the mute switch:
  iOS can only do that for the whole page, which would silence the recorded words too.
- `js/speech.js`: `say(kind, text, rate, cancel)` (recorded clip or device voice, one
  queue; kinds `w` word, `s` syllable, `t` sentence, `p` phrase), `sayRecorded(kind, text, cues)`
  (clips only; `cues` call a function at a point in the clip, by its playback position),
  `splitOf` (a blend's split), `stopSpeech`,
  `speechEpoch`, `speak` (device voice only), `hasSpeech`; device voice ranking (`score`;
  re-picked when Safari loads voices late).
- `js/app.js`: everything on screen.
  - Play state: `fill`, `locked`, `doneW`, `cur` (word), `pos` (letter index), `misses`,
    `missedW` (words with a wrong try this puzzle).
  - The puzzle in progress (`puzzle`, per edition): its layout, letters, finished words and
    selection, saved by `update()` (`savePuzzle`) and restored at launch (`loadPuzzle`,
    `restorePuzzle` in `crossword.js`) if its pack still has every word; cleared once solved.
  - Saved progress (`sbx:progress`, per pack): `done`, `round` (coverage), and
    `stats[word]` = `{ n, ok, miss }` (typed completions, first-try right, wrong tries);
    words finished by a crossing word don't count as typed. `sbx:log`: finished puzzles.
  - Start / Continue (`showStart` / `start`): one big button over the clue and board at launch (it covers
    only those and the pad and pictures, `.play`, so the packs, 🏆 and More stay usable), since
    iOS plays recorded words, the device voice and the chime only after a tap; tapping it (or
    any key or letter pad tap, which isn't typed) dismisses it and says the current word if auto-speak is on.
    The letter pad is unpinned meanwhile (`.asleep`, under the cover); the cover spans the clue, puzzle, pad and pictures (`.play`).
    Skipped after the first-visit grade question (a tap already). It says Continue only for a
    puzzle with letters typed (`played`); an untouched saved puzzle counts as new (Start, with
    its entrance). New puzzle, Next puzzle or a pack tap while it shows dismisses it and starts
    the new puzzle (`startNewPuzzle`). On return from the background, the button shows only if
    `audioAwake()` (`chime.js`) can't wake the sound.
    Its text color is navy or white, whichever stands out more on the scheme's accent (`onAccent`).
  - The guessing nudge (`noteGuesses`): a 4th wrong letter that isn't close (`isClose` in
    `phonics.js`: any vowel for a vowel, c/k/s, b/p, d/t...) in the same box of a word, with no
    listening in between (Hear it, Break it down, Sound it out or the picture clear the count,
    `listened`), says "Slow down and sound it out." and pauses the letter pad for a second
    (`.paused`), once per word. Counted in `sbx:guessing` for Stats. `GUESSES` / `PAD_PAUSE` tune it.
  - `input` / `checkWord` / `complete` / `settleCrossings`: whole-word checking only. Letters
    are accepted until the word is full; then wrong letters flash and clear. Finishing one
    word can finish a crossing word. (A check-each-letter mode was removed: it let a stuck
    player guess letters until one stuck.)
  - `clap`: the Break it down scaffold. `back`: erase.
  - `renderBoard`, `update`, `renderClues`, `renderKeyboard`, `renderPacks`: UI.
  - The More sheet (`#settingsBtn`, a quiet line gear + "More" in the muted color, no pill, so it
    reads as the grown-ups' door beside the 🏆): above the tabs, the profile picker (two or more profiles; a quiet line under the title, "Playing as Sam", `#whoPill`, opens More; not at the very top, where iOS blurs under the status bar) and Edition; tabs Settings, Stats, Link (two tasks, the players on this device, sync status, under a short note on how linking works; `renderLink`) and About (license, Home Screen steps); `openSheet(tab)` opens
    on Settings or the named tab (`SHEET_TABS`; the Home Screen tip's How? shows the same steps as About in a popover, `#installPop`), with
    `closeSheet` and the change handlers below them. `selectTab` switches tabs here and in 🏆.
  - Stats (`renderProgressSheet`): practice days, the last 4 weeks (`renderCalendar`); each
    pack's words done and right on the first try; comebacks (`counts.comeback`: words right on
    the first try after an earlier miss); where the slips happen (`renderSlips`: the
    wrong letters in try-agains by place, beginning / middle / end, and by kind, vowel / letter
    in a blend / other consonant, from `slipSpots` in `phonics.js`, counted in `checkWord` into
    `sbx:slips`; shown from 10); tricky words (`renderTricky`: missed more often than right
    first try, as pictures or sound stickers to tap and hear); guessing (`renderGuessing`, once the
    nudge below has fired: how often, and on which words); recent puzzles. Like the rest
    of the sheet it isn't locked, so it never shows a spelling.
  - Start over (Settings): clears this edition's `achievements`, `progress`, `counts`, `days`,
    `log`, `stars`, `puzzle`, `pending`, `slips`, `seenEntrances`, `entranceQueue` and `entranceDue` (`RESET_KEYS`) and the color scheme, once "start over" is
    typed. Achievements, stars, pictures and colors are all worked out from progress, so
    clearing only achievements would bring them back. Settings and the Custom list stay.
    A linked profile is unlinked too (`unlink`), so the erased progress can't sync back;
    other devices keep the shared profile.

## Working on it

- **Every change goes through a pull request.** More than one agent may be working at once,
  so don't push to `main`: `git fetch`, branch from `origin/main`, push the branch, and open
  a PR. CI runs the check on the PR; merging to `main` deploys. Leave merging to Jay.
  Use a separate git worktree per agent (Claude Code keeps them in `.claude/worktrees/`,
  which is gitignored); stage files by name rather than `git add -A`.
- Run locally with any static server, e.g. `python3 -m http.server`, then open
  http://localhost:8000. Opening `index.html` as a file won't work (modules need http).
- After editing, run `npm run check` (needs `npm install` once): runs `scripts/*.test.mjs`, syntax-checks `js/` and `sync/src/`,
  checks local links in `index.html`, validates `packs.toml` and every word list, checks
  the import map matches `package.json`, and builds 50 puzzles per pack. CI runs it too.
- GitHub Actions workflows must pass `zizmor .`: SHA-pinned actions, minimal `permissions`,
  `persist-credentials: false`.
- Test in a narrow viewport (~380px) and in dark mode. Make sure long words (9+ letters)
  still fit and the letter pad stays tappable (keys ≥ 44px tall).
- Issue forms (`.github/ISSUE_TEMPLATE/`): "Add a word pack" and "Add an edition" walk
  someone through writing the TOML in the issue, from `<...>` placeholders. The edition is
  typed, not picked, so the forms need no upkeep when editions change.
- To add a school unit's spelling list as a pack, use the `add-unit-pack` skill
  (`.claude/skills/add-unit-pack/SKILL.md`): the steps, the word rules, and a PR review table.
- When adding words, check that the emoji clearly shows that word, and that the spelling
  fits the pack's pattern. If no emoji shows it without misleading (their, would, done),
  leave the emoji off rather than picking a loose match.
- Keep the copy short and plain; players are young and some text is read by a grown-up.
  It's a free side project: the app never speaks as "we" or "us" (one exception: the "We Can Do It" achievement, a nod to Rosie the Riveter's poster), and doesn't promise
  support or turnaround (say what to do, e.g. "Open an issue on GitHub", not "Tell us").
- License: PolyForm Noncommercial 1.0.0 (`LICENSE.md`, whose first line is the
  `Required Notice:` copyright that must travel with copies). The README lists the
  third-party parts; add any new dependency, font or asset there with its license, and
  name it in About's Credits line (`index.html`), which links to the README's License section.
  `MODELS.md` describes the models and tools that make the recordings (About's "Kokoro" links
  there, not to the model's own page); update it when the audio build changes.
- This repo is public. Keep it about the general learner profile; don't add personal details
  about any specific child (name, school, diagnoses).
