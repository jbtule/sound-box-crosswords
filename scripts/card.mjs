// Renders scripts/social-card.html to social-card.png (1200×630), the image link previews
// show (og:image in index.html). Run `npm run card` after changing the page or the styles
// it borrows; needs Playwright's Chromium (`npx playwright install chromium` once).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const page = new URL("social-card.html", import.meta.url).href;
const out = fileURLToPath(new URL("../social-card.png", import.meta.url));
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light" });
  await tab.goto(page, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: out });
  console.log("wrote social-card.png");
} finally {
  await browser.close();
}
