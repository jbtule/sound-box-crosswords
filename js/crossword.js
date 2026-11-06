// Crossword generation: parse word lists, place words, number the grid.
// No DOM access, so scripts/check.mjs can run it in Node.

import { parseSounds } from "./phonics.js";

export const MAX_COLS = 11, MAX_ROWS = 12; // keeps the grid small enough for a phone

// "ba-nan-a 🍌 (buh-nan-uh)" lines →
//   [{ syll: "ba-nan-a", w: "banana", pic: "🍌", say: ["buh", "nan", "uh"], sentence: "" }].
// The optional (…) says how Break it down should pronounce each syllable; it's ignored
// (say: null) unless it has one part per syllable. An optional "quoted sentence" at the
// end is spoken for context: their "The kids hung their coats."
// An optional {c a t} lists the word's sounds for Sound it out (see phonics.js):
//   sounds: [{ at, len, sound }], or null.
// Skips blank or malformed lines, duplicates, and words outside 2–12 letters.
export function parseList(text) {
  var out = [], seen = {};
  String(text || "").split(/\r?\n/).forEach(function (line) {
    // Letters, dashes between syllables, and apostrophes (don't); curly ’ counts as '.
    var m = line.trim().replace(/[\u2018\u2019]/g, "'").match(/^([A-Za-z][A-Za-z'\-]*[A-Za-z])\s*(.*)$/);
    if (!m) return;
    var syll = m[1].toLowerCase().replace(/-+/g, "-");
    var w = syll.replace(/-/g, "");
    if (w.length < 2 || w.length > 12 || seen[w]) return;
    seen[w] = 1;
    var rest = m[2].replace(/[\u201C\u201D]/g, '"'), sentence = "", say = null, sounds = null;
    // {c a t}: the word's sounds for Sound it out (phonics.js); dropped if they don't parse.
    var braces = rest.match(/\{([^}]*)\}/);
    if (braces) {
      rest = rest.replace(braces[0], " ");
      var ps = parseSounds(braces[1], w);
      if (ps.segs) sounds = ps.segs;
    }
    var quote = rest.match(/"([^"]*)"/);
    if (quote) { sentence = quote[1].trim(); rest = rest.replace(quote[0], " "); }
    var hint = rest.match(/\(([^)]*)\)/);
    if (hint) {
      rest = rest.replace(hint[0], " ");
      say = hint[1].split("-").map(function (s) { return s.trim(); });
      if (say.length !== syll.split("-").length || say.some(function (s) { return !s; })) say = null;
    }
    out.push({ syll: syll, w: w, pic: rest.trim().split(/\s+/)[0] || "", say: say, sentence: sentence, sounds: sounds });
  });
  return out;
}

// The recordings one word needs, in play order: the word, each Break it down syllable
// (its how-it-sounds hint when there is one), and the context sentence. Used by
// scripts/audio/build.mjs to make them and by listen/ to check them.
export function clipsFor(e) {
  var out = [{ kind: "w", text: e.w }];
  var syll = e.syll.split("-");
  if (syll.length > 1) (e.say || syll).forEach(function (s, i) { out.push({ kind: "s", text: s, part: syll[i] }); });
  if (e.sentence) out.push({ kind: "t", text: e.sentence });
  return out;
}

export function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// One random greedy layout. Each word after the first must cross a placed word;
// among legal spots, prefer the ones with the most crossings. `first` words are tried
// before `rest`, so they win the open spots.
function tryBuild(first, rest, target) {
  var grid = {}, dirUse = {}, placed = [];
  var key = function (r, c) { return r + "," + c; };
  function canPlace(w, r, c, dir, first) {
    var dr = dir === "D" ? 1 : 0, dc = dir === "A" ? 1 : 0, inter = 0;
    if (grid[key(r - dr, c - dc)] || grid[key(r + dr * w.length, c + dc * w.length)]) return -1;
    for (var k = 0; k < w.length; k++) {
      var rr = r + dr * k, cc = c + dc * k, kk = key(rr, cc), ch = grid[kk];
      if (ch) {
        if (ch !== w[k] || (dirUse[kk] && dirUse[kk][dir])) return -1;
        inter++;
      } else if (dir === "A") {
        if (grid[key(rr - 1, cc)] || grid[key(rr + 1, cc)]) return -1;
      } else if (grid[key(rr, cc - 1)] || grid[key(rr, cc + 1)]) return -1;
    }
    if (!first && inter === 0) return -1;
    return inter;
  }
  function bboxOk(w, r, c, dir) {
    var rs = [r, r + (dir === "D" ? w.length - 1 : 0)], cs = [c, c + (dir === "A" ? w.length - 1 : 0)];
    placed.forEach(function (p) { rs.push(p.r, p.r + (p.dir === "D" ? p.w.length - 1 : 0)); cs.push(p.c, p.c + (p.dir === "A" ? p.w.length - 1 : 0)); });
    return Math.max.apply(null, cs) - Math.min.apply(null, cs) + 1 <= MAX_COLS && Math.max.apply(null, rs) - Math.min.apply(null, rs) + 1 <= MAX_ROWS;
  }
  function put(e, r, c, dir) {
    var dr = dir === "D" ? 1 : 0, dc = dir === "A" ? 1 : 0;
    for (var k = 0; k < e.w.length; k++) {
      var kk = key(r + dr * k, c + dc * k);
      grid[kk] = e.w[k];
      dirUse[kk] = dirUse[kk] || {}; dirUse[kk][dir] = 1;
    }
    placed.push({ w: e.w, syll: e.syll, pic: e.pic, say: e.say, sentence: e.sentence, sounds: e.sounds, r: r, c: c, dir: dir });
  }
  var order = shuffle(first.slice()).concat(shuffle(rest.slice()));
  put(order[0], 0, 0, Math.random() < 0.5 ? "A" : "D");
  // A word that crosses nothing yet may cross a word placed after it, so keep sweeping the
  // ones left over until a sweep places none.
  var left = order.slice(1), placedOne = true;
  while (placedOne && left.length && placed.length < target) {
    placedOne = false;
    left = left.filter(function (e) {
      if (placed.length >= target) return true;
      var opts = [], best = 0;
      placed.forEach(function (p) {
        for (var a = 0; a < p.w.length; a++) for (var b = 0; b < e.w.length; b++) {
          if (p.w[a] !== e.w[b]) continue;
          var dir = p.dir === "A" ? "D" : "A";
          var r = p.dir === "A" ? p.r - b : p.r + a;
          var c = p.dir === "A" ? p.c + a : p.c - b;
          var s = canPlace(e.w, r, c, dir, false);
          if (s > 0 && bboxOk(e.w, r, c, dir)) { opts.push({ r: r, c: c, dir: dir, s: s }); if (s > best) best = s; }
        }
      });
      if (!opts.length) return true;
      var top = opts.filter(function (o) { return o.s === best; });
      var o = top[Math.floor(Math.random() * top.length)];
      put(e, o.r, o.c, o.dir);
      placedOne = true;
      return false;
    });
  }
  return placed;
}

// Best of many random layouts. Aims for 6 words (5 if they're long). Scored by how many
// `fresh` words it fits (not yet done this round, so the pack is covered in as few
// puzzles as possible), then total words, then smallest area. Other words are filler,
// least recent first; `recent` words are used last.
var MIN_WORDS = 3;
function build(pool, recent, fresh) {
  var isFresh = function (e) { return fresh.indexOf(e.w) >= 0; };
  var first = shuffle(pool.filter(isFresh)).slice(0, 10);
  var others = shuffle(pool.filter(function (e) { return !isFresh(e); }));
  others.sort(function (a, b) { return (recent.indexOf(a.w) >= 0) - (recent.indexOf(b.w) >= 0); });
  var rest = others.slice(0, Math.max(4, 10 - first.length));
  var base = first.concat(rest);
  var avg = base.reduce(function (s, e) { return s + e.w.length; }, 0) / base.length;
  var target = Math.min(base.length, avg > 7 ? 5 : 6);
  var bestSet = null, bestScore = -Infinity, need = Math.min(MIN_WORDS, pool.length);
  for (var t = 0; t < 400; t++) {
    // Short of a real crossword after 80 tries: build from the whole pack in any order (the
    // fresh words still score higher, but no longer have to come first).
    if (t >= 80 && bestSet.length >= need) break;
    var p = t >= 80 ? tryBuild(first.concat(others), [], target) : first.length ? tryBuild(first, rest, target) : tryBuild(rest, [], target);
    var rs = [], cs = [];
    p.forEach(function (q) { rs.push(q.r, q.r + (q.dir === "D" ? q.w.length - 1 : 0)); cs.push(q.c, q.c + (q.dir === "A" ? q.w.length - 1 : 0)); });
    var area = (Math.max.apply(null, rs) - Math.min.apply(null, rs) + 1) * (Math.max.apply(null, cs) - Math.min.apply(null, cs) + 1);
    var nFresh = p.filter(isFresh).length;
    // A real crossword first (at least 3 words, or the whole pool if smaller): covering a fresh
    // word never wins over that, or a word that crosses nothing ends up a puzzle on its own.
    var full = p.length >= need ? 1e6 : 0;
    var score = full + nFresh * 10000 + p.length * 1000 - area;
    if (score > bestScore) { bestScore = score; bestSet = p; }
    if (p.length >= target && nFresh >= Math.min(target, first.length) && t > 20) break;
  }
  return bestSet;
}

// Builds a puzzle from parsed entries. Returns { words, rows, cols, cells }:
// - words[i]: { w, syll, pic, r, c, dir: "A"|"D", num, cells: ["r,c"...],
//   chunks: syllables, say: how to speak each syllable, sylOf: syllable index per letter }
// - cells["r,c"]: { letter, words: [word indexes], num? }
// `recent`: words to avoid repeating; `fresh`: words to cover first (see build).
export function makePuzzle(pool, recent, fresh) {
  return assemble(build(pool, recent || [], fresh || []));
}

// Rebuilds a saved puzzle ([{ w, r, c, dir }], as saved by the app) from the current word
// list, so a puzzle in progress survives a reload. Each word's details (hint, sentence,
// picture, sounds) come from the list as it is now; null if any word is gone or the
// layout no longer fits together.
export function restorePuzzle(pool, saved) {
  if (!Array.isArray(saved) || !saved.length) return null;
  var byW = {};
  pool.forEach(function (e) { byW[e.w] = e; });
  var placed = [];
  for (var i = 0; i < saved.length; i++) {
    var s = saved[i], e = s && byW[s.w];
    if (!e || (s.dir !== "A" && s.dir !== "D") || !(s.r >= 0) || !(s.c >= 0)) return null;
    placed.push({ w: e.w, syll: e.syll, pic: e.pic, say: e.say, sentence: e.sentence, sounds: e.sounds, r: s.r, c: s.c, dir: s.dir });
  }
  var P = assemble(placed);
  for (var kk in P.cells) {
    var cell = P.cells[kk];
    var ok = cell.words.every(function (i) { var W = P.words[i]; return W.w[W.cells.indexOf(kk)] === cell.letter; });
    if (!ok) return null;
  }
  return P;
}

// Placed words → the puzzle: moved to start at 0,0, cells collected, clues numbered.
function assemble(placed) {
  var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  placed.forEach(function (p) {
    minR = Math.min(minR, p.r); minC = Math.min(minC, p.c);
    maxR = Math.max(maxR, p.r + (p.dir === "D" ? p.w.length - 1 : 0));
    maxC = Math.max(maxC, p.c + (p.dir === "A" ? p.w.length - 1 : 0));
  });
  var cells = {};
  placed.forEach(function (p, i) {
    p.r -= minR; p.c -= minC; p.cells = [];
    p.chunks = p.syll.split("-");
    p.say = p.say || p.chunks;
    p.sylOf = [];
    p.chunks.forEach(function (ch, ci) { for (var x = 0; x < ch.length; x++) p.sylOf.push(ci); });
    for (var k = 0; k < p.w.length; k++) {
      var r = p.r + (p.dir === "D" ? k : 0), c = p.c + (p.dir === "A" ? k : 0), kk = r + "," + c;
      cells[kk] = cells[kk] || { letter: p.w[k], words: [] };
      cells[kk].words.push(i);
      p.cells.push(kk);
    }
  });
  // Number clues in reading order; an across and a down word can share a number.
  var starts = placed.map(function (p, i) { return { i: i, r: p.r, c: p.c }; })
    .sort(function (a, b) { return a.r - b.r || a.c - b.c; });
  var n = 0, numAt = {};
  starts.forEach(function (s) { var kk = s.r + "," + s.c; if (!numAt[kk]) numAt[kk] = ++n; placed[s.i].num = numAt[kk]; });
  Object.keys(numAt).forEach(function (kk) { cells[kk].num = numAt[kk]; });
  return { words: placed, rows: maxR - minR + 1, cols: maxC - minC + 1, cells: cells };
}

// The context sentence as shown on screen: each of `words` becomes a blank with one "_"
// per box (the grid already shows the length), so the sentence never spells a word in
// the puzzle. An ending on it (-s, -es, -d, -ed, -ing, 's) stays: "____ed".
export function blankSentence(sentence, words) {
  var alt = words.map(function (w) { return w.replace(/'/g, "['’]"); }).join("|");
  if (!alt) return sentence;
  var re = new RegExp("(^|[^a-z'’])(" + alt + ")(s|es|d|ed|ing|['’]s)?(?![a-z'’])", "gi");
  return sentence.replace(re, function (m, pre, word, end) { return pre + "_".repeat(word.length) + (end || ""); });
}
