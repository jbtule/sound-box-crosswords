// One profile's sealed records, one per grade: a SQLite Durable Object, named by the
// profile's lookup ID. It can't read them (js/seal.js); it only keeps each grade's latest
// record and its version, and refuses a save made from an out-of-date copy, so two devices
// saving at once can't overwrite each other (the later one fetches, merges and tries again).
// The Worker (api.js) checks every request before it gets here.
//
// Who may save: a device proves it has the profile's key with its write token (from the key,
// by HKDF, like the lookup ID; js/seal.js). The first save sets the profile's owner, a hash
// of that token, and every later save must bring the same token, so knowing a lookup ID isn't
// enough to change a record. A profile's first save also counts toward its network's new
// profiles for the day (Limiter), so no one place can make them by the thousand.
export const MAX_GRADES = 8;

// Storage: SQLite in the Durable Object, or Maps in the tests.
export function sqlStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS records (grade TEXT PRIMARY KEY, version INTEGER NOT NULL, body BLOB NOT NULL, saved INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS owner (one INTEGER PRIMARY KEY CHECK (one = 1), token TEXT NOT NULL)");
  return {
    list: () => sql.exec("SELECT grade, version FROM records").toArray(),
    get: (grade) => sql.exec("SELECT version, body FROM records WHERE grade = ?", grade).toArray()[0] || null,
    put: (grade, version, body) => { sql.exec("INSERT OR REPLACE INTO records (grade, version, body, saved) VALUES (?, ?, ?, ?)", grade, version, body, Date.now()); },
    owner: () => (sql.exec("SELECT token FROM owner").toArray()[0] || {}).token || null,
    setOwner: (token) => { sql.exec("INSERT OR REPLACE INTO owner (one, token) VALUES (1, ?)", token); }
  };
}
export function memoryStore() {
  const m = new Map();
  let owner = null;
  return {
    list: () => [...m].map(([grade, r]) => ({ grade, version: r.version })),
    get: (grade) => m.get(grade) || null,
    put: (grade, version, body) => { m.set(grade, { version, body }); },
    owner: () => owner,
    setOwner: (token) => { owner = token; }
  };
}

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class Profile {
  constructor(ctx, env) {
    this.store = ctx.store || sqlStore(ctx.storage.sql);
    this.env = env;
  }

  // GET /            → { grades: { grade: version } }
  // GET /<grade>     → the record (X-Version header), or 404
  // PUT /<grade>     → saves it if X-Base-Version is the current version (0: none yet) and
  //                    X-Write-Token is the owner's (or the profile has none yet). The Worker
  //                    passes the network it came from as X-Network, for the Limiter.
  async fetch(request) {
    const grade = new URL(request.url).pathname.slice(1);
    if (request.method === "GET" && !grade) {
      return json(200, { grades: Object.fromEntries(this.store.list().map((r) => [r.grade, r.version])) });
    }
    if (request.method === "GET") {
      const r = this.store.get(grade);
      if (!r) return json(404, { version: 0 });
      return new Response(r.body, { headers: { "content-type": "application/octet-stream", "x-version": String(r.version) } });
    }
    if (request.method === "PUT") {
      const body = await request.arrayBuffer();
      const token = await sha256(request.headers.get("x-write-token") || "");
      // A new profile (no owner, nothing saved): its network has to have room for one more today.
      if (!this.store.owner() && !this.store.list().length && this.env && this.env.LIMITER) {
        const net = request.headers.get("x-network") || "unknown";
        const ok = await this.env.LIMITER.get(this.env.LIMITER.idFromName(net)).fetch("https://limiter/take", { method: "POST" });
        if (ok.status !== 200) return json(429, { error: "too many new profiles from this network today" });
      }
      // No awaits from here on: the checks and the save happen together.
      const owner = this.store.owner();
      if (owner && owner !== token) return json(403, { error: "write token" });
      const base = Number(request.headers.get("x-base-version"));
      const cur = this.store.get(grade);
      const version = cur ? cur.version : 0;
      if (base !== version) return json(409, { version });
      if (!cur && this.store.list().length >= MAX_GRADES) return json(403, { error: "too many grades" });
      if (!owner) this.store.setOwner(token); // the first save, or one from before tokens
      this.store.put(grade, version + 1, body);
      return json(200, { version: version + 1 });
    }
    return json(405, { error: "method" });
  }
}

// New profiles per network per day (UTC), one SQLite Durable Object per network. Enough for a
// classroom linking every iPad on one day; far too few to fill the free plan's storage.
export const NEW_PER_DAY = 50;
export function limiterStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, n INTEGER NOT NULL)");
  return {
    count: (day) => (sql.exec("SELECT n FROM days WHERE day = ?", day).toArray()[0] || {}).n || 0,
    set: (day, n) => { sql.exec("DELETE FROM days WHERE day <> ?", day); sql.exec("INSERT OR REPLACE INTO days (day, n) VALUES (?, ?)", day, n); }
  };
}
export function memoryLimiterStore() {
  const m = new Map();
  return { count: (day) => m.get(day) || 0, set: (day, n) => { m.clear(); m.set(day, n); } };
}
export class Limiter {
  constructor(ctx) {
    this.store = ctx.store || limiterStore(ctx.storage.sql);
  }
  // POST /take → 200 if there's room today (and counts it), else 429.
  async fetch() {
    const day = new Date().toISOString().slice(0, 10), n = this.store.count(day);
    if (n >= NEW_PER_DAY) return json(429, { error: "limit" });
    this.store.set(day, n + 1);
    return json(200, { n: n + 1 });
  }
}
