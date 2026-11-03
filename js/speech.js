// Text-to-speech via the Web Speech API. On iOS it only works after a user tap.
// Everything fails quietly if speech isn't available.

var synth = window.speechSynthesis, voice = null;

export var hasSpeech = !!synth;

// Novelty and old robotic voices that ship with Apple devices. Never picked.
var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
// Clear, natural voices to prefer at the same quality level.
var FAVORED = /\b(Ava|Zoe|Samantha|Allison|Susan|Evan|Nathan|Tom|Google US English|Aria|Jenny|Guy)\b/i;

// Higher is better; 0 means not usable. Downloaded Premium/Enhanced voices win, so
// installing one on the device upgrades the app with no setting to change.
function score(v) {
  if (!/^en/i.test(v.lang) || NOVELTY.test(v.name) || /eloquence/i.test(v.voiceURI)) return 0;
  var id = v.name + " " + v.voiceURI, s = 1;
  if (/^en[-_]US/i.test(v.lang)) s += 4;
  if (/premium/i.test(id)) s += 30;
  else if (/enhanced|natural|neural/i.test(id)) s += 20;
  if (FAVORED.test(v.name)) s += 2;
  return s;
}

// Usable voices, best first. Empty until the browser has loaded its voice list.
function ranked() {
  try {
    return synth.getVoices().filter(function (v) { return score(v) > 0; })
      .sort(function (a, b) { return score(b) - score(a) || a.name.localeCompare(b.name); });
  } catch (e) { return []; }
}

function pickVoice() {
  try {
    var vs = synth.getVoices();
    voice = ranked()[0] || vs.find(function (v) { return /^en/i.test(v.lang); }) || null;
  } catch (e) {}
}
if (synth) { pickVoice(); try { synth.addEventListener("voiceschanged", pickVoice); } catch (e) {} }

// Device voice. Resolves when speech ends, or after a timeout scaled to the text,
// since onend doesn't always fire. `cancel` stops anything already speaking first.
export function speak(text, rate, cancel) {
  return new Promise(function (resolve) {
    if (!synth) { setTimeout(resolve, 500); return; }
    try {
      if (cancel) synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = "en-US"; u.rate = rate || 0.85;
      var t = setTimeout(resolve, 1500 + text.length * 120);
      u.onend = function () { clearTimeout(t); resolve(); };
      u.onerror = function () { clearTimeout(t); resolve(); };
      synth.speak(u);
    } catch (e) { resolve(); }
  });
}

/* ---------- recorded clips ----------
   Pack words, Break it down syllables, and sentences are pre-recorded (Kokoro, built by
   scripts/audio/build.mjs at deploy). audio.json maps "kind:text" to a clip on the audio
   host; anything without a clip (Custom words, local dev) uses the device voice. */
var clips = {}, clipBase = "", player = null, finishClip = null;
var queue = Promise.resolve(), epoch = 0;
// The device-voice rate each kind's recording corresponds to. A slower requested rate
// (Hear it) plays the clip slightly slower; never faster than recorded.
var NORMAL = { w: 0.85, s: 0.7, t: 0.9, p: 0.95, f: 1 };
var clipsReady = [];

(function loadClips() {
  var url = new URL("../audio.json", import.meta.url);
  url.search = new URL(import.meta.url).search; // same ?v= cache-busting stamp
  fetch(url).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) { if (m && m.clips) { clips = m.clips; clipBase = m.base; } })
    .catch(function () {})
    .then(function () { clipsReady.forEach(function (f) { f(); }); clipsReady = null; });
})();

// One shared <audio> element. iOS only lets audio start inside a tap, and later clips
// start after awaits, so play a moment of silence on the first tap to unlock it.
function getPlayer() { if (!player) { player = new Audio(); player.preload = "auto"; } return player; }
var SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
function unlock() {
  document.removeEventListener("pointerdown", unlock, true);
  document.removeEventListener("keydown", unlock, true);
  var a = getPlayer();
  if (a.src) return;
  a.src = SILENCE;
  var p = a.play();
  if (p && p.catch) p.catch(function () {});
}
document.addEventListener("pointerdown", unlock, true);
document.addEventListener("keydown", unlock, true);

// Resolves true when the clip ends, false if it fails (the caller then uses the device voice).
function playClip(url, rate) {
  return new Promise(function (resolve) {
    var a = getPlayer(), done = false;
    function end(ok) {
      if (done) return;
      done = true; finishClip = null; clearTimeout(t);
      a.onended = a.onerror = null;
      resolve(ok);
    }
    var t = setTimeout(function () { end(true); }, 15000);
    finishClip = end;
    a.onended = function () { end(true); };
    a.onerror = function () { end(false); };
    a.src = url;
    a.defaultPlaybackRate = a.playbackRate = rate;
    var p = a.play();
    if (p && p.catch) p.catch(function () { end(false); });
  });
}

// Plays (or speaks) one item after anything already queued. kind: "w" word, "s" Break it down
// syllable, "t" context sentence, "p" phrase ("f", a single sound, uses sayRecorded). `cancel` clears the queue first.
// Returns a promise for when this item is done.
export function say(kind, text, rate, cancel) {
  if (cancel) stopSpeech();
  var my = epoch;
  queue = queue.then(function () {
    if (my !== epoch) return;
    var key = clips[kind + ":" + text];
    if (!key) return speak(text, rate, false);
    var r = Math.min(1, (rate || NORMAL[kind]) / NORMAL[kind]);
    return playClip(clipBase + key + ".mp3", r).then(function (ok) {
      if (!ok && my === epoch) return speak(text, rate, false);
    });
  });
  return queue;
}

// Whether there's a recording (not just the device voice) for this item.
export function hasClip(kind, text) { return !!clips[kind + ":" + text]; }
// Runs once audio.json has loaded (or failed), so recorded-only features can show then.
export function onClips(f) { if (clipsReady) clipsReady.push(f); else f(); }
// Plays a recording only, never the device voice, which can't say a single sound ("k");
// with no recording it just resolves. Same queue as say().
export function sayRecorded(kind, text) {
  var my = epoch;
  queue = queue.then(function () {
    var key = clips[kind + ":" + text];
    if (my !== epoch || !key) return;
    return playClip(clipBase + key + ".mp3", 1);
  });
  return queue;
}

// Runs fn (which may return a promise) in turn in the same queue as say(), e.g. a sound
// effect between two spoken lines. Skipped if speech is stopped before its turn.
export function sayAfter(fn) {
  var my = epoch;
  queue = queue.then(function () { if (my === epoch) return fn(); });
  return queue;
}

// Stops the clip or speech in progress and drops anything queued.
export function stopSpeech() {
  epoch++;
  queue = Promise.resolve();
  if (finishClip) finishClip(true);
  if (player) { try { player.pause(); } catch (e) {} }
  try { if (synth) synth.cancel(); } catch (e) {}
}
// Changes whenever speech is stopped, so a running sequence (Break it down) can tell.
export function speechEpoch() { return epoch; }
