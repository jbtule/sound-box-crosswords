// Sanity checks for index.html. No dependencies: `node scripts/check.mjs`.
// 1. The inline <script> parses.
// 2. Every built-in word list follows the `syl-la-bles emoji` format.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) errors.push(`expected 1 inline <script>, found ${scripts.length}`);
const js = scripts.join("\n");
const tmp = join(mkdtempSync(join(tmpdir(), "sbx-")), "app.js");
writeFileSync(tmp, js);
try {
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
} catch (e) {
  errors.push("script syntax error:\n" + e.stderr.toString());
}

const lists = [];
for (const m of js.matchAll(/(\w+): \{ name: "([^"]+)"[^]*?list:\s*("(?:[^"\\]|\\.)*")/g)) {
  lists.push({ id: m[1], text: JSON.parse(m[3]) });
}
const custom = js.match(/DEFAULT_CUSTOM = ("(?:[^"\\]|\\.)*")/);
if (custom) lists.push({ id: "DEFAULT_CUSTOM", text: JSON.parse(custom[1]) });
if (lists.length < 5) errors.push(`only found ${lists.length} word lists; did the PACKS format change?`);

const LINE = /^([a-z]+(?:-[a-z]+)*) (\S+)$/;
for (const { id, text } of lists) {
  if (!text) continue; // "mine" is filled in by the user
  const seen = new Set();
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(LINE);
    if (!m) { errors.push(`${id}: "${line}" should look like "syl-la-bles 🙂"`); continue; }
    const w = m[1].replace(/-/g, "");
    if (w.length < 2 || w.length > 12) errors.push(`${id}: "${w}" must be 2–12 letters`);
    if (seen.has(w)) errors.push(`${id}: "${w}" is listed twice`);
    if (!/\p{Extended_Pictographic}/u.test(m[2])) errors.push(`${id}: "${w}" has no emoji picture`);
    seen.add(w);
  }
  if (id !== "DEFAULT_CUSTOM" && lines.length < 10) errors.push(`${id}: only ${lines.length} words; packs need variety to build puzzles`);
}

if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ script parses; ${lists.length} word lists OK`);
