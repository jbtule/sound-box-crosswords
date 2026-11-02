// A short confetti burst over an element, for a solved puzzle. Drawn on a temporary
// canvas in the theme's colors; does nothing when the player prefers reduced motion.

var TOKENS = ["--accent", "--ok", "--sylA-edge", "--sylB-edge", "--bad"];
var DURATION = 1400; // ms

export function confetti(host) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var css = getComputedStyle(document.documentElement);
  var colors = TOKENS.map(function (t) { return css.getPropertyValue(t).trim(); }).filter(Boolean);
  var w = host.clientWidth, h = host.clientHeight, dpr = window.devicePixelRatio || 1;
  var canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.width = w * dpr; canvas.height = h * dpr;
  host.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Two bursts from the lower corners, angled up and in.
  var bits = [];
  for (var i = 0; i < 90; i++) {
    var left = i % 2 === 0, angle = (left ? -60 : -120) + (Math.random() * 40 - 20);
    var speed = 7 + Math.random() * 6, rad = angle * Math.PI / 180;
    bits.push({
      x: left ? w * 0.1 : w * 0.9, y: h * 0.95,
      vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed,
      size: 5 + Math.random() * 5, rot: Math.random() * Math.PI, spin: Math.random() * 0.3 - 0.15,
      color: colors[i % colors.length]
    });
  }

  var start = null;
  function frame(t) {
    if (start === null) start = t;
    var age = t - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - DURATION * 0.6) / (DURATION * 0.4));
    bits.forEach(function (b) {
      b.vy += 0.28; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.rot += b.spin;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    });
    if (age < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
