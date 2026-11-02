// "Sound stickers" for picture-less (listen-only) words in the picture collection: an
// abstract badge shape in a bright gradient with a sound motif inside, drawn as SVG.
// They're never objects or emoji, so they can't be mistaken for any pack word's picture,
// now or in future packs. Picture-less words on a pack's page get different ones in pack
// order. (Its own module, not words.js: that one loads the TOML parser from the CDN and is
// imported lazily.)

// Badge outlines on a 100×100 box. No literal objects (no star, heart, shield...).
function ring(n, outer, inner) { // sunburst / scalloped edges
  var pts = [];
  for (var i = 0; i < n * 2; i++) {
    var a = (Math.PI * i) / n - Math.PI / 2, r = i % 2 ? inner : outer;
    pts.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1));
  }
  return '<polygon points="' + pts.join(" ") + '"';
}
var SHAPES = [
  '<circle cx="50" cy="50" r="46"',
  '<rect x="5" y="5" width="90" height="90" rx="28"',
  '<polygon points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"',
  ring(14, 48, 41),
  ring(8, 47, 42),
  '<path d="M50 4c19 0 34 9 40 24s4 33-7 45-29 22-45 19S9 77 5 60 6 25 19 14 38 4 50 4z"'
];

// Gradient pairs that read well on both light and dark sheets.
var PALETTES = [
  ["#ffb36b", "#ef6f22"], ["#6fe0a8", "#1f9a68"], ["#c3a6ff", "#7350d6"],
  ["#7cc8ff", "#2d78d6"], ["#ff95bd", "#d4407a"], ["#ffdf6b", "#e09a00"]
];

// White sound motifs: bars, radiating rings, a wave line.
var MOTIFS = [
  '<path d="M30 46v8M40 38v24M50 30v40M60 40v20M70 47v6" stroke-width="6.5"/>',
  '<circle cx="33" cy="50" r="5" fill="#fff" stroke="none"/><path d="M44 40a12 12 0 0 1 0 20M53 32a22 22 0 0 1 0 36M62 25a31 31 0 0 1 0 50" stroke-width="6"/>',
  '<path d="M24 50c5-14 9-14 13 0s8 14 13 0 8-14 13 0 8 14 13 0" stroke-width="6.5"/>'
];

var uid = 0;
// SVG markup for the i-th sticker. Shape, colors, and motif vary independently, so the
// first 36 are all different.
export function soundSticker(i) {
  var shape = SHAPES[i % SHAPES.length];
  var pal = PALETTES[(i + Math.floor(i / SHAPES.length)) % PALETTES.length];
  var motif = MOTIFS[(i + Math.floor(i / 3)) % MOTIFS.length];
  var id = "ss" + (uid++);
  return '<svg class="sound-sticker" viewBox="0 0 100 100" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + pal[0] + '"/><stop offset="1" stop-color="' + pal[1] + '"/></linearGradient></defs>' +
    shape + ' fill="url(#' + id + ')"/>' +
    '<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">' + motif + "</g></svg>";
}

// { word: sticker SVG } for a pack's entries: picture-less words in pack order.
export function listenStickers(entries) {
  var out = {}, n = 0;
  entries.forEach(function (e) { if (!e.pic) out[e.w] = soundSticker(n++); });
  return out;
}
