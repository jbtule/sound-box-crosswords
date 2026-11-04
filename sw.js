// Service worker: keeps a copy of the app so it opens and plays without a connection
// (home-screen use has no reload button). Registered by js/app.js.
// - The page and unstamped files: network first, the saved copy if offline or slow.
// - Files stamped ?v=<sha> at deploy, the pinned CDN library, font files and audio clips
//   never change at their URL: saved copy first.
// - Audio clips: Safari's <audio> asks for byte ranges, so the worker saves the whole clip
//   and answers each range from it.
// Only the newest copy of each of our own files is kept, so the cache doesn't grow per deploy.
const CACHE = "sbx-1";
const SCOPE = self.registration.scope;
const CLIPS = "https://sound-box-crosswords.asset-data.stream/a/";
const FOREVER = [
  "https://cdn.jsdelivr.net/npm/",
  "https://fonts.gstatic.com/",
  CLIPS,
];
const FONT_CSS = "https://fonts.googleapis.com/";
const SLOW_MS = 4000;
const LOOSE = { ignoreVary: true };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Other apps share this origin (tools.tuley.name) and its cache storage: only clear ours.
    for (const k of await caches.keys()) if (k.startsWith("sbx-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Our own files under the scope; the page itself is saved under the scope URL.
function ours(url) { return url.startsWith(SCOPE); }
function keyFor(url) {
  const u = new URL(url);
  u.hash = "";
  if (u.href.split("?")[0] === SCOPE || u.pathname === new URL("index.html", SCOPE).pathname) return SCOPE;
  return u.href;
}
function isForever(url) {
  return FOREVER.some((p) => url.startsWith(p)) || (ours(url) && new URL(url).searchParams.has("v"));
}
function wanted(url) { return ours(url) || url.startsWith(FONT_CSS) || isForever(url); }

async function save(key, res) {
  if (!res || !(res.ok || res.type === "opaque")) return;
  const cache = await caches.open(CACHE);
  if (ours(key)) {
    for (const old of await cache.keys(key, { ignoreSearch: true, ignoreVary: true })) {
      if (old.url !== key) await cache.delete(old);
    }
  }
  await cache.put(key, res);
}

// Offline, a file stamped for an older deploy is better than nothing.
async function fallback(key) {
  return (await caches.match(key, LOOSE)) || (ours(key) && (await caches.match(key, { ignoreSearch: true, ignoreVary: true })));
}

async function savedFirst(e, key) {
  const hit = await caches.match(key, LOOSE);
  if (hit) return hit;
  try {
    const res = await fetch(e.request);
    e.waitUntil(save(key, res.clone()));
    return res;
  } catch (err) {
    const old = await fallback(key);
    if (old) return old;
    throw err;
  }
}

// "no-cache": always check with the server (an unchanged file is a short 304). Plain fetch
// would take the browser's own copy, which GitHub Pages lets it keep for 10 minutes, so a
// page opened again soon after a deploy came back as the old one.
async function networkFirst(e, key) {
  const net = fetch(e.request, { cache: "no-cache" }).then((res) => {
    e.waitUntil(save(key, res.clone()));
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  const old = await fallback(key);
  if (!old) return net;
  const slow = new Promise((r) => setTimeout(r, SLOW_MS, old));
  return Promise.race([net.catch(() => old), slow]);
}

// The whole clip (saved, or fetched and saved), then the slice the player asked for.
async function clip(e) {
  const key = keyFor(e.request.url);
  let res = await caches.match(key, LOOSE);
  if (!res) {
    res = await fetch(key, { mode: "cors", credentials: "omit" });
    if (!res.ok) return res;
    e.waitUntil(save(key, res.clone()));
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(e.request.headers.get("range") || "");
  if (!m) return res;
  const body = await res.blob(), size = body.size;
  let start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
  let end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !wanted(req.url)) return;
  if (req.url.startsWith(CLIPS)) return e.respondWith(clip(e));
  if (req.headers.has("range")) return;
  const key = keyFor(req.url);
  e.respondWith(isForever(req.url) ? savedFirst(e, key) : networkFirst(e, key));
});

// The first visit loads everything before this worker is running, so the page sends the
// list of what it loaded and the worker saves a copy now.
self.addEventListener("message", (e) => {
  if (!e.data || !Array.isArray(e.data.warm)) return;
  e.waitUntil((async () => {
    for (const url of e.data.warm) {
      if (typeof url !== "string" || !wanted(url)) continue;
      const key = keyFor(url);
      if (await caches.match(key, LOOSE)) continue;
      try { await save(key, await fetch(url)); } catch (err) { /* try again next visit */ }
    }
  })());
});
