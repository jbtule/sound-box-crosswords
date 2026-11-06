// One profile's sealed records, one per grade: a SQLite Durable Object, named by the
// profile's lookup ID. It can't read them (js/seal.js); it only keeps each grade's latest
// record and its version, and refuses a save made from an out-of-date copy, so two devices
// saving at once can't overwrite each other (the later one fetches, merges and tries again).
// The Worker (index.js) checks every request before it gets here.
export const MAX_GRADES = 32;

// Storage: SQLite in the Durable Object, or a Map in the tests.
export function sqlStore(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS records (grade TEXT PRIMARY KEY, version INTEGER NOT NULL, body BLOB NOT NULL, saved INTEGER NOT NULL)");
  return {
    list: () => sql.exec("SELECT grade, version FROM records").toArray(),
    get: (grade) => sql.exec("SELECT version, body FROM records WHERE grade = ?", grade).toArray()[0] || null,
    put: (grade, version, body) => { sql.exec("INSERT OR REPLACE INTO records (grade, version, body, saved) VALUES (?, ?, ?, ?)", grade, version, body, Date.now()); }
  };
}
export function memoryStore() {
  const m = new Map();
  return {
    list: () => [...m].map(([grade, r]) => ({ grade, version: r.version })),
    get: (grade) => m.get(grade) || null,
    put: (grade, version, body) => { m.set(grade, { version, body }); }
  };
}

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

export class Profile {
  constructor(ctx) {
    this.store = ctx.store || sqlStore(ctx.storage.sql);
  }

  // GET /            → { grades: { grade: version } }
  // GET /<grade>     → the record (X-Version header), or 404
  // PUT /<grade>     → saves it if X-Base-Version is the current version (0: none yet)
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
      // No awaits from here on: the check and the save happen together.
      const base = Number(request.headers.get("x-base-version"));
      const cur = this.store.get(grade);
      const version = cur ? cur.version : 0;
      if (base !== version) return json(409, { version });
      if (!cur && this.store.list().length >= MAX_GRADES) return json(403, { error: "too many grades" });
      this.store.put(grade, version + 1, body);
      return json(200, { version: version + 1 });
    }
    return json(405, { error: "method" });
  }
}
