// Grid color schemes. Classic is everyone's; finishing a whole pack unlocks the next one
// (cosmetic only). Each sets the syllable band, selection and accent tokens, for light and
// dark. No DOM here: `npm run check` tests contrast and that the two syllable bands stay
// clearly apart (the core mechanic), and app.js applies them with `paletteCSS`.
//
// Token order: sylA, sylA-edge, sylB, sylB-edge, accent, accent-soft.
var KEYS = ["--sylA", "--sylA-edge", "--sylB", "--sylB-edge", "--accent", "--accent-soft"];

function p(id, name, light, dark) {
  var o = { id: id, name: name, light: {}, dark: {} };
  KEYS.forEach(function (k, i) { o.light[k] = light[i]; o.dark[k] = dark[i]; });
  return o;
}

export var PALETTES = [
  // Must match the defaults at the top of styles.css (the check compares them).
  p("classic", "Classic",
    ["#d6f1e3", "#2f9a6c", "#e6dcfb", "#7d5fd0", "#ef7d22", "#fde6d2"],
    ["#1c4a3a", "#4fcf97", "#3a2f60", "#a98cf2", "#ff9a47", "#4a3220"]),
  p("ocean", "Ocean",
    ["#d4e8fb", "#2b78c9", "#fbefc4", "#b0820a", "#0f8f86", "#d3f1ee"],
    ["#183a5c", "#5aa8f0", "#4a3f1c", "#e3bd52", "#3fd0c2", "#173f3c"]),
  p("forest", "Forest",
    ["#d2efab", "#5c8f1f", "#fdd8b4", "#c96b1a", "#2f7fc1", "#d8e8f8"],
    ["#2c4416", "#9ed15a", "#4a2f17", "#f0a05a", "#5fa8f0", "#1e3550"]),
  p("berry", "Berry",
    ["#f8c8de", "#c7407f", "#c9e1fa", "#3b7fd0", "#8a4fd8", "#ece0fb"],
    ["#4f1f38", "#f07ab2", "#1c3654", "#6fb0f5", "#b48cf7", "#3a2c5c"]),
  p("sunset", "Sunset",
    ["#ffe0c2", "#d9701a", "#ecdcfb", "#8b5cd6", "#12899a", "#d4f0f3"],
    ["#4c2f17", "#ffa552", "#362a5c", "#b195f5", "#45c4d6", "#16404a"]),
  p("space", "Space",
    ["#d2f3f7", "#1c98a8", "#f8d8f0", "#b8429a", "#5a5ce0", "#e0e0fb"],
    ["#12404a", "#4fd3e3", "#4a1a42", "#f07ad8", "#8a8cff", "#2a2c5c"]),
  // Secret, last: only finishing a hard mode pack (its Champion) opens it, never the usual
  // one-per-pack unlocks. Steel and maroon with a gold ring; maroon, not red, so a syllable
  // doesn't read as a wrong letter.
  Object.assign(p("blackbelt", "Black Belt",
    ["#e2e5ea", "#5a6574", "#e7a3ae", "#7a1f2b", "#c9930a", "#faeccb"],
    ["#2f3540", "#eef2f7", "#5a1f29", "#b84a59", "#f0c040", "#4a3a12"]), { secret: true })
];
// The schemes unlocked one per pack, in order (every one but the secret ones).
export var EVERYDAY = PALETTES.filter(function (pal) { return !pal.secret; }).length;

// How many of the everyday schemes are open: Classic plus one per (non-hard) pack finished.
export function unlockedCount(packsDone) {
  return Math.min(EVERYDAY, 1 + packsDone);
}

function block(sel, vars) {
  return sel + " {" + KEYS.map(function (k) { return " " + k + ": " + vars[k] + ";"; }).join("") + " }";
}

// CSS for every scheme, on :root[data-palette] (the page) and on any [data-palette]
// element inside it (the swatches in the picker). The dark rules are more specific, so
// they win over the light ones and over the defaults in styles.css.
export function paletteCSS() {
  return PALETTES.map(function (pal) {
    var a = '[data-palette="' + pal.id + '"]';
    return [
      block(":root" + a + ", :root " + a, pal.light),
      "@media (prefers-color-scheme: dark) { " +
        block(':root:not([data-theme="light"])' + a + ', :root:not([data-theme="light"]) ' + a, pal.dark) + " }",
      block(':root[data-theme="dark"]' + a + ', :root[data-theme="dark"] ' + a, pal.dark)
    ].join("\n");
  }).join("\n");
}
