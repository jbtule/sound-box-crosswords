// Builds the pre-recorded audio (Kokoro "af_heart") for every pack word, Clap it
// syllable, and context sentence, then lays out the Cloudflare Pages project:
//   ASSET_BASE=https://sound-box-crosswords.asset-data.stream/ node scripts/audio/build.mjs
//
// Writes:
//   _audio/a/<key>.mp3  one clip each; <key> hashes everything that affects the sound
//                       (model, voice, speed, text), so a clip never changes once made
//   _audio/index.json   every key in this deploy; the next deploy reads it from the live
//                       site to know which clips already exist
//   _audio/_headers     long-lived caching for clips
//   audio.json          { base, clips: { "w:volcano": key, ... } }, shipped with the app
//
// Only missing clips are generated: existing ones are downloaded from the live site
// (Cloudflare bandwidth is free), so most deploys never install Kokoro at all.
// `node scripts/audio/build.mjs --plan` just prints the plan (used by the check).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readPacks } from "../../js/words.js";
import { parseList } from "../../js/crossword.js";

export const MODEL = "kokoro-v1.0";
export const VOICE = "af_heart";
// Kokoro speed per kind of clip: w = word, s = Clap it syllable, t = context sentence,
// p = fixed phrase. js/speech.js uses the same kind letters.
export const SPEED = { w: 0.9, s: 0.8, t: 0.95, p: 0.95 };
export const PHRASES = ["You solved it!"];
// Clips that sound wrong at their kind's speed, picked by ear. At 0.9 the cut "shore"
// sounds like "sure".
const SPEED_FOR = { "w:shore": 0.8 };
const ENCODING = "mp3-64k-mono-trim-v1"; // bump to regenerate every clip
// How generate.py renders each kind: "cut" says the word inside a phrase and cuts it out
// (single words and syllables mispronounce alone); "text" says the text as is.
export const METHOD = { w: "cut", s: "cut", t: "text", p: "text" };
const CUT = "cut-next-v1"; // bump when the cut method changes

const root = fileURLToPath(new URL("../..", import.meta.url));

const speedOf = (kind, text) => SPEED_FOR[kind + ":" + text] ?? SPEED[kind];

export function keyFor(kind, text) {
  const parts = [MODEL, VOICE, speedOf(kind, text), ENCODING];
  if (METHOD[kind] === "cut") parts.push(CUT); // "text" clips keep their original keys
  const id = JSON.stringify([...parts, text]);
  return createHash("sha256").update(id).digest("hex").slice(0, 20);
}

// Every clip the packs (and the starter Custom list) need: [{ id: "w:volcano", key, kind, text, speed, voice, method }].
export function planClips() {
  const { packs, starter } = readPacks(readFileSync(join(root, "packs.toml"), "utf8"));
  const lists = Object.values(packs).map((p) => p.list).concat(starter);
  const clips = new Map();
  const add = (kind, text) => {
    const id = kind + ":" + text;
    if (!clips.has(id)) clips.set(id, { id, key: keyFor(kind, text), kind, text, speed: speedOf(kind, text), voice: VOICE, method: METHOD[kind] });
  };
  for (const list of lists) {
    for (const e of parseList(list)) {
      add("w", e.w);
      const syll = e.syll.split("-");
      if (syll.length > 1) (e.say || syll).forEach((s) => add("s", s));
      if (e.sentence) add("t", e.sentence);
    }
  }
  PHRASES.forEach((p) => add("p", p));
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
          if (res.ok) { writeFileSync(join(out, "a", c.key + ".mp3"), Buffer.from(await res.arrayBuffer())); continue; }
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
  for (const c of plan) {
    if (!existsSync(join(out, "a", c.key + ".mp3"))) throw new Error(`clip not produced: ${c.id}`);
  }

  writeFileSync(join(out, "index.json"), JSON.stringify(plan.map((c) => c.key)));
  writeFileSync(join(out, "_headers"), [
    "/a/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "  Access-Control-Allow-Origin: https://tools.tuley.name",
    "",
  ].join("\n"));
  const clips = Object.fromEntries(plan.map((c) => [c.id, c.key]));
  writeFileSync(join(root, "audio.json"), JSON.stringify({ base: base + "a/", voice: VOICE, clips }));
  console.log("✓ _audio/ and audio.json ready");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
