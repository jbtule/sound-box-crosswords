// The sync service's requests (index.js is the Worker). At
// https://sound-box-sync.asset-data.stream/, a Cloudflare Worker that
// stores sealed records (js/seal.js) for a profile's devices to fetch and merge; it can't
// read them, and holds no names or accounts. Each profile is its own Durable Object
// (profile.js). Deployed by the sync-deploy job in .github/workflows/ci.yml.
//
//   GET /v1/p/<lookup>           which grades it has: { grades: { grade: version } }
//   GET /v1/p/<lookup>/<grade>   the sealed record, its version in X-Version (404: none)
//   Every request carries X-Write-Token (from the profile's key), reads too, and comes from the
//   app's own pages (Origin), so the service can't be used to keep or hand out other things.
//   PUT /v1/p/<lookup>/<grade>   save, with X-Base-Version: the version it was merged from
//                                (0 for a first save), and X-Write-Token (from the profile's
//                                key: only its devices have it); 409 { version } if another
//                                device saved since: fetch, merge, and try again; 403 for
//                                the wrong token; 429 if the network has made too many new
//                                profiles today; 507 if the service is full (SPACE_BYTES)
//
// It refuses anything that isn't a sealed record of a sensible size, and a profile no device
// has saved in 90 days is deleted (profile.js): devices keep their own copies and send them again.

// A busy year in one grade seals to about 6 KB.
export const MAX_BYTES = 16 * 1024;
const MIN_BYTES = 1 + 12 + 16; // format byte, IV, GCM tag
const ORIGINS = [/^https:\/\/tools\.tuley\.name$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const LOOKUP = /^[A-Za-z0-9_-]{43}$/;
const GRADE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// Encrypted bytes look random: each of the 256 byte values about equally often. A chi-square
// test on the sealed part, with a bar random data fails about once in 10^17 tries, turns away
// plain text and other uncompressed data. Compressed files (gzip, JPEG, ZIP) look random too and
// pass, as does encrypted junk; the 50 MB cap (profile.js) is what bounds those. Under 1 KB
// there's too little to judge, and too little to matter.
export function looksRandom(bytes) {
  const n = bytes.length;
  if (n < 1024) return true;
  const count = new Uint32Array(256);
  for (const b of bytes) count[b]++;
  const e = n / 256;
  let x = 0;
  for (const k of count) x += (k - e) * (k - e) / e;
  return x < 255 + 12 * Math.sqrt(510);
}

// The network a request came from, for counting new profiles: the IPv4 address, or an IPv6
// address's first 64 bits (one home or phone gets a whole /64 and can pick any address in it).
export function networkOf(ip) {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  return groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":") + "::/64";
}

function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, x-base-version, x-write-token",
    "access-control-expose-headers": "x-version",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
const reply = (status, value, origin) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...PLAIN_HEADERS, ...(origin ? cors(origin) : {}) } });
// On every reply: never cached, never shown as a page (it's data, not a website).
const PLAIN_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-disposition": "attachment" };

export async function handle(request, env) {
  const origin = request.headers.get("origin");
  const allowed = origin && ORIGINS.some((re) => re.test(origin)) ? origin : null;
  // Only the app's own pages: another site, a link, an <img> or a plain download gets nothing.
  // (A script can fake the header; the token below is what keeps what's stored to its owners.)
  if (!allowed) return reply(403, { error: "origin" }, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(allowed) });

  const m = new URL(request.url).pathname.match(/^\/v1\/p\/([^/]+)(?:\/([^/]+))?$/);
  if (!m || !LOOKUP.test(m[1]) || (m[2] !== undefined && !GRADE.test(m[2]))) return reply(404, { error: "path" }, allowed);
  const [, lookup, grade = ""] = m;
  // Every request proves it has the profile's key, reads too: what's stored can only be
  // fetched by its own devices, so it can't be handed out as a link.
  if (!TOKEN.test(request.headers.get("x-write-token") || "")) return reply(400, { error: "x-write-token" }, allowed);

  let body = null;
  if (request.method === "PUT") {
    if (!grade) return reply(405, { error: "method" }, allowed);
    if (!/^\d+$/.test(request.headers.get("x-base-version") || "")) return reply(400, { error: "x-base-version" }, allowed);
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) return reply(413, { error: "too big" }, allowed);
    body = await request.arrayBuffer();
    const b = new Uint8Array(body);
    if (b.length > MAX_BYTES) return reply(413, { error: "too big" }, allowed);
    if (b.length < MIN_BYTES || b[0] !== 1 || !looksRandom(b.subarray(13))) return reply(400, { error: "not a sealed record" }, allowed);
  } else if (request.method !== "GET") {
    return reply(405, { error: "method" }, allowed);
  }

  const stub = env.PROFILE.get(env.PROFILE.idFromName(lookup));
  const res = await stub.fetch(new Request("https://profile/" + grade, {
    method: request.method,
    headers: {
      "x-write-token": request.headers.get("x-write-token"),
      ...(body ? { "x-base-version": request.headers.get("x-base-version"), "x-network": networkOf(request.headers.get("cf-connecting-ip")) } : {})
    },
    body
  }));
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...PLAIN_HEADERS, ...cors(allowed) })) out.headers.set(k, v);
  return out;
}
