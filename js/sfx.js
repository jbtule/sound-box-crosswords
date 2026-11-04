// Sound effects for the new-puzzle entrances (entrances.js), synthesized with Web Audio like
// the solve chime (chime.js): nothing to load. Each was picked by ear in the Board Entrances
// spike. makeSfx(ac, dest) gives the sounds, all playing into `dest` (one entrance's own bus,
// so skipping it can silence everything it scheduled).

var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
var noiseFor = null, noiseBuf = null;

export function makeSfx(ac, dest) {
  if (noiseFor !== ac) { // a second and a half of white noise, made once per audio context
    noiseFor = ac;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function note(step, base) { return (base || 523.25) * Math.pow(2, PENTA[Math.max(0, Math.min(PENTA.length - 1, step))] / 12); }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function osc(t, freq, type, peak, attack, decay, endFreq) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + attack + decay);
    env(g, t, peak, attack, decay); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }
  function noise(t, dur, filterType, f0, f1, peak, q) {
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = filterType; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, Math.min(0.08, dur / 3), dur); s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.1);
  }
  return {
    // Slide in: a soft whoosh per word.
    whoosh: function (t, dur) { noise(t, dur, "bandpass", 300, 2600, 0.5, 0.9); },
    // Zoom: a pop as each ring grows, a soft tap as it settles.
    pop: function (t, step) { osc(t, note(step, 440) * 1.8, "sine", 0.3, 0.004, 0.11, note(step, 440)); },
    tick: function (t, step) { osc(t, note(step), "triangle", 0.28, 0.004, 0.09); noise(t, 0.02, "highpass", 3000, 0, 0.08); },
    // Color wash: a harp-like note per diagonal.
    bell: function (t, step) { var f = note(step, 659.25); osc(t, f, "sine", 0.22, 0.005, 1.1); osc(t, f * 2.76, "sine", 0.05, 0.005, 0.5); },
    // Neon: mains hum that swells as tubes light, and a zap per flicker.
    buzz: function (t, dur) {
      var o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.value = 60; o2.type = "square"; o2.frequency.value = 120.4;
      f.type = "bandpass"; f.frequency.value = 520; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.55);
      g.gain.setValueAtTime(0.06, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(dest);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },
    zap: function (t, i) { noise(t, 0.035, "highpass", 2600 + (i % 4) * 500, 0, 0.12, 0.7); osc(t, 120, "square", 0.04, 0.002, 0.05); },
    // Stamp: a soft rubber-stamp thump per batch.
    thump: function (t) { osc(t, 150, "sine", 0.5, 0.004, 0.16, 62); noise(t, 0.07, "lowpass", 900, 300, 0.28, 0.7); },
    // Raindrops: a water-drop plip per landing.
    plip: function (t, f) { osc(t, f, "sine", 0.32, 0.003, 0.09, f * 2.6); noise(t, 0.015, "bandpass", 3500, 0, 0.05, 2); },
    // Converge: a rising swoosh that resolves into a chord.
    glide: function (t, dur) { osc(t, 196, "triangle", 0.16, dur * 0.8, dur * 0.25, 784); noise(t, dur, "bandpass", 400, 1800, 0.12, 2); },
    chord: function (t, notes, peak) { notes.forEach(function (f, i) { osc(t + i * 0.015, f, "triangle", peak || 0.16, 0.01, 0.9); }); },
    // Sweep: one note per column, climbing.
    run: function (t, step) { osc(t, note(step, 392), "sine", 0.22, 0.006, 0.22); },
    // Flip: a card-flip click.
    click: function (t, i) { noise(t, 0.025, "bandpass", 2400 + (i % 3) * 400, 0, 0.35, 3); osc(t, 1200, "square", 0.02, 0.002, 0.02); },
    // Spin in: a rising whirr, and a coin-wobble rattle as boxes settle.
    whirr: function (t, dur) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(260, t + dur);
      f.type = "lowpass"; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + dur);
      lfo.frequency.setValueAtTime(14, t); lfo.frequency.linearRampToValueAtTime(30, t + dur); lg.gain.value = 0.06;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.3); g.gain.setValueAtTime(0.1, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(dest);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    settle: function (t, i) {
      var gaps = [0, 0.022, 0.05, 0.085, 0.13, 0.19], f = 1700 + (i % 4) * 260;
      gaps.forEach(function (g, j) { noise(t + g, 0.018, "bandpass", f - j * 120, 0, 0.32 * Math.pow(0.72, j), 5); });
    },
    // Leaves in the wind: a gust that swells and dies away, and soft rustles.
    wind: function (t, dur) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), hp = ac.createBiquadFilter(), g2 = ac.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = "bandpass"; f.Q.value = 0.9;
      f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(950, t + dur * 0.3); f.frequency.linearRampToValueAtTime(600, t + dur * 0.55); f.frequency.linearRampToValueAtTime(280, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + dur * 0.28); g.gain.linearRampToValueAtTime(0.3, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      hp.type = "bandpass"; hp.Q.value = 6; hp.frequency.setValueAtTime(1300, t); hp.frequency.linearRampToValueAtTime(1900, t + dur * 0.3); hp.frequency.linearRampToValueAtTime(1100, t + dur);
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.3); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
      s.connect(f); f.connect(g); g.connect(dest); s.connect(hp); hp.connect(g2); g2.connect(dest); s.start(t); s.stop(t + dur + 0.1);
    },
    rustle: function (t) { for (var j = 0; j < 3; j++) noise(t + j * 0.025 + Math.random() * 0.02, 0.03, "bandpass", 3200 + Math.random() * 2500, 0, 0.07, 1.5); }
  };
}
