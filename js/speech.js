// Text-to-speech via the Web Speech API. On iOS it only works after a user tap.
// Everything fails quietly if speech isn't available.

var synth = window.speechSynthesis, voice = null, wanted = "", listeners = [];

export var hasSpeech = !!synth;

// Novelty and old robotic voices that ship with Apple devices. Never auto-picked or listed.
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

// For the grown-ups picker: [{ id, label }], best first. `id` is the voiceURI, since
// iOS can name a basic and an Enhanced voice the same ("Samantha").
export function listVoices() {
  return ranked().map(function (v) {
    var q = /premium/i.test(v.voiceURI) ? "Premium" : /enhanced/i.test(v.voiceURI) ? "Enhanced" : "";
    var label = v.name + (q && v.name.indexOf(q) < 0 ? " (" + q + ")" : "");
    return { id: v.voiceURI, label: label + (/^en[-_]US/i.test(v.lang) ? "" : " · " + v.lang) };
  });
}

function pickVoice() {
  try {
    var vs = synth.getVoices();
    voice = (wanted && vs.find(function (v) { return v.voiceURI === wanted; })) ||
      ranked()[0] || vs.find(function (v) { return /^en/i.test(v.lang); }) || null;
  } catch (e) {}
  listeners.forEach(function (fn) { fn(); });
}
if (synth) { pickVoice(); try { synth.addEventListener("voiceschanged", pickVoice); } catch (e) {} }

// Use the voice with this id (voiceURI), or "" for the best available. A saved voice that
// has since been removed from the device falls back to the best available.
export function setVoice(id) { wanted = id || ""; if (synth) pickVoice(); }
export function currentVoiceName() { return voice ? voice.name : ""; }
// Safari can deliver the voice list after page load; this runs whenever it changes.
export function onVoicesChanged(fn) { listeners.push(fn); }

// Resolves when speech ends (or after a timeout, since onend doesn't always fire).
// `cancel` stops anything already speaking first.
export function speak(text, rate, cancel) {
  return new Promise(function (resolve) {
    if (!synth) { setTimeout(resolve, 500); return; }
    try {
      if (cancel) synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = "en-US"; u.rate = rate || 0.85;
      var t = setTimeout(resolve, 2200);
      u.onend = function () { clearTimeout(t); resolve(); };
      u.onerror = function () { clearTimeout(t); resolve(); };
      synth.speak(u);
    } catch (e) { resolve(); }
  });
}

export function stopSpeech() {
  try { if (synth) synth.cancel(); } catch (e) {}
}
