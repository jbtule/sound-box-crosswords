// Achievements: worked out from saved progress, and kept once earned (nothing is ever
// taken away, so there are no streaks to lose). No DOM here; app.js shows them.
//
// state = {
//   packs:    [{ id, name, done, total, firsts }]  per pack: words spelled at least once
//             (done) and words ever spelled right on the first try (firsts)
//   clean:    puzzles finished with no try-agains
//   comeback: words spelled right on the first try after an earlier miss
//   days:     ["YYYY-MM-DD", ...] local days with a finished puzzle
//   edition:  the grade's name ("3rd grade"), for Champion of Champions and Legend of Legends
//   secret:   { listener, twofer, shared, look, peek, words, qwerty } counts for the secret
//             achievements (SECRETS; weekend days come from `days`)
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
    detail: function (n) { return n === 1 ? "1 word right first try after missing it" : n + " words right first try after missing them"; } }
};

// Secret achievements: shown as ??? in the 🏆 sheet until earned, and their card says
// "Secret achievement!". Each counts something in state.secret (weekend: days).
var SECRETS = [
  { key: "listener", goal: 1, icon: "👂", title: "Good Listener", detail: "Used the listening helpers on every word in a puzzle" },
  { key: "twofer", goal: 1, icon: "✌️", title: "Two for One", detail: "Finished two words at once" },
  { key: "words", goal: 100, icon: "💯", title: "Triple Digits", detail: "100 words spelled right" },
  { key: "weekend", goal: 1, icon: "📅", title: "Weekend Speller", detail: "Finished a puzzle on the weekend" },
  { key: "qwerty", goal: 5, icon: "⌨️", title: "Touch Typist", detail: "5 puzzles typed on the QWERTY keys" },
  { key: "shared", goal: 1, icon: "📣", title: "Show-Off", detail: "Shared an achievement" },
  { key: "look", goal: 1, icon: "🎨", title: "New Look", detail: "Picked new colors" },
  { key: "peek", goal: 1, icon: "👀", title: "Collector's Eye", detail: "Heard a word from the collection" }
];
// The whole grade at once, for grades with at least this many packs (Custom doesn't count).
var GRAND_MIN = 5;

function weekendDays(days) {
  return days.filter(function (d) {
    var m = /^(\d+)-(\d+)-(\d+)$/.exec(d), w = m ? new Date(+m[1], m[2] - 1, +m[3]).getDay() : -1;
    return w === 0 || w === 6;
  }).length;
}

function tierItem(track, i, have) {
  var l = LABELS[track], n = TIERS[track][i];
  return { id: track + ":" + n, icon: l.tiers[i][0], title: l.tiers[i][1], detail: l.detail(n), goal: n, have: have };
}

// Every achievement that could be shown: [{ id, icon, title, detail, goal, have, met }],
// plus `pack` (its id) on a pack's Champion and Legend. Their detail shows the pack's size
// ("All 23 words in Blends"); what's said stays the same for every pack ("Every word in
// this pack"), so a pack needs no recording beyond its name.
// For tiered tracks that's each tier up to and including the first one not yet met.
export function catalog(state) {
  var out = [];
  state.packs.forEach(function (p) {
    if (p.total < 3) return;
    out.push({ id: "pack:" + p.id, icon: "🏆", title: p.name + " Champion", detail: "All " + p.total + " words in " + p.name, goal: p.total, have: p.done, pack: p.id,
      spoken: ["Champion!", p.name, "Every word in this pack"] });
    // Then a Legend: every word right on the first try (at some point, not all at once).
    // Shown once Champion is reached, as the next goal; not for the Custom list ("mine"). It
    // doesn't unlock colors (palettes count pack: achievements only).
    if (p.done >= p.total && p.id !== "mine") {
      out.push({ id: "legend:" + p.id, icon: "🌟", title: p.name + " Legend", detail: "All " + p.total + " words in " + p.name + " right on the first try", goal: p.total, have: p.firsts || 0, pack: p.id,
        spoken: ["Legend!", p.name, "Every word right on the first try"] });
    }
  });
  // Champion of Champions: every pack's Champion; then Legend of Legends: every pack's Legend.
  // On screen they name the grade; what's said is the same for every grade.
  var real = state.packs.filter(function (p) { return p.id !== "mine" && p.total > 0; });
  if (real.length >= GRAND_MIN) {
    var champs = real.filter(function (p) { return p.done >= p.total; }).length;
    var legends = real.filter(function (p) { return (p.firsts || 0) >= p.total; }).length;
    var where = state.edition || "every pack";
    out.push({ id: "grand:champion", icon: "👑", title: "Champion of Champions", detail: "Every word in " + where, goal: real.length, have: champs,
      spoken: ["Champion of Champions!", "Every word in every pack"] });
    if (champs >= real.length) {
      out.push({ id: "grand:legend", icon: "🌠", title: "Legend of Legends", detail: "Every word in " + where + " right on the first try", goal: real.length, have: legends,
        spoken: ["Legend of Legends!", "Every word in every pack, right on the first try"] });
    }
  }
  var have = { clean: state.clean, comeback: state.comeback, days: state.days.length };
  Object.keys(TIERS).forEach(function (track) {
    for (var i = 0; i < TIERS[track].length; i++) {
      var n = TIERS[track][i];
      out.push(tierItem(track, i, have[track]));
      if (have[track] < n) break; // only the next goal, not every future tier
    }
  });
  var sec = Object.assign({}, state.secret, { weekend: weekendDays(state.days) });
  SECRETS.forEach(function (x) {
    out.push({ id: "secret:" + x.key, icon: x.icon, title: x.title, detail: x.detail, goal: x.goal, have: sec[x.key] || 0, secret: true });
  });
  out.forEach(function (a) { a.met = a.have >= a.goal; });
  return out;
}

// What an achievement card says aloud: a few short lines, each recorded on its own. A pack
// achievement says what it is, then the pack, then what it took ("Champion!" "Unit 3."
// "Every word in this pack."), so a new pack only needs its name recorded; the others say
// their title (as an exclamation, like all titles) and detail.
export function spokenParts(a) {
  return a.spoken || [a.title + "!", a.detail];
}

// Every line a card can say, for the given packs ([{ id, name }]): "New achievement!" and
// "Secret achievement!" (a new card), "Achievement!" (👂 on a card, in app.js), the fixed words, each pack's name, and
// each tier's title and detail, so the audio build can record them all
// (scripts/audio/build.mjs). The check keeps this in step with catalog().
export function spokenLines(packs) {
  var out = ["New achievement!", "Secret achievement!", "Achievement!", "Champion!", "Legend!", "Every word in this pack", "Every word right on the first try",
    "Champion of Champions!", "Every word in every pack", "Legend of Legends!", "Every word in every pack, right on the first try"];
  packs.forEach(function (p) { out.push(p.name); });
  Object.keys(TIERS).forEach(function (track) {
    TIERS[track].forEach(function (n, i) { var t = tierItem(track, i, 0); out.push(t.title + "!", t.detail); });
  });
  SECRETS.forEach(function (x) { out.push(x.title + "!", x.detail); });
  return out.filter(function (x, i) { return out.indexOf(x) === i; });
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
