// Achievements: worked out from saved progress, and kept once earned (nothing is ever
// taken away, so there are no streaks to lose). No DOM here; app.js shows them.
//
// state = {
//   packs:    [{ id, name, done, total, firsts }]  per pack: words spelled at least once
//             (done) and words ever spelled right on the first try (firsts)
//   clean:    puzzles finished with no try-agains
//   comeback: words spelled right on the first try after an earlier miss
//   days:     ["YYYY-MM-DD", ...] local days with a finished puzzle
// }

var TIERS = {
  clean: [1, 5, 10, 25, 50, 100],
  comeback: [1, 5, 10, 25, 50],
  days: [1, 3, 7, 14, 30, 60, 100]
};

// Each track is a little picture story that gets bigger tier by tier (same order as
// TIERS), so the emoji shows the progress even before the name is read. The detail line
// says plainly what it took, for grown-ups.
var LABELS = {
  // Practice days: a plant that grows a little each day you show up, and never shrinks.
  days: { tiers: [["🌱", "Seed"], ["🌿", "Sprout"], ["🪴", "Sapling"], ["🌳", "Tree"], ["🌲", "Forest"], ["🏞️", "Big Woods"], ["🌍", "Whole World"]],
    detail: function (n) { return n + (n === 1 ? " day" : " days") + " of practice"; } },
  // Clean solves (no try-agains): a trip through space.
  clean: { tiers: [["🚀", "Liftoff"], ["🛰️", "In Orbit"], ["🌙", "Moon Landing"], ["🪐", "Ringed Planet"], ["☄️", "Comet Rider"], ["🌌", "Galaxy"]],
    detail: function (n) { return n + (n === 1 ? " puzzle" : " puzzles") + " with no try-agains"; } },
  // Comebacks (right after an earlier miss): not giving up.
  comeback: { tiers: [["🏀", "Bounce Back"], ["🐢", "Keep Going"], ["🧗", "Climber"], ["🦸", "Spelling Hero"], ["🐉", "Dragon Heart"]],
    detail: function (n) { return n + (n === 1 ? " word" : " words") + " right after a miss"; } }
};

function tierItem(track, i, have) {
  var l = LABELS[track], n = TIERS[track][i];
  return { id: track + ":" + n, icon: l.tiers[i][0], title: l.tiers[i][1], detail: l.detail(n), goal: n, have: have };
}

// Every achievement that could be shown: [{ id, icon, title, detail, goal, have, met }].
// For tiered tracks that's each tier up to and including the first one not yet met.
export function catalog(state) {
  var out = [];
  state.packs.forEach(function (p) {
    if (p.total < 3) return;
    out.push({ id: "pack:" + p.id, icon: "🏆", title: p.name + " Champion", detail: "Every word in " + p.name, goal: p.total, have: p.done });
    // Then a Legend: every word right on the first try (at some point, not all at once).
    // Shown once Champion is reached, as the next goal. It doesn't unlock colors (palettes
    // count pack: achievements only).
    if (p.done >= p.total) {
      out.push({ id: "legend:" + p.id, icon: "🌟", title: p.name + " Legend", detail: "Every word in " + p.name + " right on the first try", goal: p.total, have: p.firsts || 0 });
    }
  });
  var have = { clean: state.clean, comeback: state.comeback, days: state.days.length };
  Object.keys(TIERS).forEach(function (track) {
    for (var i = 0; i < TIERS[track].length; i++) {
      var n = TIERS[track][i];
      out.push(tierItem(track, i, have[track]));
      if (have[track] < n) break; // only the next goal, not every future tier
    }
  });
  out.forEach(function (a) { a.met = a.have >= a.goal; });
  return out;
}

// Records newly met achievements in `earned` ({ id: timestamp }) and returns them.
export function award(state, earned, now) {
  return catalog(state).filter(function (a) {
    if (!a.met || earned[a.id]) return false;
    earned[a.id] = now;
    return true;
  });
}

// "YYYY-MM-DD" for a time, in local time (a practice day is the player's day).
export function dayKey(t) {
  var d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// How many of the last 7 days (today included) had practice.
export function daysThisWeek(days, now) {
  var set = {}, n = 0;
  days.forEach(function (d) { set[d] = true; });
  for (var i = 0; i < 7; i++) if (set[dayKey(now - i * 86400000)]) n++;
  return n;
}
