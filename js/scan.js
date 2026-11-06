// Reads a QR code with the camera, for More → Link → Scan a code. Loaded only then. The
// reading is done by jsQR (from the CDN, via the import map), since Safari has no
// BarcodeDetector. The Home Screen app needs its own scanner: the Camera app would open the
// link in Safari, whose storage is separate.
//
// scan(video, found): shows the back camera in `video` and calls found(text) for each code
// read; found returns true to stop. Resolves to stop(), which turns the camera off.
export async function scan(video, found) {
  const m = await import("jsqr");
  const jsQR = m.default || m;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
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
      const w = 480, h = Math.round(video.videoHeight * w / video.videoWidth);
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      if (code && found(code.data)) { stop(); return; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return stop;
}
