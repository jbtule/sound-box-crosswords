// Text-to-speech via the Web Speech API. On iOS it only works after a user tap.
// Everything fails quietly if speech isn't available.

var synth = window.speechSynthesis, voice = null;

export var hasSpeech = !!synth;

function pickVoice() {
  try {
    var vs = synth.getVoices();
    voice = vs.find(function (v) { return /^en-US/i.test(v.lang) && /Samantha|Google US|Aria|Jenny/i.test(v.name); }) ||
            vs.find(function (v) { return /^en-US/i.test(v.lang); }) || vs.find(function (v) { return /^en/i.test(v.lang); }) || null;
  } catch (e) {}
}
if (synth) { pickVoice(); try { synth.onvoiceschanged = pickVoice; } catch (e) {} }

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
