// No DOM. One sync of one grade of a linked profile with the sync service (sync/): fetch
// the server's sealed record, merge this device's data into it (merge.js), save it back
// from the version it was fetched at (another device saved since: start over), then hand
// back what to keep here. Used by app.js; `fetch` is passed in so the tests can use the
// service directly.
import { seal, unseal } from "./seal.js";
import { toRecord, merge, fromRecord, RECORD_VERSION } from "./merge.js";

export const SYNC_URL = "https://sound-box-sync.asset-data.stream";
const TRIES = 5;

// A record saved by a newer version of the app, in a format this one doesn't know all of:
// merging and saving it back would drop what it doesn't know, so that grade isn't synced
// until this device updates (which it does the next time it comes back on screen).
export class NewerRecord extends Error {
  constructor(v) { super("sync: record version " + v + " is newer than " + RECORD_VERSION); this.newer = true; }
}

// JSON with keys in order, to tell whether a merge changed anything (key order can differ).
export function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

// The grades the server has for this profile.
export async function remoteGrades({ fetch, url = SYNC_URL, keys }) {
  const res = await fetch(`${url}/v1/p/${keys.lookup}`, { cache: "no-store" });
  if (!res.ok) throw new Error("sync: " + res.status);
  return Object.keys((await res.json()).grades || {});
}

// read(): the grade's saved data now (called again at the end, since play goes on while
// this waits on the network); base: the last record merged here, or null; me: this
// device's id. apply(data, record) is given the data to keep and the record to keep as
// the next base. Throws if the service can't be reached or the record won't open.
export async function syncGrade({ fetch, url = SYNC_URL, keys, grade, me, read, base, apply }) {
  const at = `${url}/v1/p/${keys.lookup}/${grade}`;
  for (let i = 0; i < TRIES; i++) {
    const mine = toRecord(read(), base, me);
    const res = await fetch(at, { cache: "no-store" });
    if (res.status !== 200 && res.status !== 404) throw new Error("sync: " + res.status);
    const version = res.status === 404 ? 0 : Number(res.headers.get("x-version"));
    const server = version ? await unseal(keys, grade, new Uint8Array(await res.arrayBuffer())) : null;
    if (server && server.v > RECORD_VERSION) throw new NewerRecord(server.v);
    const merged = merge(mine, server);
    if (!server || canon(merged) !== canon(server)) {
      const put = await fetch(at, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream", "x-base-version": String(version) },
        body: await seal(keys, grade, merged)
      });
      if (put.status === 409) continue;
      if (!put.ok) throw new Error("sync: " + put.status);
    }
    // Anything played meanwhile is added on top, so nothing is lost by keeping the result.
    const now = read();
    apply(fromRecord(merge(merged, toRecord(now, base, me)), now), merged);
    return;
  }
  throw new Error("sync: busy");
}
