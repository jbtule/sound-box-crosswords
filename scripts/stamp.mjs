// Builds the GitHub Pages site in _site/ from the repo files, stamped with a commit:
//   node scripts/stamp.mjs <full-commit-sha>
// - Cache busting: styles.css and every js/*.js get ?v=<short sha>. The JS modules are
//   remapped through the import map, and js/words.js passes the stamp on to packs.toml.
// - The footer's GitHub badge shows the short sha and links to the commit.
// The source files stay runnable as-is; locally the badge just reads "dev".
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const sha = process.argv[2] || "";
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error("usage: node scripts/stamp.mjs <full-commit-sha>");
  process.exit(1);
}
const short = sha.slice(0, 7);
const v = "?v=" + short;

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "_site");
const SITE = ["index.html", "styles.css", "packs.toml", "js", "favicon.svg", "apple-touch-icon.png"];
// Written by scripts/audio/build.mjs in the deploy; without it the app uses the device voice.
const OPTIONAL = ["audio.json"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of SITE) cpSync(join(root, f), join(out, f), { recursive: true });
for (const f of OPTIONAL) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f));

let html = readFileSync(join(root, "index.html"), "utf8");
// Each replacement must match exactly once, so a markup change can't silently skip one.
function swap(from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`stamp: expected 1 match for ${JSON.stringify(from)}, found ${n}`);
  html = html.replace(from, to);
}

swap('href="styles.css"', `href="styles.css${v}"`);
swap('src="js/app.js"', `src="js/app.js${v}"`);

const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) throw new Error("stamp: no import map in index.html");
const map = JSON.parse(mapMatch[1]);
for (const f of readdirSync(join(root, "js")).filter((f) => f.endsWith(".js"))) {
  map.imports[`./js/${f}`] = `./js/${f}${v}`;
}
swap(mapMatch[1], "\n" + JSON.stringify(map, null, 2) + "\n");

const repo = "https://github.com/jbtule/sound-box-crosswords";
swap(`id="buildLink" href="${repo}"`, `id="buildLink" href="${repo}/commit/${sha}"`);
swap('<span id="buildSha">dev</span>', `<span id="buildSha">${short}</span>`);

writeFileSync(join(out, "index.html"), html);
console.log(`✓ _site/ stamped with ${short}`);
