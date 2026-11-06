// Game state, play logic, rendering, and the settings sheet.
import { confetti } from "./confetti.js";
import { chime, sparkle, audioAwake, audioOut } from "./chime.js";
import { ENTRANCES, geometry, playEntrance, nextEntrance } from "./entrances.js";
import { listenStickers } from "./stickers.js";
import { renderCard, shareCard } from "./sharecard.js";
import { PALETTES, EVERYDAY, unlockedCount, paletteCSS } from "./palettes.js";
import { catalog, award, dayKey, daysThisWeek, spokenParts } from "./achievements.js";
import { parseList, makePuzzle, restorePuzzle, blankSentence, shuffle } from "./crossword.js";
import { speak, say, sayAfter, sayRecorded, hasClip, splitOf, onClips, stopSpeech, speechEpoch, hasSpeech } from "./speech.js";
import { blendsIn, slipSpots, isClose } from "./phonics.js";
import { newKey, isKey, keysFor, linkFor, keyFromLink } from "./seal.js";
import { syncGrade, remoteGrades, canon } from "./sync.js";
import { linkQR } from "./linkqr.js";

var $ = function (s) { return document.querySelector(s); };

// Running from the Home Screen (full screen, no Safari controls).
var installed = navigator.standalone === true || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
// There, pinch zoom only gets in the way: nothing on screen needs it, and with no Safari
// controls a zoomed-in board is hard to get back from. Safari keeps it for anyone who needs
// it (and iPad's own Zoom in Accessibility works everywhere). iOS ignores
// user-scalable=no in Safari, so the Home Screen app also cancels its pinch gestures.
if (installed) {
  document.documentElement.classList.add("standalone");
  var vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", vp.getAttribute("content") + ", maximum-scale=1, user-scalable=no");
  ["gesturestart", "gesturechange"].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
}

// Saved data. `device` is shared by every edition ("sbx:" prefix: which edition, the Home
// Screen tip); `store` is the current edition's own (its prefix from storagePrefix(), set
// at startup), so each grade keeps its own progress, achievements and settings. Private
// mode or blocked storage just means nothing is remembered.
function storage(prefix) {
  return {
    get: function (k, d) { try { var v = localStorage.getItem(prefix() + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(prefix() + k, JSON.stringify(v)); } catch (e) {} }
  };
}
var PREFIX = "sbx:";
var device = storage(function () { return "sbx:"; });
var store = storage(function () { return PREFIX; });
// Profiles: one player's progress each, in every grade. Every device starts with one, the
// default, whose keys are the plain ones above, so nothing moved when profiles came. Others
// arrive only by Receive (More → Link) and keep theirs under "sbx:@<id>:". Names are this
// device's own and never sync. `who` is the active profile's own data: its grade and link key.
var PROFILES = device.get("profiles", null) || [{ id: "", name: "" }];
var PROFILE = device.get("profile", "");
if (!PROFILES.some(function (p) { return p.id === PROFILE; })) PROFILE = "";
function profilePrefix(id) { return id ? "sbx:@" + id + ":" : "sbx:"; }
var who = storage(function () { return profilePrefix(PROFILE); });
function whoOf(id) { return storage(function () { return profilePrefix(id); }); }
// A grade's keys for a profile: the profile's prefix, then the grade's (words.js storagePrefix).
function gradePrefix(id, ed) { return profilePrefix(id) + storagePrefix(ed).slice(4); }

// Offline copy (sw.js), so a home-screen launch works without a connection. Skipped on
// localhost so local edits always show. On the first visit everything loads before the
// worker runs, so hand it the list of what loaded to save now.
if ("serviceWorker" in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url))
    .then(function () { return navigator.serviceWorker.ready; })
    .then(function (reg) {
      var urls = performance.getEntriesByType("resource").map(function (r) { return r.name; });
      urls.push(location.href);
      reg.active.postMessage({ warm: urls });
    })
    .catch(function () {});
}

// Which grade's word lists (editions.toml). In order: a ?edition= link (then remembered),
// the one picked before, a ?start= address (below), the original edition for anyone with
// progress from before there were editions, the only one, or else ask once ("Which
// grade?"), before the first puzzle.
var gradeTapped = false;
async function pickEdition(eds) {
  var e = await chooseEdition(eds);
  homeScreenEdition(e);
  return e;
}
async function chooseEdition(eds) {
  var byId = function (id) { return eds.find(function (e) { return e.id === id; }); };
  var params = new URLSearchParams(location.search), asked = params.get("edition");
  if (asked !== null && byId(asked)) { who.set("edition", asked); return byId(asked); }
  var saved = byId(who.get("edition", ""));
  if (saved) return saved;
  var start = byId(params.get("start") || "");
  if (start) { who.set("edition", start.id); return start; }
  var before = !PROFILE && ["progress", "log", "settings", "achievements"].some(function (k) { return device.get(k, null) != null; });
  var original = eds.find(function (e) { return e.file === "packs.toml"; });
  if (before && original) { who.set("edition", original.id); return original; }
  if (eds.length === 1) return eds[0];
  gradeTapped = true; // that tap also lets sound play, so no Start button after it
  var chosen = await new Promise(function (resolve) {
    var box = $("#gradeChoices"); box.innerHTML = "";
    eds.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "primary"; b.textContent = e.name;
      b.addEventListener("click", function () { resolve(e); });
      box.appendChild(b);
    });
    $("#gradeAsk").hidden = false;
    box.firstChild.focus();
  });
  $("#gradeAsk").hidden = true;
  who.set("edition", chosen.id);
  return chosen;
}
// A Home Screen app starts with its own empty storage, so it can't know the grade picked in
// Safari. iOS saves either the page's address or the manifest's start_url, so both carry
// it as ?start=<id>: the grade to open when this device hasn't picked one (unlike ?edition=,
// it doesn't override a grade switched to later in Settings).
function homeScreenEdition(e) {
  try {
    var params = new URLSearchParams(location.search);
    params.delete("edition");
    params.set("start", e.id);
    history.replaceState(null, "", location.pathname + "?" + params + location.hash);
    var link = document.querySelector('link[rel="manifest"]');
    if (link) link.setAttribute("href", "editions/" + e.id + ".webmanifest");
  } catch (err) {}
}

var PACKS, DEFAULT_CUSTOM, EDITIONS, EDITION;
try {
  // Imported here, not at the top: words.js pulls in the TOML parser from the CDN, and a
  // failed static import would stop this whole module before it could show Try again.
  var { loadPacks, loadEditions, storagePrefix } = await import("./words.js");
  EDITIONS = await loadEditions();
  EDITION = await pickEdition(EDITIONS);
  PREFIX = gradePrefix(PROFILE, EDITION);
  ({ packs: PACKS, starter: DEFAULT_CUSTOM } = await loadPacks(EDITION.file));
} catch (e) {
  // A home-screen app has no reload button, so offer one.
  $("#board").innerHTML = '<p class="empty-msg">Couldn’t load the word packs. Check the connection, then try again.</p>' +
    '<button class="primary" id="retryBtn" type="button">Try again</button>';
  $("#retryBtn").onclick = function () { location.reload(); };
  throw e;
}

// Settings are the edition's own (each child's), the chime too. The chime used to be the
// device's ("sbx:shared", before that the plain "sbx:settings"), so once, that choice is copied
// into every edition's settings: a device that had it off keeps it off everywhere.
(function moveChime() {
  if (device.get("chimeMoved", false)) return;
  var was = (device.get("shared", {}) || {}).chime;
  if (was === undefined) was = (device.get("settings", {}) || {}).chime;
  if (was !== undefined) EDITIONS.forEach(function (ed) {
    var key = storagePrefix(ed) + "settings";
    try { var s = JSON.parse(localStorage.getItem(key)) || {}; s.chime = was; localStorage.setItem(key, JSON.stringify(s)); } catch (e) {}
  });
  try { localStorage.removeItem("sbx:shared"); } catch (e) {}
  device.set("chimeMoved", true);
})();
var settings = Object.assign({ syl: true, kb: EDITION.keyboard, speakSel: true, chime: true }, store.get("settings", {}));
var customText = store.get("custom", DEFAULT_CUSTOM);
var stars = store.get("stars", {});
var packId = store.get("pack", "");
// The Custom pack ("mine") is off until a grown-up turns it on in Settings, except where it
// was already in use before the switch existed (a saved list, picked, or played).
if (settings.custom === undefined) {
  var oldProg = store.get("progress", {}).mine;
  settings.custom = store.get("custom", null) !== null || packId === "mine" || !!(oldProg && oldProg.done && Object.keys(oldProg.done).length);
}
// Packs to offer: every pack, and Custom when it's on; hard mode packs (🥋) last.
function packIds() {
  var ids = Object.keys(PACKS).filter(function (id) { return id !== "mine" || settings.custom; });
  return ids.filter(function (id) { return !PACKS[id].hard; }).concat(ids.filter(function (id) { return PACKS[id].hard; }));
}
if (!PACKS[packId] || packIds().indexOf(packId) < 0) packId = packIds()[0];
var recent = []; // words from recent puzzles, avoided in the next one
// Per pack: `done` = words completed at least once (the % shown); `round` = words completed
// since the pack was last fully covered, so new puzzles bring in the rest first (`rounds`:
// how many rounds have started);
// `stats[word]` = { n: times spelled (typed, not finished by a crossing word),
// ok: times right on the first try, miss: wrong tries }.
var progress = store.get("progress", {});
// Finished puzzles, newest first: { t: ms, pack, n: words, m: try-agains }. Counts only,
// never the words: Settings isn't locked and would show the spellings.
var log = store.get("log", []);
// Achievement inputs and what's been earned ({ id: timestamp }); see achievements.js.
// The first time, practice days and clean solves are filled in from the puzzle log.
var counts = store.get("counts", null), days = store.get("days", null);
if (!counts) counts = { clean: log.filter(function (e) { return e.m === 0; }).length, comeback: 0 };
if (!days) days = log.map(function (e) { return dayKey(e.t); }).filter(function (d, i, a) { return a.indexOf(d) === i; });
var earned = store.get("achievements", {});
// Hard mode packs open with the first Champion of an everyday pack in this grade (Custom doesn't
// count); until then their chips show locked.
function isHard(id) { return !!(PACKS[id] && PACKS[id].hard); }
function hardOpen() {
  return Object.keys(earned).some(function (k) { var id = k.slice(5); return k.indexOf("pack:") === 0 && id !== "mine" && PACKS[id] && !isHard(id); });
}
if (isHard(packId) && !hardOpen()) packId = packIds()[0];
// Where wrong letters fall in try-agains (phonics.js slipSpots), counts only, for Stats.
var SLIPS0 = { place: { start: 0, middle: 0, end: 0 }, kind: { vowel: 0, blend: 0, consonant: 0 } };
var slips = store.get("slips", null) || JSON.parse(JSON.stringify(SLIPS0));
// Color schemes (palettes.js): Classic, plus one more per pack finished. Cosmetic only.
// Earned achievements are never taken away, so neither are unlocked colors.
var paletteStyle = document.createElement("style");
paletteStyle.textContent = paletteCSS();
document.head.appendChild(paletteStyle);
// Everyday packs finished (each opens the next scheme); a hard pack finished opens Black Belt instead.
function packsFinished() { return Object.keys(earned).filter(function (id) { return id.indexOf("pack:") === 0 && !isHard(id.slice(5)); }).length; }
function hardFinished() { return Object.keys(earned).some(function (id) { return id.indexOf("pack:") === 0 && isHard(id.slice(5)); }); }
function paletteOpen(i) { return PALETTES[i].secret ? hardFinished() : i < unlockedCount(packsFinished()); }
function applyPalette() {
  var i = PALETTES.findIndex(function (p) { return p.id === settings.palette; });
  if (i < 0 || !paletteOpen(i)) i = 0;
  document.documentElement.dataset.palette = PALETTES[i].id;
}
applyPalette();
var LOG_MAX = 200;
function packProgress(id) {
  var pp = progress[id] = progress[id] || {};
  pp.done = pp.done || {}; pp.round = pp.round || []; pp.stats = pp.stats || {};
  return pp;
}

function entries(id) { return parseList(id === "mine" ? customText : PACKS[id].list); }

/* ---------- state ---------- */
var P = null; // current puzzle, from makePuzzle()
// fill: letter typed per cell; locked: confirmed-correct cells; doneW: finished word indexes;
// cur: selected word; pos: cursor letter index within it.
var fill = {}, locked = {}, doneW = {}, cur = 0, pos = 0, misses = 0, finished = false;
var missedW = {}; // word indexes with a wrong try in this puzzle
var newPics = 0;  // pictures added to the collection in this puzzle
// For the secret achievements, this puzzle so far: words a listening helper was used on
// before they were finished (`helped`), words finished by a crossing word (`crossed`), a
// word that finished a crossing word too (`twofer`), and letters typed on real keys (`keys`).
var pz = { helped: {}, crossed: {}, twofer: false, keys: false, guess: {}, nudged: {} };

function newPuzzle(solved) {
  if (updateReady) { location.reload(); return; }
  skipEntrance();
  $("#done").hidden = true; $("#cluebar").classList.remove("spent"); $(".board-card").style.minHeight = "";
  finished = false; fill = {}; locked = {}; doneW = {}; misses = 0; missedW = {}; newPics = 0; pz = { helped: {}, crossed: {}, twofer: false, keys: false, guess: {}, nudged: {} };
  var pool = entries(packId);
  if (pool.length < 3) { P = null; renderEmpty(); return; }
  var pp = packProgress(packId), words = pool.map(function (e) { return e.w; });
  var fresh = words.filter(function (w) { return pp.round.indexOf(w) < 0; });
  // A new round. `rounds` counts them, so when two devices' copies are combined (merge.js) the later round wins.
  if (!fresh.length) { pp.round = []; pp.rounds = (pp.rounds || 0) + 1; fresh = words; store.set("progress", progress); }
  P = makePuzzle(pool, recent, fresh);
  recent = P.words.map(function (p) { return p.w; }).concat(recent).slice(0, 8);
  renderBoard();
  renderClues();
  select(order()[0], null, false);
  // Only finishing a puzzle moves on to the next entrance. Remembered (entranceDue) until it
  // plays, so an update's reload between the solve and the new puzzle doesn't lose the turn.
  var turn = solved === true || store.get("entranceDue", false) === true;
  if (started || gradeTapped) runEntrance(turn); else { board.classList.add("waiting"); waitTurn = turn; } // the Start tap plays it
}
// The first word, said as the new puzzle's boxes land (with auto-speak on), unless the player has
// already moved on: picked another word or typed.
function sayFirstWord(p) {
  if (P !== p || finished || !settings.speakSel || cur !== order()[0] || Object.keys(fill).length) return;
  sayWord(P.words[cur], 0.85, true);
}
// New-puzzle entrances (entrances.js): the boxes arrive in one of several ways, with sounds
// (the Sound effects setting covers them). Every new puzzle gets one (not one restored at launch),
// but the cycle only moves on after a finished puzzle (Next puzzle); otherwise the same one
// plays again. Skipped with reduced motion. Taps and keys work during it (typing fills the boxes
// as they arrive) but don't cut it short; a new puzzle does.
var entrance = null, waitTurn = false;
function runEntrance(turn) {
  board.classList.remove("waiting");
  skipEntrance();
  var p = P, after = function () { sayFirstWord(p); }, test = tester && tester.next();
  if (!P || document.hidden) return;
  if (reducedMotion() && !test) { after(); return; }
  var saved = store.get("entrances", null), id = saved && saved.last, queue = entranceQueue();
  if (turn && !test) store.set("entranceDue", false);
  if (test) id = test.id; // the tester (?backstage) picks it, and leaves the cycle and Front Row Seat alone
  else if (turn && queue.length) { // the player's own order (the Director tab) comes first
    id = queue.shift(); store.set("entranceQueue", queue);
    store.set("entrances", Object.assign({}, saved, { last: id }));
  } else if (turn || !id) { var pick = nextEntrance(saved); store.set("entrances", pick.state); id = pick.id; }
  var run = playEntrance(id, geometry(P, board, order()), { audio: (test ? test.sound : settings.chime) ? audioOut() : null, rate: test ? test.rate : 1 });
  entrance = run;
  showBoardCard();
  kbEl.classList.add("resting"); // the letter pad unpins while the boxes arrive, and pins again after
  run.done.then(function (skipped) {
    if (entrance === run) { entrance = null; pinPad("resting"); }
    if (test) test.done(run, skipped);
    else if (!skipped) { after(); sawEntrance(run.id); }
  });
}
// The entrance tester: open the app with ?backstage for a bar that replays any entrance on the real
// board (js/entrance-tester.js), to refine them where they'll be seen. Nothing links to it.
var tester = null;
// It stays on (this device) once opened, until its Exit button, so a reload always keeps it.
if ((function () {
  var on = new URLSearchParams(location.search).has("backstage");
  try { if (on) localStorage.setItem("sbx:backstage-on", "1"); else on = localStorage.getItem("sbx:backstage-on") === "1"; } catch (e) {}
  return on;
})()) {
  import("./entrance-tester.js").then(function (m) {
    tester = m.mountTester({
      replay: function () { dismissStart(); runEntrance(false); },
      newShape: function () { dismissStart(); newPuzzle(); }
    });
  });
}
function dismissStart() { if (!$("#startOverlay").hidden) { $("#startOverlay").hidden = true; started = true; } }
// Brings the whole puzzle card into view for an entrance (its top, if it's taller than the screen).
function showBoardCard() {
  var card = board.parentElement, r = card.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  card.scrollIntoView({ block: r.height <= window.innerHeight - 24 ? "nearest" : "start", behavior: "smooth" });
}
// Pins the letter pad again once neither reason to unpin it (resting, asleep) is left; if it wasn't
// all on screen, it rises in from the bottom rather than popping up.
function pinPad(why) {
  var off = kbEl.getBoundingClientRect().bottom > window.innerHeight + 1; // not all on screen
  kbEl.classList.remove(why);
  if (!off || kbEl.classList.contains("resting") || kbEl.classList.contains("asleep")) return;
  kbEl.classList.remove("rise"); void kbEl.offsetWidth; kbEl.classList.add("rise");
}
function skipEntrance() { if (entrance) entrance.skip(); }
// Entrances seen to the end, for Front Row Seat (every one), which opens the Director tab.
function sawEntrance(id) {
  var seen = store.get("seenEntrances", []);
  if (seen.indexOf(id) >= 0) return;
  seen.push(id); store.set("seenEntrances", seen);
  counts.entrances = seen.filter(function (x) { return ENTRANCES.some(function (e) { return e.id === x; }); }).length;
  store.set("counts", counts);
  var fresh = checkAchievements();
  if (!fresh.length) return;
  fresh.forEach(function (a) { if (pending.indexOf(a.id) < 0) pending.push(a.id); });
  store.set("pending", pending);
  pillChime = true;
  refreshPill();
}
// The player's chosen order (ids), played one per finished puzzle before the usual cycle.
function entranceQueue() {
  return (store.get("entranceQueue", []) || []).filter(function (x) { return ENTRANCES.some(function (e) { return e.id === x; }); });
}
// Word indexes in clue order: by number, across before down.
function order() {
  return P.words.map(function (_, i) { return i; }).sort(function (a, b) {
    return P.words[a].num - P.words[b].num || (P.words[a].dir === "A" ? -1 : 1);
  });
}

/* ---------- rendering ---------- */
var board = $("#board");
function sizeBoard() {
  if (!P) return;
  var avail = board.parentElement.clientWidth - 24;
  var cell = Math.floor((avail - (P.cols - 1) * 4) / P.cols);
  // On short screens also fit the height, so the clue, grid and pad can be on screen
  // together; never below 30px for that (past it, the pad floats over the page instead).
  var availH = window.innerHeight - $("#keyboard").offsetHeight - $("#cluebar").offsetHeight - 3 * 14 - 32 - 8;
  var byH = Math.floor((availH - (P.rows - 1) * 4) / P.rows);
  cell = Math.max(24, Math.min(50, cell, Math.max(30, byH)));
  board.style.setProperty("--cell-size", cell + "px");
}
function renderEmpty() {
  board.style.gridTemplateColumns = "";
  board.innerHTML = '<p class="empty-msg">This pack needs at least 3 words. Open <b>More</b> (the gear, top right) and add words under “Custom words”.</p>';
  $("#clueList").innerHTML = "";
  $("#pic").textContent = "✏️"; $("#clueLabel").textContent = "No puzzle yet"; $("#clueSub").textContent = "";
  $("#clueSent").hidden = true;
}
function renderBoard() {
  board.innerHTML = "";
  board.style.gridTemplateColumns = "repeat(" + P.cols + ", var(--cell-size))";
  for (var r = 0; r < P.rows; r++) for (var c = 0; c < P.cols; c++) {
    var kk = r + "," + c, cell = P.cells[kk], d = document.createElement("div");
    if (!cell) { d.className = "void"; board.appendChild(d); continue; }
    d.className = "cell"; d.dataset.k = kk;
    d.setAttribute("role", "button"); d.setAttribute("aria-label", "box");
    d.innerHTML = (cell.num ? '<span class="num">' + cell.num + "</span>" : "") + '<span class="ch"></span>';
    board.appendChild(d);
  }
  // The sentence line is there for the whole puzzle if any word has one, so the layout
  // doesn't jump between words.
  $("#clueSent").hidden = !P.words.some(function (W) { return W.sentence; });
  sizeBoard();
}
// Words with no emoji get a drawn sound-wave icon: listen, then spell.
var WAVE = '<svg class="wave" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4M7 6.5v11M11 3v18M15 7.5v9M19 10v4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
function setPic(el, pic) { if (pic) el.textContent = pic; else el.innerHTML = WAVE; }
function cellEl(kk) { return board.querySelector('[data-k="' + kk + '"]'); }
// Syncs the board, clue bar, and clue tiles with the play state.
// The clue's sentence with each blank drawn as small boxes, one per letter, like the grid.
// A word with a picture and no sentence uses that line for its blank boxes, with an arrow up to
// the picture: these boxes are that picture.
var UP_ARROW = '<svg class="to-pic" viewBox="0 0 56 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M53 23H40c-6 0-9-4-9-11V4"/><path d="M24.5 10.5 31 3.5l6.5 7"/></svg>';
function showSentence(text, toPic) {
  var el = $("#clueSent"); el.textContent = "";
  el.classList.toggle("pic-line", !!toPic);
  if (toPic) el.insertAdjacentHTML("beforeend", UP_ARROW);
  text.split(/(_+)/).forEach(function (part) {
    if (!/^_+$/.test(part)) { if (part) el.appendChild(document.createTextNode(part)); return; }
    var blank = document.createElement("span");
    blank.className = "blank";
    blank.setAttribute("role", "img");
    blank.setAttribute("aria-label", "blank, " + part.length + (part.length === 1 ? " letter" : " letters"));
    for (var i = 0; i < part.length; i++) blank.appendChild(document.createElement("span"));
    el.appendChild(blank);
  });
}
function update() {
  if (!P) return;
  var W = P.words[cur];
  board.querySelectorAll(".cell").forEach(function (el) {
    var kk = el.dataset.k, idx = W.cells.indexOf(kk);
    el.querySelector(".ch").textContent = fill[kk] || "";
    el.classList.toggle("locked", !!locked[kk]);
    el.classList.toggle("sel", idx >= 0 && !finished);
    el.classList.toggle("syl-a", idx >= 0 && settings.syl && W.sylOf[idx] % 2 === 0);
    el.classList.toggle("syl-b", idx >= 0 && settings.syl && W.sylOf[idx] % 2 === 1);
    el.classList.toggle("cursor", idx === pos && !finished);
  });
  // Keep the box being typed into on screen (and out from behind the floating pad).
  var cursorEl = board.querySelector(".cell.cursor");
  if (cursorEl) cursorEl.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  setPic($("#pic"), W.pic);
  $("#clueLabel").textContent = W.num + (W.dir === "A" ? " Across" : " Down");
  var n = W.chunks.length;
  $("#clueSub").textContent = W.w.length + " boxes · " + n + (n === 1 ? " beat" : " beats");
  // Only this word is blanked; pack sentences avoid the pack's other words (the check enforces it).
  showSentence(W.sentence ? blankSentence(W.sentence, [W.w]) : W.pic ? W.w.replace(/./g, "_") : "", !W.sentence && !!W.pic);
  $("#clapBtn").hidden = n < 2; // nothing to break down in a one-beat word
  $("#soundBtn").hidden = !canSoundOut(W);
  document.querySelectorAll(".ctile").forEach(function (t) {
    var i = +t.dataset.i;
    t.classList.toggle("cur", i === cur && !finished);
    t.classList.toggle("fin", !!doneW[i]);
  });
  savePuzzle();
}

// The puzzle in progress is saved (per edition) after every change, so closing the app,
// a reload or an update doesn't lose it; cleared once it's solved. Layout only (each
// word's details come from the word list when it's restored).
function savePuzzle() {
  store.set("puzzle", P && !finished ? {
    pack: packId, words: P.words.map(function (W) { return { w: W.w, r: W.r, c: W.c, dir: W.dir }; }),
    fill: fill, locked: locked, doneW: doneW, cur: cur, pos: pos, misses: misses, missedW: missedW, newPics: newPics, pz: pz, recent: recent
  } : null);
}
// On launch: the saved puzzle, if it's for the current pack and every word is still in it.
function loadPuzzle() {
  var s = store.get("puzzle", null);
  if (!s || s.pack !== packId || !PACKS[packId]) return false;
  var p = restorePuzzle(entries(packId), s.words);
  if (!p) return false;
  P = p; finished = false;
  fill = s.fill || {}; locked = s.locked || {}; doneW = s.doneW || {};
  misses = s.misses || 0; missedW = s.missedW || {}; newPics = s.newPics || 0;
  pz = Object.assign({ helped: {}, crossed: {}, twofer: false, keys: false }, s.pz);
  recent = Array.isArray(s.recent) ? s.recent : [];
  renderBoard();
  renderClues();
  var i = s.cur >= 0 && s.cur < P.words.length ? s.cur : order()[0];
  select(i, s.pos >= 0 && s.pos < P.words[i].w.length ? s.pos : null, false);
  return true;
}
function renderClues() {
  var list = $("#clueList"); list.innerHTML = "";
  order().forEach(function (i) {
    var W = P.words[i], b = document.createElement("button");
    b.type = "button"; b.className = "ctile"; b.dataset.i = i;
    var e = document.createElement("span"), l = document.createElement("span");
    e.className = "e"; setPic(e, W.pic);
    l.className = "l"; l.textContent = W.num + (W.dir === "A" ? " across" : " down");
    b.append(e, l);
    b.setAttribute("aria-label", W.num + (W.dir === "A" ? " across" : " down") + ", hear the word");
    b.addEventListener("click", function () { select(i, null, true, true); });
    list.appendChild(b);
  });
}

/* ---------- play ---------- */
function firstEmpty(i, from) {
  var W = P.words[i], n = W.cells.length;
  from = from || 0;
  for (var s = 0; s < n; s++) { var j = (from + s) % n; if (!fill[W.cells[j]]) return j; }
  return -1;
}
// Says the word; if it has a context sentence, spelling-test style: word, sentence, word.
// say() queues, so the three play in order.
// `after` queues it behind what's being said (a pack's name) instead of cutting that off.
function sayWord(W, rate, after) {
  say("w", W.w, rate, !after);
  if (W.sentence) { say("t", W.sentence, 0.9); say("w", W.w, rate); }
}
// Select word i with the cursor at letter p (or its first empty box). `say` speaks the
// word if it changed and auto-speak is on; `force` speaks it regardless.
function select(i, p, say, force) {
  if (!P || finished) return;
  var changed = i !== cur;
  cur = i;
  var fe = firstEmpty(i);
  pos = p != null ? p : (fe < 0 ? 0 : fe);
  update();
  if (say && (force || (changed && settings.speakSel))) sayWord(P.words[i], 0.85);
}
// After cell kk changes, complete any crossing word that is now fully correct.
function settleCrossings(kk) {
  var newly = [];
  P.cells[kk].words.forEach(function (i) {
    if (doneW[i]) return;
    var W = P.words[i];
    if (W.cells.every(function (c, j) { return fill[c] === W.w[j]; })) newly.push(i);
  });
  newly.forEach(function (i) { complete(i, false); });
  return newly.length > 0;
}
function flash(kk, cls, ms) {
  var el = cellEl(kk); if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(function () { el.classList.remove(cls); }, ms || 450);
}
// Letters are accepted until the word is full, then checked together, so the player
// has to recall the whole spelling instead of guessing letter by letter.
function input(ch) {
  if (!P || finished || Date.now() < padPausedUntil) return;
  var W = P.words[cur];
  if (doneW[cur]) { var nx = nextUnfinished(); if (nx < 0) return; select(nx, null, true); W = P.words[cur]; }
  if (locked[W.cells[pos]]) { var fe = firstEmpty(cur, pos); if (fe < 0) return; pos = fe; }
  fill[W.cells[pos]] = ch;
  if (W.cells.every(function (c) { return fill[c]; })) { checkWord(cur); return; }
  var nxt = firstEmpty(cur, pos + 1);
  if (nxt >= 0) pos = nxt;
  update();
}
// Complete the word if right; otherwise flash wrong boxes, then clear them.
function checkWord(i) {
  var W = P.words[i];
  if (W.cells.every(function (c, j) { return fill[c] === W.w[j]; })) { complete(i, true); update(); return; }
  misses++;
  missedW[i] = true;
  var st = wordStats(W.w);
  st.miss++;
  store.set("progress", progress);
  var firstWrong = -1, wrong = [];
  W.cells.forEach(function (c, j) {
    if (fill[c] !== W.w[j]) {
      if (firstWrong < 0) firstWrong = j;
      wrong.push(j);
      flash(c, "wrong", 700); flash(c, "wiggle");
    }
  });
  slipSpots(W.w, W.sounds, wrong).forEach(function (s) { slips.place[s.place]++; slips.kind[s.kind]++; });
  store.set("slips", slips);
  noteGuesses(i, wrong);
  update();
  setTimeout(function () {
    W.cells.forEach(function (c, j) { if (fill[c] !== W.w[j] && !locked[c]) delete fill[c]; });
    pos = firstWrong < 0 ? 0 : firstWrong;
    update();
  }, 700);
}
// The guessing nudge: a 4th letter that isn't close (phonics.js isClose) in the same box of a
// word, counted across its tries, with no listening in between (listened() clears the count),
// reads as throwing letters at the box. Once per word: the toast "Slow down and sound it
// out." (a strategy, not a button: anyone can sound a word out) and the letter pad paused for
// a second, looking paused (.paused) so it doesn't seem broken. Nothing is lost.
var GUESSES = 4, PAD_PAUSE = 1000, padPausedUntil = 0;
var guessing = store.get("guessing", null) || { t: [], words: {} }; // for Stats: when, and on which words
function noteGuesses(i, wrong) {
  var W = P.words[i];
  pz.guess = pz.guess || {}; pz.nudged = pz.nudged || {};
  var g = pz.guess[i] = pz.guess[i] || {}, hit = false;
  wrong.forEach(function (j) {
    if (isClose(W.w, j, fill[W.cells[j]])) return;
    g[j] = (g[j] || 0) + 1;
    if (g[j] >= GUESSES) hit = true;
  });
  if (!hit || pz.nudged[i]) return;
  pz.nudged[i] = true;
  toast("Slow down and sound it out.");
  padPausedUntil = Date.now() + PAD_PAUSE;
  kbEl.classList.add("paused");
  setTimeout(function () { kbEl.classList.remove("paused"); }, PAD_PAUSE);
  guessing.t.push(Date.now()); guessing.t = guessing.t.slice(-200);
  guessing.words[W.w] = (guessing.words[W.w] || 0) + 1;
  store.set("guessing", guessing);
}
// Hear it, Break it down, Sound it out or the picture: listening wipes the word's guess count.
function listened() { if (P && pz.guess) delete pz.guess[cur]; }
function nextUnfinished() {
  var o = order(), k = o.indexOf(cur);
  for (var s = 1; s <= o.length; s++) { var i = o[(k + s) % o.length]; if (!doneW[i]) return i; }
  return -1;
}
function wordStats(w) {
  var stats = packProgress(packId).stats;
  return stats[w] = stats[w] || { n: 0, ok: 0, miss: 0 };
}
// `typed`: the player spelled it (checkWord), rather than a crossing word filling it in.
function complete(i, typed) {
  if (doneW[i]) return;
  doneW[i] = true;
  var W = P.words[i];
  W.cells.forEach(function (c, j) { fill[c] = W.w[j]; locked[c] = true; setTimeout(function () { flash(c, "pop"); }, j * 60); });
  say("w", W.w, 0.9);
  var pp = packProgress(packId);
  pp.done[W.w] = true;
  if (typed) {
    var st = wordStats(W.w);
    // Comeback: right on the first try now (no miss this puzzle), after a miss before.
    if (!missedW[i] && st.miss > 0 && !st.cb) {
      st.cb = true; counts.comeback++; store.set("counts", counts);
      toast("🏀 You got it this time!");
    }
    st.n++;
    if (!missedW[i]) { if (!st.ok) newPics++; st.ok++; } // first first-try: its picture is collected
  }
  if (!typed) pz.crossed[i] = true;
  if (pp.round.indexOf(W.w) < 0) pp.round.push(W.w);
  store.set("progress", progress);
  renderProgress();
  var both = W.cells.map(settleCrossings).some(Boolean); // its letters may have finished a crossing word
  if (both && typed) pz.twofer = true;
  if (Object.keys(doneW).length === P.words.length) { setTimeout(finish, 700); return; }
  if (i === cur) {
    var nx = nextUnfinished();
    setTimeout(function () { if (!finished && doneW[cur]) select(nx, null, true); }, 900);
  }
}
function finish() {
  if (finished) return;
  finished = true;
  stars[packId] = (stars[packId] || 0) + 1;
  store.set("stars", stars);
  log.unshift({ t: Date.now(), pack: packId, n: P.words.length, m: misses });
  log = log.slice(0, LOG_MAX);
  store.set("log", log);
  if (misses === 0) counts.clean++;
  if (isHard(packId)) counts.hard = (counts.hard || 0) + 1;
  if (pz.twofer) counts.twofer = (counts.twofer || 0) + 1;
  if (settings.kb === "qwerty" || pz.keys) counts.qwerty = (counts.qwerty || 0) + 1;
  if (listenedToAll()) counts.listener = (counts.listener || 0) + 1;
  var wd = new Date().getDay();
  if (wd === 0 || wd === 6) counts.weekend = (counts.weekend || 0) + 1; // this puzzle, not past weekends
  store.set("counts", counts);
  store.set("entranceDue", true); // the next new puzzle gets the next entrance (newPuzzle)
  var today = dayKey(Date.now());
  if (days.indexOf(today) < 0) { days.push(today); store.set("days", days); }
  syncSoon();
  // Secret ones earned outside a puzzle and not opened yet join this puzzle's.
  var fresh = checkAchievements().concat(takePending());
  renderPacks();
  update();
  var parts = [P.words.length + (P.words.length === 1 ? " word" : " words")];
  parts.push(misses === 0 ? "no slips" : misses === 1 ? "1 try again" : misses + " try-agains");
  if (newPics) parts.push("+" + newPics + (newPics === 1 ? " picture" : " pictures"));
  $("#doneStats").textContent = parts.join(" · ");
  var newList = $("#doneNew"); newList.innerHTML = "";
  fresh.forEach(function (a) {
    var li = document.createElement("li");
    li.textContent = a.icon + " " + a.title;
    newList.appendChild(li);
  });
  newList.hidden = !fresh.length;
  $("#done").hidden = false;
  // A small board is shorter than the card: grow the board's card so it fits, nothing cut off.
  var done = $("#done"), bc = $(".board-card");
  done.style.bottom = "auto"; // its own height, not the card's
  var need = done.offsetHeight;
  done.style.bottom = "";
  if (need > bc.offsetHeight) bc.style.minHeight = need + "px";
  $("#cluebar").classList.add("spent"); // grayed out with the puzzle solved: no word left to hear
  confetti($(".board-card"));
  if (settings.chime) chime();
  say("p", "You solved it!", 0.95);
  say("p", "Way to go!", 0.95);
  $("#nextBtn").focus();
  if (fresh.length) setTimeout(function () { showAwards(fresh); }, 1100); // after the solve celebration
}
function back() {
  if (!P || finished) return;
  var W = P.words[cur], kk = W.cells[pos];
  if (fill[kk] && !locked[kk]) { delete fill[kk]; update(); return; }
  for (var j = pos - 1; j >= 0; j--) {
    if (!locked[W.cells[j]]) { pos = j; delete fill[W.cells[j]]; break; }
  }
  update();
}

/* ---------- scaffold: Break it down ---------- */
// Speaks each syllable slowly while its boxes light up, then the whole word.
// Multi-syllable words only; the button is hidden for one-beat words.
var clapping = false;
async function clap() {
  if (!P || clapping) return;
  clapping = true;
  var W = P.words[cur], idx = 0;
  if (W.chunks.length < 2) { clapping = false; return; }
  if (!doneW[cur]) pz.helped[cur] = true;
  stopSpeech();
  var my = speechEpoch(); // another tap that stops speech also ends the clap
  for (var ci = 0; ci < W.chunks.length && speechEpoch() === my; ci++) {
    var ks = W.cells.slice(idx, idx + W.chunks[ci].length);
    idx += W.chunks[ci].length;
    ks.forEach(function (c) { var el = cellEl(c); el && el.classList.add("beat"); });
    await say("s", W.say[ci], 0.7);
    await new Promise(function (r) { setTimeout(r, 250); });
    ks.forEach(function (c) { var el = cellEl(c); el && el.classList.remove("beat"); });
  }
  if (speechEpoch() === my) await say("w", W.w, 0.8);
  clapping = false;
}

/* ---------- scaffold: Sound it out ---------- */
// Says each sound of the word (phonics.js) while the letters that make it light up, then the
// whole word: c-a-t, sh-i-p. A blend (fr in frog) plays as one recording: its first
// sound's boxes light, then its second's join them where that sound starts. Only in
// editions that turn it on, for words whose sounds are
// listed (not sight words), and only with the recordings: a device voice can't say "k".
function canSoundOut(W) {
  return !!(EDITION.soundItOut && W.sounds && W.sounds.every(function (s) { return hasClip("f", s.sound); }));
}
onClips(function () { if (P) update(); });
async function soundOut() {
  if (!P || clapping) return;
  var W = P.words[cur];
  if (!canSoundOut(W)) return;
  clapping = true;
  if (!doneW[cur]) pz.helped[cur] = true;
  stopSpeech();
  var my = speechEpoch();
  // Box index for each letter that makes a sound (an apostrophe has a box but no sound).
  var letterBox = [];
  for (var i = 0; i < W.w.length; i++) if (W.w[i] !== "'") letterBox.push(W.cells[i]);
  function boxes(seg) { return letterBox.slice(seg.at, seg.at + seg.len); }
  function light(ks, on) { ks.forEach(function (c) { var el = cellEl(c); el && el.classList.toggle("beat", on); }); }
  // Blends with a recording (and where its second sound starts), by their first sound.
  var blendAt = {};
  blendsIn(W.sounds.map(function (s) { return s.sound; })).forEach(function (b) {
    if (hasClip("f", b.name) && splitOf("f", b.name) != null) blendAt[b.at] = b.name;
  });
  for (var si = 0; si < W.sounds.length && speechEpoch() === my; si++) {
    var ks = boxes(W.sounds[si]);
    light(ks, true);
    if (blendAt[si]) {
      var second = boxes(W.sounds[si + 1]);
      await sayRecorded("f", blendAt[si], [{ ms: splitOf("f", blendAt[si]), fn: function () { if (speechEpoch() === my) light(second, true); } }]);
      ks = ks.concat(second);
      si++;
    } else {
      await sayRecorded("f", W.sounds[si].sound);
    }
    await new Promise(function (r) { setTimeout(r, 300); });
    light(ks, false);
  }
  if (speechEpoch() === my) await say("w", W.w, 0.8);
  clapping = false;
}

// Good Listener: Break it down or Sound it out on every word that has one (at least 3),
// before spelling it. Words a crossing word finished don't need it.
function listenedToAll() {
  var want = P.words.map(function (W, i) { return i; }).filter(function (i) {
    var W = P.words[i];
    return !pz.crossed[i] && (W.chunks.length > 1 || canSoundOut(W));
  });
  return want.length >= 3 && want.every(function (i) { return pz.helped[i]; });
}

/* ---------- letter pad and physical keyboard ---------- */
function renderKeyboard() {
  // The apostrophe is typed like a letter (where it goes is part of spelling don't). It's
  // always shown, so its presence doesn't hint that a puzzle has a contraction.
  var rows = settings.kb === "qwerty" ? ["qwertyuiop", "asdfghjkl", "zxcvbnm'⌫"] : ["abcdefg", "hijklmn", "opqrstu", "vwxyz'⌫"];
  var kb = $("#keyboard"); kb.innerHTML = "";
  rows.forEach(function (row) {
    var r = document.createElement("div"); r.className = "krow";
    Array.from(row).forEach(function (k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "key";
      if (k === "⌫") { b.classList.add("wide"); b.textContent = "⌫"; b.setAttribute("aria-label", "Erase"); b.addEventListener("click", back); }
      else {
        b.textContent = k;
        if (k === "'") b.setAttribute("aria-label", "Apostrophe");
        b.addEventListener("click", function () { input(k); });
      }
      r.appendChild(b);
    });
    kb.appendChild(r);
  });
}
document.addEventListener("keydown", function (e) {
  if (!$("#sheet").hidden) { if (e.key === "Escape") closeSheet(); return; }
  if (!$("#award").hidden) { // first: it can sit on top of the 🏆 sheet
    if (e.key === "Enter" && (e.target === $("#awardShare") || e.target === $("#awardPrev") || e.target === $("#awardClose") || e.target === $("#awardHear"))) return;
    if (e.key === "Escape") closeAwards();
    else if (e.key === "Enter" || e.key === "ArrowRight") nextAward();
    else if (e.key === "ArrowLeft") prevAward();
    e.preventDefault();
    return;
  }
  if (!$("#achSheet").hidden) { if (e.key === "Escape") closeAchievements(); return; }
  if (!$("#shareSheet").hidden) { if (e.key === "Escape") closeShare(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[a-z]$/i.test(e.key)) { if (P && !finished) pz.keys = true; input(e.key.toLowerCase()); e.preventDefault(); }
  else if (e.key === "'" || e.key === "\u2019") { input("'"); e.preventDefault(); } // iPad keyboards type ’
  else if (e.key === "Backspace") { back(); e.preventDefault(); }
});

// Tapping a box moves the cursor; tapping the cursor box again switches to the crossing word.
board.addEventListener("click", function (e) {
  var el = e.target.closest(".cell"); if (!el || !P || finished) return;
  var kk = el.dataset.k, ws = P.cells[kk].words, W = P.words[cur];
  var inCur = W.cells.indexOf(kk);
  if (inCur >= 0 && inCur === pos && ws.length > 1) {
    var other = ws.find(function (i) { return i !== cur; });
    select(other, P.words[other].cells.indexOf(kk), true);
  } else if (inCur >= 0) { pos = inCur; update(); }
  else {
    var pick = ws.find(function (i) { return !doneW[i]; });
    if (pick == null) pick = ws[0];
    select(pick, P.words[pick].cells.indexOf(kk), true);
  }
});

/* ---------- packs + settings ---------- */
function renderPacks() {
  var wrap = $("#packs"); wrap.innerHTML = "";
  packIds().forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.setAttribute("aria-pressed", id === packId ? "true" : "false");
    // 🏫: the school's own list (school = true in its packs file), not one of the app's phonics packs.
    // 🥋: a hard mode pack (hard = true), locked until a first everyday pack's Champion.
    var locked = isHard(id) && !hardOpen();
    b.innerHTML = (PACKS[id].school ? '<span class="school" role="img" aria-label="From school">🏫</span> ' : "") +
      (isHard(id) ? '<span class="hard" role="img" aria-label="Hard mode">🥋</span> ' : "") +
      PACKS[id].name + (locked ? ' <span class="lock" role="img" aria-label="Locked">🔒</span>' : "") +
      (stars[id] ? ' <span class="n">⭐' + stars[id] + "</span>" : "");
    if (locked) b.classList.add("locked");
    b.addEventListener("click", function () {
      if (locked) { toast("🥋 Finish every word in a pack to unlock"); return; }
      if (packId === id) return;
      packId = id; store.set("pack", id); recent = [];
      // Its name, said (with auto-speak on) for players still learning to read the chips; the
      // achievement cards already record every pack name. The first word follows it.
      if (settings.speakSel) say("p", PACKS[id].name, 0.95, true);
      renderPacks(); startNewPuzzle();
    });
    wrap.appendChild(b);
  });
  $("#packNote").textContent = PACKS[packId].note;
  renderProgress();
}
// Words in pack `id` completed at least once: { done, total }.
function coverage(id) {
  var words = entries(id), done = packProgress(id).done;
  return { done: words.filter(function (e) { return done[e.w]; }).length, total: words.length };
}
function renderProgress() {
  var c = coverage(packId), el = $("#packProg");
  el.hidden = !c.total;
  el.querySelector(".fill").style.width = (c.total ? Math.round(100 * c.done / c.total) : 0) + "%";
  el.querySelector(".txt").textContent = c.done + " of " + c.total + " words done";
}
// Settings: per-pack coverage and the puzzle log.
// Packs shown in Stats: the ones on offer, and Custom while off only once it was played.
function statsPacks() {
  return Object.keys(PACKS).filter(function (id) { var c = coverage(id); return c.total && (packIds().indexOf(id) >= 0 || c.done); });
}
function renderProgressSheet() {
  renderCalendar();
  var rows = $("#progressPacks"); rows.innerHTML = "";
  statsPacks().forEach(function (id) {
    var c = coverage(id), stats = packProgress(id).stats;
    var firsts = entries(id).filter(function (e) { return stats[e.w] && stats[e.w].ok > 0; }).length;
    var li = document.createElement("li"), name = document.createElement("b");
    name.textContent = (isHard(id) ? "🥋 " : "") + PACKS[id].name;
    li.append(name, ": " + c.done + " of " + c.total + " words · " + firsts + " right on the first try · " +
      (stars[id] || 0) + (stars[id] === 1 ? " puzzle" : " puzzles"));
    rows.appendChild(li);
  });
  renderSlips();
  renderTricky();
  renderGuessing();
  // Comebacks: words spelled right on the first try after an earlier miss, each counted once
  // (counts.comeback, the Bounce Back achievements' input).
  var cb = counts.comeback || 0;
  $("#comebackNote").textContent = cb
    ? cb + (cb === 1 ? " word" : " words") + " spelled right on the first try after being missed before."
    : "None yet: a word spelled right on the first try after being missed before counts here.";
  var list = $("#progressLog"); list.innerHTML = "";
  var fmt = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  log.slice(0, 30).forEach(function (e) {
    var li = document.createElement("li");
    li.textContent = new Date(e.t).toLocaleString(undefined, fmt) + " · " + (PACKS[e.pack] ? PACKS[e.pack].name : e.pack) +
      " · " + e.n + " words · " + (e.m === 0 ? "no slips" : e.m === 1 ? "1 try again" : e.m + " try-agains");
    list.appendChild(li);
  });
  $("#progressEmpty").hidden = log.length > 0;
}
// Practice days: the last 4 weeks, Sunday first, a filled dot per day with a finished puzzle.
function renderCalendar() {
  var cal = $("#calendar"); cal.innerHTML = "";
  var today = new Date(), start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 21);
  for (var w = 0; w < 7; w++) {
    var h = document.createElement("span"); h.className = "wd"; h.setAttribute("aria-hidden", "true");
    h.textContent = new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: "narrow" }); // Jan 7 2024 was a Sunday
    cal.appendChild(h);
  }
  var practiced = 0;
  for (var i = 0; i < 28; i++) {
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = dayKey(d.getTime());
    var on = days.indexOf(k) >= 0, cell = document.createElement("span");
    cell.className = "day" + (on ? " on" : "") + (k === dayKey(today.getTime()) ? " today" : "") + (d > today ? " later" : "");
    cell.title = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + (on ? ": practiced" : "");
    if (on && d <= today) practiced++;
    cal.appendChild(cell);
  }
  var sum = practiced + (practiced === 1 ? " day" : " days") + " practiced in the last 4 weeks · " + days.length + " in all";
  cal.setAttribute("aria-label", sum);
  $("#calSum").textContent = sum;
}
// Where the slips happen: shares of the wrong letters in try-agains, by place in the word and
// by kind of sound, once there are enough to mean something.
var SLIP_MIN = 10;
function renderSlips() {
  var total = slips.place.start + slips.place.middle + slips.place.end, wrap = $("#slipBars");
  wrap.innerHTML = "";
  $("#slipNote").textContent = total < SLIP_MIN
    ? "Shows once there are " + SLIP_MIN + " wrong letters in try-agains (" + total + " so far)."
    : "From " + total + " wrong letters in try-agains.";
  if (total < SLIP_MIN) return;
  var bars = document.createElement("div"); bars.className = "bars";
  [["Where in the word", slips.place, [["start", "Beginning"], ["middle", "Middle"], ["end", "End"]]],
   ["Which sounds", slips.kind, [["vowel", "Vowels"], ["blend", "Letters in blends"], ["consonant", "Other consonants"]]]
  ].forEach(function (g) {
    var sub = document.createElement("span"); sub.className = "sub"; sub.textContent = g[0];
    bars.appendChild(sub);
    g[2].forEach(function (row) {
      var pct = Math.round(100 * g[1][row[0]] / total);
      var lbl = document.createElement("span"), track = document.createElement("span"), fill = document.createElement("span"), val = document.createElement("span");
      lbl.className = "lbl"; lbl.textContent = row[1];
      track.className = "track"; track.setAttribute("aria-hidden", "true");
      fill.className = "fill"; fill.style.width = pct + "%";
      val.className = "val"; val.textContent = pct + "%";
      track.appendChild(fill);
      bars.append(lbl, track, val);
    });
  });
  wrap.appendChild(bars);
}
// Tricky words: missed more often than spelled right on the first try, as pictures (or
// their sound stickers) to tap and hear; never the spelling, since this sheet isn't locked.
var TRICKY_MAX = 12;
function renderTricky() {
  var found = {}, list = $("#trickyList");
  statsPacks().forEach(function (id) {
    var words = entries(id), stats = packProgress(id).stats, stickers = listenStickers(words);
    words.forEach(function (e) {
      var st = stats[e.w];
      if (!st || !st.miss || st.miss <= st.ok) return;
      var score = st.miss - st.ok, have = found[e.w];
      if (!have || score > have.score) found[e.w] = { e: e, score: score, miss: st.miss, sticker: stickers[e.w] };
    });
  });
  var top = Object.keys(found).map(function (w) { return found[w]; })
    .sort(function (a, b) { return b.score - a.score || b.miss - a.miss; }).slice(0, TRICKY_MAX);
  list.innerHTML = "";
  $("#trickyNote").textContent = top.length
    ? "Missed more often than spelled right the first time. Tap a picture to hear the word."
    : "None yet: words missed more often than spelled right will show here.";
  top.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "col-slot got";
    b.setAttribute("aria-label", "Tricky word, hear it");
    if (t.e.pic) b.textContent = t.e.pic; else b.innerHTML = t.sticker;
    b.addEventListener("click", function () { say("w", t.e.w, 0.85, true); });
    list.appendChild(b);
  });
}
// Guessing: how often the nudge fired (all time and the last 4 weeks) and on which words, as
// pictures to tap and hear. Shown once it has fired. Never the letters guessed.
function renderGuessing() {
  var n = guessing.t.length, month = guessing.t.filter(function (t) { return t > Date.now() - 28 * 86400000; }).length;
  $("#guessSec").hidden = !n;
  if (!n) return;
  $("#guessNote").textContent = "Guessing letter after letter instead of listening: " + n + (n === 1 ? " time" : " times") +
    " (" + month + " in the last 4 weeks). These words set it off; tap one to hear it.";
  var list = $("#guessList"); list.innerHTML = "";
  var found = {};
  statsPacks().forEach(function (id) {
    var words = entries(id), stickers = listenStickers(words);
    words.forEach(function (e) { if (guessing.words[e.w] && !found[e.w]) found[e.w] = { e: e, n: guessing.words[e.w], sticker: stickers[e.w] }; });
  });
  Object.keys(found).map(function (w) { return found[w]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, TRICKY_MAX).forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "col-slot got";
    b.setAttribute("aria-label", "Guessed word, hear it");
    if (t.e.pic) b.textContent = t.e.pic; else b.innerHTML = t.sticker;
    b.addEventListener("click", function () { say("w", t.e.w, 0.85, true); });
    list.appendChild(b);
  });
}
// More → Edition, above the tabs (Settings and Stats are per edition): a dropdown of editions; switching reloads into that edition's own
// lists, progress and settings. Hidden when there's only one.
function renderGrades() {
  var sel = $("#editionSel"); sel.innerHTML = "";
  $("#gradeSec").hidden = EDITIONS.length < 2;
  EDITIONS.forEach(function (e) {
    var o = document.createElement("option");
    o.value = e.id; o.textContent = e.name;
    sel.appendChild(o);
  });
  sel.value = EDITION.id;
}
$("#editionSel").addEventListener("change", function (e) {
  if (e.target.value === EDITION.id) return;
  who.set("edition", e.target.value);
  reloadClean();
});
// Start over: clears this edition's progress and everything earned from it. Achievements,
// stars, pictures and colors are all worked out from progress, so clearing only the
// achievements would bring them straight back. Typing the phrase keeps it from happening
// by accident.
var RESET_PHRASE = "start over";
var RESET_KEYS = ["achievements", "progress", "counts", "days", "log", "stars", "puzzle", "pending", "slips", "seenEntrances", "entranceQueue", "entranceDue", "guessing"];
function resetMatches() { return $("#resetText").value.trim().toLowerCase() === RESET_PHRASE; }
$("#resetOpen").addEventListener("click", function () {
  $("#resetOpen").hidden = true; $("#resetBox").hidden = false; $("#resetText").focus();
});
$("#resetText").addEventListener("input", function () { $("#resetGo").disabled = !resetMatches(); });
$("#resetText").addEventListener("keydown", function (e) { if (e.key === "Enter" && resetMatches()) $("#resetGo").click(); });
$("#resetGo").addEventListener("click", function () {
  if (!resetMatches()) return;
  RESET_KEYS.forEach(function (k) { try { localStorage.removeItem(PREFIX + k); } catch (e) {} });
  // A linked profile is unlinked here (Link: Send links it again), so the erased progress
  // can't sync back; other devices keep the shared profile.
  unlink(PROFILE);
  delete settings.palette; store.set("settings", settings);
  location.reload();
});
function closeReset() { $("#resetText").value = ""; $("#resetGo").disabled = true; $("#resetBox").hidden = true; $("#resetOpen").hidden = false; }
// The More sheet (the gear "More" button): Settings, Stats, Link and About tabs. Opens on Settings, or `tab`.
var SHEET_TABS = { set: ["#tabSet", "#setPanel"], stats: ["#tabStats", "#statsPanel"], link: ["#tabLink", "#linkPanel"], about: ["#tabAbout", "#aboutPanel"] };
function openSheet(tab) {
  var first = SHEET_TABS[tab] ? tab : "set";
  selectTab(SHEET_TABS, first);
  renderGrades();
  renderWho();
  renderLink();
  closeReset();
  document.querySelectorAll(".edName").forEach(function (el) { el.textContent = EDITIONS.length > 1 ? EDITION.name : "this grade"; });
  $("#optSyl").checked = settings.syl;
  $("#optSpeakSel").checked = settings.speakSel;
  $("#optChime").checked = settings.chime;
  $("#kbAbc").checked = settings.kb === "abc";
  $("#kbQwerty").checked = settings.kb === "qwerty";
  $("#customText").value = customText;
  $("#optCustom").checked = settings.custom;
  $("#customBox").hidden = !settings.custom;
  renderProgressSheet();
  $("#saveMsg").textContent = "";
  $("#sheet").hidden = false;
  steadyHeight(SHEET_TABS, first);
  $("#closeBtn").focus();
}
/* ---------- achievements ---------- */
function achState() {
  return {
    packs: Object.keys(PACKS).filter(function (id) {
      return packIds().indexOf(id) >= 0 || coverage(id).done > 0; // Custom while off: only once played
    }).map(function (id) {
      var c = coverage(id), stats = packProgress(id).stats;
      var firsts = entries(id).filter(function (e) { return stats[e.w] && stats[e.w].ok > 0; }).length;
      return { id: id, name: PACKS[id].name, done: c.done, total: c.total, firsts: firsts, hard: isHard(id) };
    }),
    hard: counts.hard || 0, clean: counts.clean, comeback: counts.comeback, days: days, edition: EDITION.short,
    secret: { listener: counts.listener, twofer: counts.twofer, shared: counts.shared, look: counts.look, peek: counts.peek, qwerty: counts.qwerty, weekend: counts.weekend, words: wordsRight(), entrances: counts.entrances }
  };
}
// Words spelled right (typed, not finished by a crossing word), in every pack.
function wordsRight() {
  var n = 0;
  Object.keys(progress).forEach(function (id) {
    var stats = (progress[id] && progress[id].stats) || {};
    Object.keys(stats).forEach(function (w) { n += stats[w].n || 0; });
  });
  return n;
}
// Secret achievements earned outside a puzzle (sharing, colors, the collection) don't
// interrupt: they wait in `pending` (saved, so they outlast closing the app) behind a pill
// that stays until it's tapped, then show as cards. A puzzle solved meanwhile shows them
// with its own. The pill waits while a sheet or card is open.
var pending = store.get("pending", []), pillChime = false;
function noteSecret(key) {
  counts[key] = (counts[key] || 0) + 1;
  store.set("counts", counts);
  var fresh = checkAchievements();
  if (!fresh.length) return;
  fresh.forEach(function (a) { if (pending.indexOf(a.id) < 0) pending.push(a.id); });
  store.set("pending", pending);
  pillChime = true;
  refreshPill();
}
function takePending() {
  if (!pending.length) return [];
  var all = catalog(achState()), out = pending.map(function (id) { return all.find(function (a) { return a.id === id; }); }).filter(Boolean);
  pending = []; store.set("pending", pending);
  refreshPill();
  return out;
}
function refreshPill() {
  var pill = $("#secretPill"), open = !$("#sheet").hidden || !$("#achSheet").hidden || !$("#shareSheet").hidden || !$("#award").hidden || !$("#gradeAsk").hidden;
  var show = pending.length > 0 && !open;
  $("#secretText").textContent = pending.length > 1 ? pending.length + " secret achievements!" : "Secret achievement!";
  if (show && pill.hidden) { pill.classList.remove("show"); void pill.offsetWidth; pill.classList.add("show"); }
  pill.hidden = !show;
  if (show && pillChime) { pillChime = false; if (settings.chime) chime(); }
}
$("#secretPill").addEventListener("click", function () {
  var list = takePending();
  if (list.length) showAwards(list);
});
// Awards anything newly met and returns it (for the solved card). Never lets a problem
// here (e.g. odd saved data) stop the game.
function checkAchievements() {
  try {
    var fresh = award(achState(), earned, Date.now());
    if (fresh.length) store.set("achievements", earned);
    return fresh;
  } catch (e) { return []; }
}
// A short note over the board that doesn't interrupt play.
var toastTimer = null;
function toast(text) {
  var el = $("#toast");
  el.textContent = text; el.hidden = false;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 1800);
}
// One card that cycles through the newly earned achievements: dots, back/next (buttons,
// swipe, arrow keys), "Nice!" on the last, and ✕ to close any time. `from` is set when an
// earned one is reopened from the 🏆 sheet: no celebration, and focus goes back there.
var awardQueue = [], awardIndex = 0, awardSeen = 0, awardFrom = null;
function showAwards(list, from) {
  awardQueue = list; awardIndex = 0; awardSeen = from ? Infinity : -1; awardFrom = from || null;
  // The edition's name when there's more than one, since Seed or Liftoff exist in each.
  $("#award").hidden = false;
  showAward(true);
}
// Share: the PNG is made as soon as a card shows, because iPad Safari only opens the share
// sheet straight from a tap (no waiting on drawing in between).
var shareFor = null, shareBlob = null;
// A few collected pictures for the card (pictures only, never words). A pack achievement
// shows that pack's pictures and how many words there are besides ("+17"), so a big pack
// looks big; others show pictures from every pack.
function sharePics(a) {
  var pics = [];
  (a.pack ? [a.pack] : Object.keys(PACKS)).forEach(function (id) {
    if (!PACKS[id]) return;
    var stats = packProgress(id).stats;
    entries(id).forEach(function (e) { if (e.pic && stats[e.w] && stats[e.w].ok > 0 && pics.indexOf(e.pic) < 0) pics.push(e.pic); });
  });
  pics = shuffle(pics).slice(0, a.pack ? 5 : 6);
  return { pics: pics, more: a.pack ? Math.max(0, a.goal - pics.length) : 0 };
}
// The grade line on an achievement's cards: the grade when there's more than one, and "Hard
// mode" on hard mode ones ("3rd grade · Hard mode").
function gradeLine(a) {
  return [EDITIONS.length > 1 ? EDITION.short : "", a.hard ? "Hard mode" : ""].filter(Boolean).join(" · ");
}
function prepareShare(a) {
  shareFor = a.id; shareBlob = null;
  $("#awardShare").hidden = true;
  var shown = sharePics(a);
  renderCard(a, earned[a.id] || Date.now(), shown.pics, gradeLine(a), shown.more).then(function (b) {
    if (shareFor !== a.id) return; // moved on to another card meanwhile
    shareBlob = b;
    $("#awardShare").hidden = false;
  }).catch(function () {}); // no canvas: just no Share button
}
function showAward(first) {
  var a = awardQueue[awardIndex], n = awardQueue.length, last = awardIndex === n - 1;
  // A new one gets a sparkle (with the Sound effects setting) and is read aloud: "New achievement!",
  // its name, what it took. The first waits for "You solved it!"; moving to another card
  // replaces what's being said.
  var kicker = awardFrom ? "Achievement" : a.secret ? "Secret achievement!" : "New achievement!";
  $("#awardKicker").textContent = kicker + (gradeLine(a) ? "\n" + gradeLine(a) : "");
  if (!awardFrom) {
    if (!first) stopSpeech();
    if (settings.chime) sayAfter(sparkle);
    say("p", kicker);
    sayAchievement(a);
  }
  $("#awardHear").hidden = !hasSpeech;
  prepareShare(a);
  $("#awardIcon").textContent = a.icon;
  $("#awardTitle").textContent = a.title;
  $("#awardDetail").textContent = a.detail;
  // A pack finished while there are still colors to unlock: say where to find them.
  $("#awardExtra").hidden = !!awardFrom || a.id.indexOf("pack:") !== 0 || (!a.hard && packsFinished() >= EVERYDAY);
  $("#awardCount").textContent = n > 1 ? (awardIndex + 1) + " of " + n : "";
  var dots = $("#awardDots"); dots.innerHTML = "";
  if (n > 1) awardQueue.forEach(function (_, i) { var d = document.createElement("span"); if (i === awardIndex) d.className = "on"; dots.appendChild(d); });
  $("#awardPrev").hidden = awardIndex === 0;
  $("#awardNext").textContent = last ? "Nice!" : "Next";
  var card = $("#award .award-card");
  card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
  if (awardIndex > awardSeen) { // celebrate each one the first time it's shown (its sound is
    awardSeen = awardIndex;    // the sparkle, queued with the words above)
    confetti(card);
  }
  $("#awardNext").focus();
}
function nextAward() {
  if (awardIndex < awardQueue.length - 1) { awardIndex++; showAward(); } else closeAwards();
}
function prevAward() {
  if (awardIndex > 0) { awardIndex--; showAward(); }
}
// Hear it on the card: "Achievement!", then its name and what it took, again (for
// players who can't read it yet); also on ones reopened from the 🏆 sheet, which aren't
// read on their own.
function hearAward() {
  var a = awardQueue[awardIndex];
  if (!a) return;
  stopSpeech();
  say("p", "Achievement!");
  sayAchievement(a);
}
// The card read aloud, line by line ("Champion!" "Unit 3." "Cleared every word in this pack.").
function sayAchievement(a) {
  spokenParts(a).forEach(function (line) { say("p", line); });
}
function closeAwards() {
  if (!awardFrom) stopSpeech();
  $("#award").hidden = true;
  shareFor = shareBlob = null;
  (awardFrom || $("#nextBtn")).focus();
  refreshPill();
}
// Picture collection (sticker book), per pack: a word's picture is collected the first
// time it's spelled right on the first try (stats ok > 0). Pictures only, never words;
// tapping one says the word. Shows packs with something collected, plus the current one.
function renderCollection() {
  var wrap = $("#colList"); wrap.innerHTML = "";
  Object.keys(PACKS).forEach(function (id) {
    var words = entries(id), stats = packProgress(id).stats, stickers = listenStickers(words);
    var got = words.filter(function (e) { return stats[e.w] && stats[e.w].ok > 0; }).length;
    if (!words.length || (!got && id !== packId)) return;
    var sec = document.createElement("section"); sec.className = "col-pack";
    var h = document.createElement("h3"); h.textContent = PACKS[id].name + " · " + got + " of " + words.length;
    var grid = document.createElement("div"); grid.className = "col-grid";
    words.forEach(function (e) {
      var have = stats[e.w] && stats[e.w].ok > 0;
      var slot = document.createElement(have ? "button" : "span");
      slot.className = "col-slot" + (have ? " got" : "");
      if (have) {
        slot.type = "button";
        slot.setAttribute("aria-label", "Collected picture, hear the word");
        if (e.pic) slot.textContent = e.pic;
        else slot.innerHTML = stickers[e.w]; // the game shows a sound wave; the collection, a sound sticker
        slot.addEventListener("click", function () { say("w", e.w, 0.85, true); if (!earned["secret:peek"]) noteSecret("peek"); });
      } else {
        slot.setAttribute("aria-label", "Not collected yet");
      }
      grid.appendChild(slot);
    });
    sec.append(h, grid);
    wrap.appendChild(sec);
  });
}
// Color picker: every scheme as a little row of syllable boxes in its own colors (the
// swatch carries data-palette, so it gets that scheme's tokens). Locked ones show dimmed.
function renderColors() {
  var open = unlockedCount(packsFinished()), wrap = $("#palList"), cur = document.documentElement.dataset.palette;
  $("#palHelp").textContent = open < EVERYDAY
    ? "Finish every word in a pack to unlock new colors. " + open + " of " + EVERYDAY + " unlocked."
    : "All " + EVERYDAY + " unlocked!";
  wrap.innerHTML = "";
  PALETTES.forEach(function (pal, i) {
    // A secret scheme (Black Belt) shows as ??? until earned, and only where it can be (a grade with a hard pack).
    if (pal.secret && !hardFinished() && !packIds().some(isHard)) return;
    var locked = !paletteOpen(i), b = document.createElement("button");
    b.type = "button"; b.className = "pal"; b.dataset.palette = pal.id; b.disabled = locked;
    b.setAttribute("aria-pressed", String(pal.id === cur));
    b.innerHTML = '<span class="pal-boxes" aria-hidden="true"><i class="a cur"></i><i class="a"></i><i class="b"></i><i class="b"></i></span><span class="pal-name"></span>';
    b.querySelector(".pal-name").textContent = locked ? (pal.secret ? "🔒 ???" : "🔒 Locked") : pal.name;
    b.addEventListener("click", function () {
      var changed = pal.id !== document.documentElement.dataset.palette;
      settings.palette = pal.id; saveSettings(); applyPalette();
      if (changed && !earned["secret:look"]) noteSecret("look");
      renderColors();
      $('#palList [data-palette="' + pal.id + '"]').focus();
    });
    wrap.appendChild(b);
  });
}
// Director tab (once Front Row Seat is earned): every entrance; tapping one adds it to the
// order played after the next finished puzzles (one each), before the usual shuffle.
function renderEntrances() {
  var queue = entranceQueue(), q = $("#entQueue"), list = $("#entList");
  q.innerHTML = "";
  $("#entQueueHelp").textContent = queue.length ? "Up next, one per finished puzzle:" : "Tap entrances to pick what plays after your next puzzles.";
  $("#entClear").hidden = !queue.length;
  queue.forEach(function (id, i) {
    var e = ENTRANCES.find(function (x) { return x.id === id; }), b = document.createElement("button");
    b.type = "button"; b.className = "ent-chip";
    b.setAttribute("aria-label", "Remove " + e.name + " (number " + (i + 1) + ")");
    b.innerHTML = '<b></b><span aria-hidden="true"></span> ×';
    b.querySelector("b").textContent = i + 1;
    b.querySelector("span").textContent = e.icon + " " + e.name;
    b.addEventListener("click", function () { queue.splice(i, 1); store.set("entranceQueue", queue); renderEntrances(); });
    q.appendChild(b);
  });
  list.innerHTML = "";
  ENTRANCES.forEach(function (e) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "ent";
    b.innerHTML = '<span class="ent-icon" aria-hidden="true"></span><span class="ent-name"></span>';
    b.querySelector(".ent-icon").textContent = e.icon;
    b.querySelector(".ent-name").textContent = e.name + (e.premium ? " ⭐" : "");
    b.addEventListener("click", function () { queue.push(e.id); store.set("entranceQueue", queue); renderEntrances(); });
    list.appendChild(b);
  });
}
$("#entClear").addEventListener("click", function () { store.set("entranceQueue", []); renderEntrances(); });
// Tabs: { name: [tab button, panel] }; shows one, hides the rest.
function selectTab(tabs, name) {
  Object.keys(tabs).forEach(function (k) {
    $(tabs[k][0]).setAttribute("aria-selected", String(k === name));
    $(tabs[k][1]).hidden = k !== name;
  });
  $(tabs[name][0]).scrollIntoView({ block: "nearest", inline: "nearest" }); // a tab row that scrolls sideways
}
// A sheet sits at the bottom of the screen and fits its content, so a shorter tab would drop
// its top edge (a jump on a desktop). Once it's showing, this sizes it for its tallest tab, so
// switching tabs never moves it; the next open measures again.
function steadyHeight(tabs, name) {
  var panel = $(tabs[name][1]).closest(".panel"), tallest = 0;
  panel.style.minHeight = "";
  Object.keys(tabs).forEach(function (k) {
    Object.keys(tabs).forEach(function (j) { $(tabs[j][1]).hidden = j !== k; });
    tallest = Math.max(tallest, panel.offsetHeight);
  });
  selectTab(tabs, name);
  panel.style.minHeight = tallest + "px";
}
var TABS = { ach: ["#tabAch", "#achPanel"], col: ["#tabCol", "#colPanel"], pal: ["#tabPal", "#palPanel"], ent: ["#tabEnt", "#entPanel"] };
function showTab(name) {
  selectTab(TABS, name);
  if (name === "col") renderCollection();
  if (name === "pal") renderColors();
  if (name === "ent") renderEntrances();
}
function openAchievements() {
  var now = Date.now(), all = catalog(achState());
  $("#achDays").textContent = (EDITIONS.length > 1 ? EDITION.short + " · " : "") +
    "Practiced " + daysThisWeek(days, now) + " of the last 7 days · " +
    days.length + (days.length === 1 ? " day" : " days") + " in all";
  var list = $("#achList"); list.innerHTML = "";
  // Earned first (newest first), then what's next.
  // Packs not started yet aren't listed (less clutter); everything else is.
  all = all.filter(function (a) { return earned[a.id] || a.have > 0 || a.id.indexOf("pack:") !== 0; });
  all.sort(function (a, b) { return (earned[b.id] || 0) - (earned[a.id] || 0); });
  all.forEach(function (a) {
    var got = !!earned[a.id], hide = a.secret && !got, li = document.createElement("li");
    li.className = "ach" + (got ? " got" : "");
    var icon = document.createElement("span"), text = document.createElement("span"), sub = document.createElement("small");
    icon.className = "icon"; icon.textContent = hide ? "❓" : a.icon;
    text.className = "text"; text.textContent = hide ? "???" : a.title;
    sub.textContent = hide ? "Secret achievement" : got ? a.detail + " · " + new Date(earned[a.id]).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : a.detail + " · " + Math.min(a.have, a.goal) + " of " + a.goal;
    text.appendChild(sub);
    li.append(icon, text);
    if (got) { // reopen it in the big card, where it can be shared
      li.tabIndex = 0; li.setAttribute("role", "button");
      li.addEventListener("click", function () { showAwards([a], li); });
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); showAwards([a], li); } });
    }
    list.appendChild(li);
  });
  // The Director tab shows as ??? (locked) until Front Row Seat is earned.
  var director = !!earned["secret:entrances"], tabEnt = $("#tabEnt");
  tabEnt.textContent = director ? "Director" : "???"; tabEnt.disabled = !director;
  if (director) tabEnt.removeAttribute("aria-label"); else tabEnt.setAttribute("aria-label", "Locked tab");
  showTab("ach");
  $("#achSheet").hidden = false;
  renderCollection(); renderColors(); renderEntrances(); // measured below, so draw them now
  steadyHeight(TABS, "ach");
  $("#achClose").focus();
}
function closeAchievements() { $("#achSheet").hidden = true; $("#trophyBtn").focus(); refreshPill(); }
function closeSheet() { endScan(); $("#sheet").hidden = true; $("#settingsBtn").focus(); refreshPill(); }
function saveSettings() { store.set("settings", settings); syncSoon(); }
$("#settingsBtn").addEventListener("click", function () { openSheet(); });
$("#trophyBtn").addEventListener("click", openAchievements);
$("#awardNext").addEventListener("click", nextAward);
Object.keys(TABS).forEach(function (k) { $(TABS[k][0]).addEventListener("click", function () { showTab(k); }); });
Object.keys(SHEET_TABS).forEach(function (k) { $(SHEET_TABS[k][0]).addEventListener("click", function () { selectTab(SHEET_TABS, k); }); });
$("#awardPrev").addEventListener("click", prevAward);
$("#awardHear").addEventListener("click", hearAward);
$("#awardClose").addEventListener("click", closeAwards);
$("#awardShare").addEventListener("click", function () {
  if (shareBlob) shareCard(shareBlob, awardQueue[awardIndex].title).then(function (done) { if (done && !earned["secret:shared"]) noteSecret("shared"); });
});
$("#award").addEventListener("click", function (e) { if (e.target === $("#award")) closeAwards(); });
// Swipe left/right on the card to cycle.
var swipeX = null;
$("#award").addEventListener("pointerdown", function (e) { swipeX = e.clientX; });
$("#award").addEventListener("pointerup", function (e) {
  if (swipeX === null) return;
  var dx = e.clientX - swipeX; swipeX = null;
  if (dx < -40) nextAward(); else if (dx > 40) prevAward();
});
$("#achClose").addEventListener("click", closeAchievements);
$("#achSheet").addEventListener("click", function (e) { if (e.target === $("#achSheet")) closeAchievements(); });
$("#closeBtn").addEventListener("click", closeSheet);
$("#sheet").addEventListener("click", function (e) { if (e.target === $("#sheet")) closeSheet(); });
$("#optSyl").addEventListener("change", function (e) { settings.syl = e.target.checked; saveSettings(); update(); });
$("#optSpeakSel").addEventListener("change", function (e) { settings.speakSel = e.target.checked; saveSettings(); });
$("#optChime").addEventListener("change", function (e) { settings.chime = e.target.checked; saveSettings(); if (settings.chime) chime(); });
$("#optCustom").addEventListener("change", function (e) {
  settings.custom = e.target.checked; saveSettings();
  $("#customBox").hidden = !settings.custom;
  if (!settings.custom && packId === "mine") { packId = packIds()[0]; store.set("pack", packId); recent = []; startNewPuzzle(); }
  renderPacks(); renderProgressSheet();
});
["kbAbc", "kbQwerty"].forEach(function (id) { $("#" + id).addEventListener("change", function (e) { settings.kb = e.target.value; saveSettings(); renderKeyboard(); sizeBoard(); }); });
$("#saveBtn").addEventListener("click", function () {
  var txt = $("#customText").value, n = parseList(txt).length;
  if (n < 3) { $("#saveMsg").style.color = "var(--bad)"; $("#saveMsg").textContent = "Add at least 3 words (one per line)."; return; }
  customText = txt; store.set("custom", txt); syncSoon();
  $("#saveMsg").style.color = ""; $("#saveMsg").textContent = "Saved " + n + " words.";
  packId = "mine"; store.set("pack", "mine"); recent = [];
  renderPacks(); startNewPuzzle();
  setTimeout(closeSheet, 600);
});

/* ---------- add to Home Screen ---------- */
// Full screen, offline (sw.js), and Safari can clear a site's saved data after weeks
// unused, which it doesn't do for Home Screen apps. iPad/iPhone have no install prompt, so
// More → About shows the Share steps; browsers that fire beforeinstallprompt get a button.
// Hidden once running from the Home Screen.
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var installEvt = null;
function canInstall() { return !installed && (isIOS || !!installEvt); }
function renderInstall() {
  $("#installSec").hidden = !canInstall();
  $("#installIOS").hidden = !isIOS;
  $("#installBtn").hidden = isIOS || !installEvt;
  // The tip at the top, until ✕ or installing. Its button installs where the browser can
  // (Add), and otherwise shows the steps (How?). Shown from the first visit:
  // iOS doesn't carry progress from Safari over to the Home Screen app, so earlier is better.
  $("#installNudge").hidden = !canInstall() || !!device.get("installNudge", "");
  $("#installHow").textContent = installEvt ? "Add" : "How?";
}
function installNow() {
  if (!installEvt) return;
  var evt = installEvt;
  installEvt = null; // a prompt can only be shown once
  evt.prompt();
  evt.userChoice.then(renderInstall, renderInstall);
}
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; renderInstall(); });
window.addEventListener("appinstalled", function () { installed = true; renderInstall(); });
$("#installBtn").addEventListener("click", installNow);
$("#installNo").addEventListener("click", function () {
  device.set("installNudge", "done"); renderInstall(); $("#settingsBtn").focus();
});
// How? opens the steps in a popover just under the tip (About keeps them too, for after
// the tip is gone). Browsers without popovers fall back to About.
var installPop = $("#installPop");
$("#installHow").addEventListener("click", function () {
  if (installEvt) { installNow(); return; }
  if (!installPop.showPopover) { openSheet("about"); $("#installSec").scrollIntoView({ block: "start" }); return; }
  var r = $("#installNudge").getBoundingClientRect();
  installPop.style.top = Math.round(r.bottom + 8) + "px";
  installPop.togglePopover();
});
renderInstall();

/* ---------- share the app ---------- */
// A quiet footer link for handing the app to another family: a QR code to scan in person,
// the device's share sheet where there is one, and Copy link. The site's fixed address
// (not location.href), plus ?edition= to share just this grade; that link opens straight
// into it. The QR code is drawn by the qrcode library, loaded the first time this opens;
// without it (offline before it was ever loaded) the link and buttons still work.
var SHARE_BASE = "https://tools.tuley.name/sound-box-crosswords/";
var SHARE = { title: "Sound Box Crosswords", text: "Sound crosswords for spelling practice.", url: SHARE_BASE };
var qrLib = null;
function loadQR() {
  if (!qrLib) qrLib = import("qrcode").then(function (m) { return m.default || m; });
  return qrLib;
}
function renderShare() {
  var one = EDITIONS.length > 1 && $("#shareOne").checked;
  var want = SHARE.url = SHARE_BASE + (one ? "?edition=" + encodeURIComponent(EDITION.id) : "");
  $("#shareUrl").textContent = want;
  loadQR()
    .then(function (Q) { return Q.toString(want, { type: "svg", errorCorrectionLevel: "M", margin: 2 }); })
    .then(function (svg) {
      if (want !== SHARE.url) return; // the choice changed while drawing
      $("#shareQr").innerHTML = svg;
      $("#shareQr").setAttribute("aria-label", "QR code for " + want.replace(/^https:\/\//, ""));
      $("#shareQr").hidden = $("#shareScan").hidden = false;
    }, function () {
      qrLib = null; // try again next time
      $("#shareQr").hidden = $("#shareScan").hidden = true;
    });
}
var canShare = typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(SHARE));
$("#shareGo").hidden = !canShare;
function openShare() {
  $("#shareScope").hidden = EDITIONS.length < 2;
  $("#shareOneName").textContent = EDITION.name;
  renderShare();
  $("#shareCopy").textContent = "Copy link";
  $("#shareSheet").hidden = false;
  $("#shareClose").focus();
}
function closeShare() { $("#shareSheet").hidden = true; $("#shareBtn").focus(); refreshPill(); }
$("#shareBtn").addEventListener("click", openShare);
["shareOne", "shareAll"].forEach(function (id) { $("#" + id).addEventListener("change", renderShare); });
$("#shareClose").addEventListener("click", closeShare);
$("#shareSheet").addEventListener("click", function (e) { if (e.target === $("#shareSheet")) closeShare(); });
$("#shareGo").addEventListener("click", function () {
  navigator.share(SHARE).then(closeShare, function () {}); // dismissed: stay open
});
$("#shareCopy").addEventListener("click", function () {
  var btn = $("#shareCopy");
  Promise.resolve().then(function () { return navigator.clipboard.writeText(SHARE.url); })
    .then(function () { btn.textContent = "Copied!"; }, function () { btn.textContent = "Couldn't copy"; })
    .then(function () { setTimeout(function () { btn.textContent = "Copy link"; }, 2000); });
});

/* ---------- profiles and linked devices ---------- */
// More → Link (called "players" there; "profiles" in the code). "Play on another device
// too" (Send) shows the active profile's link code: a QR code and a link carrying its key
// after # (seal.js). "Get a player from another device" (Receive) scans or pastes one, then
// asks who it is: the same player as this device (Replace: from then on both devices are the
// same player) or someone else (Add: a new, named profile, which brings the player picker
// and the name pill). A linked profile syncs (sync.js) at launch,
// on coming back to the screen, after a puzzle, after a settings or Custom list change, on
// leaving, and when the network comes back. Unlinked, nothing goes over the network.
var SYNC_KEYS = ["progress", "log", "counts", "days", "achievements", "slips", "stars", "guessing", "seenEntrances", "settings", "custom"];
// Everything a profile keeps in a grade, for Replace (which takes another profile's place).
var GRADE_KEYS = SYNC_KEYS.concat(RESET_KEYS, ["pack", "entrances", "syncBase"]);
var ME = device.get("deviceId", "");
if (!ME) { ME = newKey().slice(0, 12); device.set("deviceId", ME); }
var syncing = null, syncAgain = false, syncErr = {}, receiving = false;
// Local testing only: ?sync=<address> (remembered) points at `npx wrangler dev` in sync/
// instead of the live service.
var SYNC_AT;
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  var devSync = new URLSearchParams(location.search).get("sync");
  if (devSync) device.set("devSync", devSync);
  SYNC_AT = device.get("devSync", undefined);
}
function saveProfiles() { device.set("profiles", PROFILES); }
function linkKey(id) { var k = whoOf(id).get("linkKey", null); return isKey(k) ? k : null; }
function unlink(id) {
  try { localStorage.removeItem(profilePrefix(id) + "linkKey"); } catch (e) {}
  EDITIONS.forEach(function (ed) { try { localStorage.removeItem(gradePrefix(id, ed) + "syncBase"); } catch (e) {} });
}
function gradeStore(id, ed) { return storage(function () { return gradePrefix(id, ed); }); }
// The grade being played lives in this page's variables, which are what gets saved; others
// are read and written in storage. (Not while Receive is replacing this profile.)
function isLive(id, ed) { return !receiving && id === PROFILE && ed.id === EDITION.id; }
function readGrade(id, ed) {
  if (isLive(id, ed)) return { progress: progress, log: log, counts: counts, days: days, achievements: earned, slips: slips, stars: stars, guessing: guessing, seenEntrances: store.get("seenEntrances", []), settings: settings, custom: store.get("custom", null) };
  var g = gradeStore(id, ed), d = {};
  SYNC_KEYS.forEach(function (k) { d[k] = g.get(k, null); });
  return d;
}
// Progress worth keeping: a word finished, a puzzle logged or an achievement (a puzzle just
// opened makes empty pack entries).
function hasData(id, ed) {
  var d = readGrade(id, ed), prog = d.progress || {};
  return (d.log || []).length > 0 || Object.keys(d.achievements || {}).length > 0 ||
    Object.keys(prog).some(function (p) { return prog[p] && Object.keys(prog[p].done || {}).length; });
}
function writeGrade(id, ed, d) {
  if (isLive(id, ed)) { applyLive(d); return; }
  var g = gradeStore(id, ed);
  SYNC_KEYS.forEach(function (k) { if (k !== "custom" || d.custom != null) g.set(k, d[k]); });
}
// Another device's progress, into this page. A changed setting or Custom list shows at the next puzzle.
function applyLive(d) {
  var was = canon([settings, store.get("custom", null)]);
  progress = d.progress; log = d.log; counts = d.counts; days = d.days; earned = d.achievements;
  slips = d.slips; stars = d.stars; guessing = d.guessing;
  settings = Object.assign({ syl: true, kb: EDITION.keyboard, speakSel: true, chime: true }, d.settings);
  store.set("progress", progress); store.set("log", log); store.set("counts", counts); store.set("days", days);
  store.set("achievements", earned); store.set("slips", slips); store.set("stars", stars); store.set("guessing", guessing);
  store.set("seenEntrances", d.seenEntrances); store.set("settings", settings);
  if (d.custom != null) { customText = d.custom; store.set("custom", d.custom); }
  if (canon([settings, store.get("custom", null)]) !== was) updateReady = true;
  checkAchievements();
  renderPacks();
}
async function syncProfile(id) {
  var key = linkKey(id);
  if (!key) return;
  var keys = await keysFor(key), net = function (u, o) { return fetch(u, o); };
  var remote = await remoteGrades({ fetch: net, url: SYNC_AT, keys: keys });
  for (var ed of EDITIONS) {
    if (remote.indexOf(ed.id) < 0 && !hasData(id, ed)) continue;
    var g = gradeStore(id, ed);
    await syncGrade({
      fetch: net, url: SYNC_AT, keys: keys, grade: ed.id, me: ME, base: g.get("syncBase", null),
      read: readGrade.bind(null, id, ed),
      apply: function (data, rec) {
        if (linkKey(id) !== key) return; // unlinked meanwhile (Start over)
        writeGrade(id, ed, data); g.set("syncBase", rec);
      }
    });
  }
  whoOf(id).set("syncedAt", Date.now());
}
function syncAll() {
  if (receiving) return Promise.resolve();
  if (syncing) { syncAgain = true; return syncing; }
  if (!PROFILES.some(function (p) { return linkKey(p.id); })) return Promise.resolve();
  syncing = (async function () {
    for (var p of PROFILES) {
      try { await syncProfile(p.id); delete syncErr[p.id]; } catch (e) { syncErr[p.id] = true; }
    }
  })().finally(function () {
    syncing = null;
    renderLinkStatus();
    if (syncAgain) { syncAgain = false; syncAll(); }
  });
  renderLinkStatus();
  return syncing;
}
var syncTimer = 0;
function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(syncAll, 1500); }
document.addEventListener("visibilitychange", function () { syncAll(); });
window.addEventListener("online", function () { syncAll(); });

// Reload into another profile or grade. Drops ?edition= (it would pick the old one again);
// a reload checks the server for the page, where going to the address could show an older copy.
function reloadClean() {
  history.replaceState(null, "", location.pathname + (new URLSearchParams(location.search).has("backstage") ? "?backstage" : ""));
  location.reload();
}
function nameOf(p) { return p.name || "Unnamed"; }
// The player picker (More, above the tabs) and the bar across the top with the name: only with two or more.
function renderWho() {
  var many = PROFILES.length > 1, me = PROFILES.find(function (p) { return p.id === PROFILE; });
  $("#whoSec").hidden = !many;
  $("#whoPill").hidden = !many;
  $("#whoPill").textContent = "Playing as " + nameOf(me) + "  ›";
  var sel = $("#profileSel"); sel.innerHTML = "";
  PROFILES.forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.id; o.textContent = nameOf(p);
    sel.appendChild(o);
  });
  sel.value = PROFILE;
}
$("#profileSel").addEventListener("change", function (e) {
  if (e.target.value === PROFILE) return;
  device.set("profile", e.target.value);
  reloadClean();
});
$("#whoPill").addEventListener("click", function () { openSheet("link"); });
function ago(t) {
  var m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : "on " + new Date(t).toLocaleDateString();
}
function renderLinkStatus() {
  var t = who.get("syncedAt", 0), linked = !!linkKey(PROFILE), el = $("#linkStatus");
  el.classList.toggle("on", linked && !syncErr[PROFILE]);
  el.textContent = !linked ? "Not linked with another device yet"
    : syncErr[PROFILE] ? "Linked · couldn’t sync just now, will try again"
    : syncing ? "Linked · syncing…"
    : "Linked · synced " + (t ? ago(t) : "soon");
  $("#resetLinked").hidden = !linked;
}
function renderProfiles() {
  var list = $("#profileList"); list.innerHTML = "";
  $("#profilesSec").hidden = PROFILES.length < 2;
  PROFILES.forEach(function (p) {
    var li = document.createElement("li"); li.className = "profile-row";
    var input = document.createElement("input");
    input.type = "text"; input.value = p.name; input.placeholder = "Name"; input.maxLength = 24;
    input.setAttribute("aria-label", "Player’s name");
    input.addEventListener("change", function () { p.name = input.value.trim(); saveProfiles(); renderWho(); });
    li.appendChild(input);
    if (p.id === PROFILE) {
      var now = document.createElement("span"); now.className = "help"; now.textContent = "playing now";
      li.appendChild(now);
    } else if (p.id) {
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "ghost"; rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        if (rm.dataset.sure !== "1") { rm.dataset.sure = "1"; rm.textContent = "Remove from this device?"; return; }
        removeProfile(p.id);
      });
      li.appendChild(rm);
    }
    list.appendChild(li);
  });
}
// From this device only: other devices holding it keep it and keep syncing.
function removeProfile(id) {
  var pre = profilePrefix(id);
  try {
    var gone = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(pre) === 0) gone.push(k); }
    gone.forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  PROFILES = PROFILES.filter(function (p) { return p.id !== id; });
  saveProfiles();
  renderProfiles(); renderWho();
}
// The Link tab shows one task at a time: Home (the two tasks, the players here, the
// status), Send ("Play on another device too") or Recv ("Get a player from another device").
function linkView(name) {
  ["Home", "Send", "Recv"].forEach(function (v) { $("#link" + v).hidden = v !== name; });
  if (name !== "Recv") endScan();
  if (name === "Home") { incoming = null; $("#arriveSec").hidden = true; renderLinkStatus(); }
}
function renderLink() {
  renderProfiles();
  renderLinkStatus();
  if (!incoming) linkView("Home");
}
document.querySelectorAll("#linkPanel [data-back]").forEach(function (b) { b.addEventListener("click", function () { linkView("Home"); }); });
$("#goSend").addEventListener("click", function () { linkView("Send"); prepareSend(); });
$("#goRecv").addEventListener("click", function () { linkView("Recv"); showScan(); startScan(); });

// Send: makes the player's key the first time (that links it), saves their progress to the
// server, then shows the code.
async function prepareSend() {
  $("#sendBox").hidden = true; $("#sendRetry").hidden = true;
  $("#sendMsg").textContent = "Getting the code ready…";
  var key = linkKey(PROFILE);
  if (!key) { key = newKey(); who.set("linkKey", key); }
  await syncAll();
  if (syncing) await syncing;
  if ($("#linkSend").hidden) return;
  if (syncErr[PROFILE]) {
    $("#sendMsg").textContent = "Couldn’t reach the sync service. Check the connection, then try again.";
    $("#sendRetry").hidden = false;
    return;
  }
  $("#sendMsg").textContent = "";
  var url = linkFor(SHARE_BASE, key);
  $("#sendUrl").textContent = url;
  $("#sendBox").hidden = false;
  // Drawn its own way (linkqr.js), so it isn't mistaken for the share sheet's QR code.
  loadQR().then(function (Q) { $("#sendQr").innerHTML = linkQR(Q, url); $("#sendQr").hidden = false; }, function () { $("#sendQr").hidden = true; });
}
$("#sendRetry").addEventListener("click", prepareSend);
$("#sendShare").hidden = typeof navigator.share !== "function";
$("#sendShare").addEventListener("click", function () { navigator.share({ url: $("#sendUrl").textContent }).catch(function () {}); });
function copyButton(btn, text) {
  var was = btn.textContent;
  Promise.resolve().then(function () { return navigator.clipboard.writeText(text); })
    .then(function () { btn.textContent = "Copied!"; }, function () { btn.textContent = "Couldn't copy"; })
    .then(function () { setTimeout(function () { btn.textContent = was; }, 2000); });
}
$("#sendCopy").addEventListener("click", function () { copyButton($("#sendCopy"), $("#sendUrl").textContent); });

// Receive: the camera starts at once; a key can also come from a pasted link, or a link
// this page was opened with. Then one question: who is this?
var incoming = null, stopScan = null;
function endScan() { if (stopScan) stopScan(); stopScan = null; $("#scanBox").hidden = true; }
function showScan() { incoming = null; $("#recvScan").hidden = false; $("#receiveBox").hidden = true; $("#receiveMsg").textContent = ""; }
async function startScan() {
  endScan();
  $("#scanBox").hidden = false; $("#scanAgain").hidden = true;
  try {
    var { scan } = await import("./scan.js");
    var stop = await scan($("#scanVideo"), function (text) {
      var k = keyFromLink(text);
      if (k) gotKey(k);
      return !!k;
    });
    if ($("#linkRecv").hidden || incoming || $("#sheet").hidden) stop(); // left meanwhile
    else stopScan = stop;
  } catch (e) {
    endScan();
    $("#scanAgain").hidden = false;
    $("#receiveMsg").textContent = "Couldn’t use the camera. Paste the link instead, or allow the camera and try again.";
  }
}
$("#scanAgain").addEventListener("click", startScan);
function gotKey(key) {
  endScan();
  if (PROFILES.some(function (p) { return linkKey(p.id) === key; })) {
    $("#receiveMsg").textContent = "That player is already on this device.";
    $("#scanAgain").hidden = false;
    return;
  }
  incoming = key;
  $("#recvScan").hidden = true; $("#receiveBox").hidden = false; $("#recvMsg").textContent = "";
  var mine = EDITIONS.some(function (ed) { return hasData(PROFILE, ed); });
  $("#recvReplace").checked = !mine; $("#recvAdd").checked = mine;
  $("#recvWarn").textContent = mine ? "This device’s progress is replaced by theirs." : "Nothing is played here yet, so nothing is lost.";
  $("#recvName").value = "";
  $("#recvMine").value = PROFILES.find(function (p) { return p.id === PROFILE; }).name;
  showRecvNames();
}
function showRecvNames() {
  var add = $("#recvAdd").checked;
  $("#recvNames").hidden = !add;
  $("#recvMineBox").hidden = !add || PROFILES.length > 1;
}
["recvAdd", "recvReplace"].forEach(function (id) { $("#" + id).addEventListener("change", showRecvNames); });
$("#pasteBtn").addEventListener("click", async function () {
  endScan();
  var text = null;
  try { text = await navigator.clipboard.readText(); } catch (e) { text = window.prompt("Paste the link from the other device:"); }
  var k = keyFromLink(text);
  if (k) gotKey(k);
  else { $("#scanAgain").hidden = false; $("#receiveMsg").textContent = "No link code there. On the other device: More → Link → Play on another device too → Copy link."; }
});
$("#recvGo").addEventListener("click", async function () {
  var key = incoming, add = $("#recvAdd").checked;
  var name = $("#recvName").value.trim(), mineName = $("#recvMine").value.trim();
  if (add && !name) { $("#recvMsg").textContent = "What’s the new player’s name?"; $("#recvName").focus(); return; }
  if (add && PROFILES.length < 2 && !mineName) { $("#recvMsg").textContent = "And who plays on this device now?"; $("#recvMine").focus(); return; }
  $("#recvGo").disabled = true; $("#recvMsg").textContent = "Linking…";
  var grades;
  try {
    if (syncing) await syncing;
    grades = await remoteGrades({ fetch: function (u, o) { return fetch(u, o); }, url: SYNC_AT, keys: await keysFor(key) });
  } catch (e) {
    $("#recvGo").disabled = false;
    $("#recvMsg").textContent = "Couldn’t reach the sync service. Check the connection, then try again.";
    return;
  }
  receiving = true;
  var target = PROFILE;
  if (add) {
    target = newKey().slice(0, 10);
    PROFILES.forEach(function (p) { if (p.id === PROFILE && mineName) p.name = mineName; });
    PROFILES.push({ id: target, name: name });
    saveProfiles();
  } else {
    // Replace: this player's own progress goes, in every grade, and the sent one takes its place.
    unlink(PROFILE);
    EDITIONS.forEach(function (ed) { GRADE_KEYS.forEach(function (k) { try { localStorage.removeItem(gradePrefix(PROFILE, ed) + k); } catch (e) {} }); });
  }
  whoOf(target).set("linkKey", key);
  try { await syncProfile(target); } catch (e) {} // otherwise it syncs at the next launch
  var known = grades.filter(function (g) { return EDITIONS.some(function (ed) { return ed.id === g; }); });
  whoOf(target).set("edition", known.indexOf(EDITION.id) >= 0 || !known.length ? EDITION.id : known[0]);
  device.set("profile", target);
  reloadClean();
});
// Opened with a link code (#link=…, from the Camera app or a pasted link): out of the
// address bar at once. In a browser tab that isn't the Home Screen app, say how to take it
// there; it can still be received here, for someone who plays in the browser.
var arrived = keyFromLink(location.hash);
if (arrived) history.replaceState(null, "", location.pathname + location.search);
$("#arriveCopy").addEventListener("click", function () { copyButton($("#arriveCopy"), linkFor(SHARE_BASE, arrived)); });
function welcomeLink() {
  if (!arrived) return;
  openSheet("link");
  linkView("Recv");
  $("#arriveSec").hidden = installed;
  gotKey(arrived);
}

/* ---------- start ---------- */
$("#pic").addEventListener("click", function () { if (P) { listened(); sayWord(P.words[cur], 0.85); } });
$("#hearBtn").addEventListener("click", function () { if (P) { listened(); sayWord(P.words[cur], 0.75); } });
$("#clapBtn").addEventListener("click", function () { listened(); clap(); });
$("#soundBtn").addEventListener("click", function () { listened(); soundOut(); });
$("#newBtn").addEventListener("click", function () { startNewPuzzle(); });
$("#nextBtn").addEventListener("click", function () { startNewPuzzle(true); });
window.addEventListener("resize", sizeBoard);
function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
// Floating pad: --kb-h for the cells' scroll margin, and .floating while it's stuck to the
// bottom (its end marker is below the screen).
var kbEl = $("#keyboard");
if (window.ResizeObserver) new ResizeObserver(function () {
  document.documentElement.style.setProperty("--kb-h", kbEl.offsetHeight + "px");
}).observe(kbEl);
if (window.IntersectionObserver) new IntersectionObserver(function (es) {
  var e = es[es.length - 1];
  kbEl.classList.toggle("floating", !e.isIntersecting && e.boundingClientRect.top > 0);
}).observe($("#kbEnd"));
if (!hasSpeech) { ["hearBtn", "clapBtn", "soundBtn"].forEach(function (id) { $("#" + id).title = "Sound isn't available in this browser"; }); }

// Start / Continue: iOS plays recorded words, the device voice and the chime only after a tap,
// and nothing on screen asks for one at launch. One big button does (speech.js and chime.js
// unlock on that first tap); it then says the current word, if that setting is on. Skipped
// after the first-visit grade question, which is a tap already. On return from the background,
// Continue shows only if the sound can't wake without a tap.
var started = false;
// Navy or white, whichever stands out more on the accent (color schemes change it).
function onAccent() {
  var lum = function (hex) {
    var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  var acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (!/^#[0-9a-f]{6}$/i.test(acc)) return;
  var a = lum(acc), navy = (a + 0.05) / (lum("#1b2a41") + 0.05), white = 1.05 / (a + 0.05);
  document.documentElement.style.setProperty("--on-accent", navy >= white ? "#1b2a41" : "#ffffff");
}
// A new puzzle the player asked for (New puzzle, Next puzzle, a pack): that tap woke the sound,
// so Start goes away and the entrance plays.
function startNewPuzzle(solved) {
  dismissStart();
  newPuzzle(solved);
}
// Whether any letter of this puzzle has been typed. One that hasn't is new: Start, not Continue.
function played() { return Object.keys(fill).some(function (k) { return fill[k]; }); }
function showStart(continuing) {
  onAccent();
  $("#startLabel").textContent = continuing ? "Continue" : "Start";
  $("#startOverlay").hidden = false;
  placeStart();
  $("#startBtn").focus({ preventScroll: true });
}
// The button sits on the puzzle, just below the clue it covers too (whose height varies).
function placeStart() { $("#startOverlay").style.setProperty("--clue-h", $("#cluebar").offsetHeight + "px"); }
window.addEventListener("resize", placeStart);
function start() {
  if ($("#startOverlay").hidden) return;
  $("#startOverlay").hidden = true;
  started = true;
  if (board.classList.contains("waiting")) runEntrance(waitTurn); // says the first word as it ends
  else if (P && !finished && settings.speakSel) sayWord(P.words[cur], 0.85);
}
$("#startOverlay").addEventListener("click", start);
// A physical key or a letter pad tap starts too, and isn't typed into the puzzle (whose boxes
// may still be waiting for their entrance). Not while a sheet is open, which has its own fields.
document.addEventListener("keydown", function (e) {
  if ($("#startOverlay").hidden || !safeToReload() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  e.preventDefault(); e.stopPropagation(); start();
}, true);
// The letter pad is unpinned (sitting in its place, under the cover) while Start or Continue
// waits, so the button is the one thing to tap.
kbEl.addEventListener("animationend", function () { kbEl.classList.remove("rise"); });
new MutationObserver(function () { if ($("#startOverlay").hidden) pinPad("asleep"); else kbEl.classList.add("asleep"); })
  .observe($("#startOverlay"), { attributes: true, attributeFilter: ["hidden"] });
kbEl.classList.toggle("asleep", !$("#startOverlay").hidden);
kbEl.addEventListener("click", function (e) {
  if ($("#startOverlay").hidden) return;
  e.preventDefault(); e.stopPropagation(); start();
}, true);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible" || !$("#startOverlay").hidden || (!started && !gradeTapped)) return;
  audioAwake().then(function (ok) { if (!ok && document.visibilityState === "visible") showStart(played()); });
});

// A home-screen app usually resumes instead of relaunching, so it would keep running an
// old deploy. Each time it comes back on screen, compare this build's ?v= stamp with the
// live page's. If it changed, reload now (the puzzle in progress is saved and comes back)
// unless a sheet or popup is open, or else at the next new puzzle. Unstamped (local) builds skip it.
var BUILD = new URL(import.meta.url).searchParams.get("v"), updateReady = false;
// The puzzle in progress is saved (savePuzzle), so only an open sheet or popup waits.
function safeToReload() {
  return $("#sheet").hidden && $("#achSheet").hidden && $("#shareSheet").hidden && $("#award").hidden;
}
document.addEventListener("visibilitychange", function () {
  if (!BUILD || updateReady || document.visibilityState !== "visible") return;
  fetch(new URL("../", import.meta.url), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (html) {
      var live = html.match(/js\/app\.js\?v=([0-9a-f]+)/);
      if (!live || live[1] === BUILD) return;
      updateReady = true;
      if (safeToReload()) location.reload();
    })
    .catch(function () {});
});

// Quietly award anything already met (e.g. from before this update); a secret one met that
// way waits behind the pill instead, since it's a surprise worth seeing.
checkAchievements().forEach(function (a) { if (a.secret && pending.indexOf(a.id) < 0) pending.push(a.id); });
store.set("pending", pending);
refreshPill();
renderPacks();
renderKeyboard();
var resumed = loadPuzzle();
if (!resumed) newPuzzle();
else if (!played() && !gradeTapped) board.classList.add("waiting"); // untouched: it's new, so Start plays its entrance
if (!gradeTapped) showStart(resumed && played());
renderWho();
syncAll();
welcomeLink();
