// No DOM. Combining two copies of one player's saved progress (one grade's worth), for
// syncing a profile between devices (the Family sync design). Nothing calls it yet.
//
// The app keeps saving plain totals (counts.clean = 5). A sync record keeps every tally
// per device ({ a: 3, b: 2 }), so two copies combine by taking each device's larger share
// and syncing twice never counts anything twice. A device works out its own share as its
// total minus the other devices' shares in the last record it merged (`base`), so the app
// itself doesn't change.
//
//   toRecord(data, base, me)  the device's saved data → a record (base: the last merged
//                             record or null; me: this device's id)
//   merge(a, b)               two records → one; order doesn't matter, and merging a record
//                             with itself changes nothing
//   fromRecord(rec, data)     a record → saved data with plain totals (data: this device's
//                             own, to keep the Custom list's text when its words didn't change)
//
// `data` holds a grade's saved values under their storage keys: progress, log, counts,
// days, achievements, slips, stars, guessing, seenEntrances, settings and custom (the
// Custom list's text, or null if never edited). How each combines:
//   - grows only: words done, practice days, the puzzle log (newest LOG_MAX), entrances
//     seen, achievements (each keeps its earliest time), comeback flags
//   - tallies, per device: word stats (n, ok, miss), counts, slips, stars, guessing words
//   - a pack's round: the later round wins (`rounds`, how many have started); the same
//     round, both copies' words
//   - settings: each one on its own, the latest change wins
//   - the Custom list: per word, added or removed, the latest change wins, so a removal
//     sticks and additions on two devices both stay
// Not synced, since they belong to the device: the puzzle in progress, the selected pack,
// secret achievements waiting behind the pill, and the entrance cycle and Director order.
// "Latest" is an edit counter (one more than the highest seen, the device id breaking
// ties), never the device's clock, which may be wrong.
import { parseList } from "./crossword.js";

export const RECORD_VERSION = 1;
export const LOG_MAX = 200;
const GUESS_MAX = 200;
// Counts that are a level, not a tally: entrances = how many different ones were seen.
const LEVELS = ["entrances"];

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const obj = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
const keys = (...os) => [...new Set(os.flatMap((o) => Object.keys(obj(o))))];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- tallies: { device: count } ---------- */
const sum = (g) => Object.values(obj(g)).reduce((n, v) => n + (+v || 0), 0);
// This device's share: its total less what the others had added, as of the last merge.
function tally(total, base, me) {
  const out = {};
  let others = 0;
  for (const d of Object.keys(obj(base))) if (d !== me) { out[d] = +base[d] || 0; others += out[d]; }
  const mine = Math.max(0, (+total || 0) - others);
  if (mine) out[me] = mine;
  return out;
}
function maxEach(a, b) {
  const out = {};
  for (const d of keys(a, b)) out[d] = Math.max(+obj(a)[d] || 0, +obj(b)[d] || 0);
  return out;
}
function tallies(totals, base, me) {
  const out = {};
  for (const k of keys(totals, base)) {
    const g = tally(obj(totals)[k], obj(base)[k], me);
    if (Object.keys(g).length) out[k] = g;
  }
  return out;
}
const mergeTallies = (a, b) => Object.fromEntries(keys(a, b).map((k) => [k, maxEach(obj(a)[k], obj(b)[k])]).filter(([, g]) => Object.keys(g).length));
const totals = (gs) => Object.fromEntries(Object.keys(obj(gs)).map((k) => [k, sum(gs[k])]));
// Totals, plus a 0 for every tally the app already keeps (it adds 1 to them in place).
const filled = (gs, mine) => ({ ...Object.fromEntries(Object.keys(obj(mine)).map((k) => [k, 0])), ...totals(gs) });

/* ---------- the latest change wins ---------- */
// rev = [counter, device]
const later = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : String(a[1]) > String(b[1]));
const pick = (a, b) => (!a ? b : !b ? a : later(b.r, a.r) ? b : a);
function topRev(rec) {
  let n = 0;
  for (const e of Object.values(obj(rec && rec.settings))) n = Math.max(n, e.r[0]);
  for (const e of Object.values(obj(rec && rec.custom))) n = Math.max(n, e.r[0]);
  return n;
}

/* ---------- the Custom list: { word: { line, r, born, gone? } } ---------- */
// Each word's own line (its syllables, picture, hint, sentence), in the list's order.
function customLines(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const e = parseList(line)[0];
    if (e && !out.some((o) => o.w === e.w)) out.push({ w: e.w, line: line.trim() });
  }
  return out;
}
function customRecord(text, base, rev, me) {
  if (text == null) return base ? { ...base } : null; // never edited here: nothing changed
  const out = {}, now = customLines(text);
  now.forEach(({ w, line }, i) => {
    const b = base && base[w];
    out[w] = b && !b.gone && b.line === line ? b : { line, r: rev, born: b ? b.born : [rev[0], rev[1], i] };
  });
  for (const w of Object.keys(obj(base))) {
    if (own(out, w)) continue;
    const b = base[w];
    out[w] = b.gone ? b : { line: b.line, r: rev, born: b.born, gone: true };
  }
  return out;
}
function mergeCustom(a, b) {
  if (!a || !b) return a || b || null;
  const out = {};
  for (const w of keys(a, b)) {
    const e = { ...pick(a[w], b[w]) };
    if (a[w] && b[w]) e.born = later(a[w].born, b[w].born) ? b[w].born : a[w].born; // first seen
    out[w] = e;
  }
  return out;
}
const bornOrder = (x, y) => x.born[0] - y.born[0] || (x.born[1] < y.born[1] ? -1 : x.born[1] > y.born[1] ? 1 : 0) || x.born[2] - y.born[2];
function customText(custom, text) {
  if (!custom) return text == null ? null : text;
  const live = Object.keys(custom).filter((w) => !custom[w].gone).map((w) => custom[w]);
  live.sort((x, y) => bornOrder(x, y) || (x.line < y.line ? -1 : 1));
  // Unchanged words keep the grown-up's own text (comments, blank lines).
  if (text != null && same(customLines(text).map((e) => e.line), live.map((e) => e.line))) return text;
  return live.map((e) => e.line).join("\n");
}

/* ---------- a whole grade ---------- */
export function toRecord(data, base, me) {
  const d = obj(data), b = obj(base);
  const rev = [topRev(b) + 1, me];
  const progress = {};
  for (const pack of keys(d.progress, b.progress)) {
    const pp = obj(obj(d.progress)[pack]), bp = obj(obj(b.progress)[pack]);
    const stats = {};
    for (const w of keys(pp.stats, bp.stats)) {
      const s = obj(obj(pp.stats)[w]), bs = obj(obj(bp.stats)[w]);
      stats[w] = tallies({ n: s.n, ok: s.ok, miss: s.miss }, { n: bs.n, ok: bs.ok, miss: bs.miss }, me);
      if (s.cb || bs.cb) stats[w].cb = true;
    }
    progress[pack] = {
      done: Object.fromEntries(keys(pp.done, bp.done).map((w) => [w, 1])),
      rounds: Math.max(+pp.rounds || 0, +bp.rounds || 0),
      round: Object.fromEntries((pp.round || []).map((w) => [w, 1])),
      stats
    };
  }
  const counts = tallies(Object.fromEntries(Object.entries(obj(d.counts)).filter(([k]) => !LEVELS.includes(k))),
    Object.fromEntries(Object.entries(obj(b.counts)).filter(([k]) => !LEVELS.includes(k))), me);
  for (const k of LEVELS) {
    const v = Math.max(+obj(d.counts)[k] || 0, +obj(b.counts)[k] || 0);
    if (v) counts[k] = v;
  }
  const settings = {};
  for (const k of keys(d.settings, b.settings)) {
    const has = own(obj(d.settings), k), v = has ? d.settings[k] : null, prev = obj(b.settings)[k];
    if (prev && (has ? !prev.gone && same(prev.v, v) : prev.gone)) settings[k] = prev;
    else settings[k] = has ? { v, r: rev } : { v: null, r: rev, gone: true };
  }
  const g = obj(d.guessing), bg = obj(b.guessing);
  return {
    v: RECORD_VERSION,
    progress,
    log: mergeLog(d.log, b.log),
    counts,
    days: union(d.days, b.days),
    achievements: earliest(d.achievements, b.achievements),
    slips: { place: tallies(obj(d.slips).place, obj(b.slips).place, me), kind: tallies(obj(d.slips).kind, obj(b.slips).kind, me) },
    stars: tallies(d.stars, b.stars, me),
    guessing: { t: union(g.t, bg.t).slice(-GUESS_MAX), words: tallies(g.words, bg.words, me) },
    seen: union(d.seenEntrances, b.seen),
    settings,
    custom: customRecord(d.custom, b.custom, rev, me)
  };
}

function union(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
function earliest(a, b) {
  const out = {};
  for (const k of keys(a, b)) out[k] = Math.min(...[obj(a)[k], obj(b)[k]].filter((t) => typeof t === "number"));
  return out;
}
function mergeLog(a, b) {
  const seen = new Map();
  for (const e of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) seen.set(e.t + "|" + e.pack, e);
  return [...seen.values()].sort((x, y) => y.t - x.t || (x.pack < y.pack ? -1 : 1)).slice(0, LOG_MAX);
}

export function merge(a, b) {
  if (!a || !b) return a || b || null;
  const progress = {};
  for (const pack of keys(a.progress, b.progress)) {
    const x = obj(a.progress[pack]), y = obj(b.progress[pack]);
    const xr = +x.rounds || 0, yr = +y.rounds || 0;
    const stats = {};
    for (const w of keys(x.stats, y.stats)) {
      const s = obj(obj(x.stats)[w]), t = obj(obj(y.stats)[w]);
      stats[w] = mergeTallies({ n: s.n, ok: s.ok, miss: s.miss }, { n: t.n, ok: t.ok, miss: t.miss });
      if (s.cb || t.cb) stats[w].cb = true;
    }
    progress[pack] = {
      done: { ...obj(x.done), ...obj(y.done) },
      rounds: Math.max(xr, yr),
      round: xr === yr ? { ...obj(x.round), ...obj(y.round) } : { ...obj(xr > yr ? x.round : y.round) },
      stats
    };
  }
  const counts = mergeTallies(...[a, b].map((r) => Object.fromEntries(Object.entries(obj(r.counts)).filter(([k]) => !LEVELS.includes(k)))));
  for (const k of LEVELS) {
    const v = Math.max(+obj(a.counts)[k] || 0, +obj(b.counts)[k] || 0);
    if (v) counts[k] = v;
  }
  const settings = {};
  for (const k of keys(a.settings, b.settings)) settings[k] = pick(obj(a.settings)[k], obj(b.settings)[k]);
  return {
    v: RECORD_VERSION,
    progress,
    log: mergeLog(a.log, b.log),
    counts,
    days: union(a.days, b.days),
    achievements: earliest(a.achievements, b.achievements),
    slips: { place: mergeTallies(obj(a.slips).place, obj(b.slips).place), kind: mergeTallies(obj(a.slips).kind, obj(b.slips).kind) },
    stars: mergeTallies(a.stars, b.stars),
    guessing: { t: union(obj(a.guessing).t, obj(b.guessing).t).slice(-GUESS_MAX), words: mergeTallies(obj(a.guessing).words, obj(b.guessing).words) },
    seen: union(a.seen, b.seen),
    settings,
    custom: mergeCustom(a.custom, b.custom)
  };
}

export function fromRecord(rec, data) {
  const r = obj(rec), d = obj(data);
  const progress = {};
  for (const pack of Object.keys(obj(r.progress))) {
    const p = r.progress[pack], stats = {};
    for (const w of Object.keys(obj(p.stats))) {
      const s = p.stats[w];
      stats[w] = { n: sum(s.n), ok: sum(s.ok), miss: sum(s.miss) };
      if (s.cb) stats[w].cb = true;
    }
    progress[pack] = { done: Object.fromEntries(Object.keys(obj(p.done)).map((w) => [w, true])), round: Object.keys(obj(p.round)), stats };
    if (p.rounds) progress[pack].rounds = p.rounds;
  }
  const counts = filled(Object.fromEntries(Object.entries(obj(r.counts)).filter(([k]) => !LEVELS.includes(k))), { clean: 0, comeback: 0, ...obj(d.counts) });
  for (const k of LEVELS) if (obj(r.counts)[k]) counts[k] = r.counts[k];
  const settings = {};
  for (const k of Object.keys(obj(r.settings))) if (!r.settings[k].gone) settings[k] = r.settings[k].v;
  return {
    progress,
    log: (r.log || []).slice(),
    counts,
    days: (r.days || []).slice(),
    achievements: { ...obj(r.achievements) },
    slips: { place: filled(obj(r.slips).place, { start: 0, middle: 0, end: 0 }), kind: filled(obj(r.slips).kind, { vowel: 0, blend: 0, consonant: 0 }) },
    stars: totals(r.stars),
    guessing: { t: (obj(r.guessing).t || []).slice(), words: totals(obj(r.guessing).words) },
    seenEntrances: (r.seen || []).slice(),
    settings,
    custom: customText(r.custom, d.custom)
  };
}
