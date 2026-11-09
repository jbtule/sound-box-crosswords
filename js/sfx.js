// Sound effects for the new-puzzle entrances (entrances.js), synthesized with Web Audio like
// the solve chime (chime.js): nothing to load. Each was picked by ear in the Board Entrances
// spike. makeSfx(ac, dest) gives the sounds, all playing into `dest` (one entrance's own bus,
// so skipping it can silence everything it scheduled).

var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
var noiseFor = null, noiseBuf = null;

export function makeSfx(ac, dest) {
  var reverb = null; // the horn's hall, made the first time
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
    // Roller coaster: clacks up the lift, a wheee round the loop, an air-brake hiss, cars clunking in.
    wheee: function (t, dur) {
      var o = ac.createOscillator(), g = ac.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1100, t + dur * 0.45); o.frequency.exponentialRampToValueAtTime(420, t + dur);
      env(g, t, 0.16, dur * 0.3, dur * 0.7); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    },
    brake: function (t, dur) { noise(t, dur, "highpass", 5200, 1800, 0.22, 0.6); },
    clunk: function (t, i) { var f = 95 + (i % 3) * 18; osc(t, f, "triangle", 0.3, 0.004, 0.12, f * 0.7); noise(t, 0.04, "lowpass", 700, 0, 0.12, 0.8); },
    // Billiards (and the coaster's lift): ball clacks, the break, cushion thuds.
    clack: function (t, i) { var f = 1900 + (i % 5) * 140; osc(t, f, "sine", 0.16, 0.001, 0.035); osc(t, f * 1.63, "sine", 0.07, 0.001, 0.025); },
    crack: function (t) { noise(t, 0.09, "highpass", 1200, 0, 0.7, 0.7); osc(t, 220, "triangle", 0.35, 0.002, 0.08, 120); },
    cushion: function (t, g) { osc(t, 120, "sine", 0.22 * g, 0.003, 0.1, 80); noise(t, 0.05, "lowpass", 600, 0, 0.1 * g, 0.7); },
    // The highlight clicking into place (Billiards, Flying saucer).
    clickin: function (t) { noise(t, 0.02, "bandpass", 2600, 0, 0.3, 4); osc(t + 0.01, 880, "triangle", 0.12, 0.002, 0.12); osc(t + 0.01, 1320, "triangle", 0.06, 0.002, 0.1); },
    // Kaiju: a growl, stomps, uh-oh, the crash, wooden knocks, a rumble.
    stomp: function (t, i) { var f = i % 2 ? 52 : 60; osc(t, f * 1.8, "triangle", 0.7, 0.003, 0.4, f * 0.8); noise(t, 0.18, "lowpass", 500, 90, 0.42, 0.7); },
    // Monster truck: a big engine, a low sawtooth with a rumble, its pitch following `pts`
    // ([[seconds in, Hz], ...]: idling in, revving up the mound, screaming in the air), cut at the end.
    engine: function (t, pts) {
      var o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      var end = pts[pts.length - 1][0];
      o.type = "sawtooth"; o2.type = "square";
      pts.forEach(function (p, i) { var at = t + p[0]; if (i) { o.frequency.linearRampToValueAtTime(p[1], at); o2.frequency.linearRampToValueAtTime(p[1] * 0.5, at); } else { o.frequency.setValueAtTime(p[1], at); o2.frequency.setValueAtTime(p[1] * 0.5, at); } });
      f.type = "lowpass"; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1400, t + end * 0.8);
      lfo.frequency.value = 23; lg.gain.value = 0.05;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.3); g.gain.setValueAtTime(0.13, t + end - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + end + 0.08);
      var g2 = ac.createGain(); g2.gain.value = 0.6; o2.connect(g2); g2.connect(f);
      lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(dest);
      [o, o2, lfo].forEach(function (x) { x.start(t); x.stop(t + end + 0.15); });
    },
    // Fireflies: crickets on a summer night, soft high chirps in threes, here and there.
    crickets: function (t, dur) {
      for (var c = 0.1; c < dur - 0.2; c += 0.35 + Math.random() * 0.4) {
        var f = 4200 + Math.random() * 600;
        for (var j = 0; j < 3; j++) osc(t + c + j * 0.045, f, "sine", 0.018, 0.004, 0.03);
      }
    },
    // Marching band: a snare (a crisp rattle of noise over a short tone) and a bass drum.
    snare: function (t, g) { noise(t, 0.09, "highpass", 2400, 0, 0.32 * (g || 1), 0.7); osc(t, 210, "triangle", 0.12 * (g || 1), 0.002, 0.06, 160); },
    bass: function (t) { osc(t, 110, "sine", 0.55, 0.003, 0.22, 48); noise(t, 0.04, "lowpass", 500, 0, 0.12, 0.7); },
    // Centipede: a skitter of tiny feet, fast soft ticks the whole way.
    skitter: function (t, dur) {
      for (var c = 0; c < dur; c += 0.028 + Math.random() * 0.02) noise(t + c, 0.008, "bandpass", 2600 + Math.random() * 1800, 0, 0.035, 3);
    },
    // Wipers on wet glass: a brushing swoosh across the stroke (filtered noise swelling and
    // fading, with a little grit), a short rubber "eek" as the blade turns over at the start,
    // and a thunk at the end.
    swish: function (t, dur) {
      var s2 = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s2.buffer = noiseBuf; f.type = "bandpass"; f.Q.value = 0.9;
      f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(600, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s2.connect(f); f.connect(g); g.connect(dest); s2.start(t); s2.stop(t + dur + 0.05);
      for (var c = 0.05; c < dur - 0.1; c += 0.06 + Math.random() * 0.05) noise(t + c, 0.015, "bandpass", 2200, 0, 0.03, 2); // grit
      // eek: rubber catching on glass, a squeal that wobbles and chatters (stick-slip)
      var e = ac.createOscillator(), ef = ac.createBiquadFilter(), eg = ac.createGain(), ch = ac.createOscillator(), chg = ac.createGain(), vb = ac.createOscillator(), vbg = ac.createGain(), ED = 0.22;
      e.type = "sawtooth"; e.frequency.setValueAtTime(1350, t); e.frequency.linearRampToValueAtTime(1800, t + ED * 0.6); e.frequency.linearRampToValueAtTime(1600, t + ED);
      vb.frequency.value = 23; vbg.gain.value = 90; vb.connect(vbg); vbg.connect(e.frequency);
      ch.type = "square"; ch.frequency.value = 62; chg.gain.value = 0.04; ch.connect(chg); chg.connect(eg.gain);
      ef.type = "bandpass"; ef.frequency.value = 1700; ef.Q.value = 5;
      eg.gain.setValueAtTime(0.0001, t); eg.gain.exponentialRampToValueAtTime(0.07, t + 0.02); eg.gain.setValueAtTime(0.07, t + ED * 0.6); eg.gain.exponentialRampToValueAtTime(0.0001, t + ED);
      e.connect(ef); ef.connect(eg); eg.connect(dest);
      [e, ch, vb].forEach(function (x) { x.start(t); x.stop(t + ED + 0.05); });
      var tk = t + dur - 0.03; // the thunk: as the stroke ends
      osc(tk, 120, "sine", 0.32, 0.004, 0.14, 70); noise(tk, 0.06, "lowpass", 500, 0, 0.12, 0.7);
    },
    // Coins: the rattle of one settling, taps coming faster and faster and fading to a stop.
    // and before that, spinning on its edge: a rolling stream of tiny uneven ticks, speeding up.
    whir: function (t, dur, i) {
      var c = 0, rate = 16; // taps a second, rising
      while (c < dur) {
        var f = 1900 + (i % 4) * 150 + (Math.random() - 0.5) * 300;
        noise(t + c, 0.009, "bandpass", f, 0, 0.022 + Math.random() * 0.012, 9); // a tiny ringing tick of the edge on the table
        rate = 16 + 22 * (c / dur);
        c += (1 / rate) * (0.75 + Math.random() * 0.5); // a little uneven
      }
    },
    settle: function (t, dur, i) {
      var c = 0, gap = 0.09;
      while (c < dur) { noise(t + c, 0.01, "bandpass", 3400 + (i % 4) * 300, 0, 0.05 * (1 - c / dur) + 0.01, 3); c += gap; gap = Math.max(0.012, gap * 0.82); }
    },
    // Digital rain: a soft, fast trickle of tiny high blips at random pitches, like data pouring.
    trickle: function (t, dur) {
      for (var c = 0; c < dur; c += 0.018 + Math.random() * 0.03) {
        var f = 2800 + Math.random() * 3400, fade = Math.min(1, c / 0.3, (dur - c) / 0.5);
        osc(t + c, f, "sine", 0.012 * Math.max(0.1, fade), 0.002, 0.02);
      }
    },
    // A cinematic synth horn ("braaam"): a chord of detuned sawtooths over a sub tone an
    // octave below its lowest note, bending up into the note, driven into a growl, a filter opening as it swells and
    // closing as it dies, ringing out in a big hall. `root` in Hz.
    horn: function (t, dur, notes, dark, stab, vol) { // vol: overall level (1 = full) // notes: the chord in Hz, lowest first; dark: a duller, rumbling "bruum" instead of a blaring "braaam"
      var root = notes[0];
      var f = ac.createBiquadFilter(), drive = ac.createWaveShaper(), g = ac.createGain(), os = [];
      var curve = new Float32Array(1024); for (var c = 0; c < 1024; c++) { var x = c / 511.5 - 1; curve[c] = Math.tanh(x * (dark ? 3.2 : 1.1)); } drive.curve = curve;
      f.type = "lowpass"; f.Q.value = 3;
      var open = dark ? 650 : 12000, after = dark ? 380 : 9000, last = dark ? 110 : 4000; // bright: stays wide open, like a synth brass section
      f.frequency.setValueAtTime(dark ? 120 : 500, t); f.frequency.exponentialRampToValueAtTime(open, t + (dark ? 0.18 : 0.05)); f.frequency.exponentialRampToValueAtTime(after, t + 0.45); f.frequency.exponentialRampToValueAtTime(last, t + dur); // the blat: snaps open, then eases down
      notes.forEach(function (hz, n) { (dark ? [-8, 8] : [-4, 4]).forEach(function (cents) { // each note of the chord: two slightly detuned saws
        var o = ac.createOscillator(), og = ac.createGain(); o.type = "sawtooth"; o.detune.value = cents;
        if (dark) { o.frequency.setValueAtTime(hz * 0.94, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.14); } // dark: leans up into the note
        else o.frequency.value = hz; // bright: right on pitch, no ominous swell
        og.gain.value = !dark && hz < 220 ? 0.4 : 1; // bright: the bass notes lighter
        o.connect(og); og.connect(f); os.push(o);
      }); });
      var sub = ac.createOscillator(), sg = ac.createGain(); sub.type = "sine"; sub.frequency.value = root / 2 > 40 ? root / 2 : root; sg.gain.value = dark ? 1.4 : 0; sub.connect(sg); sg.connect(g); os.push(sub);
      var bite = ac.createBiquadFilter(); bite.type = "peaking"; bite.frequency.value = dark ? 750 : 2500; bite.Q.value = 1.0; bite.gain.value = dark ? 2 : 6; // brass's bright middle
      var shine = ac.createBiquadFilter(); shine.type = "peaking"; shine.frequency.value = 4200; shine.Q.value = 0.8; shine.gain.value = dark ? 0 : 7;
      f.connect(drive); drive.connect(bite); bite.connect(shine); shine.connect(g);
      if (!dark) notes.slice(-3).forEach(function (hz) { // a shimmer: the top notes doubled an octave up, quietly
        var o = ac.createOscillator(), og = ac.createGain(); o.type = "sawtooth"; o.frequency.value = hz * 2; o.detune.value = 3; og.gain.value = 0.35;
        o.connect(og); og.connect(f); os.push(o);
      });
      var lvl = (vol || 1) / Math.sqrt(Math.max(1, notes.length / 3)); // a bigger chord, each note quieter
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * lvl, t + 0.03); g.gain.exponentialRampToValueAtTime(0.09 * lvl, t + 0.35); g.gain.setValueAtTime(0.09 * lvl, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (stab) { osc(t, stab, "sawtooth", 0.05 * (vol || 1), 0.005, 0.22, stab * 0.99); } // a short punch on the low note
      // the hall: a long decaying noise impulse, made once
      if (!reverb || reverb.context !== ac) {
        reverb = ac.createConvolver(); var len = Math.round(ac.sampleRate * 2.4), ir = ac.createBuffer(2, len, ac.sampleRate);
        for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2.6); }
        reverb.buffer = ir;
      }
      var wet = ac.createGain(); wet.gain.value = dark ? 0.35 : 0.2;
      g.connect(dest); g.connect(wet); wet.connect(reverb); reverb.connect(dest);
      setTimeout(function () { try { wet.disconnect(); } catch (e) {} }, (t - ac.currentTime + dur + 2.6) * 1000);
      os.forEach(function (o) { o.start(t); o.stop(t + dur + 0.05); });
    },
    growl: function (t, dur) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + dur * 0.4); o.frequency.linearRampToValueAtTime(60, t + dur);
      f.type = "lowpass"; f.frequency.value = 520; lfo.frequency.value = 11; lg.gain.value = 0.07;
      env(g, t, 0.16, dur * 0.25, dur * 0.75); lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(dest);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    uhoh: function (t) { osc(t, 520, "triangle", 0.2, 0.02, 0.16, 500); osc(t + 0.2, 400, "triangle", 0.2, 0.02, 0.32, 360); },
    crash: function (t) { noise(t, 0.5, "lowpass", 2600, 300, 0.75, 0.6); osc(t, 95, "sine", 0.6, 0.004, 0.45, 40); },
    knock: function (t, i) { var f = 620 + (i % 6) * 70; osc(t, f, "triangle", 0.16, 0.002, 0.06, f * 0.85); noise(t, 0.03, "bandpass", 1300 + (i % 3) * 300, 0, 0.09, 2); },
    rumble: function (t, dur) { noise(t, dur, "lowpass", 380, 160, 0.3, 0.8); },
    // Flying saucer: a warbly hum, pews, a boom, and a zwoop as the blaster's blocks fly off.
    hum: function (t, dur) {
      [180, 183.5].forEach(function (f0) {
        var o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.3, t + dur * 0.5); o.frequency.linearRampToValueAtTime(f0 * 1.1, t + dur);
        lfo.frequency.value = 6.5; lg.gain.value = 22; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.4); g.gain.setValueAtTime(0.09, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      });
    },
    pew: function (t) { osc(t, 1700, "square", 0.1, 0.003, 0.2, 260); osc(t, 1300, "sawtooth", 0.05, 0.003, 0.18, 200); },
    boom: function (t) { noise(t, 0.8, "lowpass", 3200, 160, 0.8, 0.6); osc(t, 80, "sine", 0.7, 0.004, 0.7, 32); for (var j = 0; j < 9; j++) noise(t + 0.08 + Math.random() * 0.5, 0.03, "bandpass", 1500 + Math.random() * 3000, 0, 0.12, 2); },
    zwoop: function (t, dur) { osc(t, 280, "sine", 0.14, dur * 0.4, dur * 0.6, 1150); noise(t, dur, "bandpass", 600, 2400, 0.05, 3); },
    // Cyclone: a box smacking flat against the board.
    smack: function (t, i) { noise(t, 0.05, "highpass", 1800 + (i % 4) * 300, 0, 0.32, 0.8); osc(t, 170 - (i % 3) * 15, "sine", 0.35, 0.002, 0.09, 70); },
    // Ratchet (the entrance): a ratchet, a click per eighth of a turn, spacing out as the flip slows
    // (clicks at equal steps of an ease-out: progress 1 - (1 - t/dur)^2.5).
    ratchet: function (t, dur, turns, i) {
      var n = Math.round(turns * 8), base = 2600 + (i % 3) * 300;
      for (var j = 1; j <= n; j++) {
        var at = t + dur * (1 - Math.pow(1 - j / n, 1 / 2.5)), fade = 1 - 0.5 * j / n;
        noise(at, 0.012, "bandpass", base, 0, 0.3 * fade, 6);
        osc(at, 1400 + (j % 2) * 180, "square", 0.025 * fade, 0.001, 0.012);
      }
    },
    // Carve: a circular saw's whine for its run, and a grinding bite for each box it cuts.
    saw: function (t, dur) { // spins up, whines through the cut, spins down
      var up = Math.min(0.1, dur / 4), down = Math.min(0.18, dur / 3);
      var o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(300, t + up); o.frequency.setValueAtTime(300, t + dur - down); o.frequency.exponentialRampToValueAtTime(110, t + dur);
      o2.type = "square"; o2.frequency.setValueAtTime(221, t); o2.frequency.exponentialRampToValueAtTime(603, t + up); o2.frequency.setValueAtTime(603, t + dur - down); o2.frequency.exponentialRampToValueAtTime(221, t + dur);
      f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + up); g.gain.setValueAtTime(0.06, t + dur - down); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(dest); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },
    bite: function (t, i) { noise(t, 0.07, "bandpass", 2200 + (i % 4) * 400, 0, 0.22, 3); osc(t, 210, "sawtooth", 0.05, 0.002, 0.06, 150); },
    // Kaleidoscope: glass beads tumbling inside as it turns (tiny high clicks at random pitches,
    // not a tune); `density` clicks a second.
    beads: function (t, dur, density) {
      var n = Math.round(dur * (density || 14));
      for (var j = 0; j < n; j++) {
        var at = t + Math.random() * dur, f = 2400 + Math.random() * 3200;
        osc(at, f, "sine", 0.05 + Math.random() * 0.05, 0.001, 0.05 + Math.random() * 0.05, f * 0.97);
        if (Math.random() < 0.4) noise(at, 0.01, "highpass", 6000, 0, 0.04, 1);
      }
    },
    bead: function (t, i) { var f = 2600 + ((i * 7919) % 2800); osc(t, f, "sine", 0.09, 0.001, 0.08, f * 0.97); noise(t, 0.012, "highpass", 6000, 0, 0.05, 1); },
    // Shooting star: a whistling streak, falling in pitch.
    streak: function (t, dur) { osc(t, 1900, "sine", 0.07, dur * 0.2, dur * 0.8, 700); noise(t, dur, "bandpass", 5200, 1600, 0.12, 2.5); },
    // Drone: rotor buzz (a fast flutter), rising a little while it flies.
    rotor: function (t, dur) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(175, t + dur * 0.3); o.frequency.linearRampToValueAtTime(140, t + dur);
      f.type = "lowpass"; f.frequency.value = 1300; lfo.frequency.value = 38; lg.gain.value = 0.03;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.2); g.gain.setValueAtTime(0.05, t + dur - 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(dest); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    // Unfold: a sheet of paper turning over: a crinkle of tiny crackles as it lifts (swelling, then
    // fading), a soft flap of air as it comes down, a crease snap as it lands flat. `size` 0..1:
    // bigger folds (later ones) are longer, fuller and lower.
    paper: function (t, dur, size) {
      var big = size || 0, n = Math.round(18 + big * 22);
      for (var j = 0; j < n; j++) {
        var u = Math.pow(Math.random(), 0.8) * 0.75, at = t + u * dur, swell = Math.sin(Math.min(1, u / 0.75) * Math.PI);
        noise(at, 0.006 + Math.random() * 0.012, "bandpass", (3800 - big * 1400) + Math.random() * 2600, 0, (0.05 + 0.1 * swell) * (0.7 + Math.random() * 0.6), 2.5);
      }
      noise(t + dur * 0.55, dur * 0.4, "lowpass", 1400 - big * 500, 300, 0.16 + big * 0.1, 0.7); // the flap of air
      noise(t + dur * 0.97, 0.018, "highpass", 2400 - big * 600, 0, 0.36, 0.9); // the crease snap
      osc(t + dur * 0.97, 260 - big * 90, "triangle", 0.12 + big * 0.06, 0.002, 0.05, 140 - big * 40);
    },
    // Wave: surf rolling in (a swell of filtered noise), the crash as it breaks, and foam fizzing away.
    surf: function (t, dur) {
      var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = "lowpass"; f.Q.value = 0.7;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.7); f.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.38, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.1);
    },
    crash: function (t) { noise(t, 0.6, "lowpass", 3800, 400, 0.55, 0.6); osc(t, 70, "sine", 0.35, 0.01, 0.4, 40); },
    fizz: function (t, dur) {
      for (var j = 0; j < 40; j++) noise(t + Math.pow(Math.random(), 1.4) * dur, 0.012, "highpass", 5000 + Math.random() * 3000, 0, 0.05 * (0.4 + Math.random()), 1.5);
      noise(t, dur, "highpass", 6000, 3000, 0.07, 0.6);
    },
    // Whirlpool: water bubbling and gurgling down a drain, busier as it speeds up, then a slurp.
    gurgle: function (t, dur) {
      var n = Math.round(dur * 16);
      for (var j = 0; j < n; j++) {
        var u = Math.pow(Math.random(), 0.6), at = t + u * dur, f = 180 + Math.random() * 260;
        osc(at, f, "sine", 0.08 + 0.1 * u, 0.004, 0.05 + Math.random() * 0.05, f * (1.8 + Math.random()));
      }
      noise(t, dur, "lowpass", 300, 900, 0.1, 1.2);
    },
    slurp: function (t) { osc(t, 520, "sine", 0.22, 0.01, 0.35, 70); noise(t, 0.4, "bandpass", 1400, 200, 0.18, 1.5); },
    rustle: function (t) { for (var j = 0; j < 3; j++) noise(t + j * 0.025 + Math.random() * 0.02, 0.03, "bandpass", 3200 + Math.random() * 2500, 0, 0.07, 1.5); },
    // Block cat: soft paw pats as it trots, a little "mrrp" (a voiced chirp: a sawtooth through a
    // vowel-ish filter, pitch rising then dipping), a swat's flick, and a purr (a low rumble
    // throbbing about 25 times a second).
    pat: function (t, i) { noise(t, 0.035, "lowpass", 700 + (i % 3) * 120, 0, 0.13, 0.8); osc(t, 160 + (i % 2) * 20, "sine", 0.06, 0.003, 0.04, 110); },
    mrrp: function (t) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g = ac.createGain(), D = 0.38;
      o.type = "sawtooth";
      o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(690, t + D * 0.45); o.frequency.linearRampToValueAtTime(560, t + D);
      f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + D * 0.5); f.frequency.linearRampToValueAtTime(1100, t + D);
      f2.type = "lowpass"; f2.frequency.value = 3200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
      g.gain.setValueAtTime(0.16, t + D * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + D);
      // the rolled "rr" at the start: a quick flutter on the level
      var fl = ac.createOscillator(), fg = ac.createGain(); fl.frequency.value = 32; fg.gain.value = 0.07;
      fl.connect(fg); fg.connect(g.gain);
      o.connect(f); f.connect(f2); f2.connect(g); g.connect(dest);
      o.start(t); fl.start(t); o.stop(t + D + 0.05); fl.stop(t + D * 0.35);
    },
    flick: function (t) { noise(t, 0.09, "bandpass", 1400, 3200, 0.12, 1.2); },
    purr: function (t, dur) {
      var s2 = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      s2.buffer = noiseBuf; s2.loop = true; f.type = "lowpass"; f.frequency.value = 260; f.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.25); g.gain.setValueAtTime(0.32, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      lfo.frequency.value = 25; lg.gain.value = 0.26; lfo.connect(lg); lg.connect(g.gain);
      s2.connect(f); f.connect(g); g.connect(dest);
      s2.start(t); lfo.start(t); s2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
  };
}
