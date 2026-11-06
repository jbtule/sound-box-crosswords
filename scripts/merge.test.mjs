// Tests for js/merge.js (combining two copies of a player's progress). Run by
// `npm run check`, or alone: node --test scripts/merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, merge, fromRecord, LOG_MAX } from "../js/merge.js";

const SLIPS0 = () => ({ place: { start: 0, middle: 0, end: 0 }, kind: { vowel: 0, blend: 0, consonant: 0 } });
const empty = () => ({
  progress: {}, log: [], counts: { clean: 0, comeback: 0 }, days: [], achievements: {}, slips: SLIPS0(),
  stars: {}, guessing: { t: [], words: {} }, seenEntrances: [], settings: {}, custom: null
});
const clone = (x) => JSON.parse(JSON.stringify(x));
// A device: its saved data and the last record it merged.
const device = (id, data = empty(), base = null) => ({ id, data, base });
// One sync, as the app will do it: this device's record merged with the server's, saved
// back, and applied here.
function sync(dev, server) {
  const rec = merge(toRecord(dev.data, dev.base, dev.id), server);
  dev.data = fromRecord(rec, dev.data);
  dev.base = rec;
  return rec;
}
// Plays a puzzle: what finish() and complete() save.
function play(dev, { pack = "blends", words = ["frog"], miss = 0, t, day = "2026-11-05" } = {}) {
  const d = dev.data, pp = d.progress[pack] = d.progress[pack] || { done: {}, round: [], stats: {} };
  for (const w of words) {
    pp.done[w] = true;
    if (!pp.round.includes(w)) pp.round.push(w);
    const st = pp.stats[w] = pp.stats[w] || { n: 0, ok: 0, miss: 0 };
    st.n++; if (!miss) st.ok++; st.miss += miss;
  }
  d.stars[pack] = (d.stars[pack] || 0) + 1;
  d.log.unshift({ t, pack, n: words.length, m: miss });
  if (!miss) d.counts.clean++;
  if (!d.days.includes(day)) d.days.push(day);
}

test("tallies add up across devices, and syncing again never counts twice", () => {
  const a = device("a"), b = device("b");
  play(a, { t: 1 }); play(a, { t: 2 }); play(a, { t: 3, miss: 1 });
  play(b, { t: 4 }); play(b, { t: 5 });
  let server = sync(a, null);
  server = sync(b, server);
  server = sync(a, server);
  for (const dev of [a, b]) {
    assert.equal(dev.data.counts.clean, 4);
    assert.equal(dev.data.stars.blends, 5);
    assert.deepEqual(dev.data.progress.blends.stats.frog, { n: 5, ok: 4, miss: 1 });
    assert.equal(dev.data.log.length, 5);
  }
  // Again and again, nothing new played: nothing changes.
  for (let i = 0; i < 3; i++) { server = sync(a, server); server = sync(b, server); }
  assert.equal(a.data.counts.clean, 4);
  assert.equal(b.data.stars.blends, 5);
  // More play after syncing adds on top.
  play(b, { t: 6 });
  server = sync(b, server); server = sync(a, server);
  assert.equal(a.data.counts.clean, 5);
  assert.deepEqual(a.data.progress.blends.stats.frog, { n: 6, ok: 5, miss: 1 });
});

test("merge doesn't care about order, and a record merged with itself is unchanged", () => {
  const a = device("a"), b = device("b"), c = device("c");
  play(a, { t: 1, words: ["frog", "stop"] }); a.data.achievements = { "pack:blends": 50, clean1: 10 };
  play(b, { t: 2, words: ["stop", "clap"], miss: 2 }); b.data.achievements = { clean1: 5 };
  play(c, { t: 3, pack: "bossy", words: ["star"] }); c.data.settings = { kb: "abc" };
  const [x, y, z] = [a, b, c].map((d) => toRecord(d.data, null, d.id));
  assert.deepEqual(merge(x, y), merge(y, x));
  assert.deepEqual(merge(merge(x, y), z), merge(x, merge(y, z)));
  assert.deepEqual(merge(x, x), merge(x, null));
  const all = fromRecord(merge(merge(x, y), z));
  assert.deepEqual(Object.keys(all.progress.blends.done).sort(), ["clap", "frog", "stop"]);
  assert.deepEqual(all.achievements, { "pack:blends": 50, clean1: 5 }); // each keeps its earliest time
});

test("a device's own data comes back the same from its record", () => {
  const a = device("a");
  play(a, { t: 1, words: ["frog", "stop"], miss: 1 });
  a.data.counts.entrances = 3; a.data.counts.twofer = 2;
  a.data.slips.place.middle = 4; a.data.slips.kind.blend = 3;
  a.data.guessing = { t: [7, 9], words: { frog: 2 } };
  a.data.seenEntrances = ["rain", "drop"];
  a.data.progress.blends.stats.frog.cb = true;
  a.data.settings = { syl: false, kb: "qwerty", palette: "ocean" };
  a.data.custom = "# my words\nbut-ter-fly 🦋\n\nra-bbit 🐇";
  const back = fromRecord(toRecord(a.data, null, "a"), a.data);
  const want = clone(a.data);
  want.seenEntrances.sort();
  assert.deepEqual(back, want);
});

test("the puzzle log keeps the newest puzzles from both", () => {
  const a = device("a"), b = device("b");
  for (let t = 1; t <= LOG_MAX; t++) play(t % 2 ? a : b, { t });
  const merged = fromRecord(merge(toRecord(a.data, null, "a"), toRecord(b.data, null, "b")));
  assert.equal(merged.log.length, LOG_MAX);
  assert.equal(merged.log[0].t, LOG_MAX);
  assert.equal(merged.log.at(-1).t, 1);
});

test("a pack's later round wins; in the same round both devices' words count", () => {
  const a = device("a"), b = device("b");
  play(a, { t: 1, words: ["frog"] }); play(b, { t: 2, words: ["stop"] });
  let rec = merge(toRecord(a.data, null, "a"), toRecord(b.data, null, "b"));
  assert.deepEqual(fromRecord(rec).progress.blends.round.sort(), ["frog", "stop"]);
  b.data.progress.blends.round = ["clap"]; b.data.progress.blends.rounds = 1; // b covered the pack and started again
  rec = merge(toRecord(a.data, null, "a"), toRecord(b.data, null, "b"));
  assert.deepEqual(fromRecord(rec).progress.blends.round, ["clap"]);
  assert.equal(fromRecord(rec).progress.blends.rounds, 1);
});

test("settings: each one on its own, the latest change wins", () => {
  const a = device("a", { ...empty(), settings: { syl: true, kb: "qwerty" } }), b = device("b");
  let server = sync(a, null);
  server = sync(b, server);
  assert.deepEqual(b.data.settings, { syl: true, kb: "qwerty" });
  // Offline, a turns syllable colors off and b picks the A–Z pad: both stay.
  a.data.settings.syl = false;
  b.data.settings.kb = "abc";
  server = sync(a, server); server = sync(b, server); server = sync(a, server);
  assert.deepEqual(a.data.settings, { syl: false, kb: "abc" });
  assert.deepEqual(b.data.settings, a.data.settings);
  // Both change the pad: the change made after seeing the other's wins...
  a.data.settings.kb = "qwerty";
  server = sync(a, server);
  server = sync(b, server);
  assert.equal(b.data.settings.kb, "qwerty");
  b.data.settings.kb = "abc";
  server = sync(b, server); server = sync(a, server);
  assert.equal(a.data.settings.kb, "abc");
  // ...and at the same edit count, either way round, the same one.
  a.data.settings.palette = "ocean"; b.data.settings.palette = "forest";
  const x = toRecord(a.data, a.base, "a"), y = toRecord(b.data, b.base, "b");
  assert.deepEqual(merge(x, y).settings.palette, merge(y, x).settings.palette);
  // A setting removed (Start over clears the color scheme) stays removed.
  const c = device("c", { ...empty(), settings: { palette: "ocean" } });
  server = sync(c, null);
  delete c.data.settings.palette;
  server = sync(c, server);
  const d = device("d");
  sync(d, server);
  assert.equal("palette" in d.data.settings, false);
});

test("the Custom list: additions on two devices both stay, and a removal sticks", () => {
  const a = device("a", { ...empty(), custom: "gi-raffe 🦒\nze-bra 🦓" }), b = device("b");
  let server = sync(a, null);
  server = sync(b, server);
  assert.equal(b.data.custom, "gi-raffe 🦒\nze-bra 🦓");
  // Offline: a removes giraffe and adds planet; b adds rocket.
  a.data.custom = "ze-bra 🦓\nplan-et 🪐";
  b.data.custom = "gi-raffe 🦒\nze-bra 🦓\nrock-et 🚀";
  server = sync(b, server); server = sync(a, server); server = sync(b, server);
  for (const dev of [a, b]) {
    const words = dev.data.custom.split("\n");
    assert.deepEqual(words.slice().sort(), ["plan-et 🪐", "rock-et 🚀", "ze-bra 🦓"]);
  }
  assert.equal(a.data.custom, b.data.custom);
  // Changing a word's picture or sentence: the latest change wins.
  b.data.custom = b.data.custom.replace("ze-bra 🦓", 'ze-bra 🦓 "A zebra has stripes."');
  server = sync(b, server); server = sync(a, server);
  assert.ok(a.data.custom.includes('"A zebra has stripes."'));
  // Adding a removed word back works.
  a.data.custom += "\ngi-raffe 🦒";
  server = sync(a, server); server = sync(b, server);
  assert.ok(b.data.custom.includes("gi-raffe 🦒"));
  // A device that never edited its list takes the shared one.
  const c = device("c");
  sync(c, server);
  assert.equal(c.data.custom, b.data.custom);
});

test("the Custom list keeps a grown-up's own text when its words didn't change", () => {
  const text = "# school words\nbut-ter-fly 🦋\n\nra-bbit 🐇";
  const a = device("a", { ...empty(), custom: text });
  let server = sync(a, null);
  play(a, { t: 1 });
  sync(a, server);
  assert.equal(a.data.custom, text);
});

test("tallies the app adds to in place are always numbers", () => {
  const d = fromRecord(merge(toRecord(empty(), null, "a"), null), empty());
  assert.deepEqual(d.slips, SLIPS0());
  assert.equal(d.counts.clean, 0);
  assert.equal(d.counts.comeback, 0);
});

// The gate on the sync record's format. Every device merges records and saves them back, and
// an older app drops whatever it doesn't know, so a new or changed field would be lost to a
// device that hasn't updated yet. A format change therefore needs a new RECORD_VERSION (older
// apps then leave that grade alone until they update: NewerRecord in js/sync.js) and its
// shape added below. The shape is the record's fields and nesting for one full sample.
import { createHash } from "node:crypto";
import { RECORD_VERSION } from "../js/merge.js";
const SHAPES = { 1: "6758970610f8" };
function shape(v) {
  if (Array.isArray(v)) return "[" + [...new Set(v.map(shape))].sort().join("|") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => k + ":" + shape(v[k])).join(",") + "}";
  return typeof v;
}
test("the sync record's format matches its RECORD_VERSION", () => {
  const d = empty();
  play(device("x", d), { t: 1, words: ["frog"], miss: 1 });
  d.progress.blends.rounds = 2; d.progress.blends.stats.frog.cb = true;
  d.counts.entrances = 3; d.counts.twofer = 1; d.slips.place.middle = 1; d.slips.kind.blend = 1;
  d.guessing = { t: [5], words: { frog: 1 } }; d.seenEntrances = ["rain"];
  d.achievements = { clean1: 1 }; d.settings = { syl: true, kb: "abc", palette: "ocean" }; d.custom = "gi-raffe 🦒";
  const rec = toRecord(d, null, "dev");
  assert.equal(rec.v, RECORD_VERSION);
  const got = createHash("sha256").update(shape(rec)).digest("hex").slice(0, 12);
  assert.equal(got, SHAPES[RECORD_VERSION],
    "The sync record's format changed (shape " + got + "). Older devices would drop what they don't know when they merge and save, " +
    "so bump RECORD_VERSION in js/merge.js and add SHAPES[" + (RECORD_VERSION + 1) + "] = \"" + got + "\" in scripts/merge.test.mjs.");
});
