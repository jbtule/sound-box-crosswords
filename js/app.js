// Game state, play logic, rendering, and the settings sheet.
import { confetti } from "./confetti.js";
import { chime } from "./chime.js";
import { listenStickers } from "./stickers.js";
import { renderCard, shareCard } from "./sharecard.js";
import { PALETTES, unlockedCount, paletteCSS } from "./palettes.js";
import { catalog, award, dayKey, daysThisWeek } from "./achievements.js";
import { parseList, makePuzzle, restorePuzzle, blankSentence, shuffle } from "./crossword.js";
import { speak, say, sayRecorded, hasClip, onClips, stopSpeech, speechEpoch, hasSpeech, listVoices, setVoice, onVoicesChanged } from "./speech.js";

var $ = function (s) { return document.querySelector(s); };

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
// the one picked before, the original edition for anyone with progress from before there
// were editions, the only one, or else ask once ("Which grade?"), before the first puzzle.
async function pickEdition(eds) {
  var byId = function (id) { return eds.find(function (e) { return e.id === id; }); };
  var params = new URLSearchParams(location.search), asked = params.get("edition");
  if (asked !== null) {
    params.delete("edition");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    if (byId(asked)) { device.set("edition", asked); return byId(asked); }
  }
  var saved = byId(device.get("edition", ""));
  if (saved) return saved;
  var before = ["progress", "log", "settings", "achievements"].some(function (k) { return device.get(k, null) != null; });
  var original = eds.find(function (e) { return e.file === "packs.toml"; });
  if (before && original) { device.set("edition", original.id); return original; }
  if (eds.length === 1) return eds[0];
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
  device.set("edition", chosen.id);
  return chosen;
}

var PACKS, DEFAULT_CUSTOM, EDITIONS, EDITION;
try {
  // Imported here, not at the top: words.js pulls in the TOML parser from the CDN, and a
  // failed static import would stop this whole module before it could show Try again.
  var { loadPacks, loadEditions, storagePrefix } = await import("./words.js");
  EDITIONS = await loadEditions();
  EDITION = await pickEdition(EDITIONS);
  PREFIX = storagePrefix(EDITION);
  ({ packs: PACKS, starter: DEFAULT_CUSTOM } = await loadPacks(EDITION.file));
} catch (e) {
  // A home-screen app has no reload button, so offer one.
  $("#board").innerHTML = '<p class="empty-msg">Couldn’t load the word packs. Check the connection, then try again.</p>' +
    '<button class="primary" id="retryBtn" type="button">Try again</button>';
  $("#retryBtn").onclick = function () { location.reload(); };
  throw e;
}

// Settings: the letter pad, syllable colors and auto-speak are the edition's own (each child's);
// the voice and chime belong to the device, shared by every edition ("shared"). Until that's
// first saved they come from the settings saved before editions (plain "sbx:settings").
var SHARED = ["voice", "chime"];
var sharedBefore = {}, oldSettings = device.get("settings", {});
SHARED.forEach(function (k) { if (oldSettings && k in oldSettings) sharedBefore[k] = oldSettings[k]; });
var settings = Object.assign({ syl: true, kb: EDITION.keyboard, speakSel: true, chime: true, voice: "" },
  store.get("settings", {}), sharedBefore, device.get("shared", {}));
var customText = store.get("custom", DEFAULT_CUSTOM);
var stars = store.get("stars", {});
var packId = store.get("pack", "");
if (!PACKS[packId]) packId = Object.keys(PACKS)[0];
var recent = []; // words from recent puzzles, avoided in the next one
// Per pack: `done` = words completed at least once (the % shown); `round` = words completed
// since the pack was last fully covered, so new puzzles bring in the rest first;
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
// Color schemes (palettes.js): Classic, plus one more per pack finished. Cosmetic only.
// Earned achievements are never taken away, so neither are unlocked colors.
var paletteStyle = document.createElement("style");
paletteStyle.textContent = paletteCSS();
document.head.appendChild(paletteStyle);
function packsFinished() { return Object.keys(earned).filter(function (id) { return id.indexOf("pack:") === 0; }).length; }
function applyPalette() {
  var i = PALETTES.findIndex(function (p) { return p.id === settings.palette; });
  if (i < 0 || i >= unlockedCount(packsFinished())) i = 0;
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

function newPuzzle() {
  if (updateReady) { location.reload(); return; }
  $("#done").hidden = true;
  finished = false; fill = {}; locked = {}; doneW = {}; misses = 0; missedW = {}; newPics = 0;
  var pool = entries(packId);
  if (pool.length < 3) { P = null; renderEmpty(); return; }
  var pp = packProgress(packId), words = pool.map(function (e) { return e.w; });
  var fresh = words.filter(function (w) { return pp.round.indexOf(w) < 0; });
  if (!fresh.length) { pp.round = []; fresh = words; store.set("progress", progress); } // new round
  P = makePuzzle(pool, recent, fresh);
  recent = P.words.map(function (p) { return p.w; }).concat(recent).slice(0, 8);
  renderBoard();
  renderClues();
  select(order()[0], null, false);
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
  board.innerHTML = '<p class="empty-msg">This pack needs at least 3 words. Open <b>Settings</b> and add words under “Custom words”.</p>';
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
function showSentence(text) {
  var el = $("#clueSent"); el.textContent = "";
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
  showSentence(W.sentence ? blankSentence(W.sentence, [W.w]) : "");
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
    fill: fill, locked: locked, doneW: doneW, cur: cur, pos: pos, misses: misses, missedW: missedW, newPics: newPics, recent: recent
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
function sayWord(W, rate) {
  say("w", W.w, rate, true);
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
  if (!P || finished) return;
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
  var firstWrong = -1;
  W.cells.forEach(function (c, j) {
    if (fill[c] !== W.w[j]) {
      if (firstWrong < 0) firstWrong = j;
      flash(c, "wrong", 700); flash(c, "wiggle");
    }
  });
  update();
  setTimeout(function () {
    W.cells.forEach(function (c, j) { if (fill[c] !== W.w[j] && !locked[c]) delete fill[c]; });
    pos = firstWrong < 0 ? 0 : firstWrong;
    update();
  }, 700);
}
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
  if (pp.round.indexOf(W.w) < 0) pp.round.push(W.w);
  store.set("progress", progress);
  renderProgress();
  W.cells.forEach(settleCrossings); // its letters may have finished a crossing word
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
  store.set("counts", counts);
  var today = dayKey(Date.now());
  if (days.indexOf(today) < 0) { days.push(today); store.set("days", days); }
  var fresh = checkAchievements();
  renderPacks();
  update();
  var parts = [P.words.length + " words"];
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
  confetti($(".board-card"));
  if (settings.chime) chime();
  say("p", "You solved it!", 0.95);
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
// whole word: c-a-t, sh-i-p. Only in editions that turn it on, for words whose sounds are
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
  stopSpeech();
  var my = speechEpoch();
  // Box index for each letter that makes a sound (an apostrophe has a box but no sound).
  var letterBox = [];
  for (var i = 0; i < W.w.length; i++) if (W.w[i] !== "'") letterBox.push(W.cells[i]);
  for (var si = 0; si < W.sounds.length && speechEpoch() === my; si++) {
    var seg = W.sounds[si], ks = letterBox.slice(seg.at, seg.at + seg.len);
    ks.forEach(function (c) { var el = cellEl(c); el && el.classList.add("beat"); });
    await sayRecorded("f", seg.sound);
    await new Promise(function (r) { setTimeout(r, 300); });
    ks.forEach(function (c) { var el = cellEl(c); el && el.classList.remove("beat"); });
  }
  if (speechEpoch() === my) await say("w", W.w, 0.8);
  clapping = false;
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
  if (/^[a-z]$/i.test(e.key)) { input(e.key.toLowerCase()); e.preventDefault(); }
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
  Object.keys(PACKS).forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.setAttribute("aria-pressed", id === packId ? "true" : "false");
    b.innerHTML = PACKS[id].name + (stars[id] ? ' <span class="n">⭐' + stars[id] + "</span>" : "");
    b.addEventListener("click", function () {
      if (packId === id) return;
      packId = id; store.set("pack", id); recent = [];
      renderPacks(); newPuzzle();
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
function renderProgressSheet() {
  var rows = $("#progressPacks"); rows.innerHTML = "";
  Object.keys(PACKS).forEach(function (id) {
    var c = coverage(id);
    if (!c.total) return;
    var li = document.createElement("li");
    li.textContent = PACKS[id].name + ": " + Math.round(100 * c.done / c.total) + "% of words (" + c.done + "/" + c.total + ")" +
      " · " + (stars[id] || 0) + (stars[id] === 1 ? " puzzle" : " puzzles");
    rows.appendChild(li);
  });
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
// Settings → Edition: a dropdown of editions; switching reloads into that edition's own
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
  device.set("edition", e.target.value);
  location.replace(location.pathname);
});
function openSheet() {
  renderGrades();
  $("#optSyl").checked = settings.syl;
  $("#optSpeakSel").checked = settings.speakSel;
  $("#optChime").checked = settings.chime;
  $("#kbAbc").checked = settings.kb === "abc";
  $("#kbQwerty").checked = settings.kb === "qwerty";
  $("#customText").value = customText;
  renderVoices();
  renderProgressSheet();
  $("#saveMsg").textContent = "";
  $("#sheet").hidden = false;
  $("#closeBtn").focus();
}
// Voice picker. "" means Automatic: the best voice on the device, so a newly downloaded
// Enhanced or Premium voice is used without changing anything here.
function renderVoices() {
  var sel = $("#voiceSel"), vs = listVoices();
  sel.innerHTML = "";
  var auto = document.createElement("option");
  auto.value = ""; auto.textContent = "Automatic" + (vs.length ? " (" + vs[0].label + ")" : "");
  sel.appendChild(auto);
  vs.forEach(function (v) {
    var o = document.createElement("option");
    o.value = v.id; o.textContent = v.label;
    sel.appendChild(o);
  });
  sel.value = vs.some(function (v) { return v.id === settings.voice; }) ? settings.voice : "";
  sel.disabled = !hasSpeech;
  $("#voiceTry").disabled = !hasSpeech;
  if (!hasSpeech) $("#voiceHelp").textContent = "Sound isn't available in this browser.";
}
/* ---------- achievements ---------- */
function achState() {
  return {
    packs: Object.keys(PACKS).map(function (id) {
      var c = coverage(id), stats = packProgress(id).stats;
      var firsts = entries(id).filter(function (e) { return stats[e.w] && stats[e.w].ok > 0; }).length;
      return { id: id, name: PACKS[id].name, done: c.done, total: c.total, firsts: firsts };
    }),
    clean: counts.clean, comeback: counts.comeback, days: days
  };
}
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
  $("#awardKicker").textContent = (from ? "Achievement" : "New achievement!") + (EDITIONS.length > 1 ? "\n" + EDITION.name : "");
  $("#award").hidden = false;
  showAward(true);
}
// Share: the PNG is made as soon as a card shows, because iPad Safari only opens the share
// sheet straight from a tap (no waiting on drawing in between).
var shareFor = null, shareBlob = null;
function sharePics() { // a few collected pictures for the card (pictures only, never words)
  var pics = [];
  Object.keys(PACKS).forEach(function (id) {
    var stats = packProgress(id).stats;
    entries(id).forEach(function (e) { if (e.pic && stats[e.w] && stats[e.w].ok > 0 && pics.indexOf(e.pic) < 0) pics.push(e.pic); });
  });
  return shuffle(pics).slice(0, 6);
}
function prepareShare(a) {
  shareFor = a.id; shareBlob = null;
  $("#awardShare").hidden = true;
  renderCard(a, earned[a.id] || Date.now(), sharePics(), EDITIONS.length > 1 ? EDITION.name : "").then(function (b) {
    if (shareFor !== a.id) return; // moved on to another card meanwhile
    shareBlob = b;
    $("#awardShare").hidden = false;
  }).catch(function () {}); // no canvas: just no Share button
}
function showAward(first) {
  var a = awardQueue[awardIndex], n = awardQueue.length, last = awardIndex === n - 1;
  // A new one is read aloud: "New achievement!", its name, what it took. The first waits
  // for "You solved it!"; moving to another card replaces what's being said.
  if (!awardFrom) {
    say("p", "New achievement!", null, !first);
    say("p", a.title);
    say("p", a.detail);
  }
  $("#awardHear").hidden = !hasSpeech;
  prepareShare(a);
  $("#awardIcon").textContent = a.icon;
  $("#awardTitle").textContent = a.title;
  $("#awardDetail").textContent = a.detail;
  // A pack finished while there are still colors to unlock: say where to find them.
  $("#awardExtra").hidden = !!awardFrom || a.id.indexOf("pack:") !== 0 || packsFinished() >= PALETTES.length;
  $("#awardCount").textContent = n > 1 ? (awardIndex + 1) + " of " + n : "";
  var dots = $("#awardDots"); dots.innerHTML = "";
  if (n > 1) awardQueue.forEach(function (_, i) { var d = document.createElement("span"); if (i === awardIndex) d.className = "on"; dots.appendChild(d); });
  $("#awardPrev").hidden = awardIndex === 0;
  $("#awardNext").textContent = last ? "Nice!" : "Next";
  var card = $("#award .award-card");
  card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
  if (awardIndex > awardSeen) { // celebrate each one the first time it's shown
    awardSeen = awardIndex;
    confetti(card);
    if (settings.chime) chime();
  }
  $("#awardNext").focus();
}
function nextAward() {
  if (awardIndex < awardQueue.length - 1) { awardIndex++; showAward(); } else closeAwards();
}
function prevAward() {
  if (awardIndex > 0) { awardIndex--; showAward(); }
}
// 👂 Hear it on the card: its name and what it took, again (for players who can't read it
// yet); also on ones reopened from the 🏆 sheet, which aren't read on their own.
function hearAward() {
  var a = awardQueue[awardIndex];
  if (!a) return;
  say("p", a.title, null, true);
  say("p", a.detail);
}
function closeAwards() {
  if (!awardFrom) stopSpeech();
  $("#award").hidden = true;
  shareFor = shareBlob = null;
  (awardFrom || $("#nextBtn")).focus();
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
        slot.addEventListener("click", function () { say("w", e.w, 0.85, true); });
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
  $("#palHelp").textContent = open < PALETTES.length
    ? "Finish every word in a pack to unlock new colors. " + open + " of " + PALETTES.length + " unlocked."
    : "All " + PALETTES.length + " unlocked!";
  wrap.innerHTML = "";
  PALETTES.forEach(function (pal, i) {
    var locked = i >= open, b = document.createElement("button");
    b.type = "button"; b.className = "pal"; b.dataset.palette = pal.id; b.disabled = locked;
    b.setAttribute("aria-pressed", String(pal.id === cur));
    b.innerHTML = '<span class="pal-boxes" aria-hidden="true"><i class="a cur"></i><i class="a"></i><i class="b"></i><i class="b"></i></span><span class="pal-name"></span>';
    b.querySelector(".pal-name").textContent = locked ? "🔒 Locked" : pal.name;
    b.addEventListener("click", function () {
      settings.palette = pal.id; saveSettings(); applyPalette();
      renderColors();
      $('#palList [data-palette="' + pal.id + '"]').focus();
    });
    wrap.appendChild(b);
  });
}
var TABS = { ach: ["#tabAch", "#achPanel"], col: ["#tabCol", "#colPanel"], pal: ["#tabPal", "#palPanel"] };
function showTab(name) {
  Object.keys(TABS).forEach(function (k) {
    $(TABS[k][0]).setAttribute("aria-selected", String(k === name));
    $(TABS[k][1]).hidden = k !== name;
  });
  if (name === "col") renderCollection();
  if (name === "pal") renderColors();
}
function openAchievements() {
  var now = Date.now(), all = catalog(achState());
  $("#achDays").textContent = (EDITIONS.length > 1 ? EDITION.name + " · " : "") +
    "Practiced " + daysThisWeek(days, now) + " of the last 7 days · " +
    days.length + (days.length === 1 ? " day" : " days") + " in all";
  var list = $("#achList"); list.innerHTML = "";
  // Earned first (newest first), then what's next.
  // Packs not started yet aren't listed (less clutter); everything else is.
  all = all.filter(function (a) { return earned[a.id] || a.have > 0 || a.id.indexOf("pack:") !== 0; });
  all.sort(function (a, b) { return (earned[b.id] || 0) - (earned[a.id] || 0); });
  all.forEach(function (a) {
    var got = !!earned[a.id], li = document.createElement("li");
    li.className = "ach" + (got ? " got" : "");
    var icon = document.createElement("span"), text = document.createElement("span"), sub = document.createElement("small");
    icon.className = "icon"; icon.textContent = a.icon;
    text.className = "text"; text.textContent = a.title;
    sub.textContent = got ? a.detail + " · " + new Date(earned[a.id]).toLocaleDateString(undefined, { month: "short", day: "numeric" })
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
  showTab("ach");
  $("#achSheet").hidden = false;
  $("#achClose").focus();
}
function closeAchievements() { $("#achSheet").hidden = true; $("#trophyBtn").focus(); }
function closeSheet() { $("#sheet").hidden = true; $("#settingsBtn").focus(); }
function saveSettings() {
  var own = {}, shared = {};
  Object.keys(settings).forEach(function (k) { (SHARED.indexOf(k) >= 0 ? shared : own)[k] = settings[k]; });
  store.set("settings", own);
  device.set("shared", shared);
}
$("#settingsBtn").addEventListener("click", openSheet);
$("#trophyBtn").addEventListener("click", openAchievements);
$("#awardNext").addEventListener("click", nextAward);
Object.keys(TABS).forEach(function (k) { $(TABS[k][0]).addEventListener("click", function () { showTab(k); }); });
$("#awardPrev").addEventListener("click", prevAward);
$("#awardHear").addEventListener("click", hearAward);
$("#awardClose").addEventListener("click", closeAwards);
$("#awardShare").addEventListener("click", function () {
  if (shareBlob) shareCard(shareBlob, awardQueue[awardIndex].title);
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
$("#voiceSel").addEventListener("change", function (e) {
  settings.voice = e.target.value; saveSettings(); setVoice(settings.voice);
  speak("butterfly", 0.85, true);
});
$("#voiceTry").addEventListener("click", function () { speak("butterfly", 0.85, true); });
setVoice(settings.voice);
onVoicesChanged(function () { if (!$("#sheet").hidden) renderVoices(); });
["kbAbc", "kbQwerty"].forEach(function (id) { $("#" + id).addEventListener("change", function (e) { settings.kb = e.target.value; saveSettings(); renderKeyboard(); sizeBoard(); }); });
$("#saveBtn").addEventListener("click", function () {
  var txt = $("#customText").value, n = parseList(txt).length;
  if (n < 3) { $("#saveMsg").style.color = "var(--bad)"; $("#saveMsg").textContent = "Add at least 3 words (one per line)."; return; }
  customText = txt; store.set("custom", txt);
  $("#saveMsg").style.color = ""; $("#saveMsg").textContent = "Saved " + n + " words.";
  packId = "mine"; store.set("pack", "mine"); recent = [];
  renderPacks(); newPuzzle();
  setTimeout(closeSheet, 600);
});

/* ---------- add to Home Screen ---------- */
// Full screen, offline (sw.js), and Safari can clear a site's saved data after weeks
// unused, which it doesn't do for Home Screen apps. iPad/iPhone have no install prompt, so
// Settings shows the Share steps; browsers that fire beforeinstallprompt get a button.
// Hidden once running from the Home Screen.
var installed = navigator.standalone === true || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var installEvt = null;
function canInstall() { return !installed && (isIOS || !!installEvt); }
function renderInstall() {
  $("#installSec").hidden = !canInstall();
  $("#installIOS").hidden = !isIOS;
  $("#installBtn").hidden = isIOS || !installEvt;
  // The tip at the top, until ✕ or installing. Its button installs where the browser can
  // (Add), and otherwise opens the steps in Settings (How?). Shown from the first visit:
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
$("#installHow").addEventListener("click", function () {
  if (installEvt) { installNow(); return; }
  openSheet();
  $("#installSec").scrollIntoView({ block: "start" });
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
function closeShare() { $("#shareSheet").hidden = true; $("#shareBtn").focus(); }
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

/* ---------- start ---------- */
$("#pic").addEventListener("click", function () { if (P) sayWord(P.words[cur], 0.85); });
$("#hearBtn").addEventListener("click", function () { if (P) sayWord(P.words[cur], 0.75); });
$("#clapBtn").addEventListener("click", clap);
$("#soundBtn").addEventListener("click", soundOut);
$("#newBtn").addEventListener("click", newPuzzle);
$("#nextBtn").addEventListener("click", newPuzzle);
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

checkAchievements(); // quietly award anything already met (e.g. from before this update)
renderPacks();
renderKeyboard();
if (!loadPuzzle()) newPuzzle();
