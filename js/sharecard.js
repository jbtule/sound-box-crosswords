// Shareable achievement cards, made on the device (there's no server): the achievement is
// drawn to a canvas and handed to the share sheet as a PNG, or downloaded where sharing
// isn't available. Never draws spelling words or a child's name.

var W = 1080, H = 1350; // 4:5 portrait, a good size for Messages and Photos
var SITE = "tools.tuley.name/sound-box-crosswords";

function token(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Largest font size (down to `min`) at which `text` fits in `maxW`.
function fit(ctx, text, weightFamily, size, min, maxW) {
  for (; size > min; size -= 4) {
    ctx.font = weightFamily.replace("{s}", size);
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

// a = { icon, title, detail }, when = timestamp, pics = up to 6 emoji from the collection,
// edition = the edition's name when there's more than one (e.g. "Kindergarten"), else "",
// more = words beyond the pictures, shown as a last "+17" tile (pack achievements).
// Resolves to a PNG Blob.
export async function renderCard(a, when, pics, edition, more) {
  // Draw with the app's fonts, not a fallback (they load from Google Fonts).
  try {
    await Promise.all([
      document.fonts.load('700 100px "Fredoka"'),
      document.fonts.load('500 40px "Lexend"'),
      document.fonts.load('600 40px "Lexend"')
    ]);
  } catch (e) {}

  var bg = token("--bg", "#e9f0f7"), card = token("--card", "#ffffff"), ink = token("--ink", "#1b2a41");
  var muted = token("--muted", "#586982"), accent = token("--accent", "#ef7d22"), edge = token("--key-edge", "#c9d6e5");
  var display = '"Fredoka", "Lexend", system-ui, sans-serif', body = '"Lexend", system-ui, sans-serif';
  var emoji = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  var ctx = c.getContext("2d");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // Graph-paper background, like the app.
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = edge; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
  for (var x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (var y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.globalAlpha = 1;

  // The card.
  var m = 70, r = 56;
  ctx.fillStyle = card;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(m, m, W - 2 * m, H - 2 * m, r) : ctx.rect(m, m, W - 2 * m, H - 2 * m);
  ctx.fill();

  var inner = W - 2 * m - 120;
  ctx.fillStyle = accent;
  ctx.font = "600 40px " + body;
  ctx.fillText("SOUND BOX CROSSWORDS", W / 2, 180);
  if (edition) {
    ctx.fillStyle = muted;
    ctx.font = "500 34px " + body;
    ctx.fillText(edition.toUpperCase(), W / 2, 228);
  }

  ctx.font = "320px " + emoji;
  ctx.fillText(a.icon, W / 2, 470);

  ctx.fillStyle = accent;
  ctx.font = "600 44px " + body;
  ctx.fillText("Achievement unlocked", W / 2, 720);

  ctx.fillStyle = ink;
  fit(ctx, a.title, "700 {s}px " + display, 120, 60, inner);
  ctx.fillText(a.title, W / 2, 820);

  ctx.fillStyle = muted;
  fit(ctx, a.detail, "500 {s}px " + body, 50, 30, inner);
  ctx.fillText(a.detail, W / 2, 920);
  ctx.font = "500 40px " + body;
  ctx.fillText(new Date(when).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }), W / 2, 985);

  pics = (pics || []).slice(0, more ? 5 : 6);
  var tiles = pics.length + (more ? 1 : 0);
  if (tiles) {
    var size = 110, gap = 20, rowW = tiles * size + (tiles - 1) * gap, x0 = (W - rowW) / 2;
    for (var i = 0; i < tiles; i++) {
      var px = x0 + i * (size + gap);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(px, 1060, size, size, 26) : ctx.rect(px, 1060, size, size);
      ctx.fill();
      if (i < pics.length) {
        ctx.font = "70px " + emoji;
        ctx.fillText(pics[i], px + size / 2, 1060 + size / 2 + 4);
      } else {
        var label = "+" + more;
        ctx.fillStyle = accent;
        fit(ctx, label, "700 {s}px " + display, 52, 30, size - 16);
        ctx.fillText(label, px + size / 2, 1060 + size / 2 + 2);
      }
    }
  }

  ctx.fillStyle = muted;
  ctx.font = "500 34px " + body;
  ctx.fillText(SITE, W / 2, H - m - 50);

  return new Promise(function (resolve, reject) {
    c.toBlob(function (b) { b ? resolve(b) : reject(new Error("toBlob failed")); }, "image/png");
  });
}

// Opens the share sheet with the PNG, or downloads it where sharing files isn't supported.
// Must be called straight from a tap (iOS), so render the blob beforehand.
export function shareCard(blob, title) {
  var name = "sound-box-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
  var file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: title, text: "I earned " + title + " on Sound Box Crosswords!" })
      .then(function () { return true; }, function () { return false; }); // false: closed without sharing
  }
  var url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  return Promise.resolve(true); // a download can't tell us more than that it started
}
