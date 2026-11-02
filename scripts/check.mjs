// Sanity checks: `npm run check` (after `npm install`).
// 1. Every js/*.js file parses, and index.html points at files that exist.
// 2. packs.toml parses, and every word list follows the `syl-la-bles emoji` format.
// 3. The generator builds valid puzzles from every pack.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [];

for (const f of readdirSync(join(root, "js")).filter((f) => f.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", join(root, "js", f)], { stdio: "pipe" });
  } catch (e) {
    errors.push(`js/${f} syntax error:\n` + e.stderr.toString());
  }
}
const html = readFileSync(join(root, "index.html"), "utf8");
for (const [, ref] of html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)) {
  if (!existsSync(join(root, ref))) errors.push(`index.html links to missing file ${ref}`);
}

// The browser gets smol-toml from the CDN URL in index.html; Node uses node_modules.
const cdn = html.match(/"smol-toml": "[^"]*smol-toml@([^/"]+)\//);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["smol-toml"];
if (!cdn || cdn[1] !== pkg) errors.push(`index.html import map uses smol-toml ${cdn?.[1]}, package.json has ${pkg}`);

const { parse } = await import("smol-toml");
const { readPacks } = await import("../js/words.js");
const { parseList, makePuzzle, MAX_COLS, MAX_ROWS } = await import("../js/crossword.js");

const tomlText = readFileSync(join(root, "packs.toml"), "utf8");
let raw = { pack: [] }, packs = {}, starter = "";
try {
  raw = parse(tomlText);
  ({ packs, starter } = readPacks(tomlText));
} catch (e) {
  errors.push(`packs.toml: ${e.message}`);
}
const ids = new Set();
for (const [i, p] of (raw.pack || []).entries()) {
  const label = `packs.toml pack #${i + 1}${p.id ? ` (${p.id})` : ""}`;
  for (const f of ["id", "name", "note", "words"]) {
    if (typeof p[f] !== "string" || !p[f].trim()) errors.push(`${label}: needs ${f} = "..."`);
  }
  if (p.id === "mine") errors.push(`${label}: id "mine" is reserved for the grown-up's own list`);
  if (ids.has(p.id)) errors.push(`${label}: id "${p.id}" is used twice`);
  ids.add(p.id);
}
if (!starter) errors.push(`packs.toml: missing [custom] words = """..."""`);

const lists = Object.entries(packs).map(([id, p]) => ({ id, text: p.list }));
lists.push({ id: "custom", text: starter });

// Short hint parts that speech engines read as words, not letters.
const SAFE_SHORT = new Set(["uh", "oh", "go", "no", "so", "ex", "um", "in", "up", "it", "at", "on", "us"]);
// Common abbreviations that speech engines expand or spell out.
const ABBREV = new Set(["vol", "tel", "min", "max", "ap", "co", "fla", "mon", "tue", "thu", "fri",
  "jan", "feb", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "st", "dr", "mr", "mrs", "ms",
  "ft", "pt", "gal", "oz", "lb", "km", "cm", "mm", "sec", "hr", "est", "etc", "vs", "inc", "ltd", "corp", "dept", "ave",
  "blvd", "rd", "ref", "pg", "pp", "ch", "fig", "govt", "approx", "misc", "gen", "lt", "sgt", "capt", "col", "jr", "sr"]);
const LINE = /^([a-z]+(?:-[a-z]+)*) (\S+)(?: \(([^)]*)\))?$/;
for (const { id, text } of lists) {
  if (!text) continue; // "mine" is filled in by the user
  const seen = new Set();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(LINE);
    if (!m) { errors.push(`${id}: "${line}" should look like "syl-la-bles 🙂"`); continue; }
    const w = m[1].replace(/-/g, "");
    if (w.length < 2 || w.length > 12) errors.push(`${id}: "${w}" must be 2–12 letters`);
    if (seen.has(w)) errors.push(`${id}: "${w}" is listed twice`);
    if (!/\p{Extended_Pictographic}/u.test(m[2])) errors.push(`${id}: "${w}" has no emoji picture`);
    const beats = m[1].split("-").length;
    // Spoken alone, syllables get misread as abbreviations ("vol" → "volume", "ap" → "A P"),
    // so every multi-syllable word spells out how each syllable sounds.
    if (beats > 1 && m[3] == null) errors.push(`${id}: "${m[1]}" needs a (how-it-sounds) hint for Clap it`);
    if (m[3] != null) {
      const say = m[3].split("-");
      if (say.length !== beats) errors.push(`${id}: "${w}" has ${beats} syllables but its (sounds) hint has ${say.length} parts`);
      if (say.some((s) => !/^[a-z' ]+$/.test(s))) errors.push(`${id}: "${w}" sounds hint "${m[3]}" should be lowercase letters split by dashes`);
      for (const s of say) {
        if ((s.length <= 2 && !SAFE_SHORT.has(s)) || !/[aeiouy]/.test(s) || ABBREV.has(s)) {
          errors.push(`${id}: "${w}" hint part "${s}" may be read as an abbreviation; use a longer spelling or a real word`);
        }
      }
    }
    seen.add(w);
  }
  if (parseList(text).length !== seen.size) errors.push(`${id}: parseList disagrees with the line count`);
  if (id !== "custom" && lines.length < 10) errors.push(`${id}: only ${lines.length} words; packs need variety to build puzzles`);
}

const RUNS = 50;
for (const { id, text } of lists) {
  const pool = parseList(text);
  if (pool.length < 3) continue;
  let recent = [], fewest = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const P = makePuzzle(pool, recent);
    recent = P.words.map((w) => w.w).concat(recent).slice(0, 8);
    fewest = Math.min(fewest, P.words.length);
    if (P.cols > MAX_COLS || P.rows > MAX_ROWS) errors.push(`${id}: puzzle is ${P.cols}×${P.rows}, over ${MAX_COLS}×${MAX_ROWS}`);
    for (const W of P.words) {
      W.cells.forEach((kk, j) => {
        if (P.cells[kk].letter !== W.w[j]) errors.push(`${id}: "${W.w}" clashes with a crossing word at ${kk}`);
      });
    }
  }
  if (fewest < 4) errors.push(`${id}: some puzzles only fit ${fewest} words`);
}

if (errors.length) {
  console.error([...new Set(errors)].map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ scripts parse; ${lists.length} word lists OK; ${RUNS} puzzles built per list`);
