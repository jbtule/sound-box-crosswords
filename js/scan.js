// Reads a QR code with the camera, for More → Link → Scan a code. Loaded only then. The
// reading is done by jsQR (from the CDN, via the import map), since Safari has no
// BarcodeDetector. The Home Screen app needs its own scanner: the Camera app would open the
// link in Safari, whose storage is separate.
//
// scan(video, found): shows the back camera in `video` and calls found(text, freeze) for
// each code read; found returns true to stop. freeze(color) gives the frame it was read
// from, as a canvas, with the code outlined in `color`, to show in place of the camera so
// the moment it's found is plain to see. Resolves to stop(), which turns the camera off.
//
// Focus: an iPhone Pro's main camera can't focus closer than about 20 cm (its Camera app
// switches to the macro lens, which a page can't pick), so a code held close stays blurry.
// So it asks for a sharp picture, zooms in 2× where the camera allows it, and reads the
// middle of the picture at full detail: the code reads from farther away, where it's sharp.
export async function scan(video, found) {
  const m = await import("jsqr");
  const jsQR = m.default || m;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
  });
  const track = stream.getVideoTracks()[0];
  try {
    const zoom = track.getCapabilities && track.getCapabilities().zoom;
    if (zoom && zoom.max >= 2) await track.applyConstraints({ advanced: [{ zoom: Math.max(zoom.min, 2) }] });
  } catch (e) { /* not every camera or browser can zoom */ }
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false, last = 0;
  function stop() {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  function tick(t) {
    if (stopped) return;
    if (t - last > 200 && video.videoWidth) { // 5 a second is plenty, and spares the battery
      last = t;
      // The middle square, at most 800 pixels across: full detail where the code is held.
      const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh) * 0.8;
      const w = Math.min(800, Math.round(side));
      canvas.width = w; canvas.height = w;
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, w, w);
      const code = jsQR(ctx.getImageData(0, 0, w, w).data, w, w, { inversionAttempts: "dontInvert" });
      if (code && found(code.data, freezer(code.location, vw, vh, side, w))) { stop(); return; }
    }
    requestAnimationFrame(tick);
  }
  // The whole frame, at most 960 pixels wide, with the code's corners (found in the middle
  // square) traced around it.
  function freezer(loc, vw, vh, side, w) {
    return function (color) {
      const k = Math.min(1, 960 / vw), out = document.createElement("canvas");
      out.width = Math.round(vw * k); out.height = Math.round(vh * k);
      const c = out.getContext("2d");
      c.drawImage(video, 0, 0, out.width, out.height);
      const at = (p) => [((vw - side) / 2 + p.x * side / w) * k, ((vh - side) / 2 + p.y * side / w) * k];
      c.beginPath();
      [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner].forEach((p, i) => {
        const [x, y] = at(p);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.closePath();
      c.lineJoin = "round"; c.lineWidth = Math.max(4, out.width / 80); c.strokeStyle = color;
      c.stroke();
      return out;
    };
  }
  requestAnimationFrame(tick);
  return stop;
}
