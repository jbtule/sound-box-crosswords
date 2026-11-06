// One profile's sealed records, one per grade: a SQLite Durable Object, named by the
// profile's lookup ID. It can't read them (js/seal.js); it only keeps each grade's latest
// record and its version, and refuses a save made from an out-of-date copy, so two devices
// saving at once can't overwrite each other (the later one fetches, merges and tries again).
// The Worker (api.js) checks every request before it gets here.
//
// Who may read and save: a device proves it has the profile's key with its token (from the
// key, by HKDF, like the lookup ID; js/seal.js). The first save sets the profile's owner, a
// hash of that token, and every later request must bring the same token, so what's stored can
// only be fetched or changed by the profile's own devices. A profile's first save also counts
// toward its network's new profiles for the day and everyone's (Limiter), and a profile no
// device has saved in 90 days is deleted (alarm): the server is only a relay, since every
// device keeps its own copy and sends it again. So it's no use for keeping anything else.
export const MAX_GRADES = 8;
export const KEEP_DAYS = 90;
export const NEW_PER_NETWORK = 20, NEW_PER_DAY = 1000;

// Storage: SQLite in the Durable Object, or Maps in the tests.
export function sqlStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS records (grade TEXT PRIMARY KEY, version INTEGER NOT NULL, body BLOB NOT NULL, saved INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS owner (one INTEGER PRIMARY KEY CHECK (one = 1), token TEXT NOT NULL)");
  return {
    list: () => sql.exec("SELECT grade, version FROM records").toArray(),
    get: (grade) => sql.exec("SELECT version, body FROM records WHERE grade = ?", grade).toArray()[0] || null,
    put: (grade, version, body) => { sql.exec("INSERT OR REPLACE INTO records (grade, version, body, saved) VALUES (?, ?, ?, ?)", grade, version, body, Date.now()); },
    owner: () => (sql.exec("SELECT token FROM owner").toArray()[0] || {}).token || null,
    setOwner: (token) => { sql.exec("INSERT OR REPLACE INTO owner (one, token) VALUES (1, ?)", token); },
    clear: () => { sql.exec("DELETE FROM records"); sql.exec("DELETE FROM owner"); }
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
    setOwner: (token) => { owner = token; },
    clear: () => { m.clear(); owner = null; }
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
    this.storage = ctx.storage; // for the alarm (none in the tests)
    this.env = env;
  }
  // 90 days after the last save: gone. Devices that come back send theirs again.
  async alarm() { this.store.clear(); }

  // Every request: X-Write-Token must be the owner's (a profile with no owner yet has nothing
  // to read, or is from before tokens and is claimed by its next save).
  // GET /            → { grades: { grade: version } }
  // GET /<grade>     → the record (X-Version header), or 404
  // PUT /<grade>     → saves it if X-Base-Version is the current version (0: none yet). The
  //                    Worker passes the network it came from as X-Network, for the Limiter.
  async fetch(request) {
    const grade = new URL(request.url).pathname.slice(1);
    const token = await sha256(request.headers.get("x-write-token") || "");
    if (this.store.owner() && this.store.owner() !== token) return json(403, { error: "token" });
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
      // A new profile (no owner, nothing saved): its network, and everyone, have to have room
      // for one more today.
      if (!this.store.owner() && !this.store.list().length && this.env && this.env.LIMITER) {
        const take = (name, limit) => this.env.LIMITER.get(this.env.LIMITER.idFromName(name)).fetch("https://limiter/take?limit=" + limit, { method: "POST" });
        const net = request.headers.get("x-network") || "unknown";
        if ((await take("net:" + net, NEW_PER_NETWORK)).status !== 200) return json(429, { error: "too many new profiles from this network today" });
        if ((await take("everyone", NEW_PER_DAY)).status !== 200) return json(429, { error: "too many new profiles today" });
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
      if (this.storage) await this.storage.setAlarm(Date.now() + KEEP_DAYS * 86400000);
      return json(200, { version: version + 1 });
    }
    return json(405, { error: "method" });
  }
}

// New profiles per day (UTC), one SQLite Durable Object per counter: each network's (enough
// for a classroom linking its iPads over a day or two) and everyone's.
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
  // POST /take?limit=N → 200 if fewer than N were taken today (and counts this one), else 429.
  async fetch(request) {
    const limit = Number(new URL(request.url).searchParams.get("limit")) || 0;
    const day = new Date().toISOString().slice(0, 10), n = this.store.count(day);
    if (n >= limit) return json(429, { error: "limit" });
    this.store.set(day, n + 1);
    return json(200, { n: n + 1 });
  }
}
