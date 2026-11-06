// The sync service's requests (index.js is the Worker). At
// https://sound-box-sync.asset-data.stream/, a Cloudflare Worker that
// stores sealed records (js/seal.js) for a profile's devices to fetch and merge; it can't
// read them, and holds no names or accounts. Each profile is its own Durable Object
// (profile.js). Deployed by the sync-deploy job in .github/workflows/ci.yml.
//
//   GET /v1/p/<lookup>           which grades it has: { grades: { grade: version } }
//   GET /v1/p/<lookup>/<grade>   the sealed record, its version in X-Version (404: none)
//   PUT /v1/p/<lookup>/<grade>   save, with X-Base-Version: the version it was merged from
//                                (0 for a first save); 409 { version } if another device
//                                saved since: fetch, merge, and try again
//
// It answers only the app's own pages (CORS), and refuses anything that isn't a sealed
// record of a sensible size.

export const MAX_BYTES = 64 * 1024;
const MIN_BYTES = 1 + 12 + 16; // format byte, IV, GCM tag
const ORIGINS = [/^https:\/\/tools\.tuley\.name$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const LOOKUP = /^[A-Za-z0-9_-]{43}$/;
const GRADE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, x-base-version",
    "access-control-expose-headers": "x-version",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
const reply = (status, value, origin) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...(origin ? cors(origin) : {}) } });

export async function handle(request, env) {
  const origin = request.headers.get("origin");
  const allowed = origin && ORIGINS.some((re) => re.test(origin)) ? origin : null;
  // A browser on another site gets nothing; a request with no Origin (curl) is let through,
  // since anyone can send one anyway.
  if (origin && !allowed) return reply(403, { error: "origin" }, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: allowed ? cors(allowed) : {} });

  const m = new URL(request.url).pathname.match(/^\/v1\/p\/([^/]+)(?:\/([^/]+))?$/);
  if (!m || !LOOKUP.test(m[1]) || (m[2] !== undefined && !GRADE.test(m[2]))) return reply(404, { error: "path" }, allowed);
  const [, lookup, grade = ""] = m;

  let body = null;
  if (request.method === "PUT") {
    if (!grade) return reply(405, { error: "method" }, allowed);
    if (!/^\d+$/.test(request.headers.get("x-base-version") || "")) return reply(400, { error: "x-base-version" }, allowed);
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) return reply(413, { error: "too big" }, allowed);
    body = await request.arrayBuffer();
    const b = new Uint8Array(body);
    if (b.length > MAX_BYTES) return reply(413, { error: "too big" }, allowed);
    if (b.length < MIN_BYTES || b[0] !== 1) return reply(400, { error: "not a sealed record" }, allowed);
  } else if (request.method !== "GET") {
    return reply(405, { error: "method" }, allowed);
  }

  const stub = env.PROFILE.get(env.PROFILE.idFromName(lookup));
  const res = await stub.fetch(new Request("https://profile/" + grade, {
    method: request.method,
    headers: body ? { "x-base-version": request.headers.get("x-base-version") } : {},
    body
  }));
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "no-store");
  if (allowed) for (const [k, v] of Object.entries(cors(allowed))) out.headers.set(k, v);
  return out;
}
