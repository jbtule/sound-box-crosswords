// New-puzzle entrances: how a fresh puzzle's boxes arrive, each with its own sound, as designed
// in the Board Entrances spike. Uses the DOM (element.animate) but no app state: app.js passes
// the puzzle, the board and the audio.
//   geometry(P, board, clueOrder) → where every box is, for the plans
//   playEntrance(id, geo, { audio }) → { done: Promise, skip() }
//   nextEntrance(state) → { id, state }: the everyday/premium cycle (see below)
import { makeSfx } from "./sfx.js";

var BOUNCE = "cubic-bezier(.25,1.45,.45,1)";

// Each plan(g, sfx) returns { keyframes for each box key: { kf, delay, dur, ease } } and may add
// timed extras with g.at(seconds, fn); fn returns the animation(s) it started (page pieces such
// as Billiards' cue ball remove themselves when theirs ends or is cancelled). Times are in seconds; sfx(at, function (when) {...})
// schedules a sound at `at` seconds in.
export var ENTRANCES = [
  { id: "slide", name: "Slide in", icon: "➡️", premium: false,
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
  { id: "stamp", name: "Stamp", icon: "📮", premium: false,
    // Boxes come down from above the page, big as if close, and press onto the paper a few at
    // a time, each batch with a rubber-stamp thump; now and then the board gives a tiny shake.
    // A beat after the rest, the first word comes down in one press, in its colored ink.
    plan: function (g, sfx) {
      var a = {}, keys = others(g), word = firstWord(g), t = 0, i = 0, batch = 0, DROP = 0.36;
      var groups = [];
      while (i < keys.length) { var size = 2 + Math.floor(Math.random() * 3); groups.push(keys.slice(i, i + size)); i += size; }
      groups.push(null, word); // null: the beat before the word
      groups.forEach(function (group, gi) {
        if (!group) { t += 0.3; return; }
        var last = gi === groups.length - 1, land = t + DROP * 0.8;
        group.forEach(function (k, n) {
          var tilt = Math.round(Math.random() * 16 - 8);
          a[k] = { kf: [
              { transform: "scale(2.7) rotate(" + tilt + "deg)", opacity: 0, zIndex: 2, boxShadow: "0 18px 30px rgba(0,0,0,.25)", offset: 0 },
              { opacity: 0.9, offset: 0.3 },
              { transform: "scale(.9) rotate(0)", opacity: 1, zIndex: 2, boxShadow: "0 0 0 rgba(0,0,0,0)", offset: 0.8 },
              { transform: "scale(1)", opacity: 1, zIndex: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", offset: 1 }],
            delay: t + (last ? 0 : n * 0.03), dur: DROP, ease: "cubic-bezier(.55,0,.9,.45)" };
        });
        sfx(land, function (at, S) { S.thump(at); if (last) S.thump(at + 0.02); });
        if (last || batch % 3 === 2) g.at(land, function () { return shake(g.board, last ? 3 : 2); });
        batch++; t += 0.24 + Math.random() * 0.12;
      });
      return a;
    } },
  { id: "raindrops", name: "Raindrops", icon: "💧", premium: false,
    // Boxes drop in at random spots like rain, getting busier as it goes, each landing sending a
    // ring spreading out, with a water-drop plip. Then the first word falls in order, in its
    // colors, its rings spreading in its syllable colors.
    plan: function (g, sfx) {
      var a = {}, keys = others(g), word = firstWord(g), n = keys.length, FALL = 0.32, rainEnd = n ? 2.1 : 0;
      keys.concat(word).forEach(function (k, i) {
        var o = g.cells[k], p = i / Math.max(1, n - 1);
        var at = i < n ? Math.pow(p, 0.7) * 2.1 + Math.random() * 0.12 : rainEnd + 0.35 + (i - n) * 0.2;
        a[k] = { kf: [{ transform: "translateY(-28px) scale(.35)", opacity: 0, offset: 0 }, { transform: "translateY(0) scale(1.08, .9)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }], delay: at, dur: FALL, ease: "ease-in" };
        var land = at + FALL * 0.7, f = 520 + Math.random() * 380;
        sfx(land, function (when, S) { S.plip(when, f); });
        g.at(land, function () {
          var r = document.createElement("div");
          r.className = "entrance-ring" + (o.sel ? " " + o.band : "");
          r.style.width = o.el.offsetWidth + "px"; r.style.height = o.el.offsetHeight + "px";
          r.style.left = o.el.offsetLeft + "px"; r.style.top = o.el.offsetTop + "px";
          g.board.appendChild(r);
          var an = r.animate([{ transform: "scale(1)", opacity: 0.8 }, { transform: "scale(2.1)", opacity: 0 }], { duration: 700, easing: "ease-out" });
          an.onfinish = an.oncancel = function () { r.remove(); };
          return an;
        });
      });
      return a;
    } },
  { id: "converge", name: "Converge", icon: "🧲", premium: false,
    // Boxes start scattered across the board and glide into the grid, over a rising swoosh
    // that resolves into a chord as everything snaps into place.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step, H = g.rows * step, end = 0;
      g.order.forEach(function (k) {
        var o = g.cells[k], tx = Math.random() * W - o.c * step - g.size / 2, ty = Math.random() * H - o.r * step - g.size / 2;
        var rot = Math.round(Math.random() * 120 - 60), at = Math.random() * 0.25, dur = 0.9 + Math.random() * 0.3;
        a[k] = { kf: [{ transform: "translate(" + tx + "px," + ty + "px) rotate(" + rot + "deg) scale(.55)", opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 }], delay: at, dur: dur, ease: "cubic-bezier(.3,.7,.2,1.08)" };
        end = Math.max(end, at + dur);
      });
      sfx(0, function (at, S) { S.glide(at, end * 0.85); });
      sfx(end * 0.9, function (at, S) { S.chord(at, [523.25, 659.25, 783.99, 1046.5], 0.14); });
      return a;
    } },
  { id: "sweep", name: "Sweep", icon: "🧹", premium: false,
    // A left-to-right wave, column by column, like a scanner passing over the paper. One note
    // per column, climbing.
    plan: function (g, sfx) {
      var a = {}, seen = {};
      g.order.forEach(function (k) {
        var o = g.cells[k], at = o.c * 0.13 + o.r * 0.012;
        a[k] = { kf: [{ transform: "translateY(22px) scaleY(.4)", opacity: 0 }, { transform: "translateY(-3px) scaleY(1.05)", opacity: 1, offset: 0.7 }, { transform: "translateY(0) scaleY(1)", opacity: 1 }], delay: at, dur: 0.42, ease: "ease-out" };
        if (!seen[o.c]) { seen[o.c] = 1; sfx(o.c * 0.13, function (when, S) { S.run(when, o.c + 1); }); }
      });
      return a;
    } },
  { id: "flip", name: "Flip", icon: "🃏", premium: false,
    // Boxes flip over in place one after another, in reading order, like cards turning face
    // up, each with a card-flip click.
    plan: function (g, sfx) {
      var a = {};
      readingOrder(g).forEach(function (k, i) {
        var at = i * 0.05;
        // The first word's cards have a plain back and a colored face: the color shows as it turns.
        var back = g.cells[k].sel ? { backgroundColor: g.plain.bg, borderColor: g.plain.edge } : {};
        a[k] = { kf: [Object.assign({ transform: "rotateY(-180deg)", opacity: 0, offset: 0 }, back), Object.assign({ opacity: 1, offset: 0.35 }, back), { transform: "rotateY(12deg)", offset: 0.8 }, { transform: "rotateY(0)", opacity: 1 }], delay: at, dur: 0.6, ease: "ease-out" };
        sfx(at + 0.2, function (when, S) { S.click(when, i); });
      });
      return a;
    } },
  { id: "spin", name: "Spin in", icon: "💫", premium: false,
    // Boxes come spinning in from every side, spiraling as they shrink into place, over a
    // rising whirr; they settle with a little rattle, like a coin wobbling to a stop.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, D = (g.cols + g.rows) * step * 0.62, end = 0;
      shuffle(g.order).forEach(function (k, i) {
        var th = Math.random() * Math.PI * 2, dir = Math.random() < 0.5 ? -1 : 1, at = i * 0.045, dur = 1.0;
        var sx = Math.cos(th) * D, sy = Math.sin(th) * D, mx = Math.cos(th + dir * 1.1) * D * 0.38, my = Math.sin(th + dir * 1.1) * D * 0.38;
        a[k] = { kf: [
            { transform: "translate(" + sx + "px," + sy + "px) rotate(" + (dir * 900) + "deg) scale(.35)", opacity: 0, offset: 0 },
            { opacity: 1, offset: 0.2 },
            { transform: "translate(" + mx + "px," + my + "px) rotate(" + (dir * 320) + "deg) scale(1.15)", opacity: 1, offset: 0.65 },
            { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1, offset: 1 }],
          delay: at, dur: dur, ease: "cubic-bezier(.3,.6,.35,1)" };
        if (i % 3 === 0) sfx(at + dur * 0.9, function (when, S) { S.settle(when, i / 3); });
        end = Math.max(end, at + dur);
      });
      sfx(0, function (at, S) { S.whirr(at, end); });
      return a;
    } },
  { id: "leaves", name: "Leaves in the wind", icon: "🍃", premium: false,
    // A gust sweeps in from the left and the boxes ride it like leaves, tumbling and
    // fluttering, slowing as the wind dies, then rocking gently to rest. Wind and rustles.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step, H = g.rows * step, end = 0;
      shuffle(g.order).forEach(function (k) {
        var o = g.cells[k], at = Math.pow(Math.random(), 1.4) * 1.3, dur = 2.6 + Math.random() * 0.8;
        var x0 = -(W * 0.55 + o.c * step + Math.random() * W * 0.3), y0 = (Math.random() - 0.5) * H * 0.9;
        var amp = g.size * (1.2 + Math.random()), ph = Math.random() * Math.PI * 2, rock = 50 + Math.random() * 40, flip = Math.random() < 0.5 ? 360 : -360;
        var kf = [], N = 7;
        for (var j = 0; j <= N; j++) {
          var p = j / N, ease = 1 - Math.pow(1 - p, 2.2), damp = Math.pow(1 - p, 1.3);
          var x = x0 * (1 - ease), y = y0 * (1 - ease) + amp * damp * Math.sin(ph + p * Math.PI * 3.2);
          var rz = rock * damp * Math.sin(ph * 1.7 + p * Math.PI * 4), ry = flip * (1 - ease);
          kf.push({ transform: "translate(" + x + "px," + y + "px) rotate(" + rz + "deg) rotateY(" + ry + "deg)", opacity: j === 0 ? 0 : 1, offset: p * 0.86 });
        }
        kf.push({ transform: "rotate(-5deg)", opacity: 1, offset: 0.92 });
        kf.push({ transform: "rotate(2.5deg)", opacity: 1, offset: 0.96 });
        kf.push({ transform: "rotate(0)", opacity: 1, offset: 1 });
        a[k] = { kf: kf, delay: at, dur: dur, ease: "linear" };
        end = Math.max(end, at + dur);
      });
      sfx(0, function (at, S) { S.wind(at, end * 0.95); });
      for (var r = 0; r < 14; r++) sfx(Math.pow(Math.random(), 1.2) * end * 0.8, function (at, S) { S.rustle(at); });
      return a;
    } },
  { id: "ratchet", name: "Ratchet", icon: "⚙️", premium: false,
    // Every box starts in place turned edge-on (invisible); after a moment of nothing they all
    // turn together, slowly and slightly, to show as thin lines. Then word by word they flip, fast and slowing, until they face you,
    // with a rattle that slows too. Across words flip side to side, down words top to bottom; the
    // first word goes last.
    plan: function (g, sfx) {
      var a = {}, BLANK = 0.7, LINE = 1.0, HOLD = 0.3, FLIP = 1.4, EACH = 0.5; // a moment of nothing, then a slow turn to lines
      var order = g.words.map(function (w, wi) { return wi; }).slice(1).concat([0]); // the first word last
      order.forEach(function (wi, n) {
        var w = g.words[wi], mine = w.cells.filter(function (k) { return g.cells[k].owner === wi; });
        if (!mine.length) return;
        var axis = w.dir === "A" ? "rotateY" : "rotateX", sign = n % 2 ? -1 : 1, start = BLANK + LINE + HOLD + n * EACH;
        mine.forEach(function (k, j) {
          var go = start + j * 0.035, total = go + FLIP, R = function (d) { return axis + "(" + d * sign + "deg)"; };
          a[k] = { kf: [
              { transform: R(90), opacity: 0, offset: 0 },
              { transform: R(90), opacity: 0, offset: BLANK / total, easing: "ease-in-out" },
              { transform: R(78), opacity: 1, offset: (BLANK + LINE) / total },
              { transform: R(78), opacity: 1, offset: go / total, easing: "cubic-bezier(.2,.7,.3,1)" }, // quick, then slowing
              { transform: R(720), opacity: 1, offset: 1 }],
            delay: 0, dur: total, ease: "linear" };
        });
        sfx(start, function (at, S) { S.ratchet(at, FLIP * 0.95, 2, n); });
      });
      return a;
    } },
  { id: "carve", name: "Carve", icon: "🗿", premium: false,
    // A full field of plain boxes fades in over the puzzle's rectangle, the first word already
    // there in its colors. Then the orange highlight, a circular saw, makes cuts: it spins up and
    // buzzes along a row or a column, cutting out the boxes that don't belong (they fly off
    // spinning; it hops over the puzzle's own), spins down, lifts, and glides to its next cut,
    // usually the other way. Last it glides to box 1 and settles there as its ring.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, half = g.size / 2, GO = 1.2, PER = 0.032, HOP = 0.14;
      g.order.forEach(function (k) {
        a[k] = { kf: [{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)" }], delay: Math.random() * 0.5, dur: 0.4, ease: "ease-out" };
      });
      var holes = [], real = function (r, c) { return !!g.cells[r + "," + c]; };
      for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) if (!real(r, c)) holes.push({ r: r, c: c });
      // the cuts: lines (rows or columns) that cover every extra box in as few cuts as can be
      // (greedy), each spanning just its stretch of extras, taken in turn with the saw off
      // (lifted, slow, quiet) as it moves to the next; rows and columns alternate where they can
      var left = holes.slice(), cuts = [];
      while (left.length) {
        var best = null;
        [true, false].forEach(function (row) {
          var tally = {};
          left.forEach(function (h) { var key = row ? h.r : h.c; tally[key] = (tally[key] || 0) + 1; });
          Object.keys(tally).forEach(function (key) {
            var n = tally[key] + (cuts.length && cuts[cuts.length - 1].row !== row ? 0.5 : 0); // a nudge to alternate
            if (!best || n > best.n) best = { row: row, line: +key, n: n };
          });
        });
        var mine = left.filter(function (h) { return (best.row ? h.r : h.c) === best.line; });
        best.lo = Math.min.apply(null, mine.map(function (h) { return best.row ? h.c : h.r; }));
        best.hi = Math.max.apply(null, mine.map(function (h) { return best.row ? h.c : h.r; }));
        cuts.push(best);
        left = left.filter(function (h) { return mine.indexOf(h) < 0; });
      }
      var segs = [], t = GO, at = { x: -step, y: -step };
      cuts.forEach(function (cut) {
        var pt = function (along) { return cut.row ? { x: along * step + half, y: cut.line * step + half } : { x: cut.line * step + half, y: along * step + half }; };
        var a0 = cut.lo - 0.8, a1 = cut.hi + 0.8, s0 = pt(a0), s1 = pt(a1);
        if (Math.hypot(s1.x - at.x, s1.y - at.y) < Math.hypot(s0.x - at.x, s0.y - at.y)) { var sw = a0; a0 = a1; a1 = sw; s0 = pt(a0); s1 = pt(a1); } // start from the nearer end
        var move = segs.length ? Math.min(0.32, 0.14 + Math.hypot(s0.x - at.x, s0.y - at.y) / step * 0.02) : 0.25;
        segs.push({ p0: at, p1: s0, t0: t, t1: t + move, cut: false }); t += move + 0.08; // off: glide over, spin up
        var dur = Math.abs(a1 - a0) * PER;
        segs.push({ p0: s0, p1: s0, t0: t - 0.08, t1: t, cut: false });
        segs.push({ p0: s0, p1: s1, t0: t, t1: t + dur, cut: true, row: cut.row, line: cut.line, from: a0, to: a1 });
        (function (at, d) { sfx(at - 0.08, function (when, S) { S.saw(when, d + 0.2); }); })(t, dur);
        t += dur + 0.04; at = s1;
      });
      var cur = g.order.map(function (k) { return g.cells[k]; }).filter(function (o) { return o.cursor; })[0] || g.cells[g.order[0]];
      var home = { x: cur.c * step + half, y: cur.r * step + half }, endT = t + 0.55;
      segs.push({ p0: at, p1: home, t0: t, t1: endT, cut: false, home: true });
      function pos(tt) {
        for (var q = 0; q < segs.length; q++) {
          var sg = segs[q];
          if (tt <= sg.t1 || q === segs.length - 1) {
            var u = sg.t1 > sg.t0 ? Math.max(0, Math.min(1, (tt - sg.t0) / (sg.t1 - sg.t0))) : 1;
            if (sg.home) u = 1 - Math.pow(1 - u, 2.5);
            return { x: sg.p0.x + (sg.p1.x - sg.p0.x) * u, y: sg.p0.y + (sg.p1.y - sg.p0.y) * u, seg: sg };
          }
        }
      }
      // each hole is cut as the saw crosses it, and flies off to one side, spinning
      holes.forEach(function (h, n) {
        var sg = segs.filter(function (x) { return x.cut && x.line === (x.row ? h.r : h.c) && (x.row ? h.c : h.r) >= Math.min(x.from, x.to) && (x.row ? h.c : h.r) <= Math.max(x.from, x.to); })[0];
        var along = sg.row ? h.c : h.r, fwd = sg.to > sg.from ? 1 : -1;
        h.hit = sg.t0 + (along - sg.from) / (sg.to - sg.from) * (sg.t1 - sg.t0);
        h.side = (n % 2 ? 1 : -1);
        h.dir = sg.row ? { x: fwd * 0.5, y: h.side } : { x: h.side, y: fwd * 0.5 };
        sfx(h.hit, function (when, S) { S.bite(when, n); });
      });
      g.at(0, function () {
        return holes.map(function (h) {
          var d = document.createElement("div");
          d.className = "entrance-decoy";
          d.style.width = d.style.height = g.size + "px"; d.style.left = h.c * step + "px"; d.style.top = h.r * step + "px";
          g.board.appendChild(d);
          var fly = g.size * (1.8 + Math.random() * 1.4), spin = h.side * (300 + Math.random() * 300), total = h.hit + 0.5, fadeAt = Math.random() * 0.5;
          var an = d.animate([
            { opacity: 0, transform: "scale(.85)", offset: 0 },
            { opacity: 0, transform: "scale(.85)", offset: fadeAt / total },
            { opacity: 1, transform: "scale(1)", offset: (fadeAt + 0.4) / total },
            { opacity: 1, transform: "scale(1)", offset: h.hit / total, easing: "ease-out" },
            { opacity: 0, transform: "translate(" + h.dir.x * fly + "px," + h.dir.y * fly + "px) rotate(" + spin + "deg) scale(.35)", offset: 1 }],
            { duration: total * 1000, easing: "linear" });
          an.onfinish = an.oncancel = function () { d.remove(); };
          return an;
        });
      });
      // the saw: spinning fast while it cuts, lifted over the puzzle's own boxes, spinning down at home
      var start = segs[0].p0, sz = g.size * 0.86;
      g.at(GO - 0.3, function () {
        var d = document.createElement("div");
        d.className = "entrance-blk"; d.style.width = d.style.height = sz + "px"; d.style.zIndex = 5;
        d.style.left = (home.x - sz / 2) + "px"; d.style.top = (home.y - sz / 2) + "px";
        g.board.appendChild(d);
        var total = endT - (GO - 0.3), kf = [], rot = 0, prev = GO - 0.3;
        kf.push({ transform: "translate(" + (start.x - home.x) + "px," + (start.y - home.y) + "px) scale(.4)", opacity: 0, offset: 0 });
        for (var tt = GO; tt <= endT + 0.0001; tt += 0.025) {
          var p = pos(tt), cutting = p.seg.cut;
          rot += (tt - prev) * (cutting ? 2400 : 260); prev = tt;
          var over = !cutting || real(Math.round((p.y - half) / step), Math.round((p.x - half) / step)); // lifted when off, or over a puzzle box
          kf.push({ transform: "translate(" + (p.x - home.x) + "px," + (p.y - home.y) + "px) rotate(" + rot + "deg) scale(" + (over ? 1.2 : 1) + ")", opacity: 1, offset: (tt - (GO - 0.3)) / total });
        }
        kf[kf.length - 1] = { transform: "translate(0,0) rotate(" + Math.round(rot / 90) * 90 + "deg) scale(" + g.size / sz + ")", opacity: 1, offset: 1 };
        var an = d.animate(kf, { duration: total * 1000, easing: "linear" });
        an.onfinish = an.oncancel = function () { d.remove(); };
        return an;
      });
      ringOn(g, endT, sfx, false);
      sfx(endT - 0.02, function (when, S) { S.clickin(when); });
      return a;
    } },
  { id: "kaleidoscope", name: "Kaleidoscope", icon: "🔮", premium: false,
    // The boxes form a mandala in the middle of the board: the first word, in its colors, the
    // inner ring, the plain boxes in rings around it, every box turned to point outward. Like
    // twisting a kaleidoscope, the rings turn opposite ways, a good few turns, and the pattern
    // breathes in and out, with glass beads tumbling. Then it blooms: boxes fly out to their
    // places, outer rings first, the colored center last, each landing with a glass click.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var cx = W / 2, cy = H / 2, SC = 0.62, sp = g.size * SC * 1.12, FORM = 0.8, TURN = 2.2, BLOOM = 0.9;
      var rings = [], word = firstWord(g), plain = others(g), GAP = 1.32;
      rings.push({ keys: word, r: Math.max(sp * 1.1, word.length * sp * 1.15 / (2 * Math.PI)) });
      var rest = plain.slice();
      while (rest.length) {
        var r = rings[rings.length - 1].r + sp * GAP, cap = Math.max(6, Math.floor(2 * Math.PI * r / (sp * 1.2) / 6) * 6);
        rings.push({ keys: rest.splice(0, cap), r: r });
      }
      // fit it on the board: shrink the whole pattern if the outer ring would reach past it
      var fit = Math.min(1, (Math.min(W, H) * 0.5 + g.size) / (rings[rings.length - 1].r + sp));
      rings.forEach(function (ring) { ring.r *= fit; }); SC *= fit; sp *= fit;
      var bloomAt = FORM + TURN, landEnd = 0;
      function spot(ring, j, n, t, ri) {
        var dir = ri % 2 ? -1 : 1, twist = dir * (1.7 * t + 0.35 * Math.sin(t * 1.6 + ri)); // turning (a good few turns), with a twist that ebbs and flows
        var th = j / n * Math.PI * 2 + twist + ri * 0.4, rr = ring.r * (1 + 0.1 * Math.sin(t * 2.4)); // the whole pattern breathes together
        return { x: cx + rr * Math.cos(th), y: cy + rr * Math.sin(th), rot: th * 180 / Math.PI + 45 };
      }
      rings.forEach(function (ring, ri) {
        var n = ring.keys.length, order = rings.length - 1 - ri; // outer rings bloom first
        ring.keys.forEach(function (key, j) {
          var o = g.cells[key], fx = o.c * step + half, fy = o.r * step + half;
          var go = bloomAt + order * 0.28 + (j % 6) * 0.03, total = go + BLOOM, kf = [], last;
          for (var t = 0; t <= go + 0.001; t += 0.05) {
            var p = spot(ring, j, n, t, ri), grow = Math.min(1, t / FORM), e = grow * grow * (3 - 2 * grow);
            last = p;
            kf.push({ transform: "translate(" + (cx + (p.x - cx) * e - fx) + "px," + (cy + (p.y - cy) * e - fy) + "px) rotate(" + p.rot + "deg) scale(" + SC * (0.3 + 0.7 * e) + ")",
              opacity: Math.min(1, t / (FORM * 0.6)), offset: t / total });
          }
          var endRot = Math.round(last.rot / 360) * 360;
          kf.push({ transform: "translate(" + (last.x - fx) * 0.5 + "px," + (last.y - fy) * 0.5 + "px) rotate(" + (last.rot + endRot) / 2 + "deg) scale(" + (SC + 1) / 2 + ")", opacity: 1, offset: (go + BLOOM * 0.55) / total, easing: "cubic-bezier(.2,.8,.3,1.15)" });
          kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1)", opacity: 1, offset: 1 });
          kf[kf.length - 3].easing = "ease-in";
          a[key] = { kf: kf, delay: 0, dur: total, ease: "linear" };
          landEnd = Math.max(landEnd, total);
          var b = ri * 31 + j; sfx(go + BLOOM * 0.72, function (when, S) { S.bead(when, b); }); // a glass click as it lands (its last stretch arrives fast, then settles)
        });
      });
      // glass beads tumbling as it turns; then a click for each box as it lands (above)
      sfx(0.2, function (when, S) { S.beads(when, bloomAt - 0.2, 12); });
      return a;
    } },
  { id: "star", name: "Shooting star", icon: "🌠", premium: false,
    // Word by word, a shooting star: the box at its leading end is its head, spinning, and the rest
    // stream behind as its tail, twisting like a ribbon, flying in along its own line (across
    // words from the left or right, down words from the top or bottom), with a whistling streak.
    // At the word, each box flattens into its own space with a squash. The first word comes last.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var FLY = 0.75, LAG = 0.07, t = 0;
      var D = Math.hypot(W, H) * 0.75 + g.size * 3;
      var order = g.words.map(function (w, wi) { return wi; }).slice(1).concat([0]); // the first word last
      order.forEach(function (wi, n) {
        var w = g.words[wi], mine = w.cells.filter(function (k) { return g.cells[k].owner === wi; });
        if (!mine.length) return;
        // it flies in along its own line: across words from the left or right, down words from the
        // top or bottom (alternating sides); the box at the leading end is the head
        var fwd = Math.floor(n / 2) % 2 === 0 ? 1 : -1, across = w.dir === "A", ux = across ? fwd : 0, uy = across ? 0 : fwd; // moving along u
        mine = mine.slice().sort(function (p, q) { var A = g.cells[p], B = g.cells[q]; return across ? (B.c - A.c) * fwd : (B.r - A.r) * fwd; });
        sfx(t, function (at, S) { S.streak(at, FLY + mine.length * LAG); });
        mine.forEach(function (k, j) {
          var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, head = j === 0;
          var sx = fx - ux * D, sy = fy - uy * D; // straight along its line from off the edge; the tail strung out behind by time
          var delay = t + j * LAG, kf = [], N = 14, twistX = (j % 2 ? 1 : -1) * 70, spin = head ? 720 : 360; // whole turns, so numbers land upright
          var base = head ? 1 : 0.85 - 0.35 * Math.min(1, j / 6); // the tail tapers
          for (var q = 0; q <= N; q++) {
            var u = q / N, e = u < 0.8 ? u / 0.8 * 0.92 : 0.92 + (u - 0.8) / 0.2 * 0.08; // straight and fast, easing only at the very end
            var x = sx + (fx - sx) * e, y = sy + (fy - sy) * e, fade = 1 - u;
            var rx = head ? 0 : twistX * Math.sin(u * Math.PI * 3 + j * 0.9) * fade, ry = head ? 0 : 50 * Math.cos(u * Math.PI * 2.5 + j) * fade;
            kf.push({ transform: "translate(" + (x - fx) + "px," + (y - fy) + "px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) rotate(" + spin * (1 - fade * fade) + "deg) scale(" + (base + (1 - base) * Math.max(0, (u - 0.75) / 0.25)) + ")",
              opacity: q === 0 ? 0 : 1, zIndex: 3, filter: head && u < 0.85 ? "brightness(1.3)" : "brightness(1)", offset: u * 0.86 });
          }
          kf.push({ transform: "translate(0,2px) rotate(" + spin + "deg) scale(1.22,.72)", opacity: 1, zIndex: 1, filter: "brightness(1)", offset: 0.92 }); // flattening into its space
          kf.push({ transform: "translate(0,0) rotate(" + spin + "deg) scale(1)", opacity: 1, zIndex: 1, filter: "brightness(1)", offset: 1 });
          a[k] = { kf: kf, delay: delay, dur: FLY + 0.2, ease: "linear" };
          sfx(delay + (FLY + 0.2) * 0.86, function (at, S) { S.pop(at, j + n); });
        });
        t += 0.42;
      });
      return a;
    } },
  { id: "mats", name: "Roll out", icon: "🧻", premium: false,
    // Word by word, the word arrives rolled up like a mat, its boxes curled face-in round a round
    // roll (their backs showing, shaded as they turn away), rolling in steadily along its own line
    // from the edge (across words from the left or right, down words from the top or bottom,
    // alternating) and pressing each box down flat, face up, as it rolls over its space. A box
    // can't bend, so while it's on the roll it's drawn as thin slices of itself, each angled a
    // little more, curving it; pressed flat, the slices line up and the real box takes over.
    // The first word comes last.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, half = g.size / 2, t = 0, PER = 0.1, K = 6; // K slices per box
      var order = g.words.map(function (w, wi) { return wi; }).slice(1).concat([0]);
      order.forEach(function (wi, n) {
        var w = g.words[wi], mine = w.cells.filter(function (k) { return g.cells[k].owner === wi; });
        if (!mine.length) return;
        var across = w.dir === "A", u = Math.floor(n / 2) % 2 === 0 ? 1 : -1; // rolling toward +u
        var along = function (k) { var o = g.cells[k]; return (across ? o.c : o.r) * step + half; };
        mine = mine.slice().sort(function (p, q) { return (along(p) - along(q)) * u; });
        var Rc = Math.max(g.size * 0.5, mine.length * step / (2 * Math.PI)), span = (across ? g.cols : g.rows) * step; // the roll's radius: its boxes wrap once round
        var C0 = u > 0 ? -Rc * 2 - step : span + Rc * 2 + step, vU = step / PER, t0 = t;
        var Cat = function (tt) { return C0 + u * vU * (tt - t0); }; // rolling in at a steady pace
        var tEnd = t0 + Math.abs(along(mine[mine.length - 1]) - C0) / vU;
        sfx(t0, function (at, S) { S.rumble(at, tEnd - t0 + 0.1); });
        var press = mine.map(function (k) { return t0 + Math.abs(along(k) - C0) / vU; });
        // the real boxes: hidden while on the roll, then pressed flat (a little squash)
        mine.forEach(function (k, j) {
          var total = press[j] + 0.14;
          a[k] = { kf: [{ opacity: 0, offset: 0 }, { opacity: 0, offset: press[j] / total, easing: "steps(1, end)" },
            { opacity: 1, transform: "scale(1.06,.94)", offset: press[j] / total + 0.0001 }, { opacity: 1, transform: "scale(1)", offset: 1 }], delay: 0, dur: total, ease: "linear" };
          sfx(press[j], function (at, S) { S.cushion(at, 0.7); });
        });
        // the roll: each box as K slices of a copy of itself, curled round the roll
        g.at(t0, function () {
          var anims = [];
          mine.forEach(function (k, j) {
            var o = g.cells[k], A = along(k);
            for (var i = 0; i < K; i++) {
              var c = o.el.cloneNode(true);
              c.removeAttribute("data-k"); c.setAttribute("aria-hidden", "true");
              c.classList.remove("sel", "cursor", "syl-a", "syl-b");
              c.style.position = "absolute"; c.style.margin = "0"; c.style.left = o.c * step + "px"; c.style.top = o.r * step + "px";
              c.style.backgroundColor = o.look.bg; c.style.borderColor = o.look.edge; c.style.boxShadow = "none";
              var lo = i / K * 100, hi = (K - 1 - i) / K * 100, mid = (i + 0.5) / K * 100;
              c.style.clipPath = across ? "inset(-2px " + hi + "% -2px " + lo + "%)" : "inset(" + lo + "% -2px " + hi + "% -2px)";
              c.style.transformOrigin = across ? mid + "% 50%" : "50% " + mid + "%";
              g.board.appendChild(c);
              var sOff = ((i + 0.5) / K - 0.5) * g.size * (across ? 1 : 1), kf = [], end = press[j] - t0;
              for (var tt = 0; tt <= end + 0.001; tt += 0.03) {
                var C = Cat(t0 + Math.min(tt, end)), th = Math.PI - u * (A - C) / Rc, phi = th - u * sOff / Rc; // this slice's angle round the roll
                var al = C + u * Rc * Math.sin(phi) - (A + sOff), z = Rc + Rc * Math.cos(phi), deg = (phi + Math.PI) * 180 / Math.PI;
                var turn = across ? "rotateY(" + u * deg + "deg)" : "rotateX(" + -u * deg + "deg)";
                kf.push({ transform: "translate3d(" + (across ? al : 0) + "px," + (across ? 0 : al) + "px," + z + "px) " + turn,
                  opacity: tt === 0 ? 0 : 1, filter: "brightness(" + (0.6 + 0.4 * Math.abs(Math.cos(phi))) + ")", offset: Math.min(1, tt / end) });
              }
              kf[kf.length - 1].offset = 1;
              var an = c.animate(kf, { duration: end * 1000, easing: "linear" });
              (function (el) { an.onfinish = an.oncancel = function () { el.remove(); }; })(c);
              anims.push(an);
            }
          });
          return anims;
        });
        t += 0.55;
      });
      return a;
    } },
  { id: "unfold", name: "Unfold", icon: "🗺️", premium: false,
    // The whole puzzle starts folded up into a single square in the corner, like a map, and
    // unfolds fold by fold, across and down in turn: at each fold the boxes on the folded-over
    // half flip out over the crease in 3D, the square doubling each time, with the sound of paper
    // turning over (a crinkle, a flap, a crease), until every box lies in its place.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, half = g.size / 2, POP = 0.35, FLIP = 0.42, GAPT = 0.08;
      var Kx = Math.ceil(Math.log2(Math.max(1, g.cols))), Ky = Math.ceil(Math.log2(Math.max(1, g.rows)));
      // where a column (or row) sits when the map is folded to width 2^k: fold the far half back over
      function folded(c, K) { var out = [c]; for (var k = K - 1; k >= 0; k--) { var w = 1 << k, p = out[0]; out.unshift(p >= w ? 2 * w - 1 - p : p); } return out; } // out[k] = place at width 2^k
      // the folds, across and down in turn, from the smallest
      var steps = [], kx = 0, ky = 0;
      while (kx < Kx || ky < Ky) { if (kx < Kx) steps.push({ axis: "x", k: kx++ }); if (ky < Ky) steps.push({ axis: "y", k: ky++ }); }
      steps.forEach(function (st, i) { st.t = POP + i * (FLIP + GAPT); });
      var end = POP + steps.length * (FLIP + GAPT);
      g.order.forEach(function (key) {
        var o = g.cells[key], fx = o.c * step + half, fy = o.r * step + half, X = folded(o.c, Kx), Y = folded(o.r, Ky);
        var kf = [], cx = 0, cy = 0; // its place now, in columns and rows (starts folded to 0, 0)
        var T = function (px, py, z, rot) { return "translate3d(" + (px - fx) + "px," + (py - fy) + "px," + z + "px) " + rot; };
        kf.push({ transform: T(half, half, 0, "scale(.4)"), opacity: 0, offset: 0 });
        kf.push({ transform: T(half, half, 0, "scale(1)"), opacity: 1, offset: POP * 0.8 / end, easing: "ease-out" });
        steps.forEach(function (st) {
          var from = st.axis === "x" ? cx : cy, to = st.axis === "x" ? X[st.k + 1] : Y[st.k + 1];
          var px0 = cx * step + half, py0 = cy * step + half;
          kf.push({ transform: T(px0, py0, 0, "rotate(0deg)"), opacity: 1, offset: st.t / end });
          if (to !== from) { // this box flips over the crease at the fold line
            var hingeIdx = 1 << st.k, h = hingeIdx * step - g.gap / 2, u = to > from ? 1 : -1, d = Math.abs((to * step + half) - h);
            for (var q = 1; q <= 8; q++) {
              var b = q / 8 * Math.PI, e = (1 - Math.cos(b)) / 2, beta = Math.PI * (b / Math.PI); // the flip angle, 0..pi
              var pos = h - u * d * Math.cos(beta), z = d * Math.sin(beta), deg = beta <= Math.PI / 2 ? beta * 180 / Math.PI : beta * 180 / Math.PI - 180; // up to edge-on, then down from the other side, face up
              var rot = st.axis === "x" ? "rotateY(" + u * deg + "deg)" : "rotateX(" + -u * deg + "deg)";
              kf.push({ transform: st.axis === "x" ? T(pos, py0, z, rot) : T(px0, pos, z, rot), opacity: 1, zIndex: 3, offset: (st.t + FLIP * q / 8) / end });
            }
            if (st.axis === "x") cx = to; else cy = to;
          }
        });
        kf.push({ transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1, zIndex: 1, offset: 1 });
        a[key] = { kf: kf, delay: 0, dur: end, ease: "linear" };
      });
      steps.forEach(function (st, i) { // the paper turning over, bigger as the map opens
        sfx(st.t, function (at, S) { S.paper(at, FLIP, i / Math.max(1, steps.length - 1)); });
      });
      return a;
    } },
  { id: "whirlpool", name: "Whirlpool", icon: "🌀", premium: false,
    // A big spiral of plain boxes (eight arms, like a galaxy) fades in over the board and turns
    // slowly, the puzzle's own boxes riding in it, each circling at its own distance from the
    // middle. Then a drain opens in the middle: it spins faster and faster (fastest near the
    // middle), the plain boxes pulled in and sucked down it, innermost first; as the swirl's edge
    // draws in past each puzzle box, it slides round into its place and stays, until the last
    // plain box gulps down the drain. Gurgling, then a slurp.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var cx = W / 2, cy = H / 2, Rmax = Math.hypot(W, H) / 2 + g.size, ws = g.size * 0.92, FORM = 0.6, TURN = 1.4, DRAIN = 1.9, END = TURN + DRAIN + 0.1;
      var sm = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
      function pull(t) { return t < TURN ? 0 : Rmax * Math.pow(sm((t - TURN) / DRAIN), 0.85); } // how far everything has been drawn in
      // the spiral: six arms of boxes from near the middle out past the corners
      var arms = 8, pts = [];
      for (var arm = 0; arm < arms; arm++) for (var r = g.size * 0.9; r < Rmax; r += ws * 0.55) pts.push({ r0: r, th0: arm * Math.PI * 2 / arms + r / (ws * 2.2) });
      // how fast the swirl turns at radius r, time t (faster near the middle, and once the drain opens)
      function omega(r, t) { return (t < TURN ? 0.9 : 0.9 + 9 * sm((t - TURN) / DRAIN)) * (1 + 2.5 * g.size / (r + g.size)); }
      // the puzzle's boxes ride in the swirl, each circling at its own distance from the middle; when
      // the swirl's edge draws in past it, it slides round into its place and stays there
      g.order.forEach(function (key) {
        var o = g.cells[key], fx = o.c * step + half, fy = o.r * step + half, dist = Math.hypot(fx - cx, fy - cy), home = Math.atan2(fy - cy, fx - cx), tR = END - 0.4;
        for (var q = 0; q <= 300; q++) { var tq = TURN + q / 300 * DRAIN; if (Rmax - pull(tq) < dist + g.size * 0.4) { tR = tq; break; } }
        var SLOT = 0.4, total = tR + SLOT, kf = [], th = home - Math.random() * Math.PI * 2, prev = 0, at = function (ang) { return { x: cx + dist * Math.cos(ang) - fx, y: cy + dist * Math.sin(ang) - fy }; };
        for (var t = 0; t <= tR + 0.001; t += 0.04) {
          th += omega(dist, t) * (t - prev); prev = t;
          var p = at(th);
          kf.push({ transform: "translate(" + p.x + "px," + p.y + "px) rotate(" + (th - home) * 180 / Math.PI + "deg) scale(" + (0.92 * Math.min(1, t / 0.4 + 0.3)) + ")", opacity: Math.min(1, t / 0.45), offset: t / total });
        }
        // slide on round the circle to its own place (the shortest way on, in the swirl's direction), landing upright
        var to = home + Math.ceil((th - home) / (Math.PI * 2)) * Math.PI * 2;
        for (var j = 1; j <= 8; j++) {
          var e = 1 - Math.pow(1 - j / 8, 2.5), ang = th + (to - th) * e, q2 = at(ang);
          kf.push({ transform: "translate(" + q2.x + "px," + q2.y + "px) rotate(" + (ang - home) * 180 / Math.PI + "deg) scale(" + (0.92 + 0.08 * e) + ")", opacity: 1, offset: (tR + SLOT * j / 8) / total });
        }
        kf[kf.length - 1].transform = "translate(0,0) rotate(" + Math.round((to - home) * 180 / Math.PI / 360) * 360 + "deg) scale(1)";
        a[key] = { kf: kf, delay: 0, dur: total, ease: "linear" };
      });
      g.at(0, function () {
        return pts.map(function (pt, n) {
          var d = document.createElement("div"); d.className = "entrance-decoy";
          d.style.width = d.style.height = ws + "px"; d.style.left = (cx - ws / 2) + "px"; d.style.top = (cy - ws / 2) + "px";
          g.board.appendChild(d);
          var kf = [], th = pt.th0, prev = 0, gone = false;
          for (var t = 0; t <= END + 0.001; t += 0.04) {
            var r = Math.max(0, pt.r0 - pull(t)), w = omega(r, t);
            th += w * (t - prev); prev = t;
            var sc = Math.min(1, r / (g.size * 1.6)), op = Math.min(1, t / FORM * 1.5) * Math.min(1, r / (g.size * 0.6));
            if (r <= 0) gone = true;
            kf.push({ transform: "translate(" + r * Math.cos(th) + "px," + r * Math.sin(th) + "px) rotate(" + (th * 180 / Math.PI + 45) + "deg) scale(" + (gone ? 0 : sc) + ")", opacity: gone ? 0 : op, offset: t / END });
          }
          kf[kf.length - 1].offset = 1;
          var an = d.animate(kf, { duration: END * 1000, easing: "linear" });
          an.onfinish = an.oncancel = function () { d.remove(); };
          return an;
        });
      });
      sfx(0.3, function (when, S) { S.gurgle(when, TURN - 0.3); });
      sfx(TURN, function (when, S) { S.gurgle(when, DRAIN - 0.2); S.gurgle(when + DRAIN * 0.4, DRAIN * 0.6); });
      sfx(TURN + DRAIN - 0.35, function (when, S) { S.slurp(when); });
      return a;
    } },
  { id: "zoom", name: "Zoom", icon: "🔍", premium: false,
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
  { id: "wash", name: "Color wash", icon: "🌈", premium: false,
    // Boxes land plain, then a diagonal wave blooms each box in its syllable color and back to
    // the board's own look (only the selected word keeps its colors). A harp-like glissando.
    plan: function (g, sfx) {
      var a = {}, t = 0.4, STEP = 0.12, diag = {};
      g.order.forEach(function (k, i) {
        var o = g.cells[k], d = o.r + o.c, band = g.band[o.band];
        // Every box lands plain, the first word too; the wave gives it its colors, and it keeps them.
        var plain = { backgroundColor: g.plain.bg, borderColor: g.plain.edge };
        a[k] = { kf: [Object.assign({ opacity: 0, transform: "scale(.9)" }, plain), Object.assign({ opacity: 1, transform: "scale(1)" }, plain)], delay: i * 0.006, dur: 0.28, ease: "ease-out" };
        diag[d] = 1;
        g.at(t + d * STEP, function () {
          return o.el.animate([
            { backgroundColor: band.fill, borderColor: band.edge, transform: "scale(1.08)", filter: "brightness(1.15)" },
            { backgroundColor: o.look.bg, borderColor: o.look.edge, transform: "scale(1)", filter: "brightness(1)" }],
            { duration: 700, easing: "ease-out", fill: o.sel ? "forwards" : "none" });
        });
      });
      Object.keys(diag).map(Number).sort(function (x, y) { return x - y; }).forEach(function (d, i) {
        sfx(t + d * STEP, function (at, S) { S.bell(at, Math.min(i, 12)); });
      });
      return a;
    } },
  { id: "neon", name: "Neon", icon: "💡", premium: false,
    // A neon sign warming up. The plain boxes sputter on first, dim tubes flickering in their
    // own rhythm until they catch. Then the first word lights up box by box, like a sign's
    // lettering, glowing in its syllable colors, and the cursor's ring flickers on last. Each
    // box ends in exactly its starting look (o.look), so nothing snaps in at the end.
    plan: function (g, sfx) {
      var a = {}, plain = shuffle(g.order.filter(function (k) { return !g.cells[k].sel; }));
      var word = g.words[0].cells, end = 0, wordAt = plain.length ? 1.9 : 0.3;
      function tube(k, at, dur, n, i) {
        var o = g.cells[k], glow = o.look.edge, tint = { backgroundColor: o.look.bg, borderColor: o.look.edge }; // its own colors throughout
        var off = Object.assign({ opacity: 0.14, filter: "brightness(.7) saturate(.3)", boxShadow: "0 0 0 0 transparent" }, tint);
        var on = Object.assign({ opacity: 1, filter: "brightness(1.35) saturate(1.3)", boxShadow: "0 0 14px 2px " + glow }, tint);
        var kf = [Object.assign({ offset: 0, easing: "steps(1, end)" }, off)], tt = 0, flicks = [];
        for (var f = 0; f < n; f++) {
          var t1 = tt + 0.05 + Math.random() * 0.12, t2 = Math.min(t1 + 0.03 + Math.random() * 0.08, 0.6);
          if (t1 >= 0.58) break;
          kf.push(Object.assign({ offset: t1, easing: "steps(1, end)" }, on));
          kf.push(Object.assign({ offset: t2, easing: "steps(1, end)" }, off));
          flicks.push(t1); tt = t2;
        }
        var lit = Math.max(tt + 0.04, 0.66);
        kf.push(Object.assign({ offset: lit, easing: "ease-out" }, on)); flicks.push(lit);
        kf.push(Object.assign({ offset: 1, opacity: 1, filter: "brightness(1) saturate(1)", boxShadow: "0 0 0 0 transparent" }, tint));
        a[k] = { kf: kf, delay: at, dur: dur, ease: "linear", fill: "both" };
        flicks.slice(0, 3).forEach(function (fl, j) { sfx(at + fl * dur, function (when, S) { S.zap(when, i + j); }); });
        end = Math.max(end, at + dur);
        return at + lit * dur;
      }
      plain.forEach(function (k, i) {
        tube(k, Math.pow(i / plain.length, 0.75) * 1.6 + Math.random() * 0.15, 0.75 + Math.random() * 0.45, 3 + Math.floor(Math.random() * 3), i);
      });
      // The first word, box by box (left to right, or top to bottom), in its syllable colors;
      // each one catching rings a brighter note, climbing. Then the cursor's ring flickers on.
      var ringAt = wordAt;
      word.forEach(function (k, j) {
        var caught = tube(k, wordAt + j * 0.2, 0.6, 2, j + 40);
        sfx(caught, function (when, S) { S.tick(when, 4 + j); });
        ringAt = Math.max(ringAt, wordAt + j * 0.2 + 0.7);
      });
      end = Math.max(end, ringOn(g, ringAt, sfx, true));
      sfx(0, function (at, S) { S.buzz(at, end + 0.4); });
      return a;
    } },
  // The premium ones: showpieces, every 5th turn (nextEntrance).
  { id: "dominoes", name: "Dominoes", icon: "🁫", premium: false,
    // Every box stands on edge like a domino (a thin sliver, seen from above). One push at the
    // cursor starts a chain: each box falls away from the one that knocked it, and knocks its
    // neighbors in its words in turn, so where words cross the run splits and spreads both ways
    // along the crossing word, speeding up as it goes. Each lands flat with a clack.
    plan: function (g, sfx) {
      var a = {}, start = g.order.filter(function (k) { return g.cells[k].cursor; })[0] || g.words[0].cells[0];
      var near = {}; // each box's neighbors along its words
      g.words.forEach(function (w) { w.cells.forEach(function (k, j) {
        near[k] = near[k] || [];
        if (j > 0) near[k].push(w.cells[j - 1]);
        if (j < w.cells.length - 1) near[k].push(w.cells[j + 1]);
      }); });
      // when each box falls, and which neighbor knocked it (the earliest to reach it)
      var fall = {}, from = {}, depth = {}, queue = [start], n = 0;
      fall[start] = 0.35; depth[start] = 0;
      var w0 = g.words.filter(function (w) { return w.cells.indexOf(start) >= 0; })[0]; // the first push goes along its word
      from[start] = null; var startDir = w0.dir;
      while (queue.length) {
        queue.sort(function (x, y) { return fall[x] - fall[y]; });
        var k = queue.shift(), dt = Math.max(0.05, 0.12 * Math.pow(0.9, depth[k]));
        near[k].forEach(function (m) {
          if (fall[m] !== undefined && fall[m] <= fall[k] + dt) return;
          fall[m] = fall[k] + dt; from[m] = k; depth[m] = depth[k] + 1; queue.push(m);
        });
      }
      g.order.forEach(function (k) {
        var o = g.cells[k], p = from[k] ? g.cells[from[k]] : null, side; // the side it's hinged on: toward what knocked it
        if (p) side = p.c < o.c ? "L" : p.c > o.c ? "R" : p.r < o.r ? "T" : "B";
        else side = startDir === "A" ? "L" : "T";
        var origin = { L: "0% 50%", R: "100% 50%", T: "50% 0%", B: "50% 100%" }[side];
        var axis = side === "L" || side === "R" ? "rotateY(" : "rotateX(", sgn = side === "L" || side === "B" ? -1 : 1;
        var stand = axis + (78 * sgn) + "deg)", back = axis + (-7 * sgn) + "deg)", flat = axis + "0deg)";
        var t = fall[k], appear = 0.05 + Math.random() * 0.2, D = t + 0.34;
        sfx(t + 0.16, function (at, S) { S.clack(at, n++); });
        a[k] = { delay: 0, dur: D, ease: "linear", kf: [
          { transform: stand, transformOrigin: origin, opacity: 0, offset: 0 },
          { transform: stand, transformOrigin: origin, opacity: 1, offset: appear / D },
          { transform: stand, transformOrigin: origin, opacity: 1, offset: t / D, easing: "cubic-bezier(.5,0,.9,.6)" }, // falls, faster and faster
          { transform: back, transformOrigin: origin, opacity: 1, offset: (t + 0.2) / D, easing: "ease-out" },         // lands, a little rebound
          { transform: flat, transformOrigin: origin, opacity: 1, offset: 1 }
        ] };
      });
      return a;
    } },
  { id: "popcorn", name: "Popcorn", icon: "🍿", premium: false,
    // The boxes start as a heap of small kernels at the bottom of the board, jiggling harder as
    // they heat up. Then they pop, one at a time in a random order and faster and faster, each
    // puffing up to full size and arcing to its place with a little bounce; the last few pop
    // in a burst. A pop each, thick and fast by the end, like a bag in the microwave.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var keys = shuffle(g.order), kern = 0.5, ks = g.size * kern * 0.95, perRow = Math.max(4, Math.ceil(Math.sqrt(keys.length * 2)));
      var t = 0.6, dt = 0.3;
      keys.forEach(function (k, i) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half;
        var row = Math.floor(i / perRow), col = i % perRow - (perRow - 1) / 2 + (row % 2) * 0.5; // the heap: rows of kernels, offset like a pile
        var px = W / 2 + col * ks + (Math.random() - 0.5) * ks * 0.3, py = H - ks * 0.5 - row * ks * 0.8;
        var tp = t, fl = 0.42 + Math.random() * 0.18, D = tp + 0.06 + fl + 0.22, kf = [], ph = Math.random() * 6;
        function T(x, y, rot, sx, sy) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + sx + "," + (sy || sx) + ")"; }
        for (var q = 0; q < tp; q += 0.08) { // heating up: jiggles grow until it pops
          var heat = Math.min(1, q / tp) * 9;
          kf.push({ transform: T(px + Math.sin(q * 37 + ph) * heat * 0.25, py, Math.sin(q * 29 + ph) * heat, kern), opacity: Math.min(1, q / 0.2), zIndex: 2, offset: q / D });
        }
        var spin = (Math.random() < 0.5 ? -1 : 1) * 360;
        kf.push({ transform: T(px, py, 0, kern), opacity: 1, zIndex: 2, offset: tp / D, easing: "ease-out" });
        kf.push({ transform: T(px, py - ks * 0.4, 0, 1.15), opacity: 1, zIndex: 3, offset: (tp + 0.06) / D, easing: "cubic-bezier(.2,.7,.4,1)" }); // pop!
        var ax = px + (fx - px) * 0.55, ay = Math.max(-H * 0.4, Math.min(py, fy) - H * (0.2 + Math.random() * 0.25));
        kf.push({ transform: T(ax, ay, spin * 0.5, 1), opacity: 1, zIndex: 3, offset: (tp + 0.06 + fl * 0.45) / D, easing: "cubic-bezier(.5,0,.9,.6)" });
        kf.push({ transform: T(fx, fy, spin, 1.1, 0.88), opacity: 1, zIndex: 1, offset: (tp + 0.06 + fl) / D, easing: "ease-out" });
        kf.push({ transform: T(fx, fy - g.size * 0.15, spin, 1), opacity: 1, zIndex: 1, offset: (tp + 0.06 + fl + 0.1) / D, easing: "ease-in" });
        kf.push({ transform: "translate(0,0) rotate(" + spin + "deg) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
        sfx(tp, function (when, S) { S.pop(when, i % 7); });
        t += dt; dt = Math.max(0.035, dt * 0.84);
      });
      return a;
    } },
  { id: "chess", name: "Chess", icon: "♟️", premium: false,
    // A faint checkerboard of plain boxes fades in under the puzzle, and the boxes stand on its
    // empty squares in two armies, left and right (the boxes whose places are in that half),
    // never on a place. Then they play: turns alternate left, right, and on each a few pieces of
    // that side make one move each by their piece's rules until all are home: a rook straight
    // along a row or column, a bishop on a diagonal (only pieces whose place is on their color), a
    // knight in L-hops, lifting over the board. A wooden tap as each lands, a note for each side.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, half = g.size / 2, R = g.rows, C = g.cols, PER = 4, TURN = 0.2, MOVE = 0.17;
      function sq(r, c) { return { x: c * step + half, y: r * step + half }; }
      var used = {}; g.order.forEach(function (k) { used[k] = 1; });
      // Home squares: the empty squares of each half, outermost first; then columns just outside.
      var empty = [[], []];
      for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) if (!used[r + "," + c]) empty[c < C / 2 ? 0 : 1].push([r, c]);
      empty[0].sort(function (x, y) { return x[1] - y[1] || Math.random() - 0.5; });
      empty[1].sort(function (x, y) { return y[1] - x[1] || Math.random() - 0.5; });
      for (var r2 = 0; r2 < R; r2++) { empty[0].push([r2, -1]); empty[1].push([r2, C]); }
      var sides = [[], []];
      g.order.forEach(function (k) { sides[g.cells[k].c < C / 2 ? 0 : 1].push(k); });
      function knightPath(r0, c0, r1, c1) {
        var seen = {}, q = [[r0, c0, []]], J = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
        seen[r0 + "," + c0] = 1;
        while (q.length) {
          var cur = q.shift();
          if (cur[0] === r1 && cur[1] === c1) return cur[2];
          if (cur[2].length >= 3) continue;
          for (var m = 0; m < 8; m++) {
            var nr = cur[0] + J[m][0], nc = cur[1] + J[m][1], id = nr + "," + nc;
            if (seen[id] || nr < 0 || nr >= R || nc < -1 || nc > C) continue;
            seen[id] = 1; q.push([nr, nc, cur[2].concat([[nr, nc]])]);
          }
        }
        return null;
      }
      var piece = {}; // per box: its home square, kind and the squares it moves through
      sides.forEach(function (list, sd) {
        list.forEach(function (k, i) {
          var o = g.cells[k], h = empty[sd][i] || [Math.floor(i / 2) % R, sd ? C : -1], path = null, kind;
          var pick = Math.random(), sameColor = (h[0] + h[1] + o.r + o.c) % 2 === 0;
          if (h[0] === o.r || h[1] === o.c) { kind = "rook"; path = [[o.r, o.c]]; }
          else if (pick < 0.35) { kind = "knight"; path = knightPath(h[0], h[1], o.r, o.c); }
          else if (pick < 0.7 && sameColor) {
            kind = "bishop";
            var br = (h[0] - h[1] + o.r + o.c) / 2, bc = (o.r + o.c - h[0] + h[1]) / 2;
            path = Math.abs(o.r - h[0]) === Math.abs(o.c - h[1]) ? [[o.r, o.c]] : [[br, bc], [o.r, o.c]];
          }
          if (!path) { kind = "rook"; path = Math.random() < 0.5 ? [[h[0], o.c], [o.r, o.c]] : [[o.r, h[1]], [o.r, o.c]]; }
          piece[k] = { sd: sd, home: h, kind: kind, path: path, at: sq(h[0], h[1]), kf: [], done: 0 };
        });
      });
      // The game: alternate sides; each turn, the next few of that side's pieces still on their way
      // (round robin) make one move.
      var queues = [shuffle(sides[0]), shuffle(sides[1])], t = 0.55, turn = 0, n = 0;
      while (queues[0].length || queues[1].length) {
        var sd = turn % 2, qq = queues[sd], movers = qq.splice(0, PER);
        movers.forEach(function (k, mi) {
          var pc = piece[k], to = sq(pc.path[pc.done][0], pc.path[pc.done][1]), st = t + mi * 0.03;
          pc.kf.push({ x: pc.at.x, y: pc.at.y, s: 1, t: st, z: 3, ease: pc.kind === "knight" ? "cubic-bezier(.3,.6,.5,1)" : "cubic-bezier(.4,0,.2,1)" });
          if (pc.kind === "knight") pc.kf.push({ x: (pc.at.x + to.x) / 2, y: (pc.at.y + to.y) / 2 - g.size * 0.45, s: 1.14, t: st + MOVE * 0.5, z: 4, ease: "cubic-bezier(.5,0,.7,.4)" });
          pc.kf.push({ x: to.x, y: to.y, s: 1, t: st + MOVE, z: 2, ease: "linear" });
          sfx(st + MOVE, function (when, S) { S.knock(when, pc.sd ? 1 : 4); });
          pc.at = to; pc.done++;
          if (pc.done < pc.path.length) qq.push(k);
        });
        if (movers.length) t += TURN;
        turn++;
      }
      var END = t + 0.3;
      g.order.forEach(function (k) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, pc = piece[k], h0 = sq(pc.home[0], pc.home[1]), D = pc.kf[pc.kf.length - 1].t + 0.08;
        function T(x, y, s2) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) scale(" + s2 + ")"; }
        var appear = 0.1 + Math.random() * 0.25, kf = [
          { transform: T(h0.x, h0.y, 0.6), opacity: 0, zIndex: 1, offset: 0 },
          { transform: T(h0.x, h0.y, 1), opacity: 1, zIndex: 1, offset: appear / D, easing: "steps(1, end)" }];
        pc.kf.forEach(function (f) { kf.push({ transform: T(f.x, f.y, f.s), opacity: 1, zIndex: f.z, offset: f.t / D, easing: f.ease }); });
        kf.push({ transform: "translate(0,0) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
        kf[1].easing = "linear";
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
      });
      // the board: faint plain boxes on the dark squares, over the puzzle and a column each side
      g.at(0, function () {
        var anims = [];
        for (var r = 0; r < R; r++) for (var c = -1; c <= C; c++) {
          if ((r + c) % 2 !== 0) continue;
          var d = document.createElement("div"), p2 = sq(r, c);
          d.className = "entrance-decoy"; d.style.width = d.style.height = g.size + "px";
          d.style.left = (p2.x - half) + "px"; d.style.top = (p2.y - half) + "px"; d.style.zIndex = 0;
          g.board.appendChild(d);
          var an = d.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.4 / END }, { opacity: 0.35, offset: (END - 0.35) / END }, { opacity: 0 }], { duration: END * 1000, fill: "forwards" });
          (function (el) { an.onfinish = an.oncancel = function () { el.remove(); }; })(d);
          anims.push(an);
        }
        return anims;
      });
      return a;
    } },
  { id: "fireflies", name: "Fireflies", icon: "✨", premium: false,
    // The boxes drift in as small dim boxes (still showing their edges) scattered over the board, wandering slowly and
    // blinking on and off like fireflies on a summer night, each with a soft glow. One by one
    // they float to their places, growing to full size and brightening as they settle. Just
    // crickets chirping, like a summer night.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var keys = shuffle(g.order), glow = "0 0 " + Math.round(g.size * 0.35) + "px " + Math.round(g.size * 0.08) + "px " + g.accent, none = "0 0 0 0 transparent";
      keys.forEach(function (k, i) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half;
        var x0 = Math.random() * W, y0 = Math.random() * H, ph = Math.random() * 6, ph2 = Math.random() * 6, blink = 2.2 + Math.random() * 1.6;
        var ts = 0.9 + i / keys.length * 1.3 + Math.random() * 0.15, FLY = 0.6, D = ts + FLY + 0.2, kf = [];
        function at(t) { return { x: x0 + Math.sin(t * 0.9 + ph) * g.size * 1.2 + Math.sin(t * 2.1 + ph2) * g.size * 0.3, y: y0 + Math.cos(t * 0.8 + ph2) * g.size * 1.0 + Math.sin(t * 1.7 + ph) * g.size * 0.3 }; }
        function T(x, y, s2) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) scale(" + s2 + ")"; }
        for (var t = 0; t < ts; t += 0.08) {
          var p = at(t), lit = Math.pow(Math.max(0, Math.sin(t * blink + ph)), 3); // blinking
          kf.push({ transform: T(p.x, p.y, 0.45), opacity: Math.min(1, t / 0.4) * (0.45 + 0.55 * lit), boxShadow: lit > 0.4 ? glow : none, zIndex: 3, offset: t / D });
        }
        var p0 = at(ts);
        kf.push({ transform: T(p0.x, p0.y, 0.45), opacity: 1, boxShadow: glow, zIndex: 3, offset: ts / D, easing: "cubic-bezier(.4,0,.2,1)" }); // floats home
        kf.push({ transform: T(fx, fy - g.size * 0.08, 1.04), opacity: 1, boxShadow: glow, zIndex: 2, offset: (ts + FLY) / D, easing: "ease-out" });
        kf.push({ transform: "translate(0,0) scale(1)", opacity: 1, boxShadow: none, zIndex: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
      });
      sfx(0, function (when, S) { S.crickets(when, 3); });
      return a;
    } },
  { id: "band", name: "Marching band", icon: "🥁", premium: false,
    // The boxes march in from the left in a tight block, in step with a drum: each beat a
    // stride with a little bob. The block halts in the middle on a drum roll, then breaks ranks,
    // front rank first: each box marches off to its place in step, along then a sharp turn up
    // or down, and stamps in. A bass drum and a snare keep the beat the whole way.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var n = g.order.length, F = Math.max(2, Math.ceil(Math.sqrt(n * 0.8))), RK = Math.ceil(n / F); // F ranks (front to back), RK boxes in each
      var bs = 0.78, sp = g.size * bs + 3, blockW = F * sp, blockH = RK * sp, BEAT = 0.15, IN = 6;
      var x1 = W / 2 - blockW / 2, y1 = H / 2 - blockH / 2, x0 = -blockW - g.size, stride = (x1 - x0) / IN, bob = g.size * 0.14;
      // who stands where: the ones going furthest right lead (front ranks on the right), each rank top to bottom
      var keys = g.order.slice().sort(function (p, q) { return g.cells[q].c - g.cells[p].c || g.cells[p].r - g.cells[q].r; });
      var slot = {};
      keys.forEach(function (k, i) { var rank = Math.floor(i / RK); slot[k] = { rank: rank, x: x1 + (F - 1 - rank + 0.5) * sp, y: y1 + (i % RK + 0.5) * sp }; });
      keys.sort(function (p, q) { return slot[p].rank - slot[q].rank || g.cells[p].r - g.cells[q].r; });
      var lastBeat = 0;
      keys.forEach(function (k) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, sl = slot[k], pts = [];
        function T(x, y, s2) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) scale(" + s2 + ")"; }
        function beatAt(b) { return 0.25 + b * BEAT; }
        function stepTo(b, xa, ya, xb, yb, s2) { // one step on beat b: up halfway, down at the end
          pts.push({ t: beatAt(b), x: xa, y: ya, s: s2 });
          pts.push({ t: beatAt(b) + BEAT * 0.5, x: (xa + xb) / 2, y: (ya + yb) / 2 - bob, s: s2 });
          pts.push({ t: beatAt(b + 1), x: xb, y: yb, s: s2 });
        }
        var x = sl.x - (x1 - x0), y = sl.y;
        for (var b = 0; b < IN; b++) { stepTo(b, x, y, x + stride, y, bs); x += stride; }
        // breaks ranks: the front rank goes first, one rank each beat; marches along, then turns
        var b2 = IN + 2 + sl.rank, legs = [[fx, y], [fx, fy]];
        legs.forEach(function (to) {
          var d = Math.hypot(to[0] - x, to[1] - y), nSteps = Math.max(1, Math.min(4, Math.round(d / (g.size * 1.3))));
          for (var j = 0; j < nSteps; j++) {
            var nx = x + (to[0] - x) / (nSteps - j), ny = y + (to[1] - y) / (nSteps - j);
            stepTo(b2++, x, y, nx, ny, bs + (1 - bs) * Math.min(1, (b2 - IN - 2 - sl.rank) / 4));
            x = nx; y = ny;
          }
        });
        lastBeat = Math.max(lastBeat, b2);
        var D = beatAt(b2) + 0.15, kf = [{ transform: T(pts[0].x, pts[0].y, bs), offset: 0 }];
        pts.forEach(function (p) { if (p.t / D > kf[kf.length - 1].offset) kf.push({ transform: T(p.x, p.y, p.s), offset: p.t / D, easing: "ease-in-out" }); });
        kf.push({ transform: "translate(0,2px) scale(1.06,.92)", offset: Math.min(0.999, (beatAt(b2) + 0.06) / D), easing: "ease-out" }); // stamps in
        kf.push({ transform: "translate(0,0) scale(1)", offset: 1 });
        kf.forEach(function (f) { f.zIndex = 3; }); kf[kf.length - 1].zIndex = 1;
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
      });
      for (var b = 0; b <= lastBeat; b++) (function (b) {
        var at = 0.25 + b * BEAT;
        if (b === IN || b === IN + 1) { for (var r = 0; r < 4; r++) sfx(at + r * BEAT / 4, function (when, S) { S.snare(when, 0.6 + r * 0.1); }); return; } // the halt: a drum roll
        sfx(at, function (when, S) { if (b % 2 === 0) S.bass(when); else S.snare(when); });
      })(b);
      return a;
    } },
  { id: "centipede", name: "Centipede", icon: "🐛", premium: false,
    // All the boxes join into one long centipede that comes in at the bottom left and snakes up
    // the board: along the bottom row, curling round at the edge, back along the next row up,
    // and so on. It's ordered so its last box always belongs to the next place it crosses: each
    // time it passes that place, its tail drops off there and stays, so it gets shorter as it
    // climbs, and its head is the last box down. A skitter of little feet the whole way.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, half = g.size / 2, R = g.rows;
      var M = step * 0.6, rad = step / 2, Lrow = W + 2 * M, Lturn = Math.PI * rad, LEG = Lrow + Lturn;
      function rowY(k) { return (R - 1 - k) * step + half; } // k: rows from the bottom
      function at(s) { // a point on the path, s along it (before 0: coming in from the left of the bottom row)
        if (s < 0) return { x: -M + s, y: rowY(0) };
        var k = Math.floor(s / LEG), u = s - k * LEG, right = k % 2 === 0;
        if (u <= Lrow) return { x: right ? -M + u : W + M - u, y: rowY(k) };
        var th = (u - Lrow) / rad, cx = right ? W + M : -M, cy = rowY(k) - rad; // the curl up to the next row
        return { x: cx + (right ? 1 : -1) * Math.sin(th) * rad, y: cy + Math.cos(th) * rad };
      }
      function where(o) { var k = R - 1 - o.r, x = o.c * step + half; return k * LEG + (k % 2 === 0 ? x + M : W + M - x); }
      var chain = g.order.slice().sort(function (p, q) { return where(g.cells[q]) - where(g.cells[p]); }); // head (furthest place) first
      var SP = step, head = where(g.cells[chain[0]]), START = 0.25, RUN = Math.min(3.2, 1.6 + head / 1400), v = head / RUN, END = START + RUN;
      chain.forEach(function (k, i) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, dest = where(o), stop = START + (dest + i * SP) / v, kf = [];
        var D = stop + 0.2;
        function T(x, y, s2) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) scale(" + s2 + ")"; }
        for (var t = 0; t < stop; t += 1 / 30) {
          var s2 = v * Math.max(0, t - START) - i * SP, p = at(s2), wig = Math.sin(t * 22 - i * 0.9) * g.size * 0.06;
          kf.push({ transform: T(p.x, p.y + wig, 0.9), opacity: p.x < -half ? 0 : 1, zIndex: 2, offset: t / D });
        }
        kf.push({ transform: T(fx, fy, 0.9), opacity: 1, zIndex: 2, offset: stop / D, easing: "ease-out" });
        kf.push({ transform: "translate(0,0) scale(1.06)", opacity: 1, zIndex: 1, offset: (stop + 0.08) / D, easing: "ease-in-out" }); // dropped off
        kf.push({ transform: "translate(0,0) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
      });
      sfx(START, function (when, S) { S.skitter(when, RUN); });
      return a;
    } },
  { id: "wipers", name: "Windshield wipers", icon: "🚗", premium: false,
    // The puzzle's boxes lie scattered over the board like rain on a windshield. A wiper, an arm
    // of plain boxes pivoting from the bottom middle, sweeps up and over from left to right,
    // catching each box as it reaches it and carrying it along. On the wipe back each one slides
    // along the arm to its place's distance and drops off as the arm passes its place, left
    // exactly where it belongs. A rubbery swish each way.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var px = W / 2, py = H + step * 0.5, T0 = 0.35, SWEEP = 1.0, BACK = 1.1, T1 = T0 + SWEEP, END = T1 + BACK + 0.3;
      var ease = function (m) { return m < 0.5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2; };
      function inv(u) { var lo = 0, hi = 1; for (var q = 0; q < 24; q++) { var m = (lo + hi) / 2; if (ease(m) < u) lo = m; else hi = m; } return (lo + hi) / 2; }
      function armAt(t) { // the arm's angle: 180 (left) up over to 0 (right), then back
        if (t <= T0) return 180;
        if (t <= T1) return 180 - 180 * ease((t - T0) / SWEEP);
        return 180 * ease(Math.min(1, (t - T1) / BACK));
      }
      function polar(x, y) { return { r: Math.hypot(x - px, py - y), f: Math.max(0, Math.min(180, Math.atan2(py - y, x - px) * 180 / Math.PI)) }; }
      function pt(r, f) { var q = f * Math.PI / 180; return { x: px + r * Math.cos(q), y: py - r * Math.sin(q) }; }
      var reach = 0;
      g.order.forEach(function (k) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, d = polar(fx, fy);
        // where it lies scattered: somewhere over the board, within the arm's sweep
        var sx, sy, sp;
        for (var tries = 0; tries < 40; tries++) {
          sx = half + Math.random() * (W - g.size); sy = half + Math.random() * (H - g.size); sp = polar(sx, sy);
          if (sp.f > 8 && sp.f < 172 && sp.r > step) break;
        }
        reach = Math.max(reach, d.r, sp.r);
        var tCatch = T0 + SWEEP * inv((180 - sp.f) / 180), tDrop = T1 + BACK * inv(d.f / 180), tilt = (Math.random() - 0.5) * 50, D = tDrop + 0.2, kf = [];
        function T(x, y, rot, s2) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + s2 + ")"; }
        kf.push({ transform: T(sx, sy, tilt, 0.85), opacity: 0, zIndex: 2, offset: 0 });
        kf.push({ transform: T(sx, sy, tilt, 0.85), opacity: 1, zIndex: 2, offset: 0.25 / D });
        kf.push({ transform: T(sx, sy, tilt, 0.85), opacity: 1, zIndex: 2, offset: tCatch / D });
        for (var t = tCatch + 1 / 30; t < tDrop; t += 1 / 30) { // caught: rides the arm, sliding along it to its place's distance on the way back
          var f = armAt(t), r = t <= T1 ? sp.r : sp.r + (d.r - sp.r) * Math.min(1, (t - T1) / Math.max(0.05, tDrop - T1)), p = pt(r, f);
          kf.push({ transform: T(p.x, p.y, tilt * Math.max(0, 1 - (t - tCatch) / 0.4), 0.85), opacity: 1, zIndex: 6, offset: t / D });
        }
        kf.push({ transform: T(fx, fy, 0, 0.85), opacity: 1, zIndex: 6, offset: tDrop / D, easing: "ease-out" });
        kf.push({ transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1, zIndex: 1, offset: 1 }); // dropped off
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
      });
      reach += half;
      g.at(0, function () {
        var sz = g.size * 0.8;
        var arm = document.createElement("div"); arm.style.position = "absolute"; arm.style.left = px + "px"; arm.style.top = py + "px"; arm.style.width = arm.style.height = "0"; arm.style.zIndex = 5; arm.style.pointerEvents = "none";
        for (var r = step * 0.3; r < reach; r += sz + 3) {
          var b = document.createElement("div"); b.className = "entrance-decoy";
          b.style.width = b.style.height = sz + "px"; b.style.left = r + "px"; b.style.top = (-sz / 2) + "px";
          arm.appendChild(b);
        }
        g.board.appendChild(arm);
        var kf = [];
        for (var t = 0; t <= END + 0.001; t += 1 / 30) {
          var op = t < T0 ? 0 : t < T0 + 0.2 ? (t - T0) / 0.2 : t < T1 + BACK + 0.05 ? 1 : Math.max(0, (T1 + BACK + 0.3 - t) / 0.25); // stays through the last thunk, then fades
          kf.push({ transform: "rotate(" + -armAt(t) + "deg)", opacity: op, offset: Math.min(1, t / END) });
        }
        kf[kf.length - 1].offset = 1;
        var aw = arm.animate(kf, { duration: END * 1000, fill: "forwards" });
        aw.onfinish = aw.oncancel = function () { arm.remove(); };
        return aw;
      });
      sfx(T0, function (when, S) { S.swish(when, SWEEP); });
      sfx(T1, function (when, S) { S.swish(when, BACK); });
      return a;
    } },
  { id: "coins", name: "Coins", icon: "🪙", premium: false,
    // The boxes drop onto the board like coins spun onto a table, a quick scatter in a random
    // order, each falling from above (bigger, then its own size as it lands) nearly on its edge.
    // Each spins on its edge, tipping lower as it goes, into a wobble circling faster and faster
    // as it flattens out, till it lies still. The quickening rattle of coins settling.
    plan: function (g, sfx) {
      var a = {}, keys = shuffle(g.order), WOB = 1.3, FALL = 0.22;
      keys.forEach(function (k, i) {
        var t0 = 0.2 + (i / keys.length) * 1.1 + Math.random() * 0.08, land = t0 + FALL, D = land + WOB, kf = [];
        var tilt0 = 76 + Math.random() * 8, ph = Math.random() * Math.PI * 2; // lands nearly on edge
        kf.push({ transform: "scale(1.7) rotate3d(1,0,0,0deg)", opacity: 0, zIndex: 3, offset: 0 });
        kf.push({ transform: "scale(1.7) rotate3d(1,0,0,0deg)", opacity: 0, zIndex: 3, offset: t0 / D, easing: "cubic-bezier(.55,0,1,.45)" }); // falls
        // the wobble: tilt shrinking, the tilt's direction circling faster and faster
        for (var q = 0; q <= 1.0001; q += 1 / 30) {
          var tilt = tilt0 * Math.pow(1 - q, 1.35), turn = ph + 2 * Math.PI * (2.2 * q + 5 * q * q * q); // spinning on its edge, then a faster and faster wobble
          kf.push({ transform: "scale(1) rotate3d(" + Math.cos(turn).toFixed(3) + "," + Math.sin(turn).toFixed(3) + ",0," + tilt.toFixed(2) + "deg)", opacity: 1, zIndex: q < 0.2 ? 2 : 1, offset: (land + q * WOB) / D });
        }
        kf[kf.length - 1].offset = 1;
        kf[kf.length - 1].transform = "scale(1) rotate3d(1,0,0,0deg)";
        a[k] = { kf: kf, delay: 0, dur: D, ease: "linear" };
        if (i % 3 === 0) sfx(land, function (when, S) { S.whir(when, WOB * 0.4, i); });
        if (i % 3 === 0) sfx(land + WOB * 0.35, function (when, S) { S.settle(when, WOB * 0.6, i); });
      });
      return a;
    } },
  { id: "rain", name: "Digital rain", icon: "🟩", premium: false,
    // Digital rain made of full-size boxes, in two layers (a dimmer, slower one behind): streams
    // fade in as they fall and pour down the board's columns at different speeds,
    // each a bright head box in the accent color with a trail of plain boxes fading behind it.
    // Each of the puzzle's boxes decodes as a stream's head passes its place: it flickers on with
    // a glow and settles. Then the rain thins out and the last trails drain off the bottom. A
    // soft trickle of tiny high blips, like data pouring, and two big bright synth-brass chords
    // as it starts.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, H = g.rows * step - g.gap, half = g.size / 2, C = g.cols;
      var hs = g.size, TAIL = 5, gapY = step, streams = [], END = 0;
      var byCol = {}; g.order.forEach(function (k) { (byCol[g.cells[k].c] = byCol[g.cells[k].c] || []).push(k); });
      for (var c = 0; c < C; c++) {
        var n = byCol[c] ? 3 : 2;
        for (var q = 0; q < n; q++) {
          var start = q === 0 && byCol[c] ? 0.1 + Math.random() * 1.1 : 0.05 + (q + Math.random()) / n * 1.9, v = H / (0.7 + Math.random() * 0.6);
          streams.push({ c: c, start: start, v: v, y0: -gapY, y1: H + TAIL * gapY, back: false });
        }
        // a back layer: dimmer, a little smaller and slower, behind, for depth
        var nb = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (var q2 = 0; q2 < nb; q2++) {
          streams.push({ c: c, start: (q2 + Math.random()) / nb * 1.4, v: 0, y0: -gapY, y1: H + TAIL * gapY, back: true }); // speed: below
        }
      }
      // each box decodes when the first head passes its place
      g.order.forEach(function (k) {
        var o = g.cells[k], fy = o.r * step + half, t = Infinity;
        streams.forEach(function (st) { if (st.c === o.c && !st.back) t = Math.min(t, st.start + (fy - st.y0) / st.v); });
        var glow = "0 0 " + Math.round(g.size * 0.4) + "px " + Math.round(g.size * 0.06) + "px " + g.accent, none = "0 0 0 0 transparent", D = t + 0.45;
        a[k] = { delay: 0, dur: D, ease: "linear", kf: [
          { opacity: 0, boxShadow: none, zIndex: 2, offset: 0 },
          { opacity: 0, boxShadow: none, zIndex: 2, offset: t / D, easing: "steps(1, end)" },
          { opacity: 1, boxShadow: glow, zIndex: 2, offset: (t + 0.04) / D, easing: "steps(1, end)" }, // flickers on
          { opacity: 0.35, boxShadow: glow, zIndex: 2, offset: (t + 0.09) / D, easing: "steps(1, end)" },
          { opacity: 1, boxShadow: glow, zIndex: 2, offset: (t + 0.14) / D, easing: "ease-out" },
          { opacity: 1, boxShadow: none, zIndex: 2, offset: 1 }] };
        END = Math.max(END, D);
      });
      streams.forEach(function (st) { if (!st.back) END = Math.max(END, st.start + (st.y1 - st.y0) / st.v); });
      streams.forEach(function (st) { if (st.back) st.v = (st.y1 - st.y0) / Math.max(0.8, END - st.start - 0.05); }); // slower, but done by the end
      g.at(0, function () {
        var anims = [];
        streams.forEach(function (st) {
          var x = st.c * step + half - hs / 2, dur = (st.y1 - st.y0) / st.v;
          for (var j = 0; j <= TAIL; j++) { // the head (j = 0), then its fading trail
            var d = document.createElement("div"), sc = st.back ? 0.8 : 1;
            d.className = j ? "entrance-decoy" : "entrance-blk";
            d.style.width = d.style.height = hs + "px"; d.style.left = x + "px"; d.style.top = "0px"; d.style.zIndex = st.back ? -1 : j ? 0 : 4;
            g.board.appendChild(d);
            var op = (j ? 0.75 * (1 - j / (TAIL + 1)) : 1) * (st.back ? 0.35 : 1), yA = st.y0 - j * gapY, yE = Math.min(st.y1 - j * gapY, H), FADE = 0.3;
            var yV = Math.max(yA, -half), tS = st.start, tV = tS + (yV - yA) / st.v, tF = tV + FADE, tE = tS + (yE - yA) / st.v, tO = tS + (yE + g.size * 0.6 - yA) / st.v;
            function at(y, o2) { return { transform: "translate(0," + y + "px) scale(" + sc + ")", opacity: o2 }; }
            var an = d.animate([
              Object.assign(at(yA, 0), { offset: 0 }),
              Object.assign(at(yA, 0), { offset: tS / END, easing: "linear" }),                                  // invisible till it moves
              Object.assign(at(yV, 0), { offset: Math.min(1, tV / END), easing: "linear" }),                    // and till it's on the board
              Object.assign(at(yV + st.v * FADE, op), { offset: Math.min(1, tF / END), easing: "linear" }),     // fades in as it falls
              Object.assign(at(yE, op), { offset: Math.min(1, tE / END), easing: "linear" }),
              Object.assign(at(yE + g.size * 0.6, 0), { offset: Math.min(1, tO / END) }),
              Object.assign(at(yE + g.size * 0.6, 0), { offset: 1 })], { duration: END * 1000, fill: "forwards" });
            (function (el) { an.onfinish = an.oncancel = function () { el.remove(); }; })(d);
            anims.push(an);
          }
        });
        return anims;
      });
      sfx(0.1, function (when, S) { S.trickle(when, END - 0.3); });
      // Two big bright chords, each with a punch on its low note (voicings from Jay's sketch): Ab C
      // Eb Bb D F over Ab, then C E G Bb D F over C.
      var C11 = [130.81, 261.63, 329.63, 392.0, 466.16, 587.33, 698.46], AB = [103.83, 207.65, 261.63, 311.13, 466.16, 587.33, 698.46];
      sfx(0.05, function (when, S) { S.horn(when, 1.4, AB, false, 103.83, 0.4); });
      sfx(0.85, function (when, S) { S.horn(when, 2.2, C11, false, 130.81, 0.4); });
      return a;
    } },
  { id: "zipper", name: "Zipper", icon: "🤐", premium: false,
    // A zipper pull (an accent block) runs up the middle of the board, and behind it a wall of
    // plain blocks zips shut row by row, each row's halves sliding in from the sides to meet in
    // the middle like teeth; the puzzle's boxes slip into place behind it. A beat, then the pull
    // runs back down and the wall unzips row by row, its halves sliding away to the sides:
    // the puzzle is underneath. A zipper's rasp, up, then down.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap;
      var ZU = 0.8, HOLD = 0.3, ZD = 0.8, T2 = ZU + HOLD, DUR = T2 + ZD + 0.35, mid = (g.cols - 1) / 2;
      var rowUp = function (r) { return (g.rows - 1 - r) / Math.max(1, g.rows - 1) * ZU * 0.9; }; // when the pull passes row r going up
      var rowDown = function (r) { return T2 + r / Math.max(1, g.rows - 1) * ZD * 0.9; };          // and going down
      // The puzzle's boxes: hidden until the wall covers their row, then in place under it.
      g.order.forEach(function (k) {
        var o = g.cells[k], on = rowUp(o.r) + 0.12;
        a[k] = { kf: [{ opacity: 0, offset: 0 }, { opacity: 0, offset: on / DUR }, { opacity: 1, offset: Math.min(1, (on + 0.01) / DUR) }, { opacity: 1, offset: 1 }], delay: 0, dur: DUR, ease: "linear" };
      });
      g.at(0, function () {
        var anims = [];
        function block(x, y, kf, z, color) {
          var d = document.createElement("div"); d.className = "entrance-decoy";
          d.style.width = d.style.height = g.size + "px"; d.style.left = x + "px"; d.style.top = y + "px"; d.style.zIndex = z;
          if (color) { d.style.background = color.fill; d.style.borderColor = color.edge; }
          g.board.appendChild(d);
          var an = d.animate(kf, { duration: DUR * 1000, easing: "linear", fill: "forwards" });
          an.onfinish = an.oncancel = function () { d.remove(); };
          anims.push(an);
        }
        // The wall: a block over every spot of the grid, the puzzle's and the empty ones.
        for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) {
          var side = c < mid ? -1 : c > mid ? 1 : (r % 2 ? 1 : -1), away = side * (Math.abs(c - mid) + 1.5) * step * 0.55;
          var tIn = rowUp(r) + Math.abs(c - mid) * 0.012, tOut = rowDown(r) + Math.abs(c - mid) * 0.012, S = function (x, op) { return { transform: "translateX(" + x + "px)", opacity: op }; };
          block(c * step, r * step, [
            Object.assign(S(away, 0), { offset: 0 }),
            Object.assign(S(away, 0), { offset: tIn / DUR, easing: "cubic-bezier(.2,.8,.3,1)" }),
            Object.assign(S(0, 1), { offset: (tIn + 0.14) / DUR }),
            Object.assign(S(0, 1), { offset: tOut / DUR, easing: "cubic-bezier(.6,0,.8,.4)" }),
            Object.assign(S(away, 0), { offset: Math.min(1, (tOut + 0.18) / DUR) }),
            Object.assign(S(away, 0), { offset: 1 })], 6);
        }
        // The pull: up the middle, a pause at the top, back down.
        var px = mid * step, A = { fill: getComputedStyle(document.documentElement).getPropertyValue("--accent-soft").trim(), edge: g.accent };
        var P = function (y, op, sc) { return { transform: "translateY(" + y + "px) scale(" + sc + ")", opacity: op }; };
        block(px, 0, [
          Object.assign(P(H + step * 0.3, 0, 0.7), { offset: 0 }),
          Object.assign(P(H - g.size, 1, 0.8), { offset: 0.06 / DUR }),
          Object.assign(P(-step * 0.15, 1, 0.8), { offset: ZU / DUR }),
          Object.assign(P(-step * 0.25, 1, 0.9), { offset: (ZU + HOLD * 0.5) / DUR }),
          Object.assign(P(-step * 0.15, 1, 0.8), { offset: T2 / DUR }),
          Object.assign(P(H - g.size, 1, 0.8), { offset: (T2 + ZD) / DUR }),
          Object.assign(P(H + step * 0.3, 0, 0.7), { offset: Math.min(1, (T2 + ZD + 0.2) / DUR) }),
          Object.assign(P(H + step * 0.3, 0, 0.7), { offset: 1 })], 8, A);
        return anims;
      });
      sfx(0.04, function (w, S) { S.zipper(w, ZU * 0.95, true); });
      sfx(T2, function (w, S) { S.zipper(w, ZD * 0.95, false); });
      sfx(T2 + ZD + 0.05, function (w, S) { S.clickin(w); });
      return a;
    } },
  { id: "discs", name: "Spinning discs", icon: "💿", premium: false,
    // Every box shows up in its place already spinning fast, blurred into a disc a little bigger
    // than itself, so neighbors overlap like a field of spinning plates; they wind down,
    // sharpening back into blocks and shrinking to size, and stop one after another across the
    // board, the first word last. A whirr winding down, a soft tick as each stops.
    plan: function (g, sfx) {
      var a = {}, wordK = firstWord(g), order = readingOrder(g).filter(function (k) { return wordK.indexOf(k) < 0; }).concat(wordK);
      var n = order.length, IN = 0.25, BASE = 1.5, SPREAD = 0.7;
      order.forEach(function (k, i) {
        var stop = IN + BASE + (n > 1 ? i / (n - 1) : 0) * SPREAD + (wordK.indexOf(k) >= 0 ? 0.15 : 0), dur = stop;
        var turns = 9 + Math.floor(Math.random() * 3), dir = Math.random() < 0.5 ? -1 : 1, kf = [];
        for (var s = 0; s <= 24; s++) {
          var t = s / 24 * dur, v = Math.max(0, (t - IN) / (dur - IN)), spin = 1 - v; // how fast it's turning: full, falling to 0
          var ang = dir * turns * 360 * (1 - Math.pow(1 - v, 2.2)), fast = Math.pow(spin, 1.6);
          kf.push({
            transform: "rotate(" + ang.toFixed(1) + "deg) scale(" + (t < IN ? 0.4 + 0.85 * (t / IN) : 1 + 0.25 * fast).toFixed(3) + ")",
            borderRadius: (7 + fast * 43) + "%", filter: "blur(" + (fast * 1.6).toFixed(2) + "px)",
            opacity: t < IN ? t / IN : 1, offset: s / 24 });
        }
        kf[kf.length - 1] = { transform: "rotate(" + (dir * turns * 360) + "deg) scale(1)", borderRadius: "7px", filter: "blur(0px)", opacity: 1, offset: 1 };
        a[k] = { kf: kf, delay: 0, dur: dur, ease: "linear" };
        sfx(stop, function (when, S) { S.softclick(when, i); });
      });
      sfx(0.05, function (when, S) { S.spindown(when, IN + BASE + SPREAD + 0.2); });
      return a;
    } },
  { id: "coaster", name: "Roller coaster", icon: "🎢", premium: true,
    // The boxes ride in as one long train: a slow climb up the left, a drop, a loop-the-loop,
    // then each car peels off to its spot. Clack-clack up the lift, a whoosh down, a wheee
    // round the loop, then an air-brake hiss and cars clunking into place.
    plan: function (g, sfx) {
      var a = {}, W = g.cols * (g.size + g.gap) - g.gap, H = g.rows * (g.size + g.gap) - g.gap, half = g.size / 2;
      var cx = W * 0.62, cy = H * 0.45, R = H * 0.3, pts = [];
      pts.push({ x: -3 * g.size, y: H * 0.78, t: 0 });
      pts.push({ x: W * 0.05, y: H * 0.5, t: 0.17 });
      pts.push({ x: W * 0.22, y: -g.size * 0.6, t: 0.34 });
      pts.push({ x: W * 0.36, y: H * 0.35, t: 0.42 });
      pts.push({ x: cx, y: cy + R, t: 0.5 });
      for (var s = 1; s <= 8; s++) { var ang = Math.PI / 2 - s * Math.PI / 4; pts.push({ x: cx + R * Math.cos(ang) * 1.05, y: cy + R * Math.sin(ang), t: 0.5 + s * 0.03 }); }
      pts.push({ x: W * 0.9, y: H * 0.95, t: 0.82 });
      var ang0 = [], prev = 0;
      pts.forEach(function (p, i) {
        var q = pts[Math.min(i + 1, pts.length - 1)], r0 = pts[Math.max(i - 1, 0)], dx = q.x - r0.x, dy = q.y - r0.y;
        var deg = Math.atan2(dy, dx) * 180 / Math.PI;
        while (deg - prev > 180) deg -= 360; while (deg - prev < -180) deg += 360;
        ang0.push(deg); prev = deg;
      });
      var DUR = 2.6, STAGGER = 0.075, last = Math.round(prev / 360) * 360;
      // the first word rides up front, as the lead cars, then the rest in reading order
      firstWord(g).concat(readingOrder(g).filter(function (k) { return !g.cells[k].sel; })).forEach(function (k, i) {
        var o = g.cells[k], fx0 = o.c * (g.size + g.gap), fy0 = o.r * (g.size + g.gap);
        var kf = pts.map(function (p, j) { return { transform: "translate(" + (p.x - half - fx0) + "px," + (p.y - half - fy0) + "px) rotate(" + ang0[j] + "deg) scale(.8)", opacity: j === 0 ? 0 : 1, offset: p.t }; });
        kf.push({ transform: "translate(0,0) rotate(" + last + "deg) scale(1)", opacity: 1, offset: 1 });
        a[k] = { kf: kf, delay: i * STAGGER, dur: DUR, ease: "linear" };
        if (i % 4 === 0) sfx(i * STAGGER + DUR * 0.98, function (when, S) { S.clunk(when, i / 4); });
      });
      for (var c = 0; c < 10; c++) (function (c) { sfx(DUR * 0.17 + c * DUR * 0.017, function (when, S) { S.clack(when, c); }); })(c);
      sfx(DUR * 0.34, function (when, S) { S.whoosh(when, DUR * 0.16); });
      sfx(DUR * 0.48, function (when, S) { S.wheee(when, DUR * 0.3); });
      sfx(DUR * 0.86, function (when, S) { S.brake(when, 0.7); });
      return a;
    } },
  { id: "billiards", name: "Billiards", icon: "🎱", premium: true,
    // The boxes appear racked in a triangle, a cue ball breaks them, and they scatter,
    // spinning, bounce off the board's edges, and roll to a stop in their places. Racking
    // clicks, a sharp break, clacks and cushion thuds.
    plan: function (g, sfx) {
      var a = {}, W = g.cols * (g.size + g.gap) - g.gap, H = g.rows * (g.size + g.gap) - g.gap, sp = g.size * 0.66;
      var keys = g.order.slice().sort(function () { return Math.random() - 0.5; }), slots = [];
      var ax = W * 0.36, ay = H * 0.5 - g.size / 2;
      for (var row = 0; slots.length < keys.length; row++) for (var j = 0; j <= row && slots.length < keys.length; j++) slots.push({ x: ax + row * sp * 0.87, y: ay + (j - row / 2) * sp });
      var DUR = 5.2, BREAK = 0.15, maxX = W - g.size, maxY = H - g.size;
      function wall(skip) { var w; do { w = Math.floor(Math.random() * 4); } while (w === skip); return w; }
      function onWall(w) { return w === 0 ? { x: 0, y: Math.random() * maxY } : w === 1 ? { x: maxX, y: Math.random() * maxY } : w === 2 ? { x: Math.random() * maxX, y: 0 } : { x: Math.random() * maxX, y: maxY }; }
      keys.forEach(function (k, i) {
        var o = g.cells[k], fx0 = o.c * (g.size + g.gap), fy0 = o.r * (g.size + g.gap), s = slots[i];
        var spin = (Math.random() < 0.5 ? -1 : 1) * (720 + Math.random() * 720);
        function T(x, y, rot, sc) { return "translate(" + (x - fx0) + "px," + (y - fy0) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
        var appear = (i / keys.length) * 0.11;
        var kf = [
            { transform: T(s.x, s.y, 0, 0.3), opacity: 0, offset: 0 },
            { transform: T(s.x, s.y, 0, 0.62), opacity: 1, offset: appear + 0.03 },
            { transform: T(s.x, s.y, 0, 0.62), opacity: 1, offset: BREAK, easing: "linear" }];
        // 4 to 6 cushion bounces, each leg a little longer than the last, as the ball slows.
        var nb = 4 + Math.floor(Math.random() * 3), legs = [], grow = 1, sum = 0, END = 0.64 + Math.random() * 0.06, w = -1; // then a slow roll home in the last third
        for (var b = 0; b < nb; b++) { legs.push(grow); sum += grow; grow *= 1.22 + Math.random() * 0.1; }
        var at = BREAK + Math.random() * 0.02;
        legs.forEach(function (leg, b) {
          at += leg / sum * (END - BREAK - 0.02);
          w = wall(w); var p = onWall(w), f = (b + 1) / (nb + 1);
          kf.push({ transform: T(p.x, p.y, spin * f, 0.62 + 0.3 * f), opacity: 1, offset: Math.min(at, 0.97), easing: b === nb - 1 ? "cubic-bezier(.3,.5,.4,1)" : "linear" });
          if ((i + b) % 3 === 0) { var hit = at, loud = Math.pow(0.78, b); sfx(DUR * hit, function (when, S) { S.cushion(when, loud); }); }
        });
        kf.push({ transform: "translate(0,0) rotate(" + (Math.round(spin / 360) * 360) + "deg) scale(1)", opacity: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: DUR, ease: "linear" };
        sfx(DUR * (appear + 0.03), function (when, S) { S.clack(when, i); });
      });
      for (var c = 0; c < 14; c++) (function (c) { sfx(DUR * (BREAK + 0.01 + Math.pow(Math.random(), 1.6) * 0.5), function (when, S) { S.clack(when, c + 3); }); })(c);
      sfx(DUR * BREAK, function (when, S) { S.crack(when); });
      // The cue ball is the orange highlight box: it breaks the rack, bounces around with the
      // others, and rolls home onto word 1's first box, becoming its highlight.
      var T0 = BREAK - 0.18 * 0.55;
      g.at(DUR * T0, function () { // reaches the rack at the break
        var cue = document.createElement("div"), d = g.size * 0.62, x0 = -d * 1.5, y0 = H / 2; // its center at the start
        cue.className = "entrance-blk"; cue.style.width = cue.style.height = d + "px"; cue.style.zIndex = 4;
        cue.style.left = (x0 - d / 2) + "px"; cue.style.top = (y0 - d / 2) + "px";
        g.board.appendChild(cue);
        var tgt = g.cells[g.words[0].cells[0]], tx = tgt.c * (g.size + g.gap) + g.size / 2, ty = tgt.r * (g.size + g.gap) + g.size / 2;
        var hitX = ax - d * 0.4, wx1 = Math.random() * (W - d) + d / 2, wx2 = d / 2 + Math.random() * (W - d);
        function O(f) { return (f - T0) / (1 - T0); }
        function C(x, y, rot, sc) { return "translate(" + (x - x0) + "px," + (y - y0) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
        var an = cue.animate([
          { transform: C(x0, y0, 0, 1), opacity: 0, offset: 0 },
          { transform: C(x0 + d, y0, 0, 1), opacity: 1, offset: O(T0 + 0.04) },
          { transform: C(hitX, y0, 0, 1), opacity: 1, offset: O(BREAK), easing: "cubic-bezier(.1,.7,.4,1)" },
          { transform: C(Math.max(d / 2, hitX - d * 2.2), y0 + d * 0.6, -120, 1), opacity: 1, offset: O(BREAK + 0.07), easing: "linear" },
          { transform: C(wx1, H - d / 2, -300, 1), opacity: 1, offset: O(0.42), easing: "linear" },
          { transform: C(wx2, d / 2, -480, 1), opacity: 1, offset: O(0.62), easing: "cubic-bezier(.3,.5,.4,1)" },
          { transform: C(tx, ty, -720, g.size / d), opacity: 1, offset: 1 }], { duration: DUR * (1 - T0) * 1000, easing: "linear" });
        an.onfinish = an.oncancel = function () { cue.remove(); };
        return an;
      });
      ringOn(g, DUR, sfx, false); // the cue ball lands as the highlight
      sfx(DUR - 0.02, function (when, S) { S.clickin(when); });
      return a;
    } },
  { id: "kaiju", name: "Kaiju", icon: "🦖", premium: true,
    // The boxes stack into a kaiju that lurches in from the left, rearing up and slamming down
    // each step so the board shakes, then trips, teeters (uh-oh), topples, and shatters; the
    // boxes roll slowly into place. A growl, heavy stomps, a crash, wooden knocks, a rumble.
    plan: function (g, sfx) {
      var a = {}, W = g.cols * (g.size + g.gap) - g.gap, H = g.rows * (g.size + g.gap) - g.gap, sp = g.size * 0.64, DUR = 6.8, half = g.size / 2;
      var slots = [];
      [-1, 1].forEach(function (c) { for (var r = 1; r <= 3; r++) slots.push({ c: c, r: r, part: c < 0 ? "legL" : "legR" }); });
      for (var r = 4; r <= 7; r++) for (var c = -1; c <= 1; c++) slots.push({ c: c, r: r, part: "body" });
      [-2, 2].forEach(function (c) { for (var r = 5; r <= 7; r++) slots.push({ c: c, r: r, part: c < 0 ? "armL" : "armR" }); });
      [-0.5, 0.5].forEach(function (c) { for (var r = 8; r <= 9; r++) slots.push({ c: c, r: r, part: "head" }); });
      slots.push({ c: 0.5, r: 10, part: "head" });
      var keys = g.order.slice();
      while (slots.length < keys.length) slots.push({ c: (slots.length % 3) - 1, r: 4 + (slots.length % 4), part: "body" });
      // Which slots get used (legs and body first, then the head, then arms), and the first word
      // goes in the head (it's the colored face), then the arms; the other boxes fill the rest.
      var rank = function (s) { return s.part === "head" ? 2 : /^arm/.test(s.part) ? 3 : s.r > 7 ? 4 : /^leg/.test(s.part) ? 0 : 1; };
      var use = slots.map(function (s, i) { return i; }).sort(function (x, y) { return rank(slots[x]) - rank(slots[y]) || x - y; }).slice(0, keys.length);
      var faceFirst = use.slice().sort(function (x, y) { var rx = slots[x].part === "head" ? 0 : /^arm/.test(slots[x].part) ? 1 : 2, ry = slots[y].part === "head" ? 0 : /^arm/.test(slots[y].part) ? 1 : 2; return rx - ry || x - y; });
      var placed = {}, wordK = firstWord(g), rest = others(g);
      wordK.forEach(function (k, i) { placed[k] = slots[faceFirst[i]]; });
      faceFirst.slice(wordK.length).forEach(function (si, i) { placed[rest[i]] = slots[si]; });
      slots = keys.map(function (k) { return placed[k]; });
      var WALK = 0.46, STEPS = 5, FALL = 0.64, LAND = 0.82, gy = H, ox0 = -6 * sp - g.size, ox1 = W * 0.16; // lurches in from off the left edge
      var TIP = [[WALK, 0], [WALK + 0.03, 16], [WALK + 0.06, 4], [WALK + 0.1, 19], [WALK + 0.13, 15]];
      function tilt(t) {
        if (t <= WALK) return 0;
        for (var i = 1; i < TIP.length; i++) if (t <= TIP[i][0]) { var q = (t - TIP[i - 1][0]) / (TIP[i][0] - TIP[i - 1][0]); return TIP[i - 1][1] + (TIP[i][1] - TIP[i - 1][1]) * q; }
        var u = Math.min((t - TIP[TIP.length - 1][0]) / (FALL - TIP[TIP.length - 1][0]), 1); return 15 + 75 * u * u;
      }
      // A lurching step: the leg lifts slowly while the body rears and sways over the planted
      // foot (u 0 to .55), slams down (.55 to .68), then everything holds still (.68 to 1).
      function lift(u) { return u < 0.55 ? Math.sin(u / 0.55 * Math.PI / 2) : u < 0.68 ? 1 - (u - 0.55) / 0.13 : 0; }
      function travel(u) { var v = Math.min(u / 0.68, 1); return v * v * (3 - 2 * v); }
      function turn(x, y, px, py, deg) { var r = deg * Math.PI / 180; return { x: px + (x - px) * Math.cos(r) - (y - py) * Math.sin(r), y: py + (x - px) * Math.sin(r) + (y - py) * Math.cos(r) }; }
      function figure(s, t) { // the box's center on the board, and its turn
        var walking = t < WALK, w = Math.min(t / WALK, 1), n = Math.min(Math.floor(w * STEPS), STEPS - 1), u = walking ? w * STEPS - n : 1;
        var ox = ox0 + (ox1 - ox0) * ((n + travel(u)) / STEPS), L = walking ? lift(u) : 0, left = n % 2 === 0;
        var dx = 0, dy = -0.26 * sp * L, swing = 0.42 * sp * L * (left ? 1 : -1);
        if (s.part === (left ? "legL" : "legR")) { dx = 0.42 * sp * L; dy = -0.62 * sp * L; }
        if (s.part === (left ? "legR" : "legL")) { dx = 0; dy = 0; }
        if (s.part === "armL") dx += swing;
        if (s.part === "armR") dx -= swing;
        var p = { x: ox + s.c * sp + dx, y: gy - (s.r - 0.5) * sp + dy }, lurch = walking ? (left ? 14 : -14) * L + 3 * L : 0; // sway over the planted foot, a little forward lean
        if (lurch) p = turn(p.x, p.y, ox + (left ? 1 : -1) * sp, gy, lurch); // sway over the planted foot
        var th = tilt(t), q = turn(p.x, p.y, ox + 1.5 * sp, gy, th);
        return { x: q.x, y: q.y, rot: th + lurch };
      }
      // The topple speeds up like a falling tower (tilt grows with time squared), so at impact each
      // box is moving along its arc, the head end fastest. From there each box carries that motion:
      // gravity, low bounces off the ground, friction, the board's sides; then it rolls home.
      var T0 = TIP[TIP.length - 1][0], OMEGA = (150 / (FALL - T0)) / DUR, WR = OMEGA * Math.PI / 180; // deg/s and rad/s at impact
      var G = 2600 * g.size / 40, FLOOR = gy - g.size * 0.31, PIVX = ox1 + 1.5 * sp, SIM = (LAND - FALL) * DUR, DT = 1 / 120;
      keys.forEach(function (k, i) {
        var o = g.cells[k], fx0 = o.c * (g.size + g.gap) + half, fy0 = o.r * (g.size + g.gap) + half, s = slots[i], kf = [];
        function T(x, y, rot, sc) { return "translate(" + (x - fx0) + "px," + (y - fy0) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
        var times = [];
        for (var st0 = 0; st0 < STEPS; st0++) [0, 0.18, 0.36, 0.55, 0.61, 0.68, 0.84].forEach(function (u) { times.push((st0 + u) / STEPS * WALK); });
        times.push(WALK, WALK + 0.03, WALK + 0.06, WALK + 0.1);
        for (var tf = T0; tf < FALL; tf += (FALL - T0) / 14) times.push(tf); // the topple, finely, so it swings on its arc
        times.push(FALL);
        times.forEach(function (t) { var f = figure(s, t); kf.push({ transform: T(f.x, Math.min(f.y, FLOOR + g.size * 0.2), f.rot, 0.62), opacity: t < 0.03 ? 0 : 1, offset: t }); });
        var c = figure(s, FALL);
        var vx = -WR * (c.y - gy) * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * 90, vy = WR * (c.x - PIVX) * (0.8 + Math.random() * 0.4);
        var x = c.x, y = Math.min(c.y, FLOOR), rot = c.rot, vr = OMEGA * (0.4 + Math.random() * 0.9) * (Math.random() < 0.3 ? -1 : 1);
        var hit = null, next = 1 / 30, minX = g.size * 0.35, maxX = W - g.size * 0.35, floor = FLOOR - Math.random() * g.size * 1.1, SCAT = 300 * g.size / 40; // each rests at its own height in the heap
        for (var tt = DT; tt <= SIM; tt += DT) {
          vy += G * DT; x += vx * DT; y += vy * DT; rot += vr * DT;
          if (y >= floor) { y = floor; if (vy > 0) {
            if (hit === null) { hit = tt; vx = vx * 0.5 + (Math.random() - 0.5) * 2 * SCAT; vy = -vy * (0.25 + Math.random() * 0.3); vr += (Math.random() - 0.5) * 900; } // breaks apart
            else { vy = vy > 120 ? -vy * 0.3 : 0; vx *= 0.7; vr *= 0.5; } } }
          if (y >= floor && vy === 0) { vx *= 0.9; vr *= 0.86; } // sliding to a stop
          if (x < minX) { x = minX; vx = Math.abs(vx) * 0.4; }
          if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.4; }
          if (tt >= next) { kf.push({ transform: T(x, y, rot, 0.62), opacity: 1, offset: FALL + tt / DUR }); next += 1 / 30; }
        }
        kf[kf.length - 1].easing = "cubic-bezier(.3,.5,.4,1)"; // then a slow roll home
        // rolls home and lands upright (whole turns), so its number isn't sideways when it settles
        var roll = Math.round((rot + Math.hypot(fx0 - x, fy0 - y) / g.size * 90 * (fx0 >= x ? 1 : -1)) / 360) * 360;
        kf.push({ transform: "translate(0,0) rotate(" + roll + "deg) scale(1)", opacity: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: DUR, ease: "linear" };
        if (hit !== null && i % 2 === 0) sfx(DUR * FALL + hit, function (when, S) { S.knock(when, i); });
        if (i % 5 === 0) sfx(DUR * (0.97 + Math.random() * 0.03), function (when, S) { S.knock(when, i + 2); });
      });
      sfx(DUR * 0.02, function (when, S) { S.growl(when, 0.9); });
      for (var st = 0; st < STEPS; st++) (function (st) {
        var slam = DUR * WALK * (st + 0.68) / STEPS;
        sfx(slam, function (when, S) { S.stomp(when, st); });
        g.at(slam, function () { return shake(g.board, 3); });
      })(st);
      sfx(DUR * (WALK + 0.02), function (when, S) { S.uhoh(when); });
      sfx(DUR * (WALK + 0.12), function (when, S) { S.whoosh(when, DUR * (FALL - WALK - 0.12)); });
      sfx(DUR * FALL, function (when, S) { S.crash(when); });
      sfx(DUR * LAND, function (when, S) { S.rumble(when, DUR * (1 - LAND) * 0.9); });
      return a;
    } },
  { id: "cyclone", name: "Cyclone", icon: "🌪️", premium: true,
    // The boxes swirl up into a big tornado funnel (a narrow tip at the ground, wide at the top),
    // whirling fast round it (the far side smaller and behind), the first word riding in its eye.
    // It roams back and forth across the board, bending as it goes, wind howling; then it flings
    // everything out at once, and the boxes fly into their places.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var plain = others(g), word = firstWord(g), L = Math.max(4, Math.min(9, Math.round(Math.sqrt(plain.length) * 1.4)));
      var tall = Math.max(H * 0.95, g.size * 7), sp = tall / L, SC = Math.min(0.7, Math.max(0.48, sp / g.size)), ground = H;
      var rTip = g.size * 0.3, rTop = Math.min(W * 0.48, g.size * 4.6, tall * 0.55);
      var FORM = 0.6, FLING = 3.4, flight = 1.05, landEnd = 0;
      // boxes per level grow with its width (the top holds the most)
      var wsum = L * (L + 1) / 2, counts = [];
      for (var lv = 0; lv < L; lv++) counts.push(Math.max(1, Math.round((lv + 1) / wsum * plain.length)));
      var sum = function () { return counts.reduce(function (x, y) { return x + y; }, 0); };
      while (sum() > plain.length) counts[counts.indexOf(Math.max.apply(null, counts))]--;
      while (sum() < plain.length) counts[L - 1]++;
      var levelOf = []; counts.forEach(function (c, lv) { for (var q = 0; q < c; q++) levelOf.push({ level: lv, slot: q, of: c }); });
      // where the funnel stands: in from the left, then roaming back and forth across the board
      function center(t) {
        var inn = Math.min(1, t / 0.9), e = 1 - Math.pow(1 - inn, 3);
        return -W * 0.4 * (1 - e) + e * (W * 0.5 + Math.sin((t - 0.4) * 2.1) * W * 0.36 + Math.sin(t * 5.3) * W * 0.04);
      }
      function at(level, t, phase, rad) { // a spot on the funnel: x, y, depth (-1 back .. 1 front)
        var r = rad != null ? rad : rTip + (rTop - rTip) * Math.pow(level / (L - 1), 1.3), w = 9.5 - level * 0.45, th = phase + w * t;
        var lean = Math.sin(t * 2.6) * sp * 0.9 * level / L; // the funnel bends as it moves
        return { x: center(t) + lean + r * Math.cos(th), y: ground - level * sp - sp * 0.5 + r * Math.sin(th) * 0.16, z: Math.sin(th), th: th };
      }
      function T(x, y, fx, fy, rot, sc) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
      function ride(k, level, phase, rad, appear, release, eye, n) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, total = release + flight, kf = [], spinRot = 0;
        for (var t = appear; t <= release + 0.001; t += 0.04) {
          var q = at(level, t, phase, rad), grow = Math.min(1, (t - appear) / 0.35);
          spinRot = eye ? Math.sin(t * 3 + n) * 15 : (t - appear) * 220;
          kf.push({ transform: T(q.x, q.y + (1 - grow) * sp * 1.5, fx, fy, spinRot, SC * (eye ? 1 : 0.8 + 0.2 * q.z) * (0.5 + 0.5 * grow)),
            opacity: grow * (eye ? 1 : 0.7 + 0.3 * (q.z + 1) / 2), zIndex: eye || q.z > 0 ? 3 : 2, offset: t / total });
        }
        kf[0].opacity = 0;
        // flung out of the vortex in 3D: it comes at you (translateZ, looming larger) still
        // whirling and now tumbling end over end, then slams flat into its spot on the board like
        // a wall: no easing at the end, a quick squash, a smack
        var p0 = at(level, release, phase, rad), th = p0.th, sx = -Math.sin(th) + 0.8 * Math.cos(th), len = Math.max(0.6, Math.abs(sx));
        var dir = eye ? (fx > p0.x ? 1 : -1) : sx / len, reach = eye ? g.size * 1.2 : g.size * (2 + Math.random() * 2);
        var c1 = { x: p0.x + dir * reach, y: p0.y - g.size * (eye ? 1.4 : 0.8 + Math.random()) }, c2 = { x: fx + (c1.x - fx) * 0.3, y: fy - g.size * 0.6 };
        var Z = eye ? 160 : 200 + Math.random() * 160, tx = 360 * (eye ? 1 : 1 + Math.floor(Math.random() * 2)) * (Math.random() < 0.5 ? -1 : 1), ty = 360 * (Math.random() < 0.5 ? -1 : 1);
        var endRot = Math.round((spinRot + (eye ? 0 : 720)) / 360) * 360;
        for (var j = 1; j <= 16; j++) {
          var s0 = j / 16, u = s0 * s0 * (3 - 2 * s0), m = 1 - u, z = Z * (1 - Math.pow(s0, 2.6)) * Math.min(1, s0 * 4); // up close, then plunging in
          var x = m * m * m * p0.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * fx;
          var y = m * m * m * p0.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * fy;
          kf.push({ transform: "translate(" + (x - fx) + "px," + (y - fy) + "px) translateZ(" + z + "px) rotateX(" + tx * s0 + "deg) rotateY(" + ty * s0 + "deg) rotate(" + (spinRot + (endRot - spinRot) * s0) + "deg) scale(" + (SC + (1 - SC) * Math.min(1, s0 * 1.4)) + ")",
            opacity: 1, zIndex: 4, offset: (release + flight * s0 * 0.9) / total });
        }
        // the smack: flat against the board, a squash and a little rebound
        kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1.12,1.12)", opacity: 1, zIndex: 1, offset: (release + flight * 0.94) / total });
        kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: total, ease: "linear" };
        var hit = release + flight * 0.9;
        sfx(hit, function (when, S) { S.smack(when, n); });
        if (!eye && n % 5 === 0) g.at(hit, function () { return shake(g.board, 2); });
        landEnd = Math.max(landEnd, total);
      }
      plain.forEach(function (k, p) {
        var lv = levelOf[p], phase = lv.slot / lv.of * Math.PI * 2 + lv.level * 0.7, w = 9.5 - lv.level * 0.45;
        // let go when it next swings to the front-outer side (θ ≈ -π/4 + 2πn), within a third of a turn
        var th = phase + w * FLING, wait = ((Math.PI * 1.75 - th) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / w;
        ride(k, lv.level, phase, null, lv.level * 0.06, FLING + Math.min(wait, 0.3), false, p);
      });
      // the eye: the first word stacked up the middle, flung a beat after the rest
      word.forEach(function (k, n) {
        ride(k, (n + 0.5) * (L - 0.5) / word.length, n * 1.3, sp * 0.12, 0.1 + n * 0.04, FLING + 0.22 + n * 0.04, true, n);
      });
      sfx(0, function (when, S) { S.wind(when, FLING + 0.5); S.whirr(when + 0.1, FLING + 0.1); });
      sfx(FLING, function (when, S) { S.whoosh(when, 0.6); });
      return a;
    } },
  { id: "drone", name: "Drone delivery", icon: "🚁", premium: true,
    // Box-built quadcopters deliver the puzzle: an orange body box with four little rotor boxes
    // spinning, buzzing. Word by word, a drone flies in from an edge with that word's boxes
    // clamped beneath it (swinging a little, the drone tilting into its flight), hovers over the
    // word's spot, drops the boxes into place with a clunk, and zips off; the next one is already
    // on its way. The first word comes on the last trip: that drone's rotors spin off and fly
    // away, and its orange body settles onto box 1 as the cursor's ring.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var IN = 0.65, HOVER = 0.45, DROP = 0.25, OUT = 0.55, bodySz = g.size * 0.7, CLAMP = bodySz * 0.5 + g.size * 1.1; // the word hangs on an (unseen) rope
      var EVERY = HOVER + DROP + 0.25; // overlapping: the next flies in while this one hovers; the drops still come one at a time
      var order = g.words.map(function (w, wi) { return wi; }).slice(1).concat([0]);
      var trips = [], t = 0, n = 0;
      order.forEach(function (wi) {
        var w = g.words[wi], mine = w.cells.filter(function (k) { return g.cells[k].owner === wi; });
        if (!mine.length) return;
        var xs = mine.map(function (k) { return g.cells[k].c * step + half; }), ys = mine.map(function (k) { return g.cells[k].r * step + half; });
        var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, top = Math.min.apply(null, ys) - half;
        var last = wi === 0, hover = { x: cx, y: top - CLAMP - g.size * 0.6 }; // payload hangs just above its spot
        var side = n % 3, from = side === 0 ? { x: -g.size * 3, y: hover.y - g.size * 2 } : side === 1 ? { x: W + g.size * 3, y: hover.y - g.size * 2 } : { x: hover.x + g.size * 2, y: -g.size * 4 };
        var to = side === 0 ? { x: W + g.size * 3, y: -g.size * 3 } : { x: -g.size * 3, y: -g.size * 3 };
        trips.push({ wi: wi, mine: mine, t0: t, t1: t + IN, t2: t + IN + HOVER, t3: t + IN + HOVER + OUT, from: from, hover: hover, to: to, cx: cx, top: top, last: last });
        t += EVERY; n++;
      });
      // the drone's place and tilt at time tt on its trip
      function path(tr, tt) { // where the drone means to be
        if (tt <= tr.t1) { var u = Math.max(0, (tt - tr.t0) / IN), e = 1 - Math.pow(1 - u, 3);
          return { x: tr.from.x + (tr.hover.x - tr.from.x) * e, y: tr.from.y + (tr.hover.y - tr.from.y) * e + Math.sin(tt * 9) * 2, tilt: (tr.hover.x > tr.from.x ? 14 : -14) * (1 - u) }; }
        if (tt <= tr.t2 || tr.last) return { x: tr.hover.x, y: tr.hover.y + Math.sin(tt * 9) * 2, tilt: 0 };
        var v = Math.min(1, (tt - tr.t2) / OUT), e2 = v * v;
        return { x: tr.hover.x + (tr.to.x - tr.hover.x) * e2, y: tr.hover.y + (tr.to.y - tr.hover.y) * e2, tilt: (tr.to.x > tr.hover.x ? 18 : -18) * Math.min(1, v * 3) };
      }
      // the load swings like a pendulum on its rope: it lags as the drone speeds up, swings on
      // when it stops, and settles (simulated: the drone's sideways acceleration drives it)
      // the load swings like a pendulum on its rope, and the drone keeps trying to get back over
      // it, too hard: it darts toward the swing, overshoots, and the two wobble together until they
      // settle (simulated: the drone's acceleration drives the swing; the swing pulls the drone)
      var DT = 1 / 120;
      trips.forEach(function (tr) {
        var Lr = CLAMP + g.size, phi = 0, w = 0, c = 0, vc = 0, cAcc = 0, tt = tr.t0, prevX = path(tr, tt).x, prevV = 0;
        tr.swing = []; tr.corr = []; tr.cAcc = [];
        for (; tt <= tr.t2 + 0.001; tt += DT) {
          var x = path(tr, tt).x, v = (x - prevX) / DT, acc = (v - prevV) / DT; prevX = x; prevV = v;
          var alpha = -(2600 / Lr) * Math.sin(phi) - ((acc + cAcc) / Lr) * Math.cos(phi) - 1.0 * w;
          w += alpha * DT; phi = Math.max(-0.7, Math.min(0.7, phi + w * DT));
          cAcc = 150 * Lr * Math.sin(phi) - 2.0 * vc; // chasing the load, under-damped: it overshoots
          vc += cAcc * DT; c = Math.max(-g.size * 1.2, Math.min(g.size * 1.2, c + vc * DT));
          tr.swing.push(phi); tr.corr.push(c); tr.cAcc.push(cAcc);
        }
      });
      function at120(arr, tr, tt) { var i = Math.round((tt - tr.t0) * 120); return arr[Math.max(0, Math.min(arr.length - 1, i))]; }
      function swingAt(tr, tt) { return at120(tr.swing, tr, tt); }
      function drone(tr, tt) { // where it is: its path, plus its (over)corrections, which die away once the load is dropped
        var p = path(tr, tt), c = at120(tr.corr, tr, tt), ca = at120(tr.cAcc, tr, tt);
        if (tt > tr.t2) { var k = Math.exp(-(tt - tr.t2) * 5), osc = Math.cos((tt - tr.t2) * 14); c *= k * osc; ca *= k; }
        return { x: p.x + c, y: p.y, tilt: p.tilt + Math.max(-22, Math.min(22, ca * 0.012)) };
      }
      var cur = g.order.map(function (k) { return g.cells[k]; }).filter(function (o) { return o.cursor; })[0] || g.cells[g.order[0]];
      var home = { x: cur.c * step + half, y: cur.r * step + half }, landEnd = 0;
      trips.forEach(function (tr, ti) {
        // the payload: the word's boxes clamped beneath, swinging a little, dropped at t2
        tr.mine.forEach(function (k, j) {
          var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, ox = fx - tr.cx, oy = fy - tr.top + CLAMP; // where it rides, from the drone's middle
          var total = tr.t2 + DROP, kf = [];
          kf.push({ transform: "translate(" + (tr.from.x + ox - fx) + "px," + (tr.from.y + oy - fy) + "px)", opacity: 0, offset: 0 });
          for (var tt = tr.t0; tt <= tr.t2 + 0.001; tt += 0.04) {
            var d = drone(tr, tt), rad = swingAt(tr, tt), sw = rad * 180 / Math.PI;
            var rx = ox * Math.cos(rad) - oy * Math.sin(rad), ry = ox * Math.sin(rad) + oy * Math.cos(rad);
            kf.push({ transform: "translate(" + (d.x + rx - fx) + "px," + (d.y + ry - fy) + "px) rotate(" + sw + "deg)", opacity: tt - tr.t0 < 0.03 ? 0 : 1, zIndex: 3, offset: tt / total }); // unseen until its drone sets off
          }
          kf.push({ transform: "translate(0,3px) scale(1.1,.86)", opacity: 1, zIndex: 1, offset: (tr.t2 + DROP * 0.8) / total, easing: "ease-out" });
          kf.push({ transform: "translate(0,0) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
          kf[kf.length - 3].easing = "ease-in"; // released: it drops
          a[k] = { kf: kf, delay: 0, dur: total, ease: "linear" };
          if (j % 2 === 0) sfx(tr.t2 + DROP * 0.8, function (when, S) { S.clunk(when, j + ti); });
          landEnd = Math.max(landEnd, total);
        });
        // the drone itself: a body box and four rotor boxes, a page piece that comes and goes
        g.at(tr.t0, function () {
          var box = document.createElement("div"); box.className = "entrance-cannon"; box.style.left = "0px"; box.style.top = "0px"; box.style.zIndex = 6;
          var body = document.createElement("div"); body.className = "entrance-blk"; body.style.width = body.style.height = bodySz + "px"; body.style.left = -bodySz / 2 + "px"; body.style.top = -bodySz / 2 + "px";
          box.appendChild(body);
          // the rotors: flat squares spinning level at the body's top corners, tipped toward you
          // enough to see they're squares, turning slowly enough to follow
          var rot = bodySz * 0.72, rots = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (q) {
            var px = q[0] * bodySz * (q[1] < 0 ? 0.42 : 0.62), py = -bodySz * (q[1] < 0 ? 0.78 : 0.6); // the back pair higher and further in
            var r = document.createElement("div"); r.className = "entrance-blk"; r.style.width = r.style.height = rot + "px";
            r.style.left = (px - rot / 2) + "px"; r.style.top = (py - rot / 2) + "px"; r.style.zIndex = q[1] < 0 ? 0 : 2;
            box.appendChild(r); return { el: r, q: q };
          });
          g.board.appendChild(box);
          var end = tr.last ? landEnd + 0.7 : tr.t3, dur = end - tr.t0, kf = [];
          for (var tt = tr.t0; tt <= end + 0.001; tt += 0.04) {
            var d = drone(tr, tt), settle = tr.last && tt > tr.t2 ? Math.min(1, (tt - tr.t2 - DROP) / 0.55) : 0, e = settle * settle * (3 - 2 * settle);
            var x = d.x + (home.x - d.x) * e, y = d.y + (home.y - d.y) * e;
            kf.push({ transform: "translate(" + x + "px," + y + "px) rotate(" + d.tilt + "deg)", opacity: tt === tr.t0 ? 0 : 1, offset: (tt - tr.t0) / dur });
          }
          kf[kf.length - 1].offset = 1;
          var out = [box.animate(kf, { duration: dur * 1000, easing: "linear" })];
          out[0].onfinish = out[0].oncancel = function () { box.remove(); };
          var TILT = "rotateX(58deg) ", SPIN = 420; // degrees a second
          rots.forEach(function (r) { // spinning level; on the last trip they spin off and fly away
            var dirSpin = r.q[0] * r.q[1] > 0 ? 1 : -1, spinKf = [{ transform: TILT + "rotate(0deg)", opacity: 1, offset: 0 }];
            if (tr.last) {
              var off = (tr.t2 + DROP - tr.t0) / dur, away = "translate(" + r.q[0] * g.size * 3 + "px," + (-g.size * 4) + "px) ";
              spinKf.push({ transform: TILT + "rotate(" + dirSpin * SPIN * off * dur + "deg)", opacity: 1, offset: off });
              spinKf.push({ transform: away + TILT + "rotate(" + dirSpin * SPIN * dur + "deg) scale(.5)", opacity: 0, offset: Math.min(1, off + 0.5 / dur) });
              spinKf.push({ transform: away + TILT + "rotate(0deg)", opacity: 0, offset: 1 });
            } else spinKf.push({ transform: TILT + "rotate(" + dirSpin * SPIN * dur + "deg)", opacity: 1, offset: 1 });
            out.push(r.el.animate(spinKf, { duration: dur * 1000, easing: "linear" }));
          });
          if (tr.last) out.push(body.animate([{ transform: "scale(1)" }, { transform: "scale(1)", offset: (tr.t2 + DROP + 0.3 - tr.t0) / dur }, { transform: "scale(" + g.size / bodySz + ")" }], { duration: dur * 1000, easing: "ease-in-out" }));
          return out;
        });
        sfx(tr.t0, function (when, S) { S.rotor(when, (tr.last ? tr.t2 + DROP + 0.4 : tr.t3) - tr.t0); });
      });
      var lastTrip = trips[trips.length - 1], fin = landEnd + 0.7;
      ringOn(g, fin, sfx, false);
      sfx(fin - 0.02, function (when, S) { S.clickin(when); });
      return a;
    } },
  { id: "wave", name: "Wave", icon: "🌊", premium: false,
    // An ocean of plain boxes rolls in from the left as a curling wave, the shape of the 🌊: a
    // body sloping up behind a tall crest whose lip curls forward and down round a hollow barrel,
    // big boxes overlapping and tumbling in it, the puzzle's own boxes carried along in it too.
    // As it rolls past each one's place it sets it down there, left behind like things on a
    // beach, and the wave rolls off to the right. Surf, a crash, foam fizzing.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      var ws = Math.max(g.size * 0.95, Math.sqrt((W + g.size * 4) * (H + g.size) / 130)), box = ws * 1.15; // big boxes, overlapping
      var Hc = Math.max(H * 0.95, g.size * 5), R = Hc * 0.42, T = ws * 1.6, Lb = Math.max(W * 0.55, R * 2.2), ROLL = 2.6, DRAIN = 0.6;
      var X0 = -R * 2.4, X1 = W + R * 2.6 + ws, END = ROLL + DRAIN + 0.4;
      var sm = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
      function xc(t) { return X0 + (X1 - X0) * Math.min(1, Math.max(0, t / ROLL)); } // where the crest is
      function passed(x) { return Math.max(0, Math.min(ROLL, (x - X0) / (X1 - X0) * ROLL)); } // when the crest passes x
      // how deep in the water a point is (in boxes; > 0 is under): the 🌊 shape plus the flood draining behind it
      function depth(x, y, t) {
        var X = x - xc(t), h = H - y, best = -9;
        if (X <= 0) { // the body, sloping up to the crest from behind (it sinks away as the crest moves on)
          var body = X > -Lb ? (Hc - R * 0.3) * Math.pow(1 - Math.pow(X / Lb, 2), 1.4) : 0;
          best = (body - h) / ws;
        }
        var cx = xc(t) + R * 0.35, cy = Hc - R, dx = x - cx, dy = h - cy, ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang > -120 || dx < 0) best = Math.max(best, (T / 2 - Math.abs(Math.hypot(dx, dy) - R)) / ws); // the curling lip, round the barrel
        if (X > 0 && X < R * 2) best = Math.max(best, (ws * 0.7 - h) / ws); // foam running ahead at the foot
        return best;
      }
      // the puzzle's boxes: carried in the wave, tumbling just behind the crest at their own
      // height, and set down in their places as the wave rolls on past them
      g.order.forEach(function (key) {
        var o = g.cells[key], fx = o.c * step + half, fy = o.r * step + half, k = R * (0.3 + Math.random() * 0.35), ph = Math.random() * 6;
        var spin = (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 200), tDep = ROLL;
        for (var q = 0; q <= 400; q++) { var tq = q / 400 * ROLL; if (xc(tq) - k >= fx) { tDep = tq; break; } }
        var SET = 0.4, total = tDep + SET, kf = [], rot = 0;
        for (var t = 0; t <= tDep + 0.001; t += 0.04) {
          var x = xc(t) - k + Math.sin(t * 3 + ph) * ws * 0.2, y = fy - ws * 0.4 * Math.sin(Math.min(1, t / tDep) * Math.PI) + Math.sin(t * 4 + ph) * ws * 0.15;
          rot = spin * t;
          kf.push({ transform: "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(.9)", opacity: x < -g.size ? 0 : 1, zIndex: 4, offset: t / total });
        }
        var endRot = Math.round(rot / 360) * 360; // lands upright
        kf.push({ transform: "translate(0,3px) rotate(" + endRot + "deg) scale(1.08,.9)", opacity: 1, zIndex: 1, offset: (tDep + SET * 0.75) / total, easing: "ease-out" });
        kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1)", opacity: 1, zIndex: 1, offset: 1 });
        kf[kf.length - 3].easing = "cubic-bezier(.3,0,.5,1)"; // set down as the water rolls on
        a[key] = { kf: kf, delay: 0, dur: total, ease: "linear" };
      });
      // the sea: a grid of big plain boxes, each showing while it's in the water, churning; faster in the curl
      var cols = Math.ceil((W + g.size * 4) / ws), rows = Math.ceil((Hc + ws) / ws);
      g.at(0, function () {
        var anims = [];
        for (var ci = 0; ci < cols; ci++) for (var ri = 0; ri < rows; ri++) {
          var x = -g.size * 2 + (ci + 0.5) * ws, y = H - (ri + 0.5) * ws, ph = Math.random() * 6, spin = (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 200), kf = [], rot = 0, prev = 0;
          var d = document.createElement("div"); d.className = "entrance-decoy";
          d.style.width = d.style.height = box + "px"; d.style.left = (x - box / 2) + "px"; d.style.top = (y - box / 2) + "px";
          g.board.appendChild(d);
          for (var t = 0; t <= END + 0.001; t += 0.05) {
            var dep = depth(x, y, t), op = Math.max(0, Math.min(1, dep + 0.6)), near = Math.abs(x - xc(t)) < R * 1.6 ? 2.2 : 1;
            rot += spin * near * (t - prev); prev = t;
            var dx = Math.sin(t * 3 + ph) * ws * 0.15 + (near > 1 ? ws * 0.25 : 0), dy = Math.sin(t * 4 + ph) * ws * 0.12;
            kf.push({ transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg)", opacity: op, offset: t / END });
          }
          kf[kf.length - 1].offset = 1;
          var an = d.animate(kf, { duration: END * 1000, easing: "linear" });
          (function (el) { an.onfinish = an.oncancel = function () { el.remove(); }; })(d);
          anims.push(an);
        }
        return anims;
      });
      sfx(0, function (when, S) { S.surf(when, ROLL * 0.55); });
      sfx(ROLL * 0.45, function (when, S) { S.crash(when); });
      sfx(ROLL * 0.5, function (when, S) { S.fizz(when, ROLL * 0.5 + DRAIN + 0.4); });
      return a;
    } },
  { id: "truck", name: "Monster truck", icon: "🛻", premium: true,
    // A monster truck made of the puzzle's boxes (the first word's colored boxes are the cab) on
    // two big square wheels roars in from the left and up a mound of plain blocks, launches,
    // goes half over in a backflip and crashes on its roof: everything, truck, wheels and mound,
    // blasts up into the air. On the way down each of the puzzle's boxes lands in its place,
    // bouncing or stopping dead; the plain blocks fall away. An engine revving, a crash, knocks.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      // Long enough to carry every box: a chassis L boxes long, a 2×2 cab at the front, and a
      // heap of cargo in the bed, up to three rows narrowing upward.
      var n = g.order.length, L = 6;
      while (L + 4 + (L - 2) + (L - 3) + (L - 4) < n) L++;
      var u = Math.max(10, Math.min(g.size * 0.62, W * 0.4 / L)), sc = u / g.size, gy = H, DUR = 7;
      var T1 = 1.5, T2 = 2.25, T3 = 3.3; // reaches the mound, launches, crashes (seconds)
      // The truck, in its own frame: x forward, y up negative; the axles at y = 0.
      var Rw = u * 1.05, AX = u * (L / 2 - 1.1), base = -(Rw * 0.55 + u * 0.5), slots = [];
      function row(r, from, count) { for (var j = 0; j < count; j++) slots.push({ x: (from + j - (L - 1) / 2) * u, y: base - r * u, cab: false }); }
      row(0, 0, L);                                                     // chassis
      [[1, L - 2], [1, L - 1], [2, L - 2], [2, L - 1]].forEach(function (p) { slots.push({ x: (p[1] - (L - 1) / 2) * u, y: base - p[0] * u, cab: true }); }); // cab, at the front
      row(1, 0, L - 2); row(2, 0.5, L - 3); row(3, 1, L - 4);           // cargo heaped in the bed
      var cabFirst = slots.map(function (s, i) { return i; }).slice(0, g.order.length);
      cabFirst.sort(function (x, y) { return (slots[y].cab - slots[x].cab) || x - y; }); // the first word in the cab
      var where = {}, wordK = firstWord(g), rest = others(g);
      wordK.forEach(function (k, i) { where[k] = slots[cabFirst[i]]; });
      cabFirst.slice(wordK.length).forEach(function (si, i) { where[rest[i]] = slots[si]; });
      var top = Math.min.apply(null, g.order.map(function (k) { return where[k].y; })) - u * 0.5; // the truck's highest point
      // The mound: a staircase of plain blocks, steepest at the lip.
      var rb = u * 1.1, HS = [1, 2, 3, 4], X0 = Math.max(u * L * 0.55, Math.min(W * 0.28, W - u * (L + 6))), X1 = X0 + HS.length * rb, HR = HS.length * rb;
      var theta = Math.atan2(HR, X1 - X0) * 180 / Math.PI;
      var XL = Math.min(X1 + u * L * 0.6, W - u * L * 0.45), YL = gy + top; // the axles' spot as it lands on its roof
      var xIn = -u * L * 0.6, peak = Math.min(H * 0.45, u * 4);
      var sm = function (v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      function truck(t) { // the axles' midpoint, the truck's turn, and how far the wheels have rolled
        var x, y, rot, roll;
        if (t <= T1) { var q = t / T1; x = xIn + (X0 - AX - xIn) * (q * 0.7 + 0.3 * q * q); y = gy - Rw - Math.abs(Math.sin(t * 9)) * u * 0.12; rot = Math.sin(t * 7) * 2; }
        else if (t <= T2) { var c = (t - T1) / (T2 - T1); x = X0 - AX + (X1 - X0 + AX) * c; var s = HR * Math.max(0, Math.min(1, (x - X0) / (X1 - X0))); y = gy - Rw - s; rot = -theta * sm(c * 2.5); }
        else if (t <= T3) { var f = (t - T2) / (T3 - T2); x = X1 + (XL - X1) * f; y = (gy - Rw - HR) + (YL - (gy - Rw - HR)) * f - 4 * peak * f * (1 - f); rot = -theta + (-180 + theta) * (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2); }
        else { x = XL; y = YL; rot = -180; }
        roll = (Math.min(t, T2) * 1.0 + Math.max(0, Math.min(t, T3) - T2) * 0.6) * 520; // wheel spin, slower in the air
        return { x: x, y: y, rot: rot, roll: roll };
      }
      function place(p, lx, ly) { var r = p.rot * Math.PI / 180; return { x: p.x + lx * Math.cos(r) - ly * Math.sin(r), y: p.y + lx * Math.sin(r) + ly * Math.cos(r) }; }
      var frames = []; for (var t = 0; t < T3; t += 1 / 30) frames.push(t); frames.push(T3);
      var G = 2400 * u / 25;
      // The puzzle's boxes: ride in the truck, blast up at the crash, and come down in their places.
      g.order.forEach(function (k, i) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, s = where[k], kf = [];
        function T(x, y, rot, sx, sy) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + sx + "," + (sy || sx) + ")"; }
        frames.forEach(function (t) { var p = truck(t), w = place(p, s.x, s.y); kf.push({ transform: T(w.x, w.y, p.rot, sc), zIndex: 3, offset: t / DUR }); });
        var p0 = place(truck(T3), s.x, s.y), land = Math.min(DUR - 0.55, T3 + 1.0 + Math.random() * 1.6), apexT = T3 + (land - T3) * (0.38 + Math.random() * 0.12);
        var ax = p0.x + (fx - p0.x) * 0.5 + (Math.random() - 0.5) * u * 3, ay = Math.max(-H * 0.7, Math.min(p0.y, fy) - H * (0.35 + Math.random() * 0.45));
        var spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540), endRot = Math.round((-180 + spin) / 360) * 360;
        kf[kf.length - 1].easing = "cubic-bezier(.2,.6,.4,1)"; // flung up, slowing
        kf.push({ transform: T(ax, ay, -180 + spin * 0.5, 0.85), zIndex: 3, offset: apexT / DUR, easing: "cubic-bezier(.55,0,.9,.6)" }); // then falling
        if (Math.random() < 0.5) { // bounces
          kf.push({ transform: T(fx, fy, endRot, 1.12, 0.84), zIndex: 1, offset: land / DUR, easing: "cubic-bezier(.2,.7,.4,1)" });
          kf.push({ transform: T(fx, fy - g.size * 0.55, endRot, 1), zIndex: 1, offset: (land + 0.18) / DUR, easing: "cubic-bezier(.6,0,.9,.5)" });
          kf.push({ transform: T(fx, fy, endRot, 1.06, 0.92), zIndex: 1, offset: (land + 0.34) / DUR, easing: "ease-out" });
          sfx(land, function (when, S) { S.clunk(when, i); });
          sfx(land + 0.34, function (when, S) { S.knock(when, i); });
        } else { // stops dead
          kf.push({ transform: T(fx, fy, endRot, 1.08, 0.9), zIndex: 1, offset: land / DUR, easing: "ease-out" });
          sfx(land, function (when, S) { S.knock(when, i + 3); });
        }
        kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1)", zIndex: 1, offset: Math.min(1, (land + 0.5) / DUR) });
        if (kf[kf.length - 1].offset < 1) kf.push({ transform: "translate(0,0) rotate(" + endRot + "deg) scale(1)", zIndex: 1, offset: 1 });
        a[k] = { kf: kf, delay: 0, dur: DUR, ease: "linear" };
      });
      // Plain blocks (the wheels and the mound): `path(t)` until the crash, then flung up and
      // falling away out of the board, fading.
      function block(sizePx, color, z, path, push) {
        var d = document.createElement("div"); d.className = "entrance-decoy";
        d.style.width = d.style.height = sizePx + "px"; d.style.left = d.style.top = "0px"; d.style.zIndex = z;
        if (color) { d.style.background = color; d.style.borderColor = color; }
        var kf = [], M = function (x, y, rot, op) { return { transform: "translate(" + (x - sizePx / 2) + "px," + (y - sizePx / 2) + "px) rotate(" + rot + "deg)", opacity: op }; };
        frames.forEach(function (t) { var p = path(t); kf.push(Object.assign(M(p.x, p.y, p.rot, t < 0.12 ? t / 0.12 : 1), { offset: t / DUR })); });
        var p0 = path(T3), x = p0.x, y = p0.y, rot = p0.rot, vx = push.vx, vy = push.vy, vr = (Math.random() - 0.5) * 900;
        for (var tt = T3 + 1 / 30; tt <= DUR; tt += 1 / 30) {
          vy += G / 30; x += vx / 30; y += vy / 30; rot += vr / 30;
          var op = Math.max(0, Math.min(1, (H + g.size - y) / g.size, (DUR - 0.3 - tt) / 0.6));
          kf.push(Object.assign(M(x, y, rot, op), { offset: tt / DUR }));
        }
        kf[kf.length - 1].offset = 1;
        g.board.appendChild(d);
        var an = d.animate(kf, { duration: DUR * 1000, easing: "linear", fill: "forwards" });
        an.onfinish = an.oncancel = function () { d.remove(); };
        return an;
      }
      g.at(0, function () {
        var anims = [], tire = g.plain.edge;
        [-1, 1].forEach(function (sgn) {
          anims.push(block(Rw * 2, tire, 4, function (t) { var p = truck(t), w = place(p, sgn * AX, 0); return { x: w.x, y: w.y, rot: p.rot + p.roll }; },
            { vx: sgn * (150 + Math.random() * 200), vy: -(900 + Math.random() * 400) * u / 25 }));
        });
        HS.forEach(function (h, ci) {
          for (var r = 0; r < h; r++) (function (bx, by) {
            anims.push(block(rb, null, 2, function () { return { x: bx, y: by, rot: 0 }; },
              { vx: (bx - XL) * 1.2 + (Math.random() - 0.5) * 300, vy: -(500 + Math.random() * 700) * u / 25 }));
          })(X0 + (ci + 0.5) * rb, gy - (r + 0.5) * rb);
        });
        return anims;
      });
      g.at(T3, function () { return shake(g.board, 5); });
      sfx(0, function (when, S) { S.engine(when, [[0, 52], [T1 * 0.6, 78], [T1, 70], [T2, 150], [T2 + 0.3, 135], [T3, 118]]); });
      sfx(T1, function (when, S) { S.thump(when); });
      sfx(T2, function (when, S) { S.whoosh(when, T3 - T2); });
      sfx(T3, function (when, S) { S.crash(when); });
      sfx(T3 + 0.02, function (when, S) { S.stomp(when, 0); });
      return a;
    } },
  { id: "cat", name: "Block cat", icon: "🐈", premium: true,
    // A cat made of blocks near the size of the puzzle's (a wide 3×2 face with big pointed ears
    // at its corners, amber eyes with dark pupils and a diamond nose, a short body, legs, and a
    // tail held up with a curl at the tip) trots in along the bottom of the board to a heap of
    // the puzzle's boxes, shrunk small. It wiggles its rear end with a "mrrp", sits up, and
    // bats them off the top of the heap with a paw, one swipe at a time, each spinning up in an arc into its place; the first word's
    // boxes go last, in one big swat. Then it sits, purrs, and trots off. Paw pats, flicks, a
    // tap as each box lands.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2;
      // The cat may use the whole puzzle card's width, not just the board's (it's usually wider),
      // so its blocks stay close to the puzzle's size.
      var card = g.board.parentElement, padL = card ? Math.max(0, g.board.offsetLeft - 8) : 0;
      var room = card ? Math.max(W, card.clientWidth - 16) : W, padR = Math.max(0, room - W - padL);
      var n = g.order.length, cw = Math.max(3, Math.ceil(Math.sqrt(n * 1.6))); // the heap's bottom row
      var u = Math.max(10, Math.min(g.size * 0.8, room / (4.6 + 2.9 + cw * 0.75 + 0.3))), floor = H, F = 1 / 30;
      // The heap: the puzzle's boxes small, stacked in a pyramid; the first to be batted on top.
      var hs = Math.max(10, Math.min(g.size * 0.6, u * 0.75)), sc = hs / g.size;
      var batOrder = others(g).concat(firstWord(g));
      var CX = Math.max(u * 4.6 - padL, Math.min(W + padR - cw * hs - u * 3.0, W * 0.3)); // where the cat's front paw stands (its tail on the card)
      var HX = CX + u * 2.9;                                                  // the heap's left edge
      var slots = [], row = 0, left = n;
      while (left > 0) { var count = Math.min(left, Math.max(1, cw - row)); for (var j = 0; j < count; j++) slots.push({ x: HX + (row * 0.5 + j + 0.5) * hs, y: floor - (row + 0.5) * hs * 0.98 }); left -= count; row++; }
      var heapAt = {}; batOrder.slice().reverse().forEach(function (k, i) { heapAt[k] = slots[i]; }); // last batted at the bottom
      // Timing: trot in, wiggle, swat, sit and purr, trot off.
      var TW = 1.1, TG = TW + 0.55, SW = 0.26, FLY = 0.55;
      var rest = batOrder.length - firstWord(g).length, per = Math.max(1, Math.ceil(rest / 11)), swats = [];
      for (var b = 0; b < rest; b += per) swats.push(batOrder.slice(b, Math.min(rest, b + per)));
      swats.push(firstWord(g));
      var TB = TG + 0.1, TS = TB + swats.length * SW + FLY + 0.15, TE = TS + 1.0, DUR = TE + 0.95;
      var swatAt = function (i) { return TB + i * SW + (i === swats.length - 1 ? 0.15 : 0); }; // a beat before the big one
      // The cat's pose at time t: where its front-floor point is, which way it faces, and how
      // each part sits. Parts in cat units (u), x forward, y up negative from the floor.
      var parts = [];
      // w, h: a part's size in units (s for a square); z: drawn above (2) or behind (0) the rest.
      function part(x, y, s, kind, extra) { parts.push(Object.assign({ x: x, y: y, w: s, h: s, kind: kind, z: 1 }, extra || {})); }
      [-3.2, -2.5].forEach(function (x) { part(x, -0.45, 0.85, "back"); });
      part(-1.15, -0.45, 0.85, "leg"); part(-0.5, -0.45, 0.85, "paw", { z: 2 });
      [-3, -2, -1].forEach(function (x, i) { part(x, -1.35, 1, i < 1 ? "rear" : "body"); part(x, -2.35, 1, i < 1 ? "rear" : "body"); });
      part(-0.4, -1.85, 0.9, "body");                                                                        // chest
      [-0.2, 0.8, 1.8].forEach(function (x) { part(x, -2.75, 1, "head", { z: 2 }); part(x, -3.75, 1, "head", { z: 2 }); }); // a wide face
      part(0.05, -4.2, 1, "head", { rot: -10, ear: true, z: 0 }); part(1.55, -4.2, 1, "head", { rot: 10, ear: true, z: 0 }); // ears: tall sharp points, half behind the head
      part(-0.95, -2.85, 0.6, "head", { z: 1 }); part(2.55, -2.85, 0.6, "head", { z: 1 });                     // puffed cheeks
      [0.3, 1.3].forEach(function (x) {                                                                          // amber eyes, low, with upright pupils
        part(x, -3.3, 0.55, "head", { eyeColor: true, z: 3 });
        part(x, -3.3, 0, "head", { w: 0.16, h: 0.38, ink: true, z: 4 });
      });
      part(0.8, -2.85, 0.24, "head", { ink: true, z: 3, rot: 45 });                                              // a small nose, just below
      [-0.1, 0.1].forEach(function (dy, wi) {                                                                    // whiskers: dotted lines of tiny blocks
        for (var dj = 0; dj < 3; dj++) {
          part(1.65 + dj * 0.28, -2.75 + dy * (1 + dj * 0.6), 0.11, "head", { ink: true, z: 4 });
          part(-0.05 - dj * 0.28, -2.75 + dy * (1 + dj * 0.6), 0.11, "head", { ink: true, z: 4 });
        }
      });
      for (var ti = 0; ti < 7; ti++) part(0, 0, 0.6, "tail", { seg: ti });
      var swipe = function (t) { // 0..1..0 over a swat, else 0
        for (var i = 0; i < swats.length; i++) { var d = (t - swatAt(i) + 0.1) / 0.2; if (d > 0 && d < 1) return Math.sin(Math.PI * d) * (i === swats.length - 1 ? 1.25 : 1); }
        return 0;
      };
      // Sits up to bat: everything but the back legs tips up around its haunch.
      var TSIT = TG + 0.05, SIT = -24, sitAt = function (t) {
        var sm = function (v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
        return SIT * Math.min(sm((t - TSIT) / 0.25), 1 - sm((t - TE + 0.05) / 0.22));
      };
      function turnAbout(x, y, deg) {
        var r = deg * Math.PI / 180, px0 = -3.2 * u, py0 = -0.6 * u, dx = x - px0, dy = y - py0;
        return { x: px0 + dx * Math.cos(r) - dy * Math.sin(r), y: py0 + dx * Math.sin(r) + dy * Math.cos(r) };
      }
      function pose(t, p) {
        var ease = function (v) { v = Math.max(0, Math.min(1, v)); return 1 - Math.pow(1 - v, 2); };
        var startX = -padL - u * 1.5, x0 = t < TW ? startX + (CX - startX) * ease(t / TW) : CX, dir = 1;
        if (t > TE) { dir = -1; x0 = CX - u * 4.5 + (t > TE + 0.15 ? -(t - TE - 0.15) * (W * 0.9 + u * 8) : 0); } // turns, then trots off left
        var trot = t < TW || t > TE + 0.15, bob = trot ? -Math.abs(Math.sin(t * 15)) * u * 0.15 : 0;
        var lx = p.x * u, ly = p.y * u, rot = p.rot || 0, sw = swipe(t);
        if (p.kind === "rear" || p.kind === "back") { if (t > TW && t < TG) lx += Math.sin((t - TW) * 34) * u * 0.18; }
        if (p.kind === "back" || p.kind === "leg") { if (trot) lx += Math.sin(t * 15 + (p.x > -2 ? 0 : Math.PI)) * u * 0.25; }
        if (p.kind === "paw") { if (trot) lx += Math.sin(t * 15 + Math.PI / 2) * u * 0.25; lx += sw * u * 1.7; ly -= sw * u * 1.1; rot -= sw * 50; }
        if (p.kind === "head") { lx += sw * u * 0.25; ly += sw * u * 0.15; if (t > TS && t < TE) ly += u * 0.15; }
        if (p.kind === "body" || p.kind === "rear") { if (t > TS && t < TE && p.kind === "rear") ly += u * 0.35; }
        if (p.kind === "tail") { // held up from the rump, the tip curling forward like a question mark; it sways (more while it purrs)
          var sway = t > TS && t < TE ? 0.16 : 0.09, ang = -1.75, base = turnAbout(-3.6 * u, -2.6 * u, sitAt(t) * 0.5), tx = base.x, ty = base.y;
          if (t > TW && t < TG) tx += Math.sin((t - TW) * 34) * u * 0.18;
          for (var s = 0; s <= p.seg; s++) {
            ang += (s >= 4 ? 0.55 : -0.04) + Math.sin(t * 2.6 - s * 0.5) * sway;
            if (s > 0) { tx += Math.cos(ang) * u * 0.52; ty += Math.sin(ang) * u * 0.52; }
          }
          lx = tx; ly = ty; rot = ang * 180 / Math.PI;
        }
        var sa = p.kind === "back" || p.kind === "tail" ? 0 : sitAt(t);
        if (sa) { // turn about the haunch; the head moves with the neck but stays level, all in one piece
          if (p.kind === "head") { var hc = turnAbout(0.8 * u, -3.25 * u, sa); lx += hc.x - 0.8 * u; ly += hc.y + 3.25 * u; }
          else { var q2 = turnAbout(lx, ly, sa); lx = q2.x; ly = q2.y; rot += sa; }
        }
        return { x: x0 + dir * lx, y: floor + ly + bob, rot: dir * rot, flip: dir };
      }
      var frames = []; for (var t = 0; t < DUR; t += F) frames.push(t); frames.push(DUR);
      var edge = g.plain.edge;
      g.at(0, function () {
        return parts.map(function (p) {
          var d = document.createElement("div"), pw = p.w * u, ph = p.h * u;
          d.className = "entrance-decoy"; d.style.width = pw + "px"; d.style.height = ph + "px"; d.style.left = d.style.top = "0px";
          d.style.zIndex = 3 + p.z;
          if (p.eyeColor) { d.style.background = g.accent; d.style.borderColor = edge; d.style.borderRadius = "4px"; }
          if (p.ink) { d.style.background = edge; d.style.borderColor = edge; d.style.borderWidth = "0"; d.style.borderRadius = "2px"; }
          else if (p.ear) d.style.borderRadius = "2px";
          else if (p.w < 1) d.style.borderRadius = "5px";
          var kf = frames.map(function (t) {
            var q = pose(t, p), op = Math.min(1, t / 0.2, (DUR - t) / 0.25);
            if (t > TE + 0.15) op = Math.min(op, Math.max(0, (q.x + padL + u * 6) / (u * 6)));
            // an ear: a square turned to a diamond, then stretched tall and narrow into a point
            var shape = p.ear ? " scale(0.62,1.35) rotate(45deg)" : "";
            return { transform: "translate(" + (q.x - pw / 2) + "px," + (q.y - ph / 2) + "px) rotate(" + q.rot + "deg)" + shape, opacity: Math.max(0, op), offset: t / DUR };
          });
          var an = d.animate(kf, { duration: DUR * 1000, easing: "linear", fill: "forwards" });
          g.board.appendChild(d);
          an.onfinish = an.oncancel = function () { d.remove(); };
          return an;
        });
      });
      // The puzzle's boxes: in the heap, then batted up in an arc into their places.
      swats.forEach(function (group, si) {
        var th = swatAt(si), big = si === swats.length - 1;
        group.forEach(function (k, j) {
          var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, h = heapAt[k];
          var hit = th + j * (big ? 0.04 : 0.03), land = hit + FLY + Math.random() * 0.12;
          var apexX = (h.x + fx) / 2 + (Math.random() - 0.5) * u, apexY = Math.min(h.y, fy) - H * (0.18 + Math.random() * 0.2) - u;
          var spin = (Math.random() < 0.5 ? -1 : 1) * 360 * (1 + Math.floor(Math.random() * 2));
          var T = function (x, y, rot, sx, sy) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + sx + "," + (sy || sx) + ")"; };
          a[k] = { kf: [
            { transform: T(h.x, h.y, 0, sc), opacity: 0, zIndex: 3, offset: 0 },
            { transform: T(h.x, h.y, 0, sc), opacity: 1, zIndex: 3, offset: 0.2 / DUR },
            { transform: T(h.x, h.y, 0, sc), opacity: 1, zIndex: 3, offset: hit / DUR, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: T(apexX, apexY, spin / 2, (sc + 1) / 2), opacity: 1, zIndex: 3, offset: (hit + (land - hit) * 0.45) / DUR, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: T(fx, fy, spin, 1.12, 0.88), opacity: 1, zIndex: 1, offset: land / DUR, easing: "ease-out" },
            { transform: T(fx, fy, spin, 1), opacity: 1, zIndex: 1, offset: Math.min(1, (land + 0.16) / DUR) },
            { transform: "translate(0,0) rotate(" + spin + "deg) scale(1)", opacity: 1, zIndex: 1, offset: 1 }],
            delay: 0, dur: DUR, ease: "linear" };
          sfx(land, function (when, S) { S.knock(when, j + si); });
        });
        sfx(th, function (when, S) { S.flick(when); S.pat(when + 0.02, si); });
      });
      for (var st = 0.05; st < TW; st += 0.105) (function (at, i) { sfx(at, function (when, S) { S.pat(when, i); }); })(st, Math.round(st * 10));
      sfx(TW + 0.05, function (when, S) { S.mrrp(when); });
      sfx(TS, function (when, S) { S.purr(when, TE - TS + 0.1); });
      for (var et = TE + 0.2; et < DUR - 0.2; et += 0.105) (function (at, i) { sfx(at, function (when, S) { S.pat(when, i); }); })(et, Math.round(et * 10));
      return a;
    } },
  { id: "unicorn", name: "Unicorn", icon: "🦄", premium: false,
    // A unicorn made of blocks (a horse's body and long head, a horn, a mane and tail in the
    // board's colors) gallops in an arch across the puzzle card, low on the left, up over the
    // top and down to the right, laying a rainbow behind it: three stripes of full-size blocks
    // in the board's own colors (the accent, then the two syllable colors, from the color
    // scheme in use). As each stretch of the rainbow fades, the puzzle's boxes float down out of
    // it into their places, the first word's last. Hoof clip-clops, a twinkling run that rises and falls with the arch, a
    // sparkle as each box settles.
    plan: function (g, sfx) {
      var a = {}, step = g.size + g.gap, W = g.cols * step - g.gap, H = g.rows * step - g.gap, half = g.size / 2, F = 1 / 30;
      var root = getComputedStyle(document.documentElement), edge = g.plain.edge;
      // The board's own block colors, as { fill, edge }: the accent, then the two syllable bands.
      var ACC = { fill: root.getPropertyValue("--accent-soft").trim(), edge: g.accent };
      var RB = [ACC, g.band.a, g.band.b];
      // It may use the whole puzzle card's width (like the Block cat).
      var card = g.board.parentElement, padL = card ? Math.max(0, g.board.offsetLeft - 8) : 0;
      var room = card ? Math.max(W, card.clientWidth - 16) : W, padR = Math.max(0, room - W - padL);
      var u = Math.max(10, Math.min(g.size * 0.75, room / 11)), b = g.size, bstep = g.size + g.gap; // unicorn unit (its blocks near the puzzle's size); a rainbow block: a puzzle box
      // The arch: hooves start off the card on the left, peak near the top, end off it on the right.
      var X0 = -padL - u * 4, X1 = W + padR + u * 4, BASE = H - u * 0.3, PEAK = Math.min(u * 6.4, H * 0.62), TT = 3.0;
      function path(p) {
        var x = X0 + (X1 - X0) * p, y = BASE - (BASE - PEAK) * Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
        var dy = -(BASE - PEAK) * Math.PI * Math.cos(Math.PI * Math.max(0, Math.min(1, p))), th = Math.atan2(dy, X1 - X0);
        return { x: x, y: y, th: th };
      }
      function at(pt, lx, ly) { var c = Math.cos(pt.th), s = Math.sin(pt.th); return { x: pt.x + lx * c - ly * s, y: pt.y + lx * s + ly * c }; }
      // The rainbow: every few pixels along the path, six blocks across the band below the
      // hooves, red outermost. Each pops in as the unicorn passes, then fades.
      var HOLD = 1.0, pieces = [], cols = Math.ceil((X1 - X0) * 1.25 / bstep);
      for (var ci = 0; ci <= cols; ci++) {
        var pc = ci / cols, pt = path(pc), tIn = pc * TT;
        for (var si = 0; si < 3; si++) { var q = at(pt, -u * 2.4, (si + 0.5) * bstep); pieces.push({ x: q.x, y: q.y, th: pt.th, color: RB[si], tIn: tIn, tOut: tIn + HOLD + si * 0.05 }); }
      }
      // The puzzle's boxes: each comes out of the middle of the band above (or below) it, as
      // that stretch fades, and floats into its place. The first word's boxes settle last.
      var DUR = 0, wordK = firstWord(g), lastFade = TT + HOLD;
      g.order.forEach(function (k, idx) {
        var o = g.cells[k], fx = o.c * step + half, fy = o.r * step + half, p = (fx + u * 2.4 - X0) / (X1 - X0), pt = path(p);
        var from = at(pt, -u * 2.4, 1.5 * bstep), first = wordK.indexOf(k);
        var start = first >= 0 ? lastFade + 0.25 + first * 0.12 : p * TT + HOLD * 0.75 + Math.random() * 0.25, fl = 0.75 + Math.random() * 0.2, land = start + fl;
        var sway = (Math.random() - 0.5) * u * 1.2;
        var T = function (x, y, rot, sc) { return "translate(" + (x - fx) + "px," + (y - fy) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; };
        a[k] = { kf: [
          { transform: T(from.x, from.y, 0, 0.3), opacity: 0, offset: 0 },
          { transform: T(from.x, from.y, 0, 0.55), opacity: 1, offset: 0.18 },
          { transform: T((from.x + fx) / 2 + sway, (from.y + fy) / 2, (Math.random() - 0.5) * 30, 0.85), opacity: 1, offset: 0.6, easing: "ease-out" },
          { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1, offset: 1 }],
          delay: start, dur: fl, ease: "cubic-bezier(.3,.6,.4,1)" };
        DUR = Math.max(DUR, land);
        sfx(land, function (when, S) { S.bead(when, idx); });
      });
      DUR = Math.max(DUR, lastFade + 0.6);
      // The unicorn, in its own frame: x forward, y up negative from the hooves. Parts in units.
      var parts = [];
      function part(x, y, w, h, extra) { parts.push(Object.assign({ x: x, y: y, w: w, h: h, z: 1, rot: 0 }, extra || {})); }
      [[-1.95, 0], [-1.35, 1], [0.25, 1], [0.85, 0]].forEach(function (l) { part(l[0], -0.75, 0.6, 1.5, { leg: l[1] }); });
      [-1.6, -0.6, 0.4].forEach(function (x) { part(x, -2.0, 1, 1); part(x, -2.95, 1, 1); });
      part(1.1, -3.55, 0.9, 0.9, { rot: -40 }); part(1.55, -4.2, 0.85, 0.85, { rot: -40 });                         // neck
      part(2.05, -4.8, 1.2, 0.85, { rot: 18, z: 2 }); part(2.85, -4.5, 0.8, 0.65, { rot: 18, z: 2 });               // head and muzzle
      part(2.1, -5.0, 0.2, 0.2, { ink: true, z: 3 });                                                                 // eye
      part(1.75, -5.35, 0.5, 0.5, { ear: true, rot: -12, z: 0 });                                                      // ear
      part(2.4, -5.55, 0.55, 0.55, { horn: true, color: ACC, rot: 28, z: 3 });                                        // horn
      [[0.7, -3.4], [1.05, -4.0], [1.35, -4.55], [1.6, -5.05]].forEach(function (m, i) { part(m[0], m[1], 0.6, 0.6, { mane: true, color: RB[i % 3], z: 2 }); }); // mane
      for (var ti = 0; ti < 6; ti++) part(0, 0, 0.6, 0.6, { tail: ti, color: RB[Math.floor(ti / 2) % 3], z: 0 });     // tail
      function pose(t, p) {
        var pp = t / TT, pt = path(pp), bob = -Math.abs(Math.sin(t * 9)) * u * 0.3, lx = p.x * u, ly = p.y * u + bob, rot = p.rot;
        if (p.leg != null) { // gallop: swing about the hip
          var sw = Math.sin(t * 18 + (p.leg ? Math.PI : 0) + (p.x > 0 ? 0.8 : 0)) * 32, r = sw * Math.PI / 180, top = -1.5 * u;
          lx = p.x * u - Math.sin(r) * 0.75 * u; ly = top + Math.cos(r) * 0.75 * u + bob; rot = sw;
        }
        if (p.tail != null) { // a rainbow tail streaming back, rippling
          var ang = Math.PI * 0.92, tx = -2.15 * u, ty = -3.0 * u + bob;
          for (var s = 0; s <= p.tail; s++) { ang += 0.12 + Math.sin(t * 10 - s * 0.9) * 0.22; if (s > 0) { tx += Math.cos(ang) * u * 0.45; ty += Math.sin(ang) * u * 0.45; } }
          lx = tx; ly = ty; rot = ang * 180 / Math.PI;
        }
        if (p.mane) lx += Math.sin(t * 12 + p.y) * u * 0.06; // the mane flutters
        var w = at(pt, lx, ly);
        return { x: w.x, y: w.y, rot: rot + pt.th * 180 / Math.PI };
      }
      var frames = []; for (var t = 0; t < TT + 0.4; t += F) frames.push(t); frames.push(TT + 0.4);
      g.at(0, function () {
        var anims = parts.map(function (p) {
          var d = document.createElement("div"), pw = p.w * u, ph = p.h * u;
          d.className = "entrance-decoy"; d.style.width = pw + "px"; d.style.height = ph + "px"; d.style.left = d.style.top = "0px";
          d.style.zIndex = 4 + p.z;
          if (p.ink) { d.style.background = edge; d.style.borderColor = edge; d.style.borderWidth = "0"; d.style.borderRadius = "2px"; }
          else if (p.color) { d.style.background = p.color.fill; d.style.borderColor = p.color.edge; d.style.borderRadius = p.horn ? "2px" : Math.round(pw * 0.18) + "px"; } // a small block's corners, scaled to its size
          else if (p.ear) d.style.borderRadius = "2px";
          else if (p.w < 1 || p.h < 1) d.style.borderRadius = "5px";
          var shape = p.horn ? " scale(0.45,1.9) rotate(45deg)" : p.ear ? " scale(0.62,1.35) rotate(45deg)" : "";
          var kf = frames.map(function (t) {
            var q = pose(t, p);
            return { transform: "translate(" + (q.x - pw / 2) + "px," + (q.y - ph / 2) + "px) rotate(" + q.rot + "deg)" + shape, offset: t / (TT + 0.4) };
          });
          var an = d.animate(kf, { duration: (TT + 0.4) * 1000, easing: "linear", fill: "forwards" });
          g.board.appendChild(d);
          an.onfinish = an.oncancel = function () { d.remove(); };
          return an;
        });
        return anims;
      });
      // The rainbow's blocks, each on its own: in as the unicorn passes, out as it fades.
      g.at(0, function () {
        return pieces.map(function (r) {
          var d = document.createElement("div");
          d.className = "entrance-decoy"; d.style.width = d.style.height = b + "px"; d.style.left = d.style.top = "0px";
          d.style.background = r.color.fill; d.style.borderColor = r.color.edge; d.style.zIndex = 2;
          var M = "translate(" + (r.x - b / 2) + "px," + (r.y - b / 2) + "px) rotate(" + (r.th * 180 / Math.PI) + "deg) ";
          var end = r.tOut + 0.45;
          var an = d.animate([
            { transform: M + "scale(0)", opacity: 0, offset: 0 },
            { transform: M + "scale(0)", opacity: 0, offset: r.tIn / end },
            { transform: M + "scale(1.15)", opacity: 1, offset: Math.min(1, (r.tIn + 0.12) / end) },
            { transform: M + "scale(1)", opacity: 0.95, offset: Math.min(1, r.tOut / end) },
            { transform: M + "scale(0.4)", opacity: 0, offset: 1 }], { duration: end * 1000, easing: "linear", fill: "forwards" });
          g.board.appendChild(d);
          an.onfinish = an.oncancel = function () { d.remove(); };
          return an;
        });
      });
      for (var hc = 0, ht = 0.05; ht < TT; ht += 0.21, hc++) (function (when, i) { sfx(when, function (w, S) { S.clack(w, i); S.clack(w + 0.07, i + 2); }); })(ht, hc);
      for (var rs = 0; rs <= 14; rs++) (function (i) { // a twinkling run, rising up the arch and falling down it
        var p = i / 14, step = Math.round(Math.sin(Math.PI * p) * 10) + 1;
        sfx(p * TT, function (w, S) { S.run(w, step); });
      })(rs);
      sfx(lastFade + 0.25, function (w, S) { S.chord(w, [523.25, 659.25, 783.99, 1046.5], 0.1); });
      return a;
    } },
  { id: "saucer", name: "Flying saucer", icon: "🛸", premium: true,
    // The boxes assemble into a block flying saucer that swoops in and hovers. A little cannon
    // at the bottom fires: miss, miss, hit! The saucer bursts and its pieces drift slowly into
    // place. A warbly hum, pews, a boom.
    plan: function (g, sfx) {
      var a = {}, W = g.cols * (g.size + g.gap) - g.gap, H = g.rows * (g.size + g.gap) - g.gap, sp = g.size * 0.55, DUR = 6.2, half = g.size / 2;
      var slots = [];
      [-0.5, 0.5].forEach(function (c) { slots.push({ c: c, r: -2 }); });
      [-1.5, -0.5, 0.5, 1.5].forEach(function (c) { slots.push({ c: c, r: -1 }); });
      for (var c1 = -3.5; c1 <= 3.5; c1++) slots.push({ c: c1, r: 0 });
      for (var c2 = -4.5; c2 <= 4.5; c2++) slots.push({ c: c2, r: 1 });
      [-4, -2, 0, 2, 4].forEach(function (c) { slots.push({ c: c, r: 2 }); });
      var keys = firstWord(g).concat(others(g)); // the first word is the dome and its lit windows (the slots start there)
      while (slots.length < keys.length) slots.push({ c: (slots.length % 7) - 3, r: 0 });
      var IN = 0.18, A1 = 0.33, A2 = 0.46, HIT = 0.6, SETTLE = 0.78, halfW = 5 * sp + g.size * 0.3;
      var PTS = [[IN, 0.5], [A1, 0.3], [A2, 0.7], [HIT, 0.5]]; // where the saucer hovers, as a share of the board width
      function center(t) {
        if (t <= IN) { var e = 1 - Math.pow(1 - t / IN, 3); return { x: -0.45 * W + (0.95 * W) * e, y: -0.35 * H + 0.6 * H * e, tilt: -16 * (1 - e) }; }
        for (var i = 1; i < PTS.length; i++) if (t <= PTS[i][0]) {
          var q = (t - PTS[i - 1][0]) / (PTS[i][0] - PTS[i - 1][0]), s = (1 - Math.cos(q * Math.PI)) / 2, dx = PTS[i][1] - PTS[i - 1][1];
          return { x: W * (PTS[i - 1][1] + dx * s), y: 0.25 * H + 0.035 * H * Math.sin(t * 60), tilt: -dx * 40 * Math.sin(q * Math.PI) };
        }
        return { x: W * 0.5, y: 0.25 * H, tilt: 0 };
      }
      function at(s, t) { var c = center(t), r = c.tilt * Math.PI / 180, ux = s.c * sp, uy = s.r * sp; return { x: c.x + ux * Math.cos(r) - uy * Math.sin(r), y: c.y + ux * Math.sin(r) + uy * Math.cos(r), rot: c.tilt }; }
      var hitC = center(HIT), DRAG = 2.4, G = 260 * g.size / 40, DT = 1 / 60;
      keys.forEach(function (k, i) {
        var o = g.cells[k], fx0 = o.c * (g.size + g.gap) + half, fy0 = o.r * (g.size + g.gap) + half, s = slots[i], kf = [];
        function T(x, y, rot, sc) { return "translate(" + (x - fx0) + "px," + (y - fy0) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
        for (var t = 0; t < HIT; t += 0.01) { var p = at(s, t); kf.push({ transform: T(p.x, p.y, p.rot, 0.55), opacity: 1, offset: t }); }
        var p0 = at(s, HIT); kf.push({ transform: T(p0.x, p0.y, 0, 0.55), opacity: 1, offset: HIT });
        var dx = p0.x - hitC.x, dy = p0.y - hitC.y, len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9, sp0 = (520 + Math.random() * 520) * g.size / 40;
        var x = p0.x, y = p0.y, vx = Math.cos(ang) * sp0, vy = Math.sin(ang) * sp0 - 120 * g.size / 40, rot = 0, vr = (Math.random() < 0.5 ? -1 : 1) * (400 + Math.random() * 700), next = 1 / 30;
        for (var tt = DT; tt <= (SETTLE - HIT) * DUR; tt += DT) {
          var dmp = Math.exp(-DRAG * DT); vx *= dmp; vy = vy * dmp + G * DT; vr *= Math.exp(-1.6 * DT);
          x += vx * DT; y += vy * DT; rot += vr * DT;
          if (x < half * 0.6) { x = half * 0.6; vx = Math.abs(vx) * 0.5; } if (x > W - half * 0.6) { x = W - half * 0.6; vx = -Math.abs(vx) * 0.5; }
          if (y < half * 0.6) { y = half * 0.6; vy = Math.abs(vy) * 0.5; } if (y > H - half * 0.6) { y = H - half * 0.6; vy = -Math.abs(vy) * 0.4; }
          if (tt >= next) { kf.push({ transform: T(x, y, rot, 0.55 + 0.2 * (tt / ((SETTLE - HIT) * DUR))), opacity: 1, offset: HIT + tt / DUR }); next += 1 / 30; }
        }
        kf[kf.length - 1].easing = "cubic-bezier(.3,.5,.4,1)"; // drift slowly home
        kf.push({ transform: "translate(0,0) rotate(" + (Math.round(rot / 360) * 360) + "deg) scale(1)", opacity: 1, offset: 1 }); // upright
        a[k] = { kf: kf, delay: 0, dur: DUR, ease: "linear" };
      });
      // The cannon, its shots, the flash: page pieces that come and go.
      var MERGE = 0.74, u = g.size * 0.36, ug = 2, cw = 3 * u + 2 * ug, ch = 2 * u + ug, cy = H - ch, clamp = function (v) { return Math.max(cw / 2, Math.min(W - cw / 2, v)); }; // a blaster of blocks: 3 across, 1 on top
      var shotsAt = [[A1 - 0.05, clamp(center(A1).x + halfW + g.size * 0.7), false], [A2 - 0.05, clamp(center(A2).x - halfW - g.size * 0.7), false], [HIT - 0.05, clamp(hitC.x), true]];
      g.at(DUR * 0.1, function () {
        var c = document.createElement("div"); c.className = "entrance-cannon"; c.style.width = cw + "px"; c.style.height = ch + "px"; c.style.left = "0px"; c.style.top = cy + "px";
        [[0, 1], [1, 1], [2, 1], [1, 0]].forEach(function (q) { var k = document.createElement("div"); k.className = "entrance-blk"; k.style.width = k.style.height = u + "px"; k.style.left = q[0] * (u + ug) + "px"; k.style.top = q[1] * (u + ug) + "px"; c.appendChild(k); });
        g.board.appendChild(c);
        var span = DUR * (MERGE - 0.1), kfc = [{ transform: "translate(" + (W / 2 - cw / 2) + "px," + ch * 2 + "px)", opacity: 0, offset: 0 }, { transform: "translate(" + (W / 2 - cw / 2) + "px,0)", opacity: 1, offset: 0.06 / (MERGE - 0.1) }];
        shotsAt.forEach(function (sh) { var off = (sh[0] - 0.1) / (MERGE - 0.1); kfc.push({ transform: "translate(" + (sh[1] - cw / 2) + "px,0)", opacity: 1, offset: off - 0.05 }); kfc.push({ transform: "translate(" + (sh[1] - cw / 2) + "px,3px)", opacity: 1, offset: off + 0.01 }); kfc.push({ transform: "translate(" + (sh[1] - cw / 2) + "px,0)", opacity: 1, offset: off + 0.03 }); });
        kfc.push({ transform: "translate(" + (shotsAt[2][1] - cw / 2) + "px,0)", opacity: 1, offset: (HIT + 0.06 - 0.1) / (MERGE - 0.1) });
        kfc.push({ transform: "translate(" + (shotsAt[2][1] - cw / 2) + "px,0)", opacity: 1, offset: 1 }); // waits, then its blocks lift off (below)
        var an = c.animate(kfc, { duration: span * 1000, easing: "ease-in-out" }); an.onfinish = an.oncancel = function () { c.remove(); }; return an;
      });
      shotsAt.forEach(function (sh) {
        sfx(DUR * sh[0], function (when, S) { S.pew(when); });
        g.at(DUR * sh[0], function () {
          var b = document.createElement("div"), y0 = cy - u, y1 = sh[2] ? hitC.y + sp * 2 : -u * 3; // a block, fired from the barrel
          b.className = "entrance-shot"; b.style.width = b.style.height = u + "px"; b.style.left = (sh[1] - u / 2) + "px"; b.style.top = y0 + "px"; g.board.appendChild(b);
          var an = b.animate([{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(" + (y1 - y0) + "px) rotate(" + (sh[2] ? 270 : 450) + "deg)" }], { duration: DUR * (sh[2] ? 0.05 : 0.07) * 1000, easing: "linear" });
          an.onfinish = an.oncancel = function () { b.remove(); }; return an;
        });
      });
      g.at(DUR * HIT, function () {
        var f = document.createElement("div"), d = g.size * 3; f.className = "entrance-flash"; f.style.width = f.style.height = d + "px"; f.style.left = (hitC.x - d / 2) + "px"; f.style.top = (hitC.y - d / 2) + "px"; g.board.appendChild(f);
        var an = f.animate([{ transform: "scale(.2)", opacity: 1 }, { transform: "scale(2.2)", opacity: 0 }], { duration: 600, easing: "ease-out" }); an.onfinish = an.oncancel = function () { f.remove(); }; return an;
      });
      // The blaster's blocks lift off, merge into one, and arc over to become word 1's highlight.
      g.at(DUR * MERGE, function () {
        var gx = shotsAt[2][1] - cw / 2, mx = shotsAt[2][1], my = cy - u * 1.6, tgt = g.cells[g.words[0].cells[0]];
        var tx = tgt.c * (g.size + g.gap) + g.size / 2, ty = tgt.r * (g.size + g.gap) + g.size / 2, big = g.size / u, peakY = Math.min(my, ty) - H * 0.22;
        return [[0, 1], [1, 1], [2, 1], [1, 0]].map(function (q) {
          var k = document.createElement("div"), bx = gx + q[0] * (u + ug), by = cy + q[1] * (u + ug), ox = bx + u / 2, oy = by + u / 2;
          k.className = "entrance-blk"; k.style.width = k.style.height = u + "px"; k.style.left = bx + "px"; k.style.top = by + "px"; k.style.zIndex = 5; g.board.appendChild(k);
          function M(x, y, sc, rot) { return "translate(" + (x - ox) + "px," + (y - oy) + "px) rotate(" + rot + "deg) scale(" + sc + ")"; }
          var an = k.animate([
            { transform: M(ox, oy, 1, 0), offset: 0 },
            { transform: M(ox + (q[0] - 1) * u * 0.6, oy - u * 0.8, 1, 0), offset: 0.15 },
            { transform: M(mx, my, 1.3, 90), offset: 0.32, easing: "ease-in-out" },
            { transform: M(mx, my, 1.7, 180), offset: 0.42, easing: "ease-in" },
            { transform: M((mx + tx) / 2, peakY, (1.7 + big) / 2, 270), offset: 0.7, easing: "ease-out" },
            { transform: M(tx, ty, big, 360), offset: 1 }], { duration: DUR * (1 - MERGE) * 1000, easing: "linear" });
          an.onfinish = an.oncancel = function () { k.remove(); }; return an;
        });
      });
      sfx(DUR * (MERGE + (1 - MERGE) * 0.32), function (when, S) { S.zwoop(when, DUR * (1 - MERGE) * 0.6); });
      ringOn(g, DUR, sfx, false); // the blaster's blocks land as the highlight
      sfx(DUR - 0.02, function (when, S) { S.clickin(when); });
      sfx(0, function (when, S) { S.hum(when, DUR * HIT); });
      sfx(DUR * HIT, function (when, S) { S.boom(when); });
      return a;
    } }
];

// The cursor's orange ring comes on at `at` seconds: flickering on like a tube with a zap and a
// note (flicker: Neon only, where it's part of the sign), or with a quick quiet fade (every other
// entrance, at its end; at once where a piece becomes the highlight, as in Billiards). Returns
// when it's done. Plans that place it themselves call it and set g.ringDone; otherwise
// playEntrance does, at the end.
function ringOn(g, at, sfx, flicker) {
  g.ringDone = true;
  var cur = g.order.map(function (k) { return g.cells[k]; }).filter(function (o) { return o.cursor; })[0];
  if (!cur) return at;
  var none = "0 0 0 0 transparent", ring = cur.look.ring;
  var frames = flicker ? [
    { boxShadow: none, offset: 0, easing: "steps(1, end)" }, { boxShadow: ring, offset: 0.15, easing: "steps(1, end)" },
    { boxShadow: none, offset: 0.3, easing: "steps(1, end)" }, { boxShadow: ring, offset: 0.5, easing: "steps(1, end)" },
    { boxShadow: none, offset: 0.6, easing: "steps(1, end)" }, { boxShadow: ring, offset: 0.8 }, { boxShadow: ring, offset: 1 }]
    : [{ boxShadow: none }, { boxShadow: ring }];
  var dur = flicker ? 0.45 : 0.2;
  g.at(at, function () { return cur.el.animate(frames, { duration: dur * 1000, fill: "forwards" }); });
  if (flicker) {
    sfx(at, function (when, S) { S.zap(when, 1); });
    sfx(at + 0.36, function (when, S) { S.tick(when, 9); });
  }
  return at + dur;
}
// The first word's boxes in order, and every other box (shuffled), for plans that give the
// first word a part of its own.
function firstWord(g) { return g.words[0].cells.slice(); }
function others(g) { return shuffle(g.order.filter(function (k) { return !g.cells[k].sel; })); }
function readingOrder(g) { return g.order.slice().sort(function (a, b) { return g.cells[a].r - g.cells[b].r || g.cells[a].c - g.cells[b].c; }); }
// A small jolt of the whole board, as if something landed hard.
function shake(el, px) {
  return el.animate([{ transform: "translate(0,0)" }, { transform: "translate(" + -px + "px," + px + "px)" }, { transform: "translate(" + px + "px," + -px / 2 + "px)" }, { transform: "translate(" + -px / 2 + "px," + px / 2 + "px)" }, { transform: "translate(0,0)" }], { duration: 180, easing: "ease-out" });
}
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
  var g = { board: board, size: size, gap: 4, accent: root.getPropertyValue("--accent").trim(), cols: P.cols, rows: P.rows, cells: {}, order: [], words: [],
    band: { a: { fill: root.getPropertyValue("--sylA").trim(), edge: root.getPropertyValue("--sylA-edge").trim() },
            b: { fill: root.getPropertyValue("--sylB").trim(), edge: root.getPropertyValue("--sylB-edge").trim() } } };
  clueOrder.forEach(function (wi, n) {
    var W = P.words[wi];
    g.words.push({ dir: W.dir, cells: W.cells });
    W.cells.forEach(function (k, j) {
      if (!g.cells[k]) {
        var rc = k.split(",").map(Number);
        var el = board.querySelector('[data-k="' + k + '"]'), cs = null;
        // Its settled look, not partway through .cell's color fade (a new board's first word is
        // still fading in from plain): reading it with the transition off ends the fade.
        if (el) { el.style.transition = "none"; cs = getComputedStyle(el); cs = { backgroundColor: cs.backgroundColor, borderColor: cs.borderColor, boxShadow: cs.boxShadow }; el.style.transition = ""; }
        // `look`: how the box starts the puzzle (its colors and the cursor's ring), read before the
        // entrance hides the selection; `sel` / `cursor`: it's in the first word / it's the cursor.
        g.cells[k] = { r: rc[0], c: rc[1], el: el, band: W.sylOf[j] % 2 ? "b" : "a", owner: n, words: [],
          sel: !!el && el.classList.contains("sel"), cursor: !!el && el.classList.contains("cursor"),
          look: cs ? { bg: cs.backgroundColor, edge: cs.borderColor, ring: cs.boxShadow } : {} };
        g.order.push(k);
      }
      g.cells[k].words.push(n);
    });
  });
  var plainCell = g.order.map(function (k) { return g.cells[k]; }).filter(function (o) { return !o.sel; })[0];
  g.plain = plainCell ? plainCell.look : { bg: root.getPropertyValue("--cell").trim(), edge: root.getPropertyValue("--cell-edge").trim() };
  return g;
}

// Plays one entrance. `audio`: { ctx, out } to make its sounds (or null for none); `rate`: speed
// (the tester's slow motion: 0.5 is half speed; the sounds are left out then). Returns
// { done, skip }: done resolves when it ends or is skipped; skip() jumps to the finished board
// and silences what it scheduled.
export function playEntrance(id, g, opts) {
  var e = ENTRANCES.find(function (x) { return x.id === id; }) || ENTRANCES[0];
  var rate = (opts && opts.rate) || 1, anims = [], timers = [], audio = rate === 1 && opts && opts.audio, bus = null, S = null, t0 = 0, finish;
  var done = new Promise(function (resolve) { finish = resolve; });
  if (audio && audio.ctx) {
    try {
      bus = audio.ctx.createGain(); bus.gain.value = 0.55;
      var comp = audio.ctx.createDynamicsCompressor();
      bus.connect(comp); comp.connect(audio.out);
      S = makeSfx(audio.ctx, bus); t0 = audio.ctx.currentTime + 0.06;
    } catch (err) { bus = null; S = null; }
  }
  g.board.classList.add("entering"); // the selection shows once the boxes are in place
  var extras = [];
  g.at = function (sec, fn) { extras.push({ at: sec, fn: fn }); };
  function sfx(at, fn) { if (S) { try { fn(t0 + at, S); } catch (err) {} } }
  g.ringDone = false;
  var plan = e.plan(g, sfx), end = 0;
  g.order.forEach(function (k) {
    var p = plan[k], o = g.cells[k], el = o.el;
    if (!p || !el) return;
    // The first word keeps its colors the whole way (any frame that doesn't set them), and fill
    // "both" holds its last frame (its starting look) until the selection shows (stop), so its
    // colors never snap in at the end.
    var kf = p.kf, fill = p.fill || "backwards";
    if (o.sel) {
      kf = kf.map(function (f) { return Object.assign({ backgroundColor: o.look.bg, borderColor: o.look.edge }, f); });
      fill = "both";
    }
    anims.push(el.animate(kf, { duration: p.dur * 1000 / rate, delay: (p.delay * 1000 + 60) / rate, easing: p.ease, fill: fill }));
    end = Math.max(end, p.delay + p.dur);
  });
  extras.forEach(function (x) { end = Math.max(end, x.at + 0.5); });
  if (!g.ringDone) end = ringOn(g, end, sfx, false); // last, the cursor's ring fades on
  extras.forEach(function (x) {
    timers.push(setTimeout(function () { [].concat(x.fn() || []).forEach(function (an) { an.playbackRate = rate; anims.push(an); }); }, (x.at * 1000 + 60) / rate));
    end = Math.max(end, x.at + 0.5);
  });
  var over = false;
  function stop(skipped) {
    if (over) return;
    over = true;
    timers.forEach(clearTimeout);
    g.board.classList.remove("entering");
    var cancel = function () { anims.forEach(function (an) { try { an.cancel(); } catch (err) {} }); };
    if (skipped) cancel();
    else setTimeout(cancel, 250); // the selection fades in under any held frames first (.cell's transition)
    if (bus) {
      var ctx = audio.ctx;
      if (skipped) { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(function () { try { bus.disconnect(); } catch (err) {} }, 250); }
      else setTimeout(function () { try { bus.disconnect(); } catch (err) {} }, 1500); // let the last notes ring
    }
    finish(skipped);
  }
  timers.push(setTimeout(function () { stop(false); }, (end * 1000 + 120) / rate));
  return { id: e.id, done: done, skip: function () { stop(true); } };
}

// Which entrance next. Every 5th is a premium one; the rest are everyday ones. Each kind plays
// from its own shuffled queue, every one once before any repeats, never the same twice in a
// row. `state` is what the last call returned ({ every, premium, n, last }, saved per edition);
// entrances added or removed in an update are handled when the queues are read.
export var PREMIUM_EVERY = 5;
// `seen`: entrances seen to the end so far (Front Row Seat's list). The ones not seen yet always
// play next in their kind (and first after a reshuffle), so new entrances come up before any repeat.
export function nextEntrance(state, seen) {
  var st = state || {}, s = { n: (st.n || 0) + 1, last: st.last || null };
  var premium = s.n % PREMIUM_EVERY === 0, kinds = { every: false, premium: true };
  Object.keys(kinds).forEach(function (kind) {
    var ids = ENTRANCES.filter(function (e) { return e.premium === kinds[kind]; }).map(function (e) { return e.id; });
    s[kind] = (st[kind] || []).filter(function (id) { return ids.indexOf(id) >= 0; }); // what's left to play
    // Any not seen yet go to the front now, not only at the next reshuffle: a queue left over from
    // before an update would otherwise play out its already-seen ones first (premium only every 5th).
    if (seen && s[kind].length) {
      var unseen = shuffle(ids.filter(function (id) { return seen.indexOf(id) < 0 && id !== s.last; }));
      s[kind] = unseen.concat(s[kind].filter(function (id) { return unseen.indexOf(id) < 0; }));
    }
    if (!s[kind].length && (kind === "premium") === premium) {
      var q;
      var fresh = ids.filter(function (id) { return !seen || seen.indexOf(id) < 0; }), old = ids.filter(function (id) { return fresh.indexOf(id) < 0; });
      do { q = shuffle(fresh).concat(shuffle(old)); } while (ids.length > 1 && q[0] === s.last);
      s[kind] = q;
    }
  });
  var id = s[premium ? "premium" : "every"].shift();
  s.last = id;
  return { id: id, state: s };
}
