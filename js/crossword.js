// Crossword generation: parse word lists, place words, number the grid.
// No DOM access, so scripts/check.mjs can run it in Node.

export const MAX_COLS = 11, MAX_ROWS = 12; // keeps the grid small enough for a phone

// "ba-nan-a 🍌 (buh-nan-uh)" lines →
//   [{ syll: "ba-nan-a", w: "banana", pic: "🍌", say: ["buh", "nan", "uh"] }].
// The optional (…) says how Clap it should pronounce each syllable; it's ignored
// (say: null) unless it has one part per syllable.
// Skips blank or malformed lines, duplicates, and words outside 2–12 letters.
export function parseList(text) {
  var out = [], seen = {};
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var m = line.trim().match(/^([A-Za-z][A-Za-z\-]*[A-Za-z])\s*(.*)$/);
    if (!m) return;
    var syll = m[1].toLowerCase().replace(/-+/g, "-");
    var w = syll.replace(/-/g, "");
    if (w.length < 2 || w.length > 12 || seen[w]) return;
    seen[w] = 1;
    var rest = m[2], say = null, hint = rest.match(/\(([^)]*)\)/);
    if (hint) {
      rest = rest.replace(hint[0], " ");
      say = hint[1].split("-").map(function (s) { return s.trim(); });
      if (say.length !== syll.split("-").length || say.some(function (s) { return !s; })) say = null;
    }
    out.push({ syll: syll, w: w, pic: rest.trim().split(/\s+/)[0] || "", say: say });
  });
  return out;
}

export function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// One random greedy layout. Each word after the first must cross a placed word;
// among legal spots, prefer the ones with the most crossings.
function tryBuild(cands, target) {
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
    placed.push({ w: e.w, syll: e.syll, pic: e.pic, say: e.say, r: r, c: c, dir: dir });
  }
  var order = shuffle(cands.slice());
  put(order[0], 0, 0, Math.random() < 0.5 ? "A" : "D");
  for (var i = 1; i < order.length && placed.length < target; i++) {
    var e = order[i], opts = [], best = 0;
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
    if (opts.length) {
      var top = opts.filter(function (o) { return o.s === best; });
      var o = top[Math.floor(Math.random() * top.length)];
      put(e, o.r, o.c, o.dir);
    }
  }
  return placed;
}

// Best of many random layouts: most words, then smallest area. Aims for 6 words
// (5 if they're long) and skips `recent` words when the pool has enough others.
function build(pool, recent) {
  var fresh = pool.filter(function (e) { return recent.indexOf(e.w) < 0; });
  var base = shuffle(fresh.length >= 6 ? fresh : pool.slice()).slice(0, 10);
  var avg = base.reduce(function (s, e) { return s + e.w.length; }, 0) / base.length;
  var target = Math.min(base.length, avg > 7 ? 5 : 6);
  var bestSet = null, bestScore = -1;
  for (var t = 0; t < 60; t++) {
    var p = tryBuild(base, target);
    var rs = [], cs = [];
    p.forEach(function (q) { rs.push(q.r, q.r + (q.dir === "D" ? q.w.length - 1 : 0)); cs.push(q.c, q.c + (q.dir === "A" ? q.w.length - 1 : 0)); });
    var area = (Math.max.apply(null, rs) - Math.min.apply(null, rs) + 1) * (Math.max.apply(null, cs) - Math.min.apply(null, cs) + 1);
    var score = p.length * 1000 - area;
    if (score > bestScore) { bestScore = score; bestSet = p; }
    if (p.length >= target && t > 20) break;
  }
  return bestSet;
}

// Builds a puzzle from parsed entries. Returns { words, rows, cols, cells }:
// - words[i]: { w, syll, pic, r, c, dir: "A"|"D", num, cells: ["r,c"...],
//   chunks: syllables, say: how to speak each syllable, sylOf: syllable index per letter }
// - cells["r,c"]: { letter, words: [word indexes], num? }
export function makePuzzle(pool, recent) {
  var placed = build(pool, recent || []);
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
