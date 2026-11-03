// Listen check: a grown-up tool for hearing every recorded clip and marking it right or
// wrong. /listen/ lists every edition's packs; /listen/?edition=<id>&pack=<id> is one
// pack's page (no edition means packs.toml's). It reads the same editions.toml, packs
// files and audio.json as the app, so it plays exactly what the app plays.
// Marks live in localStorage ("sbx:listen"), keyed by word, part and clip (markKey): the
// same recording can be right in one word and wrong in another ("dee" for la-dy's dy, but
// not for some-bod-y's y), and a clip's key hashes its text and voice settings, so a
// changed hint is a new clip and shows up as not heard. Marks from before were keyed by
// clip alone; their ✓ still counts for any word not marked since (their ✗ doesn't, since
// it may have been about another word).
import { readPacks, readEditions } from "../js/words.js";
import { SOUNDS, EXAMPLE } from "../js/phonics.js";
import { parseList, clipsFor } from "../js/crossword.js";

var $ = function (s) { return document.querySelector(s); };
var REPO = "https://github.com/jbtule/sound-box-crosswords";
var LIVE = "https://tools.tuley.name/sound-box-crosswords/";
var KIND = { w: "Word", s: "Syllable", t: "Sentence", p: "Phrase", f: "Sound", sio: "Sound it out" };
var SIO_GAP = 300; // ms between sounds, as in the app's soundOut()
var STORE = "sbx:listen";

var marks = {};
try { marks = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { marks = {}; }
function saveMarks() { try { localStorage.setItem(STORE, JSON.stringify(marks)); } catch (e) {} }
function markKey(w, c) { return c.key ? [w, c.kind, c.part || c.text, c.key].join("|") : null; }
function markOf(c) {
  if (c.mk in marks) return marks[c.mk];
  var old = marks[c.key];
  return old && old.ok ? old : null;
}
function state(c) { var m = markOf(c); return !m || m.cleared ? "new" : m.ok ? "ok" : "bad"; }
function withMarkKeys(word) { word.clips.forEach(function (c) { c.mk = markKey(word.w, c); }); return word; }

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
function pages(ed, multi, data, audio) {
  var out = [];
  function withKeys(clips) {
    return clips.map(function (c) { return Object.assign({}, c, { key: audio.clips[c.kind + ":" + c.text] || null }); });
  }
  // Sound it out, in editions that have it: the word's sounds then the word, played like the
  // app does. One mark for the whole run, keyed by every clip in it, so a changed sound or
  // word brings it back as not heard.
  function soundItOut(e) {
    if (!ed.soundItOut || !e.sounds) return [];
    var parts = e.sounds.map(function (s) { return audio.clips["f:" + s.sound] || null; }).concat(audio.clips["w:" + e.w] || null);
    var ok = parts.every(Boolean);
    return [{ kind: "sio", text: e.sounds.map(function (s) { return s.sound; }).join(" · "), parts: parts, key: ok ? "sio:" + parts.join("+") : null }];
  }
  function fromList(id, name, list) {
    out.push({ id: id, edition: ed, short: name, name: (multi ? ed.name + " · " : "") + name,
      words: parseList(list).map(function (e) { return withMarkKeys({ w: e.w, syll: e.syll, pic: e.pic, clips: withKeys(clipsFor(e)).concat(soundItOut(e)) }); }) });
  }
  Object.keys(data.packs).forEach(function (id) { if (id !== "mine") fromList(id, data.packs[id].name, data.packs[id].list); });
  if (data.starter) fromList("custom", "Custom starter", data.starter);
  return out;
}

// Clip counts for one page or several (a grade); a clip shared by two words counts once.
function counts(pagesToCount) {
  var c = { total: 0, new: 0, ok: 0, bad: 0, missing: 0 }, seen = {};
  [].concat(pagesToCount).forEach(function (page) { page.words.forEach(function (w) {
    w.clips.forEach(function (clip) {
      if (!clip.key) { if (!seen[clip.kind + ":" + clip.text]) c.missing++; seen[clip.kind + ":" + clip.text] = 1; return; }
      if (seen[clip.mk]) return; // the same word in two places counts once
      seen[clip.mk] = 1; c.total++; c[state(clip)]++;
    });
  }); });
  return c;
}
function pills(c) {
  var box = el("span", "counts");
  if (c.new) box.appendChild(el("span", "pill new", c.new + " not heard"));
  if (c.bad) box.appendChild(el("span", "pill bad", c.bad + " ✗"));
  if (c.total && !c.new && !c.bad) box.appendChild(el("span", "pill ok", "all ✓"));
  box.appendChild(el("span", "pill", c.total + (c.total === 1 ? " clip" : " clips")));
  // New words are recorded at the next deploy; until then (and locally) they have no clip.
  if (c.missing) box.appendChild(el("span", "pill", c.missing + " not recorded yet"));
  return box;
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
  if (item.gap) { setTimeout(next, item.gap); return; } // a pause in a run (Sound it out)
  player.src = item.url;
  // AbortError just means a newer tap replaced this clip; anything else skips it.
  player.play().catch(function (e) { if (e.name !== "AbortError") next(); });
}
function play(items) { player.pause(); queue = items.slice(); next(); }

// Sound it out as the app plays it: each sound, a pause after it, then the word.
function sioItems(c, base, btn) {
  var items = [];
  c.parts.forEach(function (k, i) {
    items.push({ url: base + k + ".mp3", btn: btn });
    if (i < c.parts.length - 1) items.push({ gap: SIO_GAP, btn: btn });
  });
  return items;
}

/* ---------- index ---------- */
function href(page) { return "?edition=" + encodeURIComponent(page.edition.id) + "&pack=" + encodeURIComponent(page.id); }
// /listen/: one card per grade (edition) with its counts; with a single edition, its packs.
// The Sound it out sounds (shared by every grade): one card each, on their own page.
var SOUNDS_ED = { id: "", name: "Sounds" };
function soundsPage(audio) {
  return {
    id: "sounds", edition: SOUNDS_ED, short: "Sounds", name: "Sounds",
    words: SOUNDS.map(function (n) {
      return withMarkKeys({ w: n, syll: n + " · as in " + EXAMPLE[n], pic: "", clips: [{ kind: "f", text: n, key: audio.clips["f:" + n] || null }] });
    })
  };
}
// Phrases the app says in every grade ("You solved it!", achievement pieces): one card each,
// on their own page, like Sounds.
function phrasesPage(audio) {
  var phrases = Object.keys(audio.clips).filter(function (k) { return k.startsWith("p:"); }).map(function (k) { return k.slice(2); });
  return {
    id: "phrases", edition: SOUNDS_ED, short: "Phrases", name: "Phrases",
    words: phrases.map(function (p) { return withMarkKeys({ w: "phrase:" + p, syll: p, pic: "", clips: [{ kind: "p", text: p, key: audio.clips["p:" + p] }] }); })
  };
}
// The cards for pages shared by every grade (Sounds, Phrases).
var GLOBAL = { sounds: "Sound it out: each single sound, used by every grade", phrases: "What the app says in every grade: \"You solved it!\" and achievement pieces" };
function globalCards(all, ul) {
  Object.keys(GLOBAL).forEach(function (id) {
    var page = all.find(function (p) { return p.id === id; });
    if (!page) return;
    var li = el("li", "card"), a = el("a");
    a.href = "?" + id;
    a.appendChild(el("span", "name", page.short));
    a.appendChild(pills(counts(page)));
    li.append(a, el("p", "sub", GLOBAL[id]));
    ul.appendChild(li);
  });
}
function renderIndex(all, eds) {
  if (eds.length === 1) { renderEdition(all, eds[0], false); return; }
  var list = $("#list"); list.innerHTML = "";
  var ul = el("ul", "packs");
  eds.forEach(function (ed) {
    var mine = all.filter(function (p) { return p.edition === ed; });
    var li = el("li", "card"), a = el("a");
    a.href = "?edition=" + encodeURIComponent(ed.id);
    a.appendChild(el("span", "name", ed.name));
    a.appendChild(pills(counts(mine)));
    var sub = el("p", "sub", mine.map(function (p) { return p.short; }).join(" · "));
    li.append(a, sub);
    ul.appendChild(li);
  });
  globalCards(all, ul);
  list.appendChild(ul);
  setupReport(all, "all grades");
}
// /listen/?edition=<id>: that grade's packs, each with its words underneath.
function renderEdition(all, ed, multi) {
  var mine = all.filter(function (p) { return p.edition === ed; });
  if (multi) {
    document.title = ed.name + " · Listen check";
    $("#title").textContent = ed.name;
    $("#crumb").textContent = "‹ All grades"; $("#crumb").href = "./"; $("#crumb").hidden = false;
  }
  var list = $("#list"); list.innerHTML = "";
  var ul = indexList(mine);
  if (!multi) globalCards(all, ul);
  list.appendChild(ul);
  setupReport(mine, multi ? ed.name : "all packs");
}
// A word's status for the nested index: ✗ if any clip is marked wrong, then not heard,
// then ✓ when every clip is. "none" when it has no recordings in this deploy yet.
function wordState(w) {
  var keyed = w.clips.filter(function (c) { return c.key; });
  if (!keyed.length) return "none";
  var st = keyed.map(function (c) { return state(c); });
  return st.indexOf("bad") >= 0 ? "bad" : st.indexOf("new") >= 0 ? "new" : "ok";
}
var MARK = { bad: "✗", new: "•", ok: "✓", none: "–" };
var MARK_LABEL = { bad: "marked wrong", new: "not heard", ok: "all right", none: "no recording yet" };
function wordAnchor(w) { return "w-" + w.w; }
function indexList(all) {
  var ul = el("ul", "packs");
  all.forEach(function (page) {
    var li = el("li", "card"), a = el("a");
    a.href = href(page);
    a.appendChild(el("span", "name", page.short));
    a.appendChild(pills(counts(page)));
    li.appendChild(a);
    // Nested index: every word in the pack with its status, each jumping to its card.
    var more = el("details", "words-index"), sum = el("summary", null, page.words.length + (page.words.length === 1 ? " word" : " words"));
    var wl = el("ul", "word-list");
    page.words.forEach(function (w) {
      var s = wordState(w), item = el("li"), link = el("a", "word-link is-" + s);
      link.href = href(page) + "#" + wordAnchor(w);
      var mark = el("span", "mark", MARK[s]);
      mark.setAttribute("aria-label", MARK_LABEL[s]); mark.setAttribute("role", "img");
      link.append(mark, el("span", null, (w.pic ? w.pic + " " : "") + w.syll));
      item.appendChild(link); wl.appendChild(item);
    });
    more.append(sum, wl);
    li.appendChild(more);
    ul.appendChild(li);
  });
  return ul;
}

/* ---------- one pack ---------- */
var filter = "new";
function renderPack(page, base) {
  var list = $("#list"); list.innerHTML = "";
  var shown = 0;
  page.words.forEach(function (w) {
    var clips = w.clips.filter(function (c) { return c.key && (filter === "all" || state(c) === filter); });
    if (!clips.length) return;
    shown++;
    var card = el("section", "card word"), h = el("h2");
    card.id = wordAnchor(w);
    if (w.pic) h.appendChild(el("span", "emoji", w.pic));
    h.appendChild(el("span", null, w.syll));
    var all = el("button", "tool", "▶ All");
    all.type = "button";
    h.appendChild(all);
    card.appendChild(h);
    var ul = el("ul", "clips"), buttons = [];
    clips.forEach(function (c) {
      var li = el("li", "clip is-" + state(c));
      var btn = el("button", "play", "▶");
      btn.type = "button"; btn.setAttribute("aria-label", "Play " + KIND[c.kind] + ": " + c.text);
      var items = c.kind === "sio" ? sioItems(c, base, btn) : [{ url: base + c.key + ".mp3", btn: btn }];
      btn.addEventListener("click", function () { play(items); });
      buttons.push.apply(buttons, items);
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
        var s = state(c);
        li.className = "clip is-" + s;
        yes.setAttribute("aria-pressed", String(s === "ok"));
        no.setAttribute("aria-pressed", String(s === "bad"));
        note.hidden = s !== "bad";
        note.value = (markOf(c) && markOf(c).note) || "";
      }
      function mark(ok) {
        var cur = state(c);
        // Tap again to clear (kept as "cleared" so an older ✓ for the clip doesn't come back).
        if ((ok && cur === "ok") || (!ok && cur === "bad")) marks[c.mk] = { cleared: true, t: Date.now() };
        else marks[c.mk] = { ok: ok, t: Date.now() };
        saveMarks(); sync(); setupReport([page], page.name);
        if (!ok && state(c) === "bad") note.focus();
      }
      yes.addEventListener("click", function () { mark(true); });
      no.addEventListener("click", function () { mark(false); });
      note.addEventListener("input", function () {
        if (state(c) === "bad") { marks[c.mk].note = note.value; saveMarks(); setupReport([page], page.name); }
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
        if (!c.key || state(c) !== "bad" || seen[page.id + c.mk]) return;
        seen[page.id + c.mk] = 1;
        var note = marks[c.mk].note ? " — " + marks[c.mk].note.trim() : "";
        var what = c.kind === "s" ? 'syllable "' + c.part + '" (hint "' + c.text + '")' : KIND[c.kind].toLowerCase() + ' "' + c.text + '"';
        var ref = c.kind === "sio"
          ? c.text.split(" · ").map(function (n) { return "f:" + n; }).join(" ") + " then w:" + w.w + "; a bad sound is fixed in scripts/audio/sounds/picks.json, a bad split in the word's {…}"
          : c.kind + ":" + c.text + " → " + c.key;
        lines.push("- " + page.name + ", " + w.syll + ": " + what + note + " [" + ref + "]");
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
    "\n\nFix a word by changing its (how-it-sounds) hint or sentence in its packs file (see editions.toml); a new hint gets a new recording. Fix a single Sound by changing its pick in scripts/audio/sounds/picks.json (candidates: scripts/audio/sounds/run.sh).";
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
        all = all.concat(pages(ed, eds.length > 1, data, audio));
      }
      all.push(soundsPage(audio), phrasesPage(audio));
    }
  } catch (e) {
    $("#list").appendChild(el("p", "empty", "Couldn't load the word packs. Check the connection and reload."));
    return;
  }
  if (!audio || !audio.clips) {
    $("#list").appendChild(el("p", "empty", "No recordings in this deploy (the app is using the device voice)."));
    return;
  }
  var multi = eds.length > 1, edParam = params.get("edition");
  for (var g of Object.keys(GLOBAL)) {
    if (params.has(g)) { showPage(all.find(function (p) { return p.id === g; }), audio, "‹ All grades", "./"); return; }
  }
  if (!id && !edParam) { renderIndex(all, eds); return; }
  // No ?edition= means the original one (packs.toml), so older links still work.
  var ed = eds.find(function (e) { return e.id === edParam; }) || (!edParam && (eds.find(function (e) { return e.file === "packs.toml"; }) || eds[0]));
  if (!ed) { location.replace("./"); return; }
  if (!id) { renderEdition(all, ed, multi); return; }
  var page = all.find(function (p) { return p.id === id && p.edition === ed; });
  if (!page) { location.replace(multi ? "?edition=" + encodeURIComponent(ed.id) : "./"); return; }
  showPage(page, audio, multi ? "‹ " + ed.name : "‹ All packs", multi ? "?edition=" + encodeURIComponent(ed.id) : "./");
}
// One pack's (or the Sounds) page, with a back link.
function showPage(page, audio, back, backHref) {
  document.title = page.name + " · Listen check";
  $("#title").textContent = page.short;
  $("#crumb").textContent = back; $("#crumb").href = backHref;
  $("#crumb").hidden = false;
  $("#bar").hidden = false;
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderPack(page, audio.base);
    });
  });
  // From the nested index (#w-<word>): show every clip so that word is on the page, then
  // bring it into view and flash it.
  var jump = location.hash.slice(1);
  if (jump) {
    filter = "all";
    document.querySelectorAll("[data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.filter === "all")); });
  }
  renderPack(page, audio.base);
  var target = jump && document.getElementById(jump);
  if (target) {
    target.scrollIntoView({ block: "start" });
    target.classList.add("jumped");
    setTimeout(function () { target.classList.remove("jumped"); }, 1600);
  }
}
start();
