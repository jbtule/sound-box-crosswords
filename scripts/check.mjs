// Sanity checks. No dependencies: `node scripts/check.mjs`.
// 1. Every js/*.js file parses, and index.html points at files that exist.
// 2. Every built-in word list follows the `syl-la-bles emoji` format.
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

const { PACKS, DEFAULT_CUSTOM } = await import("../js/words.js");
const { parseList, makePuzzle, MAX_COLS, MAX_ROWS } = await import("../js/crossword.js");

const lists = Object.entries(PACKS).map(([id, p]) => ({ id, text: p.list }));
lists.push({ id: "DEFAULT_CUSTOM", text: DEFAULT_CUSTOM });

const LINE = /^([a-z]+(?:-[a-z]+)*) (\S+)$/;
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
    seen.add(w);
  }
  if (parseList(text).length !== seen.size) errors.push(`${id}: parseList disagrees with the line count`);
  if (id !== "DEFAULT_CUSTOM" && lines.length < 10) errors.push(`${id}: only ${lines.length} words; packs need variety to build puzzles`);
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
