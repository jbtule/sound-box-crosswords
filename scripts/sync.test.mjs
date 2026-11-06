// Tests for the sync service (sync/src), with each profile's Durable Object kept in memory.
// Run by `npm run check`, or alone: node --test scripts/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, MAX_BYTES } from "../sync/src/api.js";
import { Profile, memoryStore, MAX_GRADES } from "../sync/src/profile.js";
import { newKey, keysFor, seal, unseal } from "../js/seal.js";
import { toRecord, merge, fromRecord } from "../js/merge.js";

const SITE = "https://tools.tuley.name";
function service() {
  const profiles = new Map();
  const env = {
    PROFILE: {
      idFromName: (name) => name,
      get: (id) => {
        if (!profiles.has(id)) profiles.set(id, new Profile({ store: memoryStore() }));
        return { fetch: (req) => profiles.get(id).fetch(req) };
      }
    }
  };
  const call = (path, init = {}) =>
    handle(new Request("https://sound-box-sync.asset-data.stream" + path, { ...init, headers: { origin: SITE, ...init.headers } }), env);
  return { call, profiles };
}
const put = (call, lookup, grade, base, body) =>
  call(`/v1/p/${lookup}/${grade}`, { method: "PUT", headers: { "x-base-version": String(base) }, body });

test("save and fetch a sealed record; a stale save is refused", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  assert.equal((await call(`/v1/p/${keys.lookup}/g3`)).status, 404);
  let res = await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", { n: 1 }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { version: 1 });
  res = await call(`/v1/p/${keys.lookup}/g3`);
  assert.equal(res.headers.get("x-version"), "1");
  assert.equal(res.headers.get("access-control-allow-origin"), SITE);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await unseal(keys, "g3", new Uint8Array(await res.arrayBuffer())), { n: 1 });
  // Another device saved from version 0 too: refused, told the current version.
  res = await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", { n: 2 }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { version: 1 });
  assert.equal((await put(call, keys.lookup, "g3", 1, await seal(keys, "g3", { n: 2 }))).status, 200);
  res = await call(`/v1/p/${keys.lookup}`);
  assert.deepEqual(await res.json(), { grades: { g3: 2 } });
});

test("two devices syncing at once both end up with everything", async () => {
  const { call } = service();
  const key = newKey(), keys = await keysFor(key);
  // The app's save: fetch, merge, save from that version; on 409, again.
  async function sync(dev) {
    for (;;) {
      const res = await call(`/v1/p/${keys.lookup}/g3`);
      const version = res.status === 404 ? 0 : Number(res.headers.get("x-version"));
      const server = version ? await unseal(keys, "g3", new Uint8Array(await res.arrayBuffer())) : null;
      const rec = merge(toRecord(dev.data, dev.base, dev.id), server);
      const saved = await put(call, keys.lookup, "g3", version, await seal(keys, "g3", rec));
      if (saved.status === 409) continue;
      assert.equal(saved.status, 200);
      dev.data = fromRecord(rec, dev.data); dev.base = rec;
      return;
    }
  }
  const play = (dev, n) => { dev.data.counts.clean += n; dev.data.stars.blends = (dev.data.stars.blends || 0) + n; };
  const blank = () => ({ counts: { clean: 0, comeback: 0 }, stars: {} });
  const a = { id: "a", data: blank(), base: null }, b = { id: "b", data: blank(), base: null };
  play(a, 3); play(b, 2);
  await Promise.all([sync(a), sync(b)]);
  await sync(a);
  assert.equal(a.data.counts.clean, 5);
  assert.equal(b.data.stars.blends, 5);
});

test("refuses other sites, bad paths, and anything that isn't a sealed record", async () => {
  const { call } = service();
  const lookup = (await keysFor(newKey())).lookup;
  const ok = await seal(await keysFor(newKey()), "g3", {});
  assert.equal((await call(`/v1/p/${lookup}/g3`, { headers: { origin: "https://example.com" } })).status, 403);
  assert.equal((await call(`/v1/p/${lookup}/g3`, { headers: { origin: "http://localhost:8000" } })).status, 404);
  assert.equal((await call(`/v1/p/short/g3`)).status, 404);
  assert.equal((await call(`/v1/p/${lookup}/G3!`)).status, 404);
  assert.equal((await call(`/other`)).status, 404);
  assert.equal((await put(call, lookup, "g3", 0, new TextEncoder().encode("hello, this is not sealed at all"))).status, 400);
  assert.equal((await put(call, lookup, "g3", 0, new Uint8Array(MAX_BYTES + 1).fill(1))).status, 413);
  assert.equal((await call(`/v1/p/${lookup}/g3`, { method: "PUT", body: ok })).status, 400); // no base version
  assert.equal((await call(`/v1/p/${lookup}/g3`, { method: "DELETE" })).status, 405);
  const pre = await call(`/v1/p/${lookup}/g3`, { method: "OPTIONS", headers: { "access-control-request-method": "PUT" } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers"), /x-base-version/);
});

test("a profile holds at most MAX_GRADES grades", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  for (let i = 0; i < MAX_GRADES; i++) assert.equal((await put(call, keys.lookup, "g" + i, 0, await seal(keys, "g" + i, {}))).status, 200);
  assert.equal((await put(call, keys.lookup, "one-more", 0, await seal(keys, "one-more", {}))).status, 403);
  assert.equal((await put(call, keys.lookup, "g0", 1, await seal(keys, "g0", { again: true }))).status, 200);
});

// js/sync.js, the app's side, against the service.
import { syncGrade, remoteGrades, canon } from "../js/sync.js";
function client(call) {
  return (url, init = {}) => call(new URL(url).pathname, { method: init.method, headers: init.headers, body: init.body });
}
function deviceFor(id) {
  const dev = { id, data: { counts: { clean: 0, comeback: 0 }, stars: {}, progress: {} }, base: null };
  dev.opts = (fetch, keys) => ({
    fetch, url: "https://sound-box-sync.asset-data.stream", keys, grade: "g3", me: id,
    read: () => JSON.parse(JSON.stringify(dev.data)), base: dev.base,
    apply: (data, rec) => { dev.data = data; dev.base = rec; }
  });
  return dev;
}

test("syncGrade: two devices share progress, and a sync that changes nothing saves nothing", async () => {
  const { call } = service();
  let puts = 0;
  const fetch = (url, init = {}) => { if (init.method === "PUT") puts++; return client(call)(url, init); };
  const keys = await keysFor(newKey());
  const a = deviceFor("a"), b = deviceFor("b");
  a.data.counts.clean = 3; a.data.progress = { blends: { done: { frog: true }, round: ["frog"], stats: { frog: { n: 1, ok: 1, miss: 0 } } } };
  b.data.counts.clean = 2;
  await syncGrade(a.opts(fetch, keys)); await syncGrade(b.opts(fetch, keys)); await syncGrade(a.opts(fetch, keys));
  assert.equal(a.data.counts.clean, 5);
  assert.equal(b.data.counts.clean, 5);
  assert.deepEqual(Object.keys(b.data.progress.blends.done), ["frog"]);
  assert.deepEqual(await remoteGrades({ fetch, keys }), ["g3"]);
  const before = puts;
  await syncGrade(a.opts(fetch, keys)); await syncGrade(b.opts(fetch, keys));
  assert.equal(puts, before);
});

test("syncGrade: a puzzle finished while it waits on the network is kept", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  const a = deviceFor("a"), b = deviceFor("b");
  b.data.counts.clean = 2;
  await syncGrade(b.opts(client(call), keys));
  a.data.counts.clean = 1;
  // a's save goes out with 1 clean; before the reply lands, another puzzle is finished.
  const slow = async (url, init = {}) => { const r = await client(call)(url, init); if (init.method === "PUT") a.data.counts.clean = 2; return r; };
  await syncGrade(a.opts(slow, keys));
  assert.equal(a.data.counts.clean, 4); // b's 2, a's 1, and the one finished meanwhile
  await syncGrade(a.opts(client(call), keys)); await syncGrade(b.opts(client(call), keys));
  assert.equal(b.data.counts.clean, 4);
  assert.equal(a.data.counts.clean, 4);
});

test("syncGrade: a record it can't open is an error, and nothing is kept", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  await put(call, keys.lookup, "g3", 0, await seal(keys, "kindergarten", { not: "this grade" }));
  const a = deviceFor("a"); a.data.counts.clean = 1;
  await assert.rejects(syncGrade(a.opts(client(call), keys)));
  assert.equal(a.base, null);
});

test("canon ignores key order", () => {
  assert.equal(canon({ b: 1, a: [{ d: 2, c: 3 }] }), canon({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test("syncGrade: a record from a newer app is left alone", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  const newer = { v: 2, progress: {}, futureField: { kept: true } };
  await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", newer));
  let puts = 0;
  const fetch = (url, init = {}) => { if (init.method === "PUT") puts++; return client(call)(url, init); };
  const a = deviceFor("a"); a.data.counts.clean = 1;
  await assert.rejects(syncGrade(a.opts(fetch, keys)), (e) => e.newer === true);
  assert.equal(puts, 0);
  assert.equal(a.base, null);
  const res = await call(`/v1/p/${keys.lookup}/g3`);
  assert.deepEqual(await unseal(keys, "g3", new Uint8Array(await res.arrayBuffer())), newer);
});
