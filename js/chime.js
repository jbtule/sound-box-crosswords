// Reward sounds, synthesized with Web Audio (nothing to load), picked by ear from a dozen.
// iOS only allows audio that starts from a tap, so the audio context is created and
// resumed on the first tap; the sounds themselves play later.

var ctx = null, out = null, echo = null;

function unlock() {
  document.removeEventListener("pointerdown", unlock, true);
  document.removeEventListener("keydown", unlock, true);
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    // A soft echo (feedback delay through a low-pass) for the glitter run.
    var d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = 0.16; fb.gain.value = 0.32; wet.gain.value = 0.35;
    lp.type = "lowpass"; lp.frequency.value = 3500;
    d.connect(lp).connect(fb).connect(d);
    lp.connect(wet).connect(out);
    echo = d;
  } catch (e) { ctx = null; }
}
document.addEventListener("pointerdown", unlock, true);
document.addEventListener("keydown", unlock, true);

// Whether sound can play now. After the app was in the background, iOS may have paused the
// audio; try to wake it, and if that needs a tap, say so (app.js then shows Continue).
export function audioAwake() {
  if (!ctx) return Promise.resolve(false);
  if (ctx.state === "running") return Promise.resolve(true);
  try { return ctx.resume().then(function () { return ctx.state === "running"; }, function () { return false; }); }
  catch (e) { return Promise.resolve(false); }
}

// The audio context and output, for other synthesized sounds (the new-puzzle entrances), once
// the first tap has made them; null before that.
export function audioOut() { return ctx ? { ctx: ctx, out: out } : null; }

// A solved puzzle: "glitter", a fast run of eight high bells up a pentatonic scale
// (G5 to C7) with an echo, about a second.
export function chime() {
  play(function (t) {
    [79, 81, 84, 86, 88, 91, 93, 96].forEach(function (m, i) {
      note(m, t + i * 0.04, BELL, 0.06, 0.4, true);
    });
  });
}

// A new achievement: "climb and chord", marimba-like C5 E5 G5 rising into a C major bell
// chord. Resolves when it's done, so the words after it ("New achievement!") don't talk
// over it.
export function sparkle() {
  play(function (t) {
    [72, 76, 79].forEach(function (m, i) { note(m, t + i * 0.09, MALLET, 0.15, 0.35); });
    [72, 76, 79, 84].forEach(function (m) { note(m, t + 0.3, BELL, 0.06, 0.9); });
  });
  return new Promise(function (r) { setTimeout(r, ctx ? 1100 : 0); });
}

// Timbres: [wave, [frequency multiple, relative level]...].
var BELL = ["sine", [1, 1], [2, 0.25], [3.01, 0.08]];
var MALLET = ["triangle", [1, 1], [4, 0.05]];

function play(fn) {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    fn(ctx.currentTime + 0.03);
  } catch (e) {}
}

// One note (MIDI number) at time t: a quick attack, then a bell-like decay over `dur`
// seconds (upper partials fade faster).
function note(midi, t, timbre, level, dur, withEcho) {
  var f = 440 * Math.pow(2, (midi - 69) / 12), bus = ctx.createGain();
  bus.connect(out);
  if (withEcho) bus.connect(echo);
  timbre.slice(1).forEach(function (p) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = timbre[0];
    osc.frequency.value = f * p[0];
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * p[1], t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (p[0] > 1.5 ? 0.6 : 1));
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}
