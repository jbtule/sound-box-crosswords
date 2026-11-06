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
// SPACE_BYTES: each profile holds room in BLOCK-sized pieces in one shared count (Space), which
// keeps how many blocks each profile holds, as its records grow, and gives it back when they're
// deleted. "Hold at least N" and "release" can be repeated safely, so a lost reply or a retry
// never counts anything twice. A real profile fits in one or two
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
    // Numbers it keeps about itself: `reserved` (blocks held in Space), `seq` (its last message
    // to Space) and `counted` (already counted as a new profile).
    sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, n INTEGER NOT NULL)");
  };
  // A profile that has any tables (including ones made by earlier versions, which had no
  // `meta`) gets all of them now; one that has none gets them at its first write.
  let made = sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").toArray()[0].n > 0;
  if (made) create();
  const make = () => { if (!made) { create(); made = true; } };
  const read = (q, ...p) => (made ? sql.exec(q, ...p).toArray() : []);
  return {
    bytes: (except) => (read("SELECT COALESCE(SUM(length(body)), 0) AS n FROM records WHERE grade <> ?", except)[0] || { n: 0 }).n,
    num: (key) => (read("SELECT n FROM meta WHERE key = ?", key)[0] || {}).n || 0,
    setNum: (key, n) => { make(); sql.exec("INSERT OR REPLACE INTO meta (key, n) VALUES (?, ?)", key, n); },
    list: () => read("SELECT grade, version FROM records"),
    get: (grade) => read("SELECT version, body FROM records WHERE grade = ?", grade)[0] || null,
    put: (grade, version, body) => { make(); sql.exec("INSERT OR REPLACE INTO records (grade, version, body, saved) VALUES (?, ?, ?, ?)", grade, version, body, Date.now()); },
    lastSaved: () => (read("SELECT COALESCE(MAX(saved), 0) AS t FROM records")[0] || { t: 0 }).t,
    owner: () => (read("SELECT token FROM owner")[0] || {}).token || null,
    setOwner: (token) => { make(); sql.exec("INSERT OR REPLACE INTO owner (one, token) VALUES (1, ?)", token); },
    clear: () => { if (made) sql.exec("DELETE FROM records"); }
  };
}
export function memoryStore() {
  const m = new Map(), nums = new Map();
  let owner = null;
  return {
    bytes: (except) => [...m].reduce((n, [g, r]) => n + (g === except ? 0 : r.body.byteLength), 0),
    num: (key) => nums.get(key) || 0,
    setNum: (key, n) => { nums.set(key, n); },
    list: () => [...m].map(([grade, r]) => ({ grade, version: r.version })),
    get: (grade) => m.get(grade) || null,
    put: (grade, version, body) => { m.set(grade, { version, body, saved: Date.now() }); },
    lastSaved: () => Math.max(0, ...[...m.values()].map((r) => r.saved || 0)),
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

// The blocks a profile holds in Space, kept with its other numbers.
function withReserved(store) {
  store.reserved = () => store.num("reserved");
  store.setReserved = (n) => store.setNum("reserved", n);
  return store;
}

export class Profile {
  constructor(ctx, env) {
    this.store = withReserved(ctx.store || sqlStore(ctx.storage.sql));
    this.storage = ctx.storage; // for the alarm (none in the tests)
    this.env = env;
    // Who it is in the shared count: its Durable Object id (a name in the tests).
    this.name = ctx.id ? ctx.id.toString() : ctx.name || crypto.randomUUID();
    this.now = () => Date.now(); // the alarm's clock (moved ahead in the tests)
  }
  // 90 days after the last save (reads don't count): its records are gone, and its room given
  // back. Its owner stays, so when its devices come back and send theirs again, it's the same
  // profile, not a new one counted against today's limits. If giving the room back fails, it
  // throws, so the runtime runs the alarm again later (releasing twice is harmless). A save
  // arriving meanwhile holds room again with a later-numbered message, which Space keeps even if
  // the release lands after it.
  async alarm() {
    // Saved within the 90 days after all (a save while an earlier try of this alarm was being
    // retried): not due yet, so wait until 90 days after that save.
    const last = this.store.lastSaved(), due = last + KEEP_DAYS * 86400000;
    if (last && due > this.now() + 60000) {
      if (this.storage) await this.storage.setAlarm(due);
      return;
    }
    this.giveUp();
    this.store.clear();
    if (this.env && this.env.SPACE) {
      const res = await this.room("release");
      if (res.status !== 200) throw new Error("sync: releasing room failed (" + res.status + ")");
    }
  }
  // Its room is being given back: `gen` changes, so a save waiting on Space meanwhile knows its
  // reply is out of date and has the device try again.
  giveUp() {
    this.store.setNum("gen", this.store.num("gen") + 1);
    this.store.setReserved(0);
  }
  // Counts a new profile against its network's and everyone's limits for today: null, or why not.
  // Each count is taken once (`netCounted`, then `counted`), so a retry after a failure partway
  // doesn't take its network's again. A Limiter that can't be reached is "unavailable", not
  // a limit: the device just tries again later.
  async countNew(net) {
    const take = async (name, limit) => {
      try {
        const res = await this.env.LIMITER.get(this.env.LIMITER.idFromName(name)).fetch("https://limiter/take?limit=" + limit, { method: "POST" });
        return res.status === 200 ? "ok" : res.status === 429 ? "limit" : "unavailable";
      } catch (e) { return "unavailable"; }
    };
    if (!this.store.num("netCounted")) {
      const r = await take("net:" + net, NEW_PER_NETWORK);
      if (r !== "ok") return r === "limit" ? { status: 429, error: "too many new profiles from this network today" } : { status: 503, error: "unavailable" };
      this.store.setNum("netCounted", 1);
    }
    const r = await take("everyone", NEW_PER_DAY);
    if (r !== "ok") return r === "limit" ? { status: 429, error: "too many new profiles today" } : { status: 503, error: "unavailable" };
    this.store.setNum("counted", 1);
    return null;
  }
  // Messages to Space are numbered in the order they're sent (the number is saved before the
  // message goes), and Space ignores any older than the last it applied for this profile, so
  // they take effect in the order they were sent, whatever order they arrive in.
  room(what, blocks) {
    const seq = this.store.num("seq") + 1;
    this.store.setNum("seq", seq);
    const q = "?profile=" + encodeURIComponent(this.name) + "&seq=" + seq + (blocks == null ? "" : "&blocks=" + blocks);
    return this.env.SPACE.get(this.env.SPACE.idFromName("everyone")).fetch("https://space/" + what + q, { method: "POST" });
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
      // Room: enough blocks for all its records with this one. Reserved before the save (and kept
      // even if the save is then refused, to be used by the next try), and the profile then has
      // an alarm, so reserved room is always given back in time even if nothing is ever saved.
      // Checked before the new-profile limits, so a full service doesn't use them up.
      const need = Math.ceil((this.store.bytes(grade) + body.byteLength) / BLOCK), have = this.store.reserved();
      if (need > have && this.env && this.env.SPACE) {
        const gen = this.store.num("gen"), res = await this.room("hold", need);
        if (res.status !== 200) return json(507, { error: "full" });
        const held = (await res.json()).held;
        // Given up meanwhile (expired, or a refused first save): this reply is out of date.
        if (this.store.num("gen") !== gen) return json(409, { version: was ? was.version : 0 });
        this.store.setReserved(Math.max(this.store.reserved(), held));
        if (this.storage && (await this.storage.getAlarm()) == null) await this.storage.setAlarm(Date.now() + KEEP_DAYS * 86400000);
        if (held < need) return json(409, { version: was ? was.version : 0 }); // an older message; the next try asks again
      }
      // A new profile (no owner, nothing saved): its network, and everyone, have to have room
      // for one more today. Counted once, however many tries its first save takes; refused,
      // it gives back the room it just took.
      if (!this.store.owner() && !this.store.list().length && !this.store.num("counted") && this.env && this.env.LIMITER) {
        // Saves arriving together share one count (and its answer).
        if (!this.counting) this.counting = this.countNew(request.headers.get("x-network") || "unknown").finally(() => { this.counting = null; });
        const refused = await this.counting;
        // Unavailable: keep the room (it has an alarm) for the next try.
        if (refused && refused.status === 503) return json(503, { error: refused.error });
        if (refused) {
          if (!this.store.list().length && this.store.reserved() && this.env.SPACE) {
            this.giveUp();
            try { await this.room("release"); } catch (e) { /* its alarm gives it back */ }
          }
          return json(429, { error: refused.error });
        }
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

// Everyone's room, in one SQLite Durable Object: how many BLOCKs each profile holds, the
// number of the last message it applied for each, and the total. Holding is "at least N" and
// releasing is "none", and a message older than the last applied is ignored, so messages can
// be repeated, retried after a lost reply, or arrive out of order without counting anything
// twice or undoing a later one.
export function spaceStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS holds (profile TEXT PRIMARY KEY, blocks INTEGER NOT NULL, seq INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS total (one INTEGER PRIMARY KEY CHECK (one = 1), blocks INTEGER NOT NULL)");
  return {
    get: (p) => sql.exec("SELECT blocks, seq FROM holds WHERE profile = ?", p).toArray()[0] || { blocks: 0, seq: 0 },
    set: (p, blocks, seq) => { sql.exec("INSERT OR REPLACE INTO holds (profile, blocks, seq) VALUES (?, ?, ?)", p, blocks, seq); },
    total: () => (sql.exec("SELECT blocks FROM total").toArray()[0] || {}).blocks || 0,
    setTotal: (n) => { sql.exec("INSERT OR REPLACE INTO total (one, blocks) VALUES (1, ?)", n); }
  };
}
export function memorySpaceStore() {
  const m = new Map();
  let t = 0;
  return { get: (p) => m.get(p) || { blocks: 0, seq: 0 }, set: (p, blocks, seq) => { m.set(p, { blocks, seq }); }, total: () => t, setTotal: (n) => { t = n; } };
}
export class Space {
  constructor(ctx) {
    this.store = ctx.store || spaceStore(ctx.storage.sql);
    this.store.held = (p) => this.store.get(p).blocks;
  }
  // POST /hold?profile=P&seq=S&blocks=N → P holds at least N blocks: 200, or 507 if that wouldn't
  //                                        fit under SPACE_BYTES (and nothing changes).
  // POST /release?profile=P&seq=S        → P holds none.
  // A message numbered at or below the last one applied for P changes nothing (200).
  async fetch(request) {
    const url = new URL(request.url), p = url.searchParams.get("profile") || "";
    const seq = Math.max(0, Math.floor(Number(url.searchParams.get("seq")) || 0));
    const n = Math.max(0, Math.floor(Number(url.searchParams.get("blocks")) || 0));
    if (!p) return json(400, { error: "profile" });
    if (url.pathname !== "/hold" && url.pathname !== "/release") return json(404, { error: "path" });
    const cur = this.store.get(p), total = this.store.total();
    if (seq <= cur.seq) return json(200, { held: cur.blocks, stale: true });
    if (url.pathname === "/release") {
      this.store.set(p, 0, seq);
      this.store.setTotal(Math.max(0, total - cur.blocks));
      return json(200, { held: 0 });
    }
    if (n <= cur.blocks) { this.store.set(p, cur.blocks, seq); return json(200, { held: cur.blocks }); }
    if ((total - cur.blocks + n) * BLOCK > SPACE_BYTES) return json(507, { error: "full" });
    this.store.set(p, n, seq);
    this.store.setTotal(total - cur.blocks + n);
    return json(200, { held: n });
  }
}
