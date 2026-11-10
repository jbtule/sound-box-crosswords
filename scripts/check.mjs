// Sanity checks: `npm run check` (after `npm install`).
// 1. Every js/*.js file and sw.js parse, index.html points at files that exist, and the
//    manifest's icons exist.
// 2. packs.toml parses, and every word list follows the `syl-la-bles emoji` format.
// 3. The generator builds valid puzzles from every pack.
// 4. Every color scheme keeps the syllable colors clearly apart and readable.
// 5. The tests (scripts/*.test.mjs) pass: combining two devices' progress, sealing it, and
//    the sync service.
// 6. The app starts in a headless browser for each edition and types a key (scripts/smoke.mjs).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { smoke } from "./smoke.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [];

for (const f of readdirSync(join(root, "js")).filter((f) => f.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", join(root, "js", f)], { stdio: "pipe" });
  } catch (e) {
    errors.push(`js/${f} syntax error:\n` + e.stderr.toString());
  }
}
for (const f of ["sw.js", "listen/listen.js", ...readdirSync(join(root, "sync", "src")).map((f) => "sync/src/" + f)]) {
  try {
    execFileSync(process.execPath, ["--check", join(root, f)], { stdio: "pipe" });
  } catch (e) {
    errors.push(`${f} syntax error:\n` + e.stderr.toString());
  }
}
try {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
  for (const i of manifest.icons) if (!existsSync(join(root, i.src))) errors.push(`manifest.webmanifest: missing icon ${i.src}`);
  // stamp.mjs writes a manifest per edition, finding the ids with a pattern; it must see
  // the same ones as the real parser.
  const { readEditions } = await import("../js/words.js");
  const toml = readFileSync(join(root, "editions.toml"), "utf8");
  const real = readEditions(toml).map((e) => e.id).join(","), seen = [...toml.matchAll(/^\s*id\s*=\s*"([^"]+)"/gm)].map((m) => m[1]).join(",");
  if (real !== seen) errors.push(`editions.toml: scripts/stamp.mjs would find the edition ids "${seen}", not "${real}" (keep each id = "..." on its own line)`);
} catch (e) {
  errors.push(`manifest.webmanifest: ${e.message}`);
}
const html = readFileSync(join(root, "index.html"), "utf8");
for (const [, ref] of html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)) {
  if (!existsSync(join(root, ref))) errors.push(`index.html links to missing file ${ref}`);
}

// The listen check (listen/): a grown-up tool that spells every pack word, so it must stay
// unlinked from the app and out of search engines.
const listenHtml = readFileSync(join(root, "listen", "index.html"), "utf8");
for (const [, ref] of listenHtml.matchAll(/(?:src|href)="(?!https?:|data:|\?|\.\/")([^"]+)"/g)) {
  if (!existsSync(join(root, "listen", ref))) errors.push(`listen/index.html links to missing file ${ref}`);
}
// No text box gets the keyboard's help (suggestions, autocorrect): it would spell pack words.
for (const tag of html.match(/<(input|textarea)\b[^>]*>/g) || []) {
  if (/type="(checkbox|radio|range|button|submit|hidden)"/.test(tag)) continue;
  for (const attr of ['autocomplete="off"', 'autocorrect="off"', 'spellcheck="false"']) if (!tag.includes(attr)) errors.push(`index.html: ${tag.slice(0, 40)}… needs ${attr} (the keyboard's suggestions would spell words)`);
}
{
  const app = readFileSync(join(root, "js", "app.js"), "utf8");
  const made = app.match(/createElement\("(input|textarea)"\)/g) || [], wrapped = app.match(/noSpellHelp\(document\.createElement\("(input|textarea)"\)\)/g) || [];
  if (made.length !== wrapped.length) errors.push("js/app.js: a text box made in code must be noSpellHelp(document.createElement(...)) (the keyboard's suggestions would spell words)");
}
if (!listenHtml.includes('<meta name="robots" content="noindex, nofollow">')) errors.push("listen/index.html must keep its noindex robots tag");
if (/href="[^"]*listen/.test(html)) errors.push("index.html must not link to the listen check");

// Browser dependencies come from the CDN URLs in each page's import map; Node uses
// node_modules. Every entry must pin the exact version in package.json.
const deps = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies;
for (const [name, page] of [["index.html", html], ["listen/index.html", listenHtml]]) {
  let map = {};
  try { map = JSON.parse(page.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports; }
  catch (e) { errors.push(`${name}: can't read the import map`); }
  for (const [dep, url] of Object.entries(map)) {
    const v = url.match(new RegExp(`/${dep}@([^/"]+)/`));
    if (!deps[dep]) errors.push(`${name} import map loads ${dep}, which isn't in package.json dependencies`);
    else if (!v || v[1] !== deps[dep]) errors.push(`${name} import map uses ${dep} ${v?.[1]}, package.json has ${deps[dep]}`);
  }
}

// The share sheet's address (its QR code is drawn in the browser by the qrcode library).
const SHARE_ADDR = "https://tools.tuley.name/sound-box-crosswords/";
if (!readFileSync(join(root, "js", "app.js"), "utf8").includes(`var SHARE_BASE = "${SHARE_ADDR}";`)) errors.push(`js/app.js SHARE_BASE should be ${SHARE_ADDR}`);
if (!html.includes(`>${SHARE_ADDR}</code>`)) errors.push(`index.html share link should show ${SHARE_ADDR}`);

// The link-preview image: present, 1200×630, and where the og:image tag points.
{
  const card = join(root, "social-card.png");
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
  if (!existsSync(card)) errors.push("social-card.png is missing: run npm run card");
  else {
    const png = readFileSync(card);
    if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) errors.push("social-card.png should be 1200×630");
  }
  if (!ogImage || !ogImage.startsWith(SHARE_ADDR) || !existsSync(join(root, ogImage.slice(SHARE_ADDR.length)))) {
    errors.push(`index.html og:image should be ${SHARE_ADDR}social-card.png`);
  }
  if (!html.includes(`<meta property="og:url" content="${SHARE_ADDR}">`)) errors.push(`index.html og:url should be ${SHARE_ADDR}`);
}

const { parse } = await import("smol-toml");
const { readPacks } = await import("../js/words.js");
const { parseList, makePuzzle, blankSentence, MAX_COLS, MAX_ROWS } = await import("../js/crossword.js");

// Editions (editions.toml): one packs file per grade, each checked the same way.
const { readEditions, storagePrefix } = await import("../js/words.js");
let editions = [];
try {
  editions = readEditions(readFileSync(join(root, "editions.toml"), "utf8"));
} catch (e) {
  errors.push(`editions.toml: ${e.message}`);
}
if (!editions.length) errors.push("editions.toml: needs at least one [[edition]]");
{
  const edIds = new Set(), prefixes = new Set(), shorts = new Set();
  for (const ed of editions) {
    const at = `editions.toml (${ed.id || "?"})`;
    if (!ed.raw || typeof ed.raw.short !== "string" || !ed.raw.short.trim()) errors.push(`${at}: needs short = "..."`);
    for (const f of ["id", "name", "file"]) if (typeof ed[f] !== "string" || !ed[f].trim()) errors.push(`${at}: needs ${f} = "..."`);
    if (ed.id && !/^[a-z0-9-]+$/.test(ed.id)) errors.push(`${at}: id should be lowercase letters, digits and dashes`);
    // New ids are descriptive enough never to clash (grade2-2026-room12); the first two
    // were short and can't change.
    if (ed.id && ed.id.length < 8 && !["k", "g3"].includes(ed.id)) errors.push(`${at}: id should be at least 8 characters, like grade2-2026-room12`);
    if (edIds.has(ed.id)) errors.push(`${at}: id is used twice`);
    if (typeof ed.short === "string" && ed.short.length > 16) errors.push(`${at}: short should be at most 16 characters (it goes on achievement cards)`);
    if (shorts.has(ed.short)) errors.push(`${at}: short is used twice (it tells grades apart on cards)`);
    shorts.add(ed.short);
    if (ed.file && !existsSync(join(root, ed.file))) errors.push(`${at}: missing file ${ed.file}`);
    if (!["qwerty", "abc"].includes(ed.keyboard)) errors.push(`${at}: keyboard should be "qwerty" or "abc"`);
    if (ed.raw && ed.raw.sound_it_out !== undefined && typeof ed.raw.sound_it_out !== "boolean") errors.push(`${at}: sound_it_out should be true or false`);
    if (ed.id && ed.file) {
      const pre = storagePrefix(ed);
      if (prefixes.has(pre)) errors.push(`${at}: shares saved data (${pre}) with another edition`);
      prefixes.add(pre);
    }
    edIds.add(ed.id);
  }
  if (!editions.some((ed) => ed.file === "packs.toml")) errors.push("editions.toml: packs.toml must stay an edition (existing saved progress belongs to it)");
}
// The share sheet draws a QR code for the site, or for one grade (?edition=<id>).
{
  const QRCode = (await import("qrcode")).default;
  for (const url of [SHARE_ADDR, ...editions.map((ed) => `${SHARE_ADDR}?edition=${ed.id}`)]) {
    try {
      const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
      if (!svg.startsWith("<svg")) throw new Error("not an SVG");
    } catch (e) { errors.push(`qrcode can't draw ${url}: ${e.message}`); }
  }
}

// Sound it out: every sound phonics.js knows has a recipe in picks.json, and the reverse.
{
  const { SOUNDS: names } = await import("../js/phonics.js");
  const picks = Object.keys(JSON.parse(readFileSync(join(root, "scripts/audio/sounds/picks.json"), "utf8")));
  for (const n of names) if (!picks.includes(n)) errors.push(`scripts/audio/sounds/picks.json: no pick for the sound "${n}" (js/phonics.js)`);
  for (const n of picks) if (!names.includes(n)) errors.push(`js/phonics.js: SOUNDS is missing "${n}" (scripts/audio/sounds/picks.json)`);
  // Stops, as phonics.js lists them (blend names) and lab.py makes them.
  const { STOPS } = await import("../js/phonics.js");
  const labStops = [...readFileSync(join(root, "scripts/audio/sounds/lab.py"), "utf8").matchAll(/\("([a-z]+)", "[a-z]+", "[^"]+", "stop"\)/g)].map((m) => m[1]);
  if (!labStops.length || labStops.sort().join() !== [...STOPS].sort().join()) errors.push(`js/phonics.js: STOPS (${STOPS.join(" ")}) should be the sounds lab.py marks "stop" (${labStops.join(" ")})`);
  // The sounds' clip names don't follow their code on their own (see SOUND_RECIPE).
  const { SOUND_INPUTS, SOUND_FILES, soundInputs } = await import("./audio/build.mjs");
  const now = soundInputs();
  if (now !== SOUND_INPUTS) errors.push(`scripts/audio/build.mjs: ${SOUND_FILES.join(", ")} changed (SOUND_INPUTS is ${SOUND_INPUTS}, now ${now}). ` +
    `If the Sound it out clips will sound different, give those sounds a new value in SOUND_RECIPE_FOR (only they re-record and lose their listen marks), or SOUND_RECIPE for all 46; if blend() changed, bump BLEND_RECIPE or BLEND_STOP_RECIPE (re-records those blends). Either way, set SOUND_INPUTS to "${now}".`);
}

// Achievement cards are read aloud line by line (spokenParts); spokenLines() must list
// every line catalog() can produce, or a card falls back to the device voice.
{
  const { catalog, spokenLines } = await import("../js/achievements.js");
  const packs = ["Blends", "Bossy R", "Two Beats", "Three Beats", "Unit 1"].map((name, i) => ({ id: "p" + i, name, done: 5, total: 5, firsts: 5 }))
    .concat({ id: "mine", name: "Custom", done: 3, total: 3, firsts: 3 }, { id: "h", name: "Long Words", done: 5, total: 5, firsts: 5, hard: true });
  const lines = new Set(spokenLines(packs));
  const all = { listener: 1e6, twofer: 1e6, shared: 1e6, look: 1e6, peek: 1e6, words: 1e6, qwerty: 1e6, weekend: 1e6 };
  const big = { packs, hard: 1e6, clean: 1e6, comeback: 1e6, days: Array.from({ length: 1000 }, (_, i) => "d" + i), edition: "3rd grade", secret: all };
  const { spokenParts } = await import("../js/achievements.js");
  const shown = catalog(big);
  for (const id of ["grand:champion", "grand:legend", "secret:listener", "hard:mode", "pack:h"]) if (!shown.some((a) => a.id === id)) errors.push(`scripts/check.mjs: catalog() no longer lists ${id}; update this check`);
  for (const a of shown) {
    for (const t of spokenParts(a)) if (!lines.has(t)) errors.push(`js/achievements.js: spokenLines() is missing "${t}"`);
  }
}

// The guessing nudge's idea of a close letter (phonics.js isClose): the examples from its plan.
{
  const { isClose } = await import("../js/phonics.js");
  const want = [["stomp", 2, "a", true], ["stomp", 2, "u", true], ["frog", 1, "l", true], ["frog", 1, "w", false], ["frog", 1, "m", false],
    ["frog", 1, "z", false], ["cat", 0, "k", true], ["cat", 1, "m", false], ["ship", 1, "c", true], ["phone", 0, "f", true], ["cake", 3, "x", true], ["tent", 0, "d", true]];
  for (const [w, i, t, close] of want) if (isClose(w, i, t) !== close) errors.push(`js/phonics.js: isClose("${w}", ${i}, "${t}") should be ${close}`);
}

// Every word list in every edition: { id (for messages), text, custom }.
const lists = [];
const textOk = new Set(); // packs with words_in_text = true
for (const ed of editions) {
  if (!ed.file || !existsSync(join(root, ed.file))) continue;
  const file = ed.file;
  const tomlText = readFileSync(join(root, file), "utf8");
  let raw = { pack: [] }, packs = {}, starter = "";
  try {
    raw = parse(tomlText);
    ({ packs, starter } = readPacks(tomlText));
  } catch (e) {
    errors.push(`${file}: ${e.message}`);
    continue;
  }
  const ids = new Set();
  const tag = file === "packs.toml" ? "" : ed.id + "/";
  for (const [i, p] of (raw.pack || []).entries()) {
    const label = `${file} pack #${i + 1}${p.id ? ` (${p.id})` : ""}`;
    for (const f of ["id", "name", "note", "words"]) {
      if (typeof p[f] !== "string" || !p[f].trim()) errors.push(`${label}: needs ${f} = "..."`);
    }
    if (p.id === "mine") errors.push(`${label}: id "mine" is reserved for the Custom list`);
    if (ids.has(p.id)) errors.push(`${label}: id "${p.id}" is used twice`);
    // The note is shown on screen, so it must not spell out a pack word, even split
    // into syllables ("fr-og"). That would turn recall into copying.
    // A pack can set words_in_text = true (kindergarten high-frequency words): finding a
    // word printed elsewhere is part of learning to read it, so its words may appear in
    // the note and in each other's sentences. A clue's own word is always blanked.
    if (p.words_in_text !== undefined && typeof p.words_in_text !== "boolean") errors.push(`${label}: words_in_text should be true or false`);
    if (p.words_in_text === true) textOk.add(tag + p.id);
    if (p.school !== undefined && typeof p.school !== "boolean") errors.push(`${label}: school should be true or false`);
    // hard = true: a hard mode pack (🥋), any number per edition.
    if (p.hard !== undefined && typeof p.hard !== "boolean") errors.push(`${label}: hard should be true or false`);
    if (typeof p.note === "string" && typeof p.words === "string" && p.words_in_text !== true) {
      const shown = new Set(p.note.toLowerCase().replace(/[-'\u2019]/g, "").split(/[^a-z]+/));
      for (const e of parseList(p.words)) {
        if (shown.has(e.w.replace(/'/g, ""))) errors.push(`${label}: note gives away "${e.w}"`);
      }
    }
    ids.add(p.id);
  }
  if (!(raw.pack || []).length) errors.push(`${file}: needs at least one [[pack]]`);
  if (!starter) errors.push(`${file}: missing [custom] words = """..."""`);
  const sio = ed.soundItOut;
  for (const [id, p] of Object.entries(packs)) lists.push({ id: tag + id, text: p.list, custom: false, sio });
  lists.push({ id: tag + "custom", text: starter, custom: true, sio });
}

// Short hint parts that speech engines read as words, not letters. "un" and "ub" were
// timed against Google US English and read normally.
const SAFE_SHORT = new Set(["uh", "oh", "go", "no", "so", "ex", "um", "in", "up", "it", "at", "on", "us", "un", "ub"]);
// Common abbreviations that speech engines expand or spell out, plus syllables timed as
// misread by Google US English (spelled out, or expanded like "fla" → "Florida").
const ABBREV = new Set(["mit", "bih", "uhn", "uhb", "ca", "tle", "ril", "ple", "cil", "dle", "dile", "oc",
  "vol", "tel", "min", "max", "ap", "co", "fla", "mon", "tue", "thu", "fri",
  "jan", "feb", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "st", "dr", "mr", "mrs", "ms",
  "ft", "pt", "gal", "oz", "lb", "km", "cm", "mm", "sec", "hr", "est", "etc", "vs", "inc", "ltd", "corp", "dept", "ave",
  "blvd", "rd", "ref", "pg", "pp", "ch", "fig", "govt", "approx", "misc", "gen", "lt", "sgt", "capt", "col", "jr", "sr"]);
// Sound words in quips, which the 5-word limit leaves out.
const SOUND_WORDS = /^(achoo|ah-?choo|bock|moo|oink|woof|meow|roar|boom|zap|whoosh|vroom)[!.,?]*$/i;
// word, then optional emoji (none = listen-only), (sounds) hint, "context sentence",
// {its sounds} for Sound it out, and ~"a quip".
const LINE = /^([a-z][a-z']*(?:-[a-z']+)*)(?: +([^\s("{~]\S*))?(?: +\(([^)]*)\))?(?: +"([^"]+)")?(?: +\{([^}]*)\})?(?: +~"([^"]+)")?$/;
const { parseSounds } = await import("../js/phonics.js");
// Every entry of every word, to compare across lists below: { id, differs, fields }.
const entries = {};
for (const { id, text, custom, sio } of lists) {
  if (!text) continue; // "mine" is filled in by the user
  const seen = new Set();
  // Lines starting with # are comments (parseList skips them too). "# differs: <why>"
  // applies to the word on the next line.
  const all = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines = all.filter((l) => !l.startsWith("#"));
  let differs = null;
  for (const line of all) {
    if (line.startsWith("#")) {
      const d = line.match(/^#\s*differs\b:?\s*(.*)$/i);
      if (d) {
        if (!d[1].trim()) errors.push(`${id}: "${line}" needs a reason: "# differs: <why>"`);
        differs = d[1].trim() || "?";
      }
      continue;
    }
    const m = line.match(LINE);
    if (!m) { errors.push(`${id}: "${line}" should look like "syl-la-bles 🙂"`); differs = null; continue; }
    const w = m[1].replace(/-/g, "");
    // Sounds only matter in editions with Sound it out; elsewhere they're never compared.
    (entries[w] ??= []).push({ id, differs, fields: [m[1], m[2] ?? "", m[3] ?? "", m[4] ?? "", sio ? m[5] ?? "" : null, m[6] ?? ""] });
    // A quip: a few words (5 at most), said after the word now and then. Sound words
    // ("Achoo!") don't count: they're over in a moment.
    if (m[6] != null && m[6].trim().split(/\s+/).filter((x) => !SOUND_WORDS.test(x)).length > 5) errors.push(`${id}: "${w}" quip is more than 5 words: "${m[6]}"`);
    differs = null;
    if (w.length < 2 || w.length > 12) errors.push(`${id}: "${w}" must be 2–12 letters`);
    if (seen.has(w)) errors.push(`${id}: "${w}" is listed twice`);
    // An emoji, or a keycap (6️⃣: a digit, # or * with the keycap mark), which isn't "pictographic" but shows as one.
    if (m[2] != null && !/\p{Extended_Pictographic}|^[0-9#*]\uFE0F?\u20E3$/u.test(m[2])) errors.push(`${id}: "${w}" picture "${m[2]}" isn't an emoji`);
    // A word with no picture needs a spoken sentence for context (their vs there).
    if (m[2] == null && m[4] == null && !custom) errors.push(`${id}: "${w}" has no picture, so it needs a "sentence that uses it"`);
    if (m[4] != null && !new RegExp(`\\b${w}\\b`, "i").test(m[4])) errors.push(`${id}: "${w}" sentence doesn't use the word: "${m[4]}"`);
    if (m[5] != null) {
      const ps = parseSounds(m[5], w);
      if (ps.error) errors.push(`${id}: "${w}" sounds {${m[5]}}: ${ps.error}`);
    }
    const beats = m[1].split("-").length;
    // Spoken alone, syllables get misread as abbreviations ("vol" → "volume", "ap" → "A P"),
    // so every multi-syllable word spells out how each syllable sounds.
    if (beats > 1 && m[3] == null) errors.push(`${id}: "${m[1]}" needs a (how-it-sounds) hint for Break it down`);
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
  if (differs !== null) errors.push(`${id}: "# differs" at the end, with no word after it`);
  // Sentences are shown with the word blanked out, so one that uses another word from the
  // same list would spell it on screen when both are in a puzzle.
  if (!custom && !textOk.has(id)) {
    const all = parseList(text).map((e) => e.w);
    for (const e of parseList(text)) {
      if (!e.sentence) continue;
      for (const o of all) {
        if (o !== e.w && blankSentence(e.sentence, [o]) !== e.sentence) errors.push(`${id}: "${e.w}" sentence gives away "${o}": "${e.sentence}"`);
      }
    }
  }
  if (parseList(text).length !== seen.size) errors.push(`${id}: parseList disagrees with the line count`);
  if (!custom && lines.length < 10) errors.push(`${id}: only ${lines.length} words; packs need variety to build puzzles`);
}

// A word in more than one list (another pack, another grade, a Custom starter) is said and
// shown the same way everywhere: same syllables, picture, hint, sentence and sounds, so one
// recording and one listen mark serve them all. When one should differ (a shorter sentence
// for a younger grade, a sight word with no sounds, a sentence that would give away a word
// in its own pack), put "# differs: <why>" on the line above it.
const FIELDS = ["syllables", "picture", "hint", "sentence", "sounds", "quip"];
const unlike = (a, b) => FIELDS.filter((_, i) => a.fields[i] !== null && b.fields[i] !== null && a.fields[i] !== b.fields[i]);
for (const [w, list] of Object.entries(entries)) {
  const plain = list.filter((e) => !e.differs);
  for (const e of plain.slice(1)) {
    const diff = unlike(plain[0], e);
    if (diff.length) errors.push(`"${w}": ${diff.join(", ")} in ${e.id} ${diff.length > 1 ? "differ" : "differs"} from ${plain[0].id}; make them match, or put "# differs: <why>" on the line above one`);
  }
  for (const e of list.filter((e) => e.differs)) {
    if (list.length === 1) errors.push(`${e.id}: "# differs" above "${w}", which isn't in any other list`);
    else if (list.every((o) => o === e || !unlike(o, e).length)) errors.push(`${e.id}: "# differs" above "${w}", but it matches everywhere; remove the comment`);
  }
}

const RUNS = 50;
// Two- and three-letter words share few letters, so their puzzles run smaller (about 5
// words, and 3 at the least, which suits kindergarten) and can't all cross each other
// early on, so covering the pack takes a few more puzzles. Longer words fit about 6, and
// at least 4.
const shortWords = (pool) => pool.reduce((n, e) => n + e.w.length, 0) / pool.length <= 3.5;
for (const { id, text, custom } of lists) {
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
  const least = shortWords(pool) ? 3 : 4;
  if (fewest < least) errors.push(`${id}: some puzzles only fit ${fewest} words`);
}

// Coverage: building puzzles from the words not done yet this round (like the app does)
// should see every word in close to the fewest possible puzzles (see shortWords above).
const coverage = [];
for (const { id, text, custom } of lists) {
  const pool = parseList(text);
  if (pool.length < 6 || custom) continue;
  const trials = 20, counts = [];
  // Every word has to be able to cross another, or it can never be in a puzzle (and the
  // pack's Champion can't be reached).
  const ws = pool.map((e) => e.w);
  for (const w of ws) if (!ws.some((o) => o !== w && [...w].some((ch) => o.includes(ch)))) errors.push(`${id}: "${w}" shares no letter with any other word, so it can never cross into a puzzle`);
  let small = Infinity, stuck = false;
  for (let t = 0; t < trials; t++) {
    const seen = new Set();
    let recent = [], n = 0;
    while (seen.size < pool.length && n < 50) {
      const fresh = pool.map((e) => e.w).filter((w) => !seen.has(w));
      const P = makePuzzle(pool, recent, fresh);
      small = Math.min(small, P.words.length);
      P.words.forEach((W) => seen.add(W.w));
      recent = P.words.map((W) => W.w).concat(recent).slice(0, 8);
      n++;
    }
    if (seen.size < pool.length) stuck = true;
    counts.push(n);
  }
  // The app builds puzzles this way (the words not done yet this round first), so each one
  // must still be a real crossword, and every word must come up.
  if (small < 3) errors.push(`${id}: covering the pack made a puzzle of only ${small} ${small === 1 ? "word" : "words"}`);
  if (stuck) errors.push(`${id}: some words never came up in 50 puzzles`);
  const per = shortWords(pool) ? 5 : 6;
  const avg = counts.reduce((a, b) => a + b) / trials, best = Math.ceil(pool.length / per);
  coverage.push(`${id} ${avg.toFixed(1)} (best ${best})`);
  if (avg > best + (shortWords(pool) ? 3 : 1.5)) errors.push(`${id}: takes ${avg.toFixed(1)} puzzles on average to cover ${pool.length} words (best possible ${best})`);
}

// Color schemes (js/palettes.js): the syllable bands are the core mechanic, so in every
// scheme, light and dark, the two bands must stay clearly apart, letters must read on
// them, and the accent (cursor ring) must stand out from the band edges and from the
// "wrong" red. The bars are Classic's own numbers, rounded down.
const { PALETTES } = await import("../js/palettes.js");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const lab = (h) => { // CIELAB, D65
  const [r, g, b] = hex(h).map(lin);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const apart = (a, b) => { const [p, q] = [lab(a), lab(b)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const css = readFileSync(join(root, "styles.css"), "utf8");
const tokens = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const base = {
  light: tokens(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")))),
  dark: tokens(css.slice(css.indexOf(':root[data-theme="dark"] {'), css.indexOf("}", css.indexOf(':root[data-theme="dark"] {'))))
};
for (const pal of PALETTES) {
  for (const mode of ["light", "dark"]) {
    const t = pal[mode], b = base[mode], at = `palette ${pal.id} (${mode})`;
    for (const k of Object.keys(t)) {
      if (!/^#[0-9a-f]{6}$/i.test(t[k])) errors.push(`${at}: ${k} must be a #rrggbb color`);
      if (pal.id === "classic" && t[k] !== b[k]) errors.push(`${at}: ${k} is ${t[k]} but styles.css has ${b[k]}`);
    }
    if (errors.some((e) => e.startsWith(at))) continue;
    for (const k of ["--sylA", "--sylB", "--accent-soft"]) {
      if (contrast(b["--ink"], t[k]) < 7) errors.push(`${at}: letters are hard to read on ${k}`);
    }
    if (apart(t["--sylA"], t["--sylB"]) < 25) errors.push(`${at}: the two syllable colors are too alike`);
    if (apart(t["--sylA-edge"], t["--sylB-edge"]) < 50) errors.push(`${at}: the two syllable edges are too alike`);
    for (const k of ["--sylA-edge", "--sylB-edge"]) {
      if (contrast(t[k], b["--card"]) < 3) errors.push(`${at}: ${k} is too faint`);
      if (apart(t["--accent"], t[k]) < 30) errors.push(`${at}: the cursor color is too close to ${k}`);
    }
    if (contrast(t["--accent"], b["--card"]) < 2.5) errors.push(`${at}: --accent is too faint`);
    if (apart(t["--accent"], b["--bad"]) < 30) errors.push(`${at}: --accent is too close to the "wrong" red`);
  }
}

// Saved keys: a player's data is moved (storage upgrades), replaced and removed by the key
// lists in app.js, so every key saved per grade must be in GRADE_KEYS, and every key of a
// player's own in OWN_KEYS, or it would be left behind.
{
  const app = readFileSync(join(root, "js", "app.js"), "utf8");
  const list = (name) => JSON.parse("[" + app.match(new RegExp("var " + name + " = \\[([^\\]]*)\\]"))[1].replace(/\s+/g, " ") + "]");
  const grade = new Set(list("GRADE_KEYS")), own = new Set(list("OWN_KEYS"));
  for (const [, k] of app.matchAll(/\b(?:store|g)\.(?:get|set)\("([^"]+)"/g)) if (!grade.has(k)) errors.push(`js/app.js saves "${k}" per grade, but it isn't in GRADE_KEYS`);
  for (const [, k] of app.matchAll(/\b(?:who|whoOf\([^)]*\))\.(?:get|set)\("([^"]+)"/g)) if (!own.has(k)) errors.push(`js/app.js saves "${k}" for a player, but it isn't in OWN_KEYS`);
}

// The tests: combining two devices' progress (js/merge.js), sealing it (js/seal.js), and the
// sync service (sync/).
const tests = readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".test.mjs")).map((f) => join(root, "scripts", f));
try {
  execFileSync(process.execPath, ["--test", "--test-reporter=dot", ...tests], { stdio: "pipe" });
} catch (e) {
  errors.push("scripts/*.test.mjs failed:\n" + e.stdout.toString() + e.stderr.toString());
}

// The app itself, started in a headless browser for each edition (scripts/smoke.mjs): a script
// that parses but throws while starting only shows up there.
const started = await smoke();
errors.push(...started.errors);

if (errors.length) {
  console.error([...new Set(errors)].map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ scripts parse; ${lists.length} word lists OK; ${RUNS} puzzles built per list`);
console.log(`✓ puzzles to cover each pack: ${coverage.join(", ")}`);
console.log(`✓ ${PALETTES.length} color schemes keep syllables apart in light and dark`);
console.log(`✓ ${tests.length} test files pass (merging, sealing, the sync service)`);
console.log(started.skipped ? `- startup check skipped: ${started.skipped}` : `✓ the app starts and types in ${started.ran.length} editions (headless browser)`);
