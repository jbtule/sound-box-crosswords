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
  { id: "spin", name: "Spin in", icon: "🌀", premium: false,
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
  { id: "shutters", name: "Shutters", icon: "🪟", premium: false,
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
export function nextEntrance(state) {
  var st = state || {}, s = { n: (st.n || 0) + 1, last: st.last || null };
  var premium = s.n % PREMIUM_EVERY === 0, kinds = { every: false, premium: true };
  Object.keys(kinds).forEach(function (kind) {
    var ids = ENTRANCES.filter(function (e) { return e.premium === kinds[kind]; }).map(function (e) { return e.id; });
    s[kind] = (st[kind] || []).filter(function (id) { return ids.indexOf(id) >= 0; }); // what's left to play
    if (!s[kind].length && (kind === "premium") === premium) {
      var q;
      do { q = shuffle(ids); } while (ids.length > 1 && q[0] === s.last);
      s[kind] = q;
    }
  });
  var id = s[premium ? "premium" : "every"].shift();
  s.last = id;
  return { id: id, state: s };
}
