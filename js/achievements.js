// Achievements: worked out from saved progress, and kept once earned (nothing is ever
// taken away, so there are no streaks to lose). No DOM here; app.js shows them.
//
// state = {
//   packs:    [{ id, name, done, total }]  coverage per pack (words spelled at least once)
//   clean:    puzzles finished with no try-agains
//   comeback: words spelled right on the first try after an earlier miss
//   days:     ["YYYY-MM-DD", ...] local days with a finished puzzle
// }

var TIERS = {
  clean: [1, 5, 10, 25, 50, 100],
  comeback: [1, 5, 10, 25, 50],
  days: [1, 3, 7, 14, 30, 60, 100]
};

// A fun name for each tier (same order as TIERS); the detail line says plainly what it took.
var LABELS = {
  clean: { icon: "✨", names: ["Spotless", "Squeaky Clean", "Sharp Speller", "Steady Hand", "Precision Pro", "Flawless Hundred"],
    detail: function (n) { return n + (n === 1 ? " puzzle" : " puzzles") + " with no try-agains"; } },
  comeback: { icon: "🔁", names: ["Bounce Back", "Comeback Kid", "Second Wind", "Unstoppable", "Comeback Legend"],
    detail: function (n) { return n + (n === 1 ? " word" : " words") + " right after a miss"; } },
  days: { icon: "📅", names: ["Day One", "Warming Up", "Full Week", "Two-Week Trek", "Marathon Month", "Sixty-Day Summit", "Century Club"],
    detail: function (n) { return n + (n === 1 ? " day" : " days") + " of practice"; } }
};

function tierItem(track, i, have) {
  var l = LABELS[track], n = TIERS[track][i];
  return { id: track + ":" + n, icon: l.icon, title: l.names[i], detail: l.detail(n), goal: n, have: have };
}

// Every achievement that could be shown: [{ id, icon, title, detail, goal, have, met }].
// For tiered tracks that's each tier up to and including the first one not yet met.
export function catalog(state) {
  var out = [];
  state.packs.forEach(function (p) {
    if (p.total < 3) return;
    out.push({ id: "pack:" + p.id, icon: "🏁", title: "Full House: " + p.name, detail: "Every word in " + p.name, goal: p.total, have: p.done });
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
