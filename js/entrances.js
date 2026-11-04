// New-puzzle entrances: how a fresh puzzle's boxes arrive, each with its own sound, as designed
// in the Board Entrances spike. Uses the DOM (element.animate) but no app state: app.js passes
// the puzzle, the board and the audio.
//   geometry(P, board, clueOrder) → where every box is, for the plans
//   playEntrance(id, geo, { audio }) → { done: Promise, skip() }
//   nextEntrance(state) → { id, state }: the everyday/premium cycle (see below)
import { makeSfx } from "./sfx.js";

var BOUNCE = "cubic-bezier(.25,1.45,.45,1)";

// Each plan(g, sfx) returns { keyframes for each box key: { kf, delay, dur, ease } } and may add
// timed extras with g.at(seconds, fn). Times are in seconds; sfx(at, function (when) {...})
// schedules a sound at `at` seconds in.
export var ENTRANCES = [
  { id: "slide", name: "Slide in", premium: false,
    // Each word's boxes slide in from its own edge: across words from the left, down words
    // from the top. A soft whoosh per word.
    plan: function (g, sfx) {
      var a = {}, t = 0, step = g.size + g.gap;
      g.words.forEach(function (w, wi) {
        var mine = w.cells.filter(function (k) { return g.cells[k].owner === wi; });
        if (!mine.length) return;
        sfx(t, function (at, S) { S.whoosh(at, 0.45); });
        mine.forEach(function (k, j) {
          var o = g.cells[k], dx = w.dir === "A" ? -(o.c + 2) * step : 0, dy = w.dir === "D" ? -(o.r + 2) * step : 0;
          a[k] = { kf: [{ transform: "translate(" + dx + "px," + dy + "px)", opacity: 0 }, { transform: "translate(0,0)", opacity: 1 }],
            delay: t + j * 0.045, dur: 0.55, ease: BOUNCE };
        });
        t += 0.32;
      });
      return a;
    } },
  { id: "zoom", name: "Zoom", premium: false,
    // Boxes grow outward from the crossings, past their size, then settle. A pop as each
    // ring grows, a soft tap as it settles.
    plan: function (g, sfx) {
      var a = {}, rings = {}, crossings = g.order.filter(function (k) { return g.cells[k].words.length > 1; });
      if (!crossings.length) crossings = [g.order[0]];
      g.order.forEach(function (k) {
        var o = g.cells[k], d = Math.min.apply(null, crossings.map(function (x) { return Math.hypot(o.r - g.cells[x].r, o.c - g.cells[x].c); })), at = d * 0.13;
        a[k] = { kf: [
            { transform: "scale(0) rotate(-20deg)", opacity: 0, zIndex: 2, offset: 0 },
            { transform: "scale(1.6) rotate(5deg)", opacity: 1, zIndex: 2, offset: 0.45, easing: "ease-in-out" },
            { transform: "scale(.92) rotate(-1deg)", opacity: 1, zIndex: 1, offset: 0.78, easing: "ease-out" },
            { transform: "scale(1) rotate(0)", opacity: 1, zIndex: 1, offset: 1 }],
          delay: at, dur: 0.65, ease: "linear" };
        var ring = Math.round(d);
        if (rings[ring] === undefined) rings[ring] = at;
      });
      Object.keys(rings).forEach(function (ring) {
        sfx(rings[ring], function (at, S) { S.pop(at, +ring * 2); });
        sfx(rings[ring] + 0.65 * 0.72, function (at, S) { S.tick(at, Math.max(0, +ring * 2 - 3)); });
      });
      return a;
    } },
  { id: "wash", name: "Color wash", premium: false,
    // Boxes land plain, then a diagonal wave blooms each box in its syllable color and back to
    // the board's own look (only the selected word keeps its colors). A harp-like glissando.
    plan: function (g, sfx) {
      var a = {}, t = 0.4, STEP = 0.12, diag = {};
      g.order.forEach(function (k, i) {
        a[k] = { kf: [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)" }], delay: i * 0.006, dur: 0.28, ease: "ease-out" };
        var o = g.cells[k], d = o.r + o.c, band = g.band[o.band];
        diag[d] = 1;
        g.at(t + d * STEP, function () {
          var cs = getComputedStyle(o.el);
          return o.el.animate([
            { backgroundColor: band.fill, borderColor: band.edge, transform: "scale(1.08)", filter: "brightness(1.15)" },
            { backgroundColor: cs.backgroundColor, borderColor: cs.borderColor, transform: "scale(1)", filter: "brightness(1)" }],
            { duration: 700, easing: "ease-out" });
        });
      });
      Object.keys(diag).map(Number).sort(function (x, y) { return x - y; }).forEach(function (d, i) {
        sfx(t + d * STEP, function (at, S) { S.bell(at, Math.min(i, 12)); });
      });
      return a;
    } },
  { id: "neon", name: "Neon", premium: false,
    // Dark, unlit tubes sputter on like a neon sign warming up, each flickering in its own
    // rhythm before it catches, glowing in its syllable color, then easing to normal.
    plan: function (g, sfx) {
      var a = {}, end = 0;
      shuffle(g.order).forEach(function (k, i, all) {
        var o = g.cells[k], glow = g.band[o.band].edge, at = Math.pow(i / all.length, 0.75) * 2.2 + Math.random() * 0.15, dur = 0.75 + Math.random() * 0.45;
        var off = { opacity: 0.14, filter: "brightness(.7) saturate(.3)", boxShadow: "0 0 0 0 transparent" };
        var on = { opacity: 1, filter: "brightness(1.35) saturate(1.3)", boxShadow: "0 0 14px 2px " + glow };
        var kf = [Object.assign({ offset: 0, easing: "steps(1, end)" }, off)], tt = 0, n = 3 + Math.floor(Math.random() * 3), flicks = [];
        for (var f = 0; f < n; f++) {
          var t1 = tt + 0.05 + Math.random() * 0.12, t2 = Math.min(t1 + 0.03 + Math.random() * 0.08, 0.6);
          if (t1 >= 0.58) break;
          kf.push(Object.assign({ offset: t1, easing: "steps(1, end)" }, on));
          kf.push(Object.assign({ offset: t2, easing: "steps(1, end)" }, off));
          flicks.push(t1); tt = t2;
        }
        var lit = Math.max(tt + 0.04, 0.66);
        kf.push(Object.assign({ offset: lit, easing: "ease-out" }, on)); flicks.push(lit);
        kf.push({ offset: 1, opacity: 1, filter: "brightness(1) saturate(1)", boxShadow: "0 0 0 0 transparent" });
        a[k] = { kf: kf, delay: at, dur: dur, ease: "linear" };
        flicks.slice(0, 3).forEach(function (fl, j) { sfx(at + fl * dur, function (when, S) { S.zap(when, i + j); }); });
        end = Math.max(end, at + dur);
      });
      sfx(0, function (at, S) { S.buzz(at, end + 0.4); });
      return a;
    } }
];

function shuffle(list) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// Where every box is: its row and column, element, syllable band ("a"/"b", from the first
// word in clue order that has it), the words it's in, and which word owns it (the first).
// Words come in clue order, so words[0] is the one selected when the puzzle starts.
export function geometry(P, board, clueOrder) {
  var size = parseFloat(getComputedStyle(board).getPropertyValue("--cell-size")) || 40;
  var root = getComputedStyle(document.documentElement);
  var g = { board: board, size: size, gap: 4, cols: P.cols, rows: P.rows, cells: {}, order: [], words: [],
    band: { a: { fill: root.getPropertyValue("--sylA").trim(), edge: root.getPropertyValue("--sylA-edge").trim() },
            b: { fill: root.getPropertyValue("--sylB").trim(), edge: root.getPropertyValue("--sylB-edge").trim() } } };
  clueOrder.forEach(function (wi, n) {
    var W = P.words[wi];
    g.words.push({ dir: W.dir, cells: W.cells });
    W.cells.forEach(function (k, j) {
      if (!g.cells[k]) {
        var rc = k.split(",").map(Number);
        g.cells[k] = { r: rc[0], c: rc[1], el: board.querySelector('[data-k="' + k + '"]'), band: W.sylOf[j] % 2 ? "b" : "a", owner: n, words: [] };
        g.order.push(k);
      }
      g.cells[k].words.push(n);
    });
  });
  return g;
}

// Plays one entrance. `audio`: { ctx, out } to make its sounds (or null for none). Returns
// { done, skip }: done resolves when it ends or is skipped; skip() jumps to the finished board
// and silences what it scheduled.
export function playEntrance(id, g, opts) {
  var e = ENTRANCES.find(function (x) { return x.id === id; }) || ENTRANCES[0];
  var anims = [], timers = [], audio = opts && opts.audio, bus = null, S = null, t0 = 0, finish;
  var done = new Promise(function (resolve) { finish = resolve; });
  if (audio && audio.ctx) {
    try {
      bus = audio.ctx.createGain(); bus.gain.value = 0.55;
      var comp = audio.ctx.createDynamicsCompressor();
      bus.connect(comp); comp.connect(audio.out);
      S = makeSfx(audio.ctx, bus); t0 = audio.ctx.currentTime + 0.06;
    } catch (err) { bus = null; S = null; }
  }
  var extras = [];
  g.at = function (sec, fn) { extras.push({ at: sec, fn: fn }); };
  function sfx(at, fn) { if (S) { try { fn(t0 + at, S); } catch (err) {} } }
  var plan = e.plan(g, sfx), end = 0;
  g.order.forEach(function (k) {
    var p = plan[k], el = g.cells[k].el;
    if (!p || !el) return;
    anims.push(el.animate(p.kf, { duration: p.dur * 1000, delay: p.delay * 1000 + 60, easing: p.ease, fill: "backwards" }));
    end = Math.max(end, p.delay + p.dur);
  });
  extras.forEach(function (x) {
    timers.push(setTimeout(function () { var an = x.fn(); if (an) anims.push(an); }, x.at * 1000 + 60));
    end = Math.max(end, x.at + 0.7);
  });
  var over = false;
  function stop(skipped) {
    if (over) return;
    over = true;
    timers.forEach(clearTimeout);
    if (skipped) anims.forEach(function (an) { try { an.cancel(); } catch (err) {} });
    if (bus) {
      var ctx = audio.ctx;
      if (skipped) { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(function () { try { bus.disconnect(); } catch (err) {} }, 250); }
      else setTimeout(function () { try { bus.disconnect(); } catch (err) {} }, 1500); // let the last notes ring
    }
    finish(skipped);
  }
  timers.push(setTimeout(function () { stop(false); }, end * 1000 + 120));
  return { id: e.id, done: done, skip: function () { stop(true); } };
}

// Which entrance next. The everyday ones play once each, shuffled; then each premium one once,
// shuffled; then it starts over. Never the same one twice in a row. `state` is what the last
// call returned ({ cycle, at, last }, saved per edition); entrances added or removed in an
// update are handled when the cycle is read.
export function nextEntrance(state) {
  var ids = ENTRANCES.map(function (e) { return e.id; });
  var s = { cycle: ((state && state.cycle) || []).filter(function (id) { return ids.indexOf(id) >= 0; }), at: (state && state.at) || 0, last: (state && state.last) || null };
  if (s.at >= s.cycle.length) {
    var every = ENTRANCES.filter(function (e) { return !e.premium; }).map(function (e) { return e.id; });
    var cycle;
    do { cycle = shuffle(every); } while (every.length > 1 && cycle[0] === s.last);
    s.cycle = cycle.concat(shuffle(ENTRANCES.filter(function (e) { return e.premium; }).map(function (e) { return e.id; })));
    s.at = 0;
  }
  var id = s.cycle[s.at++];
  s.last = id;
  return { id: id, state: s };
}
