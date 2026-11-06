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
// device has saved in 90 days has its records deleted (alarm): the server is only a relay,
// since every device keeps its own copy and sends it again. And everything stored, by everyone, fits in
// SPACE_BYTES: each profile reserves room in BLOCK-sized pieces from one shared count (Space)
// as its records grow, and gives it back when it's deleted. A real profile fits in one or two
// blocks; when it's full, saves that need more room are refused until some expire. So it's no
// use for keeping anything else.
export const MAX_GRADES = 8;
export const BLOCK = 16 * 1024, SPACE_BYTES = 50 * 1024 * 1024;
export const KEEP_DAYS = 90;
export const NEW_PER_NETWORK = 20, NEW_PER_DAY = 1000;

// Storage: SQLite in the Durable Object, or Maps in the tests. The tables are made only when
// something is first written, so a read of a lookup nobody has saved leaves nothing behind.
export function sqlStore(sql) {
  const create = () => {
    sql.exec("CREATE TABLE IF NOT EXISTS records (grade TEXT PRIMARY KEY, version INTEGER NOT NULL, body BLOB NOT NULL, saved INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS owner (one INTEGER PRIMARY KEY CHECK (one = 1), token TEXT NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS room (one INTEGER PRIMARY KEY CHECK (one = 1), blocks INTEGER NOT NULL)");
  };
  // A profile that has any tables (including ones made by earlier versions, which had no
  // `room`) gets all of them now; one that has none gets them at its first write.
  let made = sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").toArray()[0].n > 0;
  if (made) create();
  const make = () => { if (!made) { create(); made = true; } };
  const read = (q, ...p) => (made ? sql.exec(q, ...p).toArray() : []);
  return {
    bytes: (except) => (read("SELECT COALESCE(SUM(length(body)), 0) AS n FROM records WHERE grade <> ?", except)[0] || { n: 0 }).n,
    reserved: () => (read("SELECT blocks FROM room")[0] || {}).blocks || 0,
    setReserved: (n) => { make(); sql.exec("INSERT OR REPLACE INTO room (one, blocks) VALUES (1, ?)", n); },
    list: () => read("SELECT grade, version FROM records"),
    get: (grade) => read("SELECT version, body FROM records WHERE grade = ?", grade)[0] || null,
    put: (grade, version, body) => { make(); sql.exec("INSERT OR REPLACE INTO records (grade, version, body, saved) VALUES (?, ?, ?, ?)", grade, version, body, Date.now()); },
    owner: () => (read("SELECT token FROM owner")[0] || {}).token || null,
    setOwner: (token) => { make(); sql.exec("INSERT OR REPLACE INTO owner (one, token) VALUES (1, ?)", token); },
    clear: () => { if (made) sql.exec("DELETE FROM records"); }
  };
}
export function memoryStore() {
  const m = new Map();
  let owner = null, blocks = 0;
  return {
    bytes: (except) => [...m].reduce((n, [g, r]) => n + (g === except ? 0 : r.body.byteLength), 0),
    reserved: () => blocks,
    setReserved: (n) => { blocks = n; },
    list: () => [...m].map(([grade, r]) => ({ grade, version: r.version })),
    get: (grade) => m.get(grade) || null,
    put: (grade, version, body) => { m.set(grade, { version, body }); },
    owner: () => owner,
    setOwner: (token) => { owner = token; },
    clear: () => { m.clear(); }
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
  // 90 days after the last save (reads don't count): its records are gone, and its room given
  // back. Its owner stays, so when its devices come back and send theirs again, it's the same
  // profile, not a new one counted against today's limits. The records and this profile's
  // count go first, so if giving the room back then fails, those blocks are lost to the shared
  // count (it reads a little fuller than it is), never given back twice.
  async alarm() {
    const blocks = this.store.reserved();
    this.store.setReserved(0);
    this.store.clear();
    if (blocks && this.env && this.env.SPACE) {
      try { await this.room("release", blocks); } catch (e) { /* lost to the count; see above */ }
    }
  }
  room(what, n) {
    return this.env.SPACE.get(this.env.SPACE.idFromName("everyone")).fetch("https://space/" + what + "?blocks=" + n, { method: "POST" });
  }

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
    // A profile saved before alarms has records and no alarm: give it one (a missing alarm
    // only; reads never move one that's set).
    if (this.storage && !this.alarmChecked) {
      this.alarmChecked = true;
      if (this.store.list().length && (await this.storage.getAlarm()) == null) await this.storage.setAlarm(Date.now() + KEEP_DAYS * 86400000);
    }
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
      const base = Number(request.headers.get("x-base-version"));
      // A save that's going to be refused is refused before anything is counted or reserved.
      const was = this.store.get(grade);
      if (base !== (was ? was.version : 0)) return json(409, { version: was ? was.version : 0 });
      if (!was && this.store.list().length >= MAX_GRADES) return json(403, { error: "too many grades" });
      // A new profile (no owner, nothing saved): its network, and everyone, have to have room
      // for one more today.
      if (!this.store.owner() && !this.store.list().length && this.env && this.env.LIMITER) {
        const take = (name, limit) => this.env.LIMITER.get(this.env.LIMITER.idFromName(name)).fetch("https://limiter/take?limit=" + limit, { method: "POST" });
        const net = request.headers.get("x-network") || "unknown";
        if ((await take("net:" + net, NEW_PER_NETWORK)).status !== 200) return json(429, { error: "too many new profiles from this network today" });
        if ((await take("everyone", NEW_PER_DAY)).status !== 200) return json(429, { error: "too many new profiles today" });
      }
      // Room: enough blocks for all its records with this one. Reserved before the save (and kept
      // even if the save is then refused, to be used by the next try), and the profile then has
      // an alarm, so reserved room is always given back in time even if nothing is ever saved.
      const need = Math.ceil((this.store.bytes(grade) + body.byteLength) / BLOCK), have = this.store.reserved();
      if (need > have && this.env && this.env.SPACE) {
        if ((await this.room("reserve", need - have)).status !== 200) return json(507, { error: "full" });
        this.store.setReserved(this.store.reserved() + need - have);
        if (this.storage && (await this.storage.getAlarm()) == null) await this.storage.setAlarm(Date.now() + KEEP_DAYS * 86400000);
      }
      // No awaits from here on: the checks (again: things may have changed while it waited) and
      // the save happen together.
      const owner = this.store.owner();
      if (owner && owner !== token) return json(403, { error: "write token" });
      const cur = this.store.get(grade);
      const version = cur ? cur.version : 0;
      if (base !== version) return json(409, { version });
      if (!cur && this.store.list().length >= MAX_GRADES) return json(403, { error: "too many grades" });
      // Grew meanwhile (another save of the same profile while this one waited): try again.
      if (this.env && this.env.SPACE && Math.ceil((this.store.bytes(grade) + body.byteLength) / BLOCK) > this.store.reserved()) return json(409, { version });
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

// Everyone's room: how many BLOCKs all profiles have reserved, in one SQLite Durable Object.
export function spaceStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS used (one INTEGER PRIMARY KEY CHECK (one = 1), blocks INTEGER NOT NULL)");
  return {
    used: () => (sql.exec("SELECT blocks FROM used").toArray()[0] || {}).blocks || 0,
    setUsed: (n) => { sql.exec("INSERT OR REPLACE INTO used (one, blocks) VALUES (1, ?)", n); }
  };
}
export function memorySpaceStore() {
  let n = 0;
  return { used: () => n, setUsed: (v) => { n = v; } };
}
export class Space {
  constructor(ctx) {
    this.store = ctx.store || spaceStore(ctx.storage.sql);
  }
  // POST /reserve?blocks=N → 200 if they fit under SPACE_BYTES (and counts them), else 507.
  // POST /release?blocks=N → gives them back.
  async fetch(request) {
    const url = new URL(request.url), n = Math.max(0, Number(url.searchParams.get("blocks")) || 0);
    const used = this.store.used();
    if (url.pathname === "/release") { this.store.setUsed(Math.max(0, used - n)); return json(200, { used: Math.max(0, used - n) }); }
    if ((used + n) * BLOCK > SPACE_BYTES) return json(507, { error: "full" });
    this.store.setUsed(used + n);
    return json(200, { used: used + n });
  }
}
