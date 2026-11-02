// Game state, play logic, rendering, and the settings sheet.
import { loadPacks } from "./words.js";
import { confetti } from "./confetti.js";
import { chime } from "./chime.js";
import { parseList, makePuzzle } from "./crossword.js";
import { speak, say, stopSpeech, speechEpoch, hasSpeech, listVoices, setVoice, onVoicesChanged } from "./speech.js";

var $ = function (s) { return document.querySelector(s); };

// Per-device storage under the "sbx:" prefix. Private mode or blocked storage just
// means nothing is remembered.
var store = {
  get: function (k, d) { try { var v = localStorage.getItem("sbx:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem("sbx:" + k, JSON.stringify(v)); } catch (e) {} }
};

var PACKS, DEFAULT_CUSTOM;
try {
  ({ packs: PACKS, starter: DEFAULT_CUSTOM } = await loadPacks());
} catch (e) {
  $("#board").innerHTML = '<p class="empty-msg">Couldn’t load the word packs. Check the connection and reload.</p>';
  throw e;
}

var settings = Object.assign({ syl: true, kb: "qwerty", speakSel: true, chime: true, voice: "" }, store.get("settings", {}));
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

function newPuzzle() {
  $("#done").hidden = true;
  finished = false; fill = {}; locked = {}; doneW = {}; misses = 0; missedW = {};
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
  sizeBoard();
}
// Words with no emoji get a drawn sound-wave icon: listen, then spell.
var WAVE = '<svg class="wave" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4M7 6.5v11M11 3v18M15 7.5v9M19 10v4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
function setPic(el, pic) { if (pic) el.textContent = pic; else el.innerHTML = WAVE; }
function cellEl(kk) { return board.querySelector('[data-k="' + kk + '"]'); }
// Syncs the board, clue bar, and clue tiles with the play state.
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
  $("#clapBtn").hidden = n < 2; // nothing to clap in a one-beat word
  document.querySelectorAll(".ctile").forEach(function (t) {
    var i = +t.dataset.i;
    t.classList.toggle("cur", i === cur && !finished);
    t.classList.toggle("fin", !!doneW[i]);
  });
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
    st.n++;
    if (!missedW[i]) st.ok++;
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
  renderPacks();
  update();
  var parts = [P.words.length + " words"];
  parts.push(misses === 0 ? "no slips" : misses === 1 ? "1 try again" : misses + " try-agains");
  $("#doneStats").textContent = parts.join(" · ");
  $("#done").hidden = false;
  confetti($(".board-card"));
  if (settings.chime) chime();
  say("p", "You solved it!", 0.95);
  $("#nextBtn").focus();
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

/* ---------- scaffold: Clap it ---------- */
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
function openSheet() {
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
function closeSheet() { $("#sheet").hidden = true; $("#settingsBtn").focus(); }
function saveSettings() { store.set("settings", settings); }
$("#settingsBtn").addEventListener("click", openSheet);
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

/* ---------- start ---------- */
$("#pic").addEventListener("click", function () { if (P) sayWord(P.words[cur], 0.85); });
$("#hearBtn").addEventListener("click", function () { if (P) sayWord(P.words[cur], 0.75); });
$("#clapBtn").addEventListener("click", clap);
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
if (!hasSpeech) { ["hearBtn", "clapBtn"].forEach(function (id) { $("#" + id).title = "Sound isn't available in this browser"; }); }

renderPacks();
renderKeyboard();
newPuzzle();
