---
name: add-unit-pack
description: Turn a school spelling list (typed, pasted, or a photo of the sheet) into a new "Unit N" pack in packs.toml, following the app's word rules, then run the check and open a PR with a review table. Use when someone shares a unit's or week's spelling words for Sound Box Crosswords.
---

# Add a school unit pack

A school unit pack is the class's own list, so keep every word the teacher assigned, even
ones outside the app's spelling patterns. Your job is to turn each word into an entry that
plays well: the right syllable split, an honest picture or none, a "how it sounds" hint that
the voice says correctly, and a sentence where one helps. The grown-up reviews your
judgment calls in the PR, so make them easy to see.

Read the header of `packs.toml` (the entry format), `editions.toml` (one packs file per
grade), and the Goals in `CLAUDE.md` first. The
rules below add to them; they don't replace them.

## 1. Get the list

- **Which grade (edition):** find it in `editions.toml` and work in that edition's file
  (`packs.toml` for 3rd grade, `editions/kindergarten.toml` for Kindergarten). If it's not
  clear which child or grade the list is for, ask. A grade that isn't there yet needs a
  new `[[edition]]` and file; ask before adding one.
- **Sound it out (Kindergarten):** words a child can sound out (cat, ship, frog) get their
  sounds at the end of the line, `{c a t}` (see the `packs.toml` header and `js/phonics.js`).
  Sight words and high-frequency words don't. Flag any unusual sound (`{c=s i t y=ee}`) in
  the review table.
- **Kindergarten high-frequency lists** go into the growing `k-hfw` pack rather than a
  new Unit pack. That pack sets `words_in_text = true`, so its sentences may use the
  other words naturally. One-letter words ("I", "a") can't be added: say so in the PR.

- **What you need:** the words, the grade, the school year, and the unit number. If the
  unit number or grade isn't given, look at the newest Unit pack in `packs.toml` (its `id`
  is `g<grade>-<year>-unit<N>`) and ask whether this is the next one. Don't guess.
- **From an issue:** the "Add a word pack" form (`.github/ISSUE_TEMPLATE/add-pack.yml`)
  gives the edition (typed: match it to `editions.toml`, and ask if it's unclear) and the
  pack written as TOML, plus notes and maybe a photo of the sheet. Treat it as a draft:
  check every line against the rules here, fix what's off (and say so in the review table),
  and flag any `<...>` placeholder left in. Link the issue in the PR (`Closes #N`).
- **From a photo:** copy the words exactly as printed. Don't fix the school's spelling and
  don't add or drop words. List anything you can't read clearly and ask about it.
- **Bonus or challenge words:** ask whether to include them. Default to the main list only.
- **Limits:** the check needs at least 10 words; each word must be 2–12 letters (letters
  and apostrophes only). If the list is shorter, or a word is longer or has a hyphen or
  space, stop and ask: don't drop or change words silently.

## 2. Branch

Follow "Working on it" in `CLAUDE.md`: a worktree in `.claude/worktrees/`, branched from
`origin/main`, and a PR. Never push to `main`.

## 3. The pack block

Add it at the top of the edition's packs file, above the previous unit (newest first):

```toml
[[pack]]
id = "g3-2026-unit4"
name = "Unit 4"
note = "3rd grade 2026 school words. A sound wave means listen, then spell."
words = """
...
"""
```

- `id`: `g<grade>-<year>-unit<N>`, with the same year as the earlier units of that school
  year (`2026` for 2026–27). Saved progress is keyed by it, so it can never change once shipped.
- `name`: `Unit N`. `note`: the same line as the other units, with grade and year.
- Keep the words in the school's order.

## 4. Each word

One line: `syl-la-bles emoji (how-it-sounds) "Sentence that uses it."` Only the word is
always required; the check enforces the rest.

**Syllables.** Split the way a teacher would clap the word, by sound:

- Compounds split between their parts: `sun-shine`, `cow-boy`.
- A suffix is its own syllable only when it's its own beat: `burn-ing`, `ex-cit-ed`, but
  `jumped` and `stomped` are one syllable.
- Follow the earlier Unit packs and the 2-syllable / 3-syllable packs for similar words.
- Flag any split you weren't sure about in the PR table.

**Picture (emoji).** Add one only if a child looking at it would say this exact word.

- Leave it off when no emoji shows it honestly: function words (their, would, these,
  done), verbs and adjectives that need context, abstract words. Leaving it off is
  normal and fine: the app shows a sound wave and speaks the sentence.
- Reject near misses: an emoji that more naturally names a different word (a synonym, a
  related object, the plural) teaches the wrong spelling.
- Check it renders as one emoji, not two side by side.

**How it sounds `( )`** (required for 2+ syllables). Break it down speaks each part
alone, and a TTS voice misreads short or odd parts ("vol" → "volume", "ap" → "A P").

- One part per syllable, lowercase, joined by dashes.
- Use real words or 3+ letter spellings with a clear vowel: `ex-plore`, `chick-in`,
  `pan-ick`, `eggs-it`, `ub-zurv`. Use `uh` for the soft unstressed vowel: `uh-round`.
- The check rejects parts that are too short or on its list of known misreads
  (`SAFE_SHORT` and `ABBREV` in `scripts/check.mjs`). Pick a longer spelling, don't
  just get past the check.

**Sentence `" "`** (required when there's no emoji).

- Add one for every word without an emoji, for homophones (their / there), and for any
  word whose emoji alone could mean something else.
- Short (about 10 words or fewer), concrete, about a child's everyday life. Friendly but
  not babyish. No real names.
- It must contain the word in exactly that form (the check looks for the whole word).
- It must not contain any other word from the same pack, including its plural or -ed /
  -ing forms: the sentence is shown on screen with only its own word blanked out. The
  check catches this.
- It must make the word clear when heard: someone hearing only the sentence should be
  able to tell which word is meant.

## 5. Check and play

- `npm install` once in the worktree if `node_modules` is missing (then `git checkout
  package-lock.json` if it changed), then `npm run check`. Fix every error; never weaken
  the check to pass.
- Serve the worktree (`python3 -m http.server`) and play a couple of puzzles of the new
  pack at ~380px wide: the clue bar, Hear it, Break it down, and the sentence with its
  blank. Local play uses the device voice; the recorded voice is generated at deploy.

## 6. Pull request

Commit only the edition's packs file (stage it by name). Open a PR titled `Add Unit N spelling pack`
with:

- **The source:** where the list came from and anything you were unsure about
  reading.
- **A review table**, one row per word: word, syllables, emoji (or "none"), how it
  sounds, sentence, and a **Check** column naming any judgment call (uncertain split,
  emoji left off on purpose, homophone, a hint chosen to avoid a misread). Put the words
  that need a look first.
- **Testing:** `npm run check` output and what you played.

Leave merging to Jay.

## 7. After it deploys

The deploy records every new word, syllable and sentence. In the PR, and when telling Jay
it's ready, give the listen check link for the new pack:
`https://tools.tuley.name/sound-box-crosswords/listen/?edition=<edition id>&pack=<id>`. Its "Not heard" view
shows just the new recordings to play and mark ✓ or ✗.

A ✗ comes back as pasted text or a GitHub issue ("Recordings to fix: …"), one line per
clip with the pack, word, part, note and clip id. Fix only what was reported (don't sweep
other words that might be wrong: they've been heard), each in a follow-up PR:

- A syllable: change that word's `( )` hint to a clearer spelling (same rules as step 4).
  The voice has its own misreads (`ick` → "Ike"): `sh scripts/audio/hints.sh <model-dir>`
  (in Apple's `container`; model files as in `scripts/audio/kokoro.sh`) shows how it will say
  a hint, so try spellings until the part matches the word (`ikk` → `ˈɪk`).
- A whole word: try a hint-free fix first only if it's a known case (`SPEED_FOR` in
  `scripts/audio/build.mjs` slows one clip); otherwise describe it in the PR and ask.
- A sentence: reword it (still short, uses the word, no other pack words).

A changed hint or sentence is a new clip, so it shows up as "Not heard" again after the
next deploy. Say so in the PR so it gets a second listen.
