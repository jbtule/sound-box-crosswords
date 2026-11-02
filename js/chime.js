// A soft two-note chime for a solved puzzle, synthesized with Web Audio (nothing to load).
// iOS only allows audio that starts from a tap, so the audio context is created and
// resumed on the first tap; the chime itself plays later, when the puzzle is solved.

var ctx = null;

function unlock() {
  document.removeEventListener("pointerdown", unlock, true);
  document.removeEventListener("keydown", unlock, true);
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) { ctx = null; }
}
document.addEventListener("pointerdown", unlock, true);
document.addEventListener("keydown", unlock, true);

// Two rising bell-like notes (E5, then A5), quiet, about half a second in all.
export function chime() {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    var now = ctx.currentTime + 0.02;
    [[659.25, 0], [880, 0.14]].forEach(function (n) {
      var osc = ctx.createOscillator(), gain = ctx.createGain(), start = now + n[1];
      osc.type = "sine";
      osc.frequency.value = n[0];
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015); // soft attack
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45); // bell-like decay
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch (e) {}
}
