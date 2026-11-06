// No DOM. Send's link code (More → Link), drawn from the qrcode library's grid so it doesn't
// look like the share sheet's plain QR code: round dots, rounded corner eyes with an orange
// box in each, and a key in the middle, since the code carries the player's key. The middle
// covers a few percent of the code, which error correction H (up to 30%) reads through.
// Fixed colors, since it always sits on white: dark enough for any camera to read as dark.
const INK = "#14213d", ORANGE = "#c4470a";

// Q: the qrcode library. Returns an SVG string.
export function linkQR(Q, text) {
  const qr = Q.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size, bits = qr.modules.data, pad = 2, size = n + 2 * pad;
  const eyeAt = [[0, 0], [0, n - 7], [n - 7, 0]];
  const inEye = (r, c) => eyeAt.some(([er, ec]) => r >= er && r < er + 7 && c >= ec && c < ec + 7);
  // The middle: an odd number of modules, about a fifth of the code across.
  const k = Math.max(5, Math.round(n / 5) | 1), lo = (n - k) / 2;
  const inMiddle = (r, c) => r >= lo && r < lo + k && c >= lo && c < lo + k;
  const dots = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!bits[r * n + c] || inEye(r, c) || inMiddle(r, c)) continue;
      dots.push(`M${c + pad + 0.08} ${r + pad + 0.5}a0.42 0.42 0 1 0 0.84 0a0.42 0.42 0 1 0 -0.84 0`);
    }
  }
  const eyes = eyeAt.map(([r, c]) => {
    const x = c + pad, y = r + pad;
    return `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="2" fill="none" stroke="${INK}" stroke-width="1"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${ORANGE}"/>`;
  }).join("");
  // The key in the middle: an orange ring, then the shaft and two teeth.
  const m = lo + pad, s = k, cy = m + s / 2, w = s * 0.09;
  const rx = m + s * 0.3, r = s * 0.15, end = m + s * 0.86;
  const middle = `<rect x="${m}" y="${m}" width="${s}" height="${s}" rx="${s * 0.22}" fill="#fff"/>` +
    `<circle cx="${rx}" cy="${cy}" r="${r}" fill="none" stroke="${ORANGE}" stroke-width="${w * 1.2}"/>` +
    `<path d="M${rx + r + w * 0.6} ${cy}H${end}M${end - w / 2} ${cy}v${s * 0.15}M${end - s * 0.16} ${cy}v${s * 0.11}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path fill="${INK}" d="${dots.join("")}"/>${eyes}${middle}</svg>`;
}
