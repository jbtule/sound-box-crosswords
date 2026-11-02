// The share sheet's QR code (qr.svg), pre-rendered so the site ships no QR library.
// `npm run qr` writes it; scripts/check.mjs fails if the committed file is out of date.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

// Must match SHARE.url in js/app.js (the check verifies it).
export const SHARE_URL = "https://tools.tuley.name/sound-box-crosswords/";
export const QR_FILE = fileURLToPath(new URL("../qr.svg", import.meta.url));

export function qrSvg() {
  return QRCode.toString(SHARE_URL, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(QR_FILE, await qrSvg());
  console.log(`wrote qr.svg for ${SHARE_URL}`);
}
