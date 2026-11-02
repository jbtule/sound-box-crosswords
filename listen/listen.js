// Listen check: a grown-up tool for hearing every recorded clip and marking it right or
// wrong. /listen/ lists every edition's packs; /listen/?edition=<id>&pack=<id> is one
// pack's page (no edition means packs.toml's). It reads the same editions.toml, packs
// files and audio.json as the app, so it plays exactly what the app plays.
// Marks live in localStorage ("sbx:listen"), keyed by clip: a clip's key hashes its text
// and voice settings, so a changed hint is a new clip and shows up as not heard.
import { readPacks, readEditions } from "../js/words.js";
import { parseList, clipsFor } from "../js/crossword.js";

var $ = function (s) { return document.querySelector(s); };
var REPO = "https://github.com/jbtule/sound-box-crosswords";
var LIVE = "https://tools.tuley.name/sound-box-crosswords/";
var KIND = { w: "Word", s: "Syllable", t: "Sentence", p: "Phrase" };
var STORE = "sbx:listen";

var marks = {};
try { marks = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { marks = {}; }
function saveMarks() { try { localStorage.setItem(STORE, JSON.stringify(marks)); } catch (e) {} }
function state(key) { var m = marks[key]; return !m ? "new" : m.ok ? "ok" : "bad"; }

// The live site's copies when running locally (no audio.json without a deploy).
async function getJSON(rel, fallback) {
  var res = await fetch(rel).catch(function () { return null; });
  if ((!res || !res.ok) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) res = await fetch(fallback).catch(function () { return null; });
  return res && res.ok ? res.json() : null;
}
async function getText(rel) {
  var res = await fetch(rel);
  if (!res.ok) throw new Error(rel + ": HTTP " + res.status);
  return res.text();
}

// Every page: { id, edition, name, words: [{ syll, pic, clips: [{ kind, text, part, key }] }] }.
// `name` includes the grade when there's more than one (for reports).
function pages(ed, multi, data, audio, withPhrases) {
  var out = [];
  function withKeys(clips) {
    return clips.map(function (c) { return Object.assign({}, c, { key: audio.clips[c.kind + ":" + c.text] || null }); });
  }
  function fromList(id, name, list) {
    out.push({ id: id, edition: ed, short: name, name: (multi ? ed.name + " · " : "") + name,
      words: parseList(list).map(function (e) { return { syll: e.syll, pic: e.pic, clips: withKeys(clipsFor(e)) }; }) });
  }
  Object.keys(data.packs).forEach(function (id) { if (id !== "mine") fromList(id, data.packs[id].name, data.packs[id].list); });
  if (data.starter) fromList("custom", "Custom starter", data.starter);
  var phrases = Object.keys(audio.clips).filter(function (k) { return k.startsWith("p:"); }).map(function (k) { return k.slice(2); });
  if (phrases.length && withPhrases) {
    out.push({ id: "phrases", edition: ed, short: "Phrases", name: (multi ? ed.name + " · " : "") + "Phrases", words: phrases.map(function (p) { return { syll: p, pic: "", clips: withKeys([{ kind: "p", text: p }]) }; }) });
  }
  return out;
}

function counts(page) {
  var c = { total: 0, new: 0, ok: 0, bad: 0 }, seen = {};
  page.words.forEach(function (w) {
    w.clips.forEach(function (clip) {
      if (!clip.key || seen[clip.key]) return; // a syllable shared by two words counts once
      seen[clip.key] = 1; c.total++; c[state(clip.key)]++;
    });
  });
  return c;
}

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- playback: one clip at a time ---------- */
var player = new Audio(), playingBtn = null, queue = [];
player.addEventListener("ended", next);
player.addEventListener("error", next);
function next() {
  if (playingBtn) playingBtn.classList.remove("playing");
  var item = queue.shift();
  if (!item) { playingBtn = null; return; }
  playingBtn = item.btn;
  if (playingBtn) playingBtn.classList.add("playing");
  player.src = item.url;
  // AbortError just means a newer tap replaced this clip; anything else skips it.
  player.play().catch(function (e) { if (e.name !== "AbortError") next(); });
}
function play(items) { player.pause(); queue = items.slice(); next(); }

/* ---------- index ---------- */
function href(page) { return "?edition=" + encodeURIComponent(page.edition.id) + "&pack=" + encodeURIComponent(page.id); }
function renderIndex(all, eds) {
  var list = $("#list"); list.innerHTML = "";
  eds.forEach(function (ed) {
    var mine = all.filter(function (p) { return p.edition === ed; });
    if (eds.length > 1) list.appendChild(el("h2", "grade", ed.name));
    list.appendChild(indexList(mine));
  });
  setupReport(all, "all packs");
}
function indexList(all) {
  var ul = el("ul", "packs");
  all.forEach(function (page) {
    var c = counts(page), li = el("li", "card"), a = el("a");
    a.href = href(page);
    a.appendChild(el("span", "name", page.short));
    var pills = el("span", "counts");
    if (c.new) pills.appendChild(el("span", "pill new", c.new + " not heard"));
    if (c.bad) pills.appendChild(el("span", "pill bad", c.bad + " ✗"));
    if (!c.new && !c.bad) pills.appendChild(el("span", "pill ok", "all ✓"));
    pills.appendChild(el("span", "pill", c.total + (c.total === 1 ? " clip" : " clips")));
    a.appendChild(pills);
    li.appendChild(a); ul.appendChild(li);
  });
  return ul;
}

/* ---------- one pack ---------- */
var filter = "new";
function renderPack(page, base) {
  var list = $("#list"); list.innerHTML = "";
  var shown = 0;
  page.words.forEach(function (w) {
    var clips = w.clips.filter(function (c) { return c.key && (filter === "all" || state(c.key) === filter); });
    if (!clips.length) return;
    shown++;
    var card = el("section", "card word"), h = el("h2");
    if (w.pic) h.appendChild(el("span", "emoji", w.pic));
    h.appendChild(el("span", null, w.syll));
    var all = el("button", "tool", "▶ All");
    all.type = "button";
    h.appendChild(all);
    card.appendChild(h);
    var ul = el("ul", "clips"), buttons = [];
    clips.forEach(function (c) {
      var li = el("li", "clip is-" + state(c.key));
      var btn = el("button", "play", "▶");
      btn.type = "button"; btn.setAttribute("aria-label", "Play " + KIND[c.kind] + ": " + c.text);
      btn.addEventListener("click", function () { play([{ url: base + c.key + ".mp3", btn: btn }]); });
      buttons.push({ url: base + c.key + ".mp3", btn: btn });
      var what = el("div", "what");
      what.appendChild(el("span", "kind", KIND[c.kind] + (c.part && c.part !== c.text ? " · " + c.part : "")));
      what.appendChild(el("span", "text", c.text));
      var mk = el("div", "marks");
      var yes = el("button", "yes", "✓"), no = el("button", "no", "✗");
      yes.type = no.type = "button";
      yes.setAttribute("aria-label", "Sounds right"); no.setAttribute("aria-label", "Sounds wrong");
      var note = el("input", "note");
      note.type = "text"; note.placeholder = "What's wrong? (optional)";
      function sync() {
        var s = state(c.key);
        li.className = "clip is-" + s;
        yes.setAttribute("aria-pressed", String(s === "ok"));
        no.setAttribute("aria-pressed", String(s === "bad"));
        note.hidden = s !== "bad";
        note.value = (marks[c.key] && marks[c.key].note) || "";
      }
      function mark(ok) {
        var cur = state(c.key);
        if ((ok && cur === "ok") || (!ok && cur === "bad")) delete marks[c.key]; // tap again to clear
        else marks[c.key] = { ok: ok, t: Date.now() };
        saveMarks(); sync(); setupReport([page], page.name);
        if (!ok && state(c.key) === "bad") note.focus();
      }
      yes.addEventListener("click", function () { mark(true); });
      no.addEventListener("click", function () { mark(false); });
      note.addEventListener("input", function () {
        if (marks[c.key]) { marks[c.key].note = note.value; saveMarks(); setupReport([page], page.name); }
      });
      mk.appendChild(yes); mk.appendChild(no);
      li.appendChild(btn); li.appendChild(what); li.appendChild(mk); li.appendChild(note);
      sync();
      ul.appendChild(li);
    });
    all.addEventListener("click", function () { play(buttons); });
    card.appendChild(ul);
    list.appendChild(card);
  });
  if (!shown) list.appendChild(el("p", "empty", filter === "new" ? "Everything here has been heard. 🎧" : filter === "bad" ? "Nothing marked ✗." : "No recordings for this pack."));
  setupReport([page], page.name);
}

/* ---------- report: the ✗ list as text, or a new GitHub issue ---------- */
function badLines(pagesToReport) {
  var lines = [], seen = {};
  pagesToReport.forEach(function (page) {
    page.words.forEach(function (w) {
      w.clips.forEach(function (c) {
        if (!c.key || state(c.key) !== "bad" || seen[page.id + c.key]) return;
        seen[page.id + c.key] = 1;
        var note = marks[c.key].note ? " — " + marks[c.key].note.trim() : "";
        var what = c.kind === "s" ? 'syllable "' + c.part + '" (hint "' + c.text + '")' : KIND[c.kind].toLowerCase() + ' "' + c.text + '"';
        lines.push("- " + page.name + ", " + w.syll + ": " + what + note + " [" + c.kind + ":" + c.text + " → " + c.key + "]");
      });
    });
  });
  return lines;
}
function setupReport(pagesToReport, label) {
  var lines = badLines(pagesToReport);
  $("#report").hidden = !lines.length;
  if (!lines.length) return;
  var body = "Marked wrong on the listen check (" + label + "):\n\n" + lines.join("\n") +
    "\n\nFix by changing the word's (how-it-sounds) hint or sentence in its packs file (see editions.toml); a new hint gets a new recording.";
  $("#copyBtn").onclick = function () {
    navigator.clipboard.writeText(body).then(function () { $("#status").textContent = "Copied."; }, function () { $("#status").textContent = "Couldn't copy."; });
  };
  $("#issueBtn").href = REPO + "/issues/new?title=" + encodeURIComponent("Recordings to fix: " + label + " (" + lines.length + ")") + "&body=" + encodeURIComponent(body);
}

/* ---------- start ---------- */
async function start() {
  var params = new URLSearchParams(location.search), id = params.get("pack");
  var eds, all = [], audio;
  try {
    eds = readEditions(await getText("../editions.toml"));
    audio = await getJSON("../audio.json", LIVE + "audio.json");
    if (audio && audio.clips) {
      for (var ed of eds) {
        var data = readPacks(await getText("../" + ed.file));
        all = all.concat(pages(ed, eds.length > 1, data, audio, ed.file === "packs.toml"));
      }
    }
  } catch (e) {
    $("#list").appendChild(el("p", "empty", "Couldn't load the word packs. Check the connection and reload."));
    return;
  }
  if (!audio || !audio.clips) {
    $("#list").appendChild(el("p", "empty", "No recordings in this deploy (the app is using the device voice)."));
    return;
  }
  if (!id) { renderIndex(all, eds); return; }
  // No ?edition= means the original one (packs.toml), so older links still work.
  var edId = params.get("edition") || (eds.find(function (e) { return e.file === "packs.toml"; }) || eds[0]).id;
  var page = all.find(function (p) { return p.id === id && p.edition.id === edId; });
  if (!page) { location.replace("./"); return; }
  document.title = page.name + " · Listen check";
  $("#title").textContent = page.name;
  $("#crumb").hidden = false;
  $("#bar").hidden = false;
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderPack(page, audio.base);
    });
  });
  renderPack(page, audio.base);
}
start();
