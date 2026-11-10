// Builds the pre-recorded audio (Kokoro "af_heart") for every pack word, Break it down
// syllable, and context sentence, then lays out the Cloudflare Pages project:
//   ASSET_BASE=https://sound-box-crosswords.asset-data.stream/ node scripts/audio/build.mjs
//
// Writes:
//   _audio/a/<key>.mp3  one clip each; <key> hashes everything that affects the sound
//                       (model, voice, speed, text), so a clip never changes once made
//   _audio/a/<key>.json a blend's ("f:f+r") { split_ms }: where its second sound starts
//   _audio/index.json   every key in this deploy; the next deploy reads it from the live
//                       site to know which clips already exist
//   _audio/_headers     long-lived caching for clips
//   audio.json          { base, clips: { "w:volcano": key, ... }, splits: { "f:f+r": ms } },
//                       shipped with the app
//
// Only missing clips are generated: existing ones are downloaded from the live site
// (Cloudflare bandwidth is free), so most deploys never install Kokoro at all.
// `node scripts/audio/build.mjs --plan` just prints the plan (used by the check).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readPacks, readEditions, PACK_KINDS } from "../../js/words.js";
import { spokenLines } from "../../js/achievements.js";
import { parseList, clipsFor } from "../../js/crossword.js";
import { blendsIn, STOPS } from "../../js/phonics.js";

export const MODEL = "kokoro-v1.0";
export const VOICE = "af_heart";
// Kokoro speed per kind of clip: w = word, s = Break it down syllable, t = context sentence,
// p = fixed phrase, f = a single sound for Sound it out (its recipe sets its own speed).
// js/speech.js uses the same kind letters.
export const SPEED = { w: 0.9, s: 0.8, t: 0.95, p: 0.95, f: 0.8, q: 1.0 };
// q = a quip after a word ("Bock bock!"): said in its own voice, so it's never taken for a clue.
export const VOICE_FOR = { q: "af_bella" };
const voiceOf = (kind) => VOICE_FOR[kind] ?? VOICE;
export const PHRASES = ["You solved it!", "Way to go!", ...Object.values(PACK_KINDS)];
// Clips that sound wrong at their kind's speed, picked by ear. At 0.9 the cut "shore"
// sounds like "sure".
const SPEED_FOR = { "w:shore": 0.8, "p:New achievement!": 1.0, "p:Secret achievement!": 1.0, "p:Achievement!": 1.0 };
const ENCODING = "mp3-64k-mono-trim-v1"; // bump to regenerate every clip
// How generate.py renders each kind: "cut" says the word inside a phrase and cuts it out
// (single words and syllables mispronounce alone); "text" says the text as is; "lift" says it
// livelier (lively.py: our spelling, pitch higher and wider, the end lifted).
export const METHOD = { w: "cut", s: "cut", t: "text", p: "lift", f: "sound", q: "lift" };
const CUT = "cut-next-v1"; // bump when the cut method changes
// Clips made another way, picked by ear: "excited" says the line after "Wow, look at that!"
// and cuts it out (lively.py): the dragon's quip, whose pauses inside sounded stiff lifted,
// and "Listened…", whose d the lift ran into the k of "close".
const METHOD_FOR = { "q:Stand back. I sneeze fire. Achoo!": "excited", "p:Listened close to every word in a puzzle": "excited" };
const LIVELY = { lift: "lift-v2", excited: "excited-v1" }; // bump one when lively.py changes it

const root = fileURLToPath(new URL("../..", import.meta.url));

const speedOf = (kind, text) => SPEED_FOR[kind + ":" + text] ?? SPEED[kind];
const methodOf = (kind, text) => METHOD_FOR[kind + ":" + text] ?? METHOD[kind];

// Single sounds (Sound it out) are made by scripts/audio/sounds/lab.py the way picks.json
// says, with the Kokoro code in kokoro_core.py. Their clip names use SOUND_RECIPE, not a
// hash of that code, so a grown-up's listen-check marks on the 46 sounds survive edits that
// don't change them (adding a method to generate.py once re-recorded them all).
// SOUND_INPUTS is the hash of those three files (soundInputs); `npm run check` fails when it
// no longer matches. Then: if the change alters how a sound is made (a new pick, a new
// recipe, a change to the cut), set SOUND_RECIPE to a new value too, which re-records all
// 46 and resets their marks. For a change to some sounds only (a new pick for one sound),
// give just those a recipe of their own in SOUND_RECIPE_FOR instead: only they re-record.
// If it doesn't change a sound (a comment, a refactor), update SOUND_INPUTS only.
export const SOUND_RECIPE = "007b92ef43eb";
// Sounds re-picked since SOUND_RECIPE: name -> its own recipe value.
export const SOUND_RECIPE_FOR = { i: "core70-kid-slow" };
// Blends ("f+r") are made from two picked sounds (lab.py, blend()), so their names follow
// both sounds' recipes and BLEND_RECIPE (BLEND_STOP_RECIPE when the second is a stop, which
// joins on after a gap instead): bump the one whose blends blend() now makes differently.
export const BLEND_RECIPE = "hold220-xf30";
export const BLEND_STOP_RECIPE = "hold220-gap90";
const recipeOf = (name) => SOUND_RECIPE_FOR[name] ?? SOUND_RECIPE;
export const SOUND_INPUTS = "85ab609680c9";
export const SOUND_FILES = ["sounds/picks.json", "sounds/lab.py", "kokoro_core.py"];
export function soundInputs() {
  return createHash("sha256")
    .update(SOUND_FILES.map((f) => readFileSync(join(root, "scripts/audio", f), "utf8")).join("\0"))
    .digest("hex").slice(0, 12);
}

export function keyFor(kind, text) {
  if (kind === "f" && text.includes("+")) {
    const [a, b] = text.split("+");
    return createHash("sha256").update(JSON.stringify([MODEL, VOICE, ENCODING, "blend", STOPS.includes(b) ? BLEND_STOP_RECIPE : BLEND_RECIPE, recipeOf(a), recipeOf(b), text])).digest("hex").slice(0, 20);
  }
  if (kind === "f") return createHash("sha256").update(JSON.stringify([MODEL, VOICE, ENCODING, "sound", recipeOf(text), text])).digest("hex").slice(0, 20);
  const parts = [MODEL, voiceOf(kind), speedOf(kind, text), ENCODING];
  const method = methodOf(kind, text);
  if (method === "cut") parts.push(CUT); // "text" clips keep their original keys
  if (LIVELY[method]) parts.push(LIVELY[method]);
  const id = JSON.stringify([...parts, text]);
  return createHash("sha256").update(id).digest("hex").slice(0, 20);
}

// Every clip the packs (and each starter Custom list) need, across all editions: [{ id: "w:volcano", key, kind, text, speed, voice, method }].
const isBlend = (c) => c.kind === "f" && c.text.includes("+");

export function planClips() {
  // Every edition's packs file (editions.toml), each with its starter Custom list.
  const lists = [];
  for (const ed of readEditions(readFileSync(join(root, "editions.toml"), "utf8"))) {
    const { packs, starter } = readPacks(readFileSync(join(root, ed.file), "utf8"));
    lists.push(...Object.values(packs).map((p) => p.list), starter);
  }
  const clips = new Map();
  const add = (kind, text) => {
    const id = kind + ":" + text;
    if (!clips.has(id)) clips.set(id, { id, key: keyFor(kind, text), kind, text, speed: speedOf(kind, text), voice: voiceOf(kind), method: methodOf(kind, text) });
  };
  for (const list of lists) {
    for (const e of parseList(list)) {
      for (const c of clipsFor(e)) add(c.kind, c.text);
      // Each blend in a word with its sounds listed (Sound it out).
      if (e.sounds) blendsIn(e.sounds.map((s) => s.sound)).forEach((b) => add("f", b.name));
    }
  }
  PHRASES.forEach((p) => add("p", p));
  // What achievement cards say aloud: "New achievement!", titles and details, for every
  // edition's packs.
  for (const ed of readEditions(readFileSync(join(root, "editions.toml"), "utf8"))) {
    const { packs } = readPacks(readFileSync(join(root, ed.file), "utf8"));
    spokenLines(Object.entries(packs).map(([id, p]) => ({ id, name: p.name }))).forEach((t) => add("p", t));
  }
  // Every Sound it out sound, whether or not a word uses it yet (the listen check plays them all).
  Object.keys(JSON.parse(readFileSync(join(root, "scripts/audio/sounds/picks.json"), "utf8"))).forEach((name) => add("f", name));
  return [...clips.values()];
}

async function main() {
  const plan = planClips();
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const base = process.env.ASSET_BASE;
  if (!base || !base.endsWith("/")) throw new Error("set ASSET_BASE to the audio site URL, ending in /");

  const out = join(root, "_audio");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "a"), { recursive: true });

  // Clips already live. The very first deploy has no index.json yet.
  let live = new Set();
  try {
    const res = await fetch(base + "index.json");
    if (res.ok) live = new Set(await res.json());
  } catch (e) { /* treat as empty */ }

  const missing = [];
  const queue = plan.slice();
  async function worker() {
    for (let c; (c = queue.shift()); ) {
      if (live.has(c.key)) {
        try {
          const res = await fetch(`${base}a/${c.key}.mp3`);
          // A blend comes with where its second sound starts.
          const side = isBlend(c) ? await fetch(`${base}a/${c.key}.json`) : null;
          if (res.ok && (!side || side.ok)) {
            writeFileSync(join(out, "a", c.key + ".mp3"), Buffer.from(await res.arrayBuffer()));
            if (side) writeFileSync(join(out, "a", c.key + ".json"), await side.text());
            continue;
          }
        } catch (e) { /* regenerate below */ }
      }
      missing.push(c);
    }
  }
  await Promise.all(Array.from({ length: 16 }, worker));
  console.log(`${plan.length} clips: ${plan.length - missing.length} reused, ${missing.length} to generate`);

  if (missing.length) {
    const missingPath = join(out, "missing.json");
    writeFileSync(missingPath, JSON.stringify(missing));
    execFileSync("sh", [join(root, "scripts/audio/kokoro.sh"), missingPath, join(out, "a")], { stdio: "inherit" });
    rmSync(missingPath);
  }
  const splits = {};
  for (const c of plan) {
    if (!existsSync(join(out, "a", c.key + ".mp3"))) throw new Error(`clip not produced: ${c.id}`);
    if (isBlend(c)) {
      const side = join(out, "a", c.key + ".json");
      if (!existsSync(side)) throw new Error(`blend has no split: ${c.id}`);
      splits[c.id] = JSON.parse(readFileSync(side, "utf8")).split_ms;
    }
  }

  writeFileSync(join(out, "index.json"), JSON.stringify(plan.map((c) => c.key)));
  writeFileSync(join(out, "_headers"), [
    "/a/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "  Access-Control-Allow-Origin: https://tools.tuley.name",
    "",
  ].join("\n"));
  const clips = Object.fromEntries(plan.map((c) => [c.id, c.key]));
  writeFileSync(join(root, "audio.json"), JSON.stringify({ base: base + "a/", voice: VOICE, clips, splits }));
  console.log("✓ _audio/ and audio.json ready");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
