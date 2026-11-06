// Sound it out: the single sounds the app has recordings for, and how a word list writes a
// word's sounds. No DOM; runs in Node (scripts/check.mjs, the audio build).
//
// In a word list, a word's sounds go in braces at the end of its line, letters grouped by
// sound with spaces between: `cat 🐈 {c a t}`, `ship 🚢 {sh i p}`. Each group says its usual
// sound (USUAL below: c → k, sh → sh, ee → ee); say another with "=": `{c=s i t y}`.
// Words without braces (sight words) don't get Sound it out.

// Every sound with a recording (scripts/audio/sounds/picks.json says how each is made; the
// check keeps the two lists the same). Short vowels are a e i o u; uu is the vowel in
// "book", uh the one in "about", dh the "th" in "this", zh the sound in "vision".
export var SOUNDS = [
  "a", "e", "i", "o", "u", "ay", "ee", "igh", "oh", "oo", "uu", "ow", "oy", "aw", "uh",
  "ar", "or", "er", "air", "ear",
  "b", "d", "g", "k", "p", "t", "ch", "j", "f", "v", "s", "z", "sh", "zh", "th", "dh", "h",
  "m", "n", "ng", "l", "r", "w", "y", "ks", "kw"
];

// A word with each sound, for labels (the listen check): "sh, as in ship".
export var EXAMPLE = {
  a: "cat", e: "bed", i: "pig", o: "hot", u: "sun", ay: "cake", ee: "see", igh: "kite", oh: "boat",
  oo: "moon", uu: "book", ow: "cow", oy: "boy", aw: "saw", uh: "about", ar: "car", or: "for",
  er: "her", air: "hair", ear: "ear", b: "bat", d: "dog", g: "go", k: "kit", p: "pig", t: "top",
  ch: "chip", j: "jam", f: "fan", v: "van", s: "sun", z: "zip", sh: "ship", zh: "vision",
  th: "thin", dh: "this", h: "hat", m: "map", n: "nut", ng: "sing", l: "leg", r: "red", w: "web",
  y: "yes", ks: "box", kw: "queen"
};

// Blends: two consonant sounds in a row (f r in frog, s t in nest) play as one recording,
// the sounds running together, while each still lights its own box (a blend is two
// sounds; sh, one sound, lights its two boxes at once). The recording is "f+r", made from
// the two single sounds (scripts/audio/sounds/lab.py, blend()). Left to right, a sound is
// in one blend at most: s t r → s+t, then r.
var VOWELS = ["a", "e", "i", "o", "u", "ay", "ee", "igh", "oh", "oo", "uu", "ow", "oy", "aw", "uh",
  "ar", "or", "er", "air", "ear"];
// Stops: sounds said as a short burst, not held (scripts/audio/sounds/lab.py marks the same
// ones "stop"; the check keeps them equal). A blend ending in one is made differently.
export var STOPS = ["b", "d", "g", "k", "p", "t", "ch", "j", "ks", "kw"];
// `names`: a word's sounds in order ("f", "r", "o", "g") → [{ at: 0, name: "f+r" }], `at`
// being the index of the blend's first sound.
export function blendsIn(names) {
  var out = [];
  for (var i = 0; i + 1 < names.length; i++) {
    if (VOWELS.indexOf(names[i]) < 0 && VOWELS.indexOf(names[i + 1]) < 0) { out.push({ at: i, name: names[i] + "+" + names[i + 1] }); i++; }
  }
  return out;
}

// Where wrong letters fall, for the Stats tab ("where the slips happen"), as counts only.
// `idxs`: positions in `word` (apostrophes have boxes too; they're skipped) →
// [{ place, kind }]: place "start" / "middle" / "end" (the first and last third of the
// letters, rounded up), kind "vowel" / "blend" (a consonant sound next to another, like the
// t in stop) / "consonant". `segs`: the word's sounds (parseSounds) when its list gives
// them; otherwise letters are grouped by spelling, so sh, ck or a double letter is one sound.
var GROUPS = ["tch", "dge", "sh", "ch", "th", "wh", "ph", "ck", "ng", "gh", "kn", "wr", "qu"];
export function slipSpots(word, segs, idxs) {
  var letters = String(word).replace(/['’]/g, ""), n = letters.length, k = Math.ceil(n / 3);
  var units = segs ? segs.map(function (s) { return { at: s.at, len: s.len, vowel: VOWELS.indexOf(s.sound) >= 0 }; }) : [];
  for (var i = 0; !segs && i < n; ) {
    var len = GROUPS.indexOf(letters.substr(i, 3)) >= 0 ? 3
      : GROUPS.indexOf(letters.substr(i, 2)) >= 0 || (letters[i] === letters[i + 1] && "aeiou".indexOf(letters[i]) < 0) ? 2 : 1;
    var ch = letters[i];
    units.push({ at: i, len: len, vowel: len === 1 && ("aeiou".indexOf(ch) >= 0 || (ch === "y" && i > 0)) });
    i += len;
  }
  var unitOf = [];
  units.forEach(function (u, ui) { for (var j = 0; j < u.len; j++) unitOf[u.at + j] = ui; });
  var out = [], li = -1, letterAt = [];
  for (var w = 0; w < word.length; w++) letterAt[w] = /['’]/.test(word[w]) ? -1 : ++li;
  idxs.forEach(function (w) {
    var l = letterAt[w];
    if (l == null || l < 0) return;
    var ui = unitOf[l], u = units[ui];
    if (!u) return;
    var near = function (v) { return v && !v.vowel; };
    var kind = u.vowel ? "vowel" : near(units[ui - 1]) || near(units[ui + 1]) ? "blend" : "consonant";
    out.push({ place: l < k ? "start" : l >= n - k ? "end" : "middle", kind: kind });
  });
  return out;
}

// The sound a letter group usually makes. Groups that are often more than one sound (ow:
// cow or snow) aren't here, so the list must say which: `{s n ow=oh}`.
export var USUAL = {
  a: "a", e: "e", i: "i", o: "o", u: "u",
  b: "b", c: "k", d: "d", f: "f", g: "g", h: "h", j: "j", k: "k", l: "l", m: "m", n: "n",
  p: "p", r: "r", s: "s", t: "t", v: "v", w: "w", x: "ks", y: "y", z: "z", qu: "kw",
  ck: "k", sh: "sh", ch: "ch", th: "th", ng: "ng", ph: "f", wh: "w", kn: "n", wr: "r",
  tch: "ch", dge: "j", bb: "b", dd: "d", ff: "f", gg: "g", ll: "l", mm: "m", nn: "n",
  pp: "p", rr: "r", ss: "s", tt: "t", zz: "z",
  ee: "ee", ea: "ee", ai: "ay", ay: "ay", oa: "oh", igh: "igh", oo: "oo", ar: "ar", or: "or",
  er: "er", ir: "er", ur: "er", oi: "oy", oy: "oy", ou: "ow", aw: "aw", au: "aw", ew: "oo"
};

// "c a t" for the word "cat" → { segs: [{ at: 0, len: 1, sound: "k" }, ...] }, or
// { error: "..." }. `at` and `len` count letters of the word, skipping apostrophes (they
// have a box but no sound).
export function parseSounds(spec, word) {
  var letters = String(word).replace(/['’]/g, ""), segs = [], at = 0;
  var groups = String(spec).trim().split(/\s+/).filter(Boolean);
  if (!groups.length) return { error: "no sounds between the braces" };
  for (var i = 0; i < groups.length; i++) {
    var m = groups[i].toLowerCase().match(/^([a-z]+)(?:=([a-z]+))?$/);
    if (!m) return { error: '"' + groups[i] + '" should be letters, or letters=sound' };
    var sound = m[2] || USUAL[m[1]];
    if (!sound) return { error: 'say which sound "' + m[1] + '" makes here: ' + m[1] + "=<sound>" };
    if (SOUNDS.indexOf(sound) < 0) return { error: '"' + sound + '" isn\'t a sound with a recording (' + SOUNDS.join(" ") + ")" };
    segs.push({ at: at, len: m[1].length, sound: sound });
    at += m[1].length;
  }
  var joined = groups.map(function (g) { return g.split("=")[0].toLowerCase(); }).join("");
  if (joined !== letters) return { error: 'the groups spell "' + joined + '", not "' + letters + '"' };
  return { segs: segs };
}

// The guessing nudge (app.js): is `typed` a close guess for the letter at `i` in `word`? Close =
// a letter that can stand for a similar sound, an honest spelling mistake (any vowel for a vowel,
// c/k/q/s/x, b/p, d/t...). Anything else, like m where a goes, looks like throwing letters at
// the box. Generous on purpose: only clear guessing should ever count.
var CLOSE = ["aeiouy", "ckqsx", "sz", "gj", "fv", "bp", "dt", "mn", "wh", "rl"];
var PAIRS = ["ch", "sh", "th", "ph", "wh", "ck", "ng", "gh", "qu"]; // two letters, one sound
export function isClose(word, i, typed) {
  var right = word[i], t = (typed || "").toLowerCase();
  if (t === right || right === "'" || t === "'") return true;
  if (right === "e" && i === word.length - 1) return true; // a silent e at the end
  // A letter in a two-letter sound (sh, ch, th, ph, ck...): its partner letters and the sound's
  // usual spellings are close (s for c in "ch", f for p in "ph").
  for (var d = -1; d <= 0; d++) {
    var pair = word.slice(i + d, i + d + 2);
    if (i + d >= 0 && PAIRS.indexOf(pair) >= 0 && "cshtpfwkgnq".indexOf(t) >= 0) return true;
  }
  return CLOSE.some(function (g) { return g.indexOf(right) >= 0 && g.indexOf(t) >= 0; });
}
