// Starts the app in a headless browser, once per edition, and plays a key: the part of
// `npm run check` that catches what a syntax check can't (a script that parses but throws while
// starting, so the page shows "Sound Box didn't start"). Run by scripts/check.mjs; also on its
// own: node scripts/smoke.mjs
//
// The browser: Playwright's own Chromium if it's installed (npx playwright install chromium),
// else Google Chrome (GitHub's Linux runners have it). With neither, it's skipped locally and
// fails in CI. Silent: audio muted and the device voice stubbed out.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readEditions } from "../js/words.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".toml": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

function serve() {
  const server = createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    if (path === "" || path.endsWith("/")) path += "index.html";
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function browser() {
  const { chromium } = await import("playwright");
  const args = ["--mute-audio"];
  try { return await chromium.launch({ args }); } catch (e) { /* no Playwright Chromium: try Chrome */ }
  try { return await chromium.launch({ args, channel: "chrome" }); } catch (e) { return null; }
}

// Returns { errors: [...], ran: [edition ids], skipped: reason or "" }.
export async function smoke() {
  const errors = [], ran = [];
  const b = await browser();
  if (!b) {
    const why = "no headless browser (npx playwright install chromium)";
    if (process.env.CI) errors.push(`startup check: ${why}`);
    return { errors, ran, skipped: why };
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const ed of readEditions(readFileSync(join(root, "editions.toml"), "utf8"))) {
      const at = `startup check (${ed.name})`;
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      await p.addInitScript(() => { if (window.speechSynthesis) { speechSynthesis.speak = () => {}; speechSynthesis.cancel = () => {}; } });
      const thrown = [];
      p.on("pageerror", (e) => thrown.push(e.message));
      try {
        await p.goto(`${base}?edition=${encodeURIComponent(ed.id)}`);
        // Started: app.js clears html.loading (appReady); a failure shows the "didn't start" message.
        await p.waitForFunction(() => !document.documentElement.classList.contains("loading") || document.documentElement.classList.contains("stuck"), null, { timeout: 20000 });
        if (await p.evaluate(() => document.documentElement.classList.contains("stuck"))) throw new Error("the page shows \"Sound Box didn't start\"");
        if (!(await p.locator(".cell").count())) throw new Error("no puzzle on the board");
        await p.keyboard.press("Shift"); // Start / Continue
        await p.waitForFunction(() => !document.querySelector(".board").classList.contains("entering"), null, { timeout: 20000 });
        await p.keyboard.press("q");
        const typed = await p.waitForFunction(() => [...document.querySelectorAll(".cell .ch")].some((c) => c.textContent), null, { timeout: 5000 }).then(() => true, () => false);
        if (!typed) throw new Error("a key typed nothing into the puzzle");
        ran.push(ed.id);
      } catch (e) {
        errors.push(`${at}: ${e.message.split("\n")[0]}`);
      }
      if (thrown.length) errors.push(`${at}: script error: ${thrown[0]}`);
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  return { errors, ran, skipped: "" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await smoke();
  if (r.errors.length) { console.error(r.errors.map((e) => "✗ " + e).join("\n")); process.exit(1); }
  console.log(r.skipped ? `- startup check skipped: ${r.skipped}` : `✓ the app starts and types in ${r.ran.length} editions`);
}
