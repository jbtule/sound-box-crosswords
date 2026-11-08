---
name: write-quips
description: Brainstorm, audition and add quips (the short funny line said in another voice after a word is spelled, `~"..."` on a word list line) for Sound Box Crosswords, following the quip guidelines, then open a PR. Use when someone asks for quips for a pack or word, or wants to rework existing ones.
---

# Write quips

A quip is a short line said in the quip voice (Bella) a beat after a word is spelled, now and
then (`maybeQuip` in `js/app.js`; see the Quips bullet in `CLAUDE.md`). It's written last on
the word's line in a word list: `cac-tus 🌵 (cack-tuss) ~"No hugs."`. Quips are only ever
spoken, never shown. The grown-up picks every quip by ear, so the job is good options plus an
easy way to hear them.

## The guidelines

**Tone**
1. **Cheer the player on, or be silly.** "I'm rooting for you!", "Tiny trees! Yum!",
   "I only walk sideways."
2. **Never aimed at the player.** No pushing away, scolding, or telling the player what to do.
   Replaced for this: "Leaf me alone.", "Don't pinch me!", "Wash your hands!", "Make sure you
   eat it!", "What's the magic word?", "Says who?".
3. **Grumpy is fine when it's the thing's own joke.** Cactus "No hugs." is about the cactus,
   not the player.
4. **Never encourage risky behavior.** Danger is funny through being nervous or careful
   ("Safety spelling goggles: on!"), never daring ("Hold my juice box").
5. **Not babyish.** Players are strong readers (Goals in `CLAUDE.md`): playful, not toddler talk.
6. **The app's spelling-obsessed inner thoughts are a favorite:** "Yay! More spelling words!",
   "Gimme, gimme more words!", "Safety spelling goggles: on!", "Nice try. More words!". The
   obsession is with words, never a judgment of the player's spelling. One favored style among
   the others, not a quota: offer one where it fits the word.

**Fit**
7. **About the word:** its meaning, picture or sentence. storm "I'm not scared. Okay, maybe.",
   publish "Extra! Extra!".
8. **Not every word needs one.** Function words (these, those, said) rarely have a natural
   joke, and no quip beats a weak one.
9. **Each one distinct.** Two words sharing a line ("Which ones?") falls flat.
10. **Still funny the fifth time.** Quips come in about 6 puzzles in 10, so a line with some
    character holds up better than a plain reaction.

**Rules**
11. **5 words at most** (the word list header says so).
12. **The same quip in every list a word is in** (the check enforces it), unless different
    audiences call for different lines: then mark it with `# differs: <why>` on the line above.

**Sound**
13. **Hear it before choosing** (step 2 below): the word's recording, a beat, then the take.
14. **Watch for the voice's weak spots.** Kokoro mangles some interjections ("Hmm") and
    foreign words ("Allons-y"). A respelling can fix one, since quips are only spoken, but a
    line that also reads well in the file is better ("Onward!" over "Ah-lon-zee!").
15. **Punctuation sets the delivery:** "!" sounds excited, "." dry ("Fascinating." vs "Yay!").

## Steps

1. **Brainstorm.** Read the pack's words, pictures and sentences, and its existing quips
   (the listen check shows each pack's quip count). For each word asked about, write 4–6
   options that follow the guidelines, with a pick or two. Check the tone of every option
   before offering it.
2. **Record the takes.** Put them in a file, one per line, `word | Quip text!`, then:
   `sh scripts/audio/quips.sh <model-dir> <out-dir> < takes.txt`
   It records each take the way the audio build will (`VOICE_FOR.q`, `SPEED.q` in
   `scripts/audio/build.mjs`) and writes `<out-dir>/index.html`, which plays the word's live
   recording, a beat, then the take, with a checkbox per take: the picks gather in a box as
   `word | quip` lines to copy and paste back. Serve `<out-dir>` (`python3 -m http.server`; for an iPad,
   a server on the Mac's Tailscale address) and share the link. Number the takes, and include
   the current quip as 1 when reworking one.
3. **Apply the picks.** Edit the `~"..."` on the word's line in every list it's in (grep the
   word across `packs.toml` and `editions/*.toml`, including the `[custom]` starter list). To
   remove a quip, delete the `~"..."`.
4. **Check.** `npm run check`. Then diff `node scripts/audio/build.mjs --plan` against the live
   `audio.json`: only the new `q:` clips should be new and nothing should change (old quips
   just drop out).
5. **PR.** A table of word / was / now, the audio summary, and the check result. The new
   clips show in the listen check as not heard, under each word.
