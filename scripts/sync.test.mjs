// Tests for the sync service (sync/src), with each profile's Durable Object kept in memory.
// Run by `npm run check`, or alone: node --test scripts/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, MAX_BYTES, networkOf, looksRandom } from "../sync/src/api.js";
import { Profile, memoryStore, MAX_GRADES, Limiter, memoryLimiterStore, NEW_PER_NETWORK, NEW_PER_DAY, Space, memorySpaceStore, BLOCK, SPACE_BYTES, KEEP_DAYS } from "../sync/src/profile.js";
import { newKey, keysFor, seal, unseal } from "../js/seal.js";
import { toRecord, merge, fromRecord } from "../js/merge.js";

const SITE = "https://tools.tuley.name";
function service() {
  const profiles = new Map(), limiters = new Map(), space = new Space({ store: memorySpaceStore() });
  // Each profile's Durable Object storage, for its alarm: when it's set to go off.
  const alarmAt = (id) => profiles.get(id).storage.at;
  const env = {
    PROFILE: {
      idFromName: (name) => name,
      get: (id) => {
        if (!profiles.has(id)) profiles.set(id, new Profile({ store: memoryStore(), storage: { at: null, async setAlarm(t) { this.at = t; }, async getAlarm() { return this.at; } } }, env));
        return { fetch: (req) => profiles.get(id).fetch(req) };
      }
    },
    SPACE: { idFromName: (name) => name, get: () => ({ fetch: (url, init) => space.fetch(new Request(url, init)) }) },
    LIMITER: {
      idFromName: (name) => name,
      get: (id) => {
        if (!limiters.has(id)) limiters.set(id, new Limiter({ store: memoryLimiterStore() }));
        return { fetch: (url, init) => limiters.get(id).fetch(new Request(url, init)) };
      }
    }
  };
  const call = (path, init = {}) =>
    handle(new Request("https://sound-box-sync.asset-data.stream" + path, { ...init, headers: { origin: SITE, "x-write-token": TOKEN, ...init.headers } }), env);
  return { call, profiles, limiters, space, alarmAt };
}
const TOKEN = "T".repeat(43);
const put = (call, lookup, grade, base, body, token = TOKEN, ip) =>
  call(`/v1/p/${lookup}/${grade}`, { method: "PUT", headers: { "x-base-version": String(base), "x-write-token": token, ...(ip ? { "cf-connecting-ip": ip } : {}) }, body });

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
  // Whichever finished first hasn't seen the other's yet: one more sync each, in either order.
  await sync(a); await sync(b);
  assert.equal(a.data.counts.clean, 5);
  assert.equal(b.data.stars.blends, 5);
  assert.equal(a.data.stars.blends, 5);
  assert.equal(b.data.counts.clean, 5);
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
  await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", newer), keys.writeToken);
  let puts = 0;
  const fetch = (url, init = {}) => { if (init.method === "PUT") puts++; return client(call)(url, init); };
  const a = deviceFor("a"); a.data.counts.clean = 1;
  await assert.rejects(syncGrade(a.opts(fetch, keys)), (e) => e.newer === true);
  assert.equal(puts, 0);
  assert.equal(a.base, null);
  const res = await call(`/v1/p/${keys.lookup}/g3`, { headers: { "x-write-token": keys.writeToken } });
  assert.deepEqual(await unseal(keys, "g3", new Uint8Array(await res.arrayBuffer())), newer);
});

test("only the profile's own devices can read or save: the token", async () => {
  const { call, profiles } = service();
  const keys = await keysFor(newKey()), other = await keysFor(newKey());
  const as = (token) => ({ headers: { "x-write-token": token } });
  const rec = await seal(keys, "g3", { n: 1 });
  assert.equal((await put(call, keys.lookup, "g3", 0, rec, keys.writeToken)).status, 200);
  // Someone who knows the lookup ID but not the key can't save, read, or list it.
  assert.equal((await put(call, keys.lookup, "g3", 1, rec, other.writeToken)).status, 403);
  assert.equal((await put(call, keys.lookup, "g3", 1, rec, "")).status, 400);
  assert.equal((await call(`/v1/p/${keys.lookup}/g3`, as(other.writeToken))).status, 403);
  assert.equal((await call(`/v1/p/${keys.lookup}`, as(other.writeToken))).status, 403);
  assert.equal((await call(`/v1/p/${keys.lookup}/g3`, as(""))).status, 400);
  // Its own devices can.
  assert.equal((await call(`/v1/p/${keys.lookup}/g3`, as(keys.writeToken))).headers.get("x-version"), "1");
  assert.equal((await put(call, keys.lookup, "g3", 1, rec, keys.writeToken)).status, 200);
  // The server keeps a hash, not the token.
  assert.notEqual(profiles.get(keys.lookup).store.owner(), keys.writeToken);
  // A profile saved before tokens: its first save with a token claims it.
  const old = await keysFor(newKey());
  const p = new Profile({ store: memoryStore() }); profiles.set(old.lookup, p);
  p.store.put("g3", 1, await seal(old, "g3", { n: 1 }));
  assert.equal((await put(call, old.lookup, "g3", 1, await seal(old, "g3", { n: 2 }), old.writeToken)).status, 200);
  assert.equal((await put(call, old.lookup, "g3", 2, await seal(old, "g3", { n: 3 }), other.writeToken)).status, 403);
});

test("only the app's own pages, and replies that never show as a page", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", {}), keys.writeToken);
  // No Origin (a link, an <img>, curl) or another site's: refused.
  const bare = await handle(new Request(`https://sound-box-sync.asset-data.stream/v1/p/${keys.lookup}/g3`, { headers: { "x-write-token": keys.writeToken } }), {});
  assert.equal(bare.status, 403);
  assert.equal((await call(`/v1/p/${keys.lookup}/g3`, { headers: { origin: "https://example.com", "x-write-token": keys.writeToken } })).status, 403);
  for (const res of [await call(`/v1/p/${keys.lookup}/g3`, { headers: { "x-write-token": keys.writeToken } }), await call(`/v1/p/short/g3`)]) {
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("content-disposition"), "attachment");
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("a profile no device has saved in 90 days is deleted, and comes back from its devices", async () => {
  const { call, profiles } = service();
  const keys = await keysFor(newKey());
  const a = deviceFor("a"); a.data.counts.clean = 3;
  await syncGrade(a.opts(client(call), keys));
  await profiles.get(keys.lookup).alarm(); // 90 days later
  assert.equal((await call(`/v1/p/${keys.lookup}`, { headers: { "x-write-token": keys.writeToken } })).status, 200);
  assert.deepEqual(await (await call(`/v1/p/${keys.lookup}`, { headers: { "x-write-token": keys.writeToken } })).json(), { grades: {} });
  // The device still has everything, and its next sync saves it again.
  a.data.counts.clean += 1;
  await syncGrade(a.opts(client(call), keys));
  const b = deviceFor("b");
  await syncGrade(b.opts(client(call), keys));
  assert.equal(b.data.counts.clean, 4);
});

test("new profiles: NEW_PER_NETWORK a day per network, NEW_PER_DAY for everyone; saving existing ones isn't limited", async () => {
  const { call, limiters } = service();
  const made = [];
  for (let i = 0; i < NEW_PER_NETWORK; i++) {
    const k = await keysFor(newKey()); made.push(k);
    assert.equal((await put(call, k.lookup, "g3", 0, await seal(k, "g3", {}), k.writeToken, "203.0.113.7")).status, 200);
  }
  const extra = await keysFor(newKey());
  assert.equal((await put(call, extra.lookup, "g3", 0, await seal(extra, "g3", {}), extra.writeToken, "203.0.113.7")).status, 429);
  assert.equal((await put(call, extra.lookup, "g3", 0, await seal(extra, "g3", {}), extra.writeToken, "198.51.100.2")).status, 200);
  const k = made[0];
  assert.equal((await put(call, k.lookup, "g3", 1, await seal(k, "g3", { more: 1 }), k.writeToken, "203.0.113.7")).status, 200);
  assert.equal((await put(call, k.lookup, "k", 0, await seal(k, "k", {}), k.writeToken, "203.0.113.7")).status, 200);
  // Everyone's limit: when it's used up, a new network can't make one either.
  limiters.get("everyone").store.set(new Date().toISOString().slice(0, 10), NEW_PER_DAY);
  const late = await keysFor(newKey());
  assert.equal((await put(call, late.lookup, "g3", 0, await seal(late, "g3", {}), late.writeToken, "192.0.2.9")).status, 429);
  // Another address in the same IPv6 /64 is the same network.
  assert.equal(networkOf("2001:db8:1:2::1"), networkOf("2001:0db8:0001:0002:ffff:1:2:3"));
  assert.notEqual(networkOf("2001:db8:1:2::1"), networkOf("2001:db8:1:3::1"));
});

test("syncGrade sends the token, and says when the network is at its limit", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  const a = deviceFor("a"); a.data.counts.clean = 1;
  await syncGrade(a.opts(client(call), keys));
  const stranger = await keysFor(newKey()), b = deviceFor("b"); b.data.counts.clean = 1;
  await assert.rejects(syncGrade(b.opts(client(call), { ...keys, writeToken: stranger.writeToken })), /403/);
  // A new profile from a network that's used up today's: a "limited" error the app can name.
  const { call: call2, limiters } = service();
  const full = new Limiter({ store: memoryLimiterStore() });
  full.store.set(new Date().toISOString().slice(0, 10), NEW_PER_NETWORK);
  limiters.set("net:unknown", full);
  const fresh = await keysFor(newKey()), c = deviceFor("c"); c.data.counts.clean = 1;
  await assert.rejects(syncGrade(c.opts(client(call2), fresh)), (e) => e.limited === true);
});

test("each successful save sets the 90-day alarm; refused ones don't", async () => {
  const { call, alarmAt } = service();
  const keys = await keysFor(newKey()), other = await keysFor(newKey());
  const t0 = Date.now();
  assert.equal((await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", {}), keys.writeToken)).status, 200);
  const at = alarmAt(keys.lookup);
  assert.ok(at >= t0 + KEEP_DAYS * 86400000 && at <= Date.now() + KEEP_DAYS * 86400000);
  const before = alarmAt(keys.lookup);
  assert.equal((await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", {}), keys.writeToken)).status, 409);
  assert.equal((await put(call, keys.lookup, "g3", 1, await seal(keys, "g3", {}), other.writeToken)).status, 403);
  assert.equal(alarmAt(keys.lookup), before);
});

test("a profile saved before tokens: its family can still read it, and claims it with its next save", async () => {
  const { call, profiles } = service();
  const old = await keysFor(newKey());
  const p = new Profile({ store: memoryStore() }); profiles.set(old.lookup, p);
  p.store.put("g3", 1, await seal(old, "g3", { n: 1 }));
  const res = await call(`/v1/p/${old.lookup}/g3`, { headers: { "x-write-token": old.writeToken } });
  assert.equal(res.status, 200);
  assert.deepEqual(await unseal(old, "g3", new Uint8Array(await res.arrayBuffer())), { n: 1 });
});

test("everything stored fits in SPACE_BYTES; expiry gives the room back", async () => {
  const { call, profiles, space } = service();
  const a = await keysFor(newKey());
  assert.equal((await put(call, a.lookup, "g3", 0, await seal(a, "g3", {}), a.writeToken)).status, 200);
  assert.equal(space.store.used(), 1); // one block for a small record
  assert.equal(profiles.get(a.lookup).store.reserved(), 1);
  // Nearly full: one block left.
  space.store.setUsed(SPACE_BYTES / BLOCK - 1);
  const b = await keysFor(newKey()), c = await keysFor(newKey());
  assert.equal((await put(call, b.lookup, "g3", 0, await seal(b, "g3", {}), b.writeToken)).status, 200);
  assert.equal((await put(call, c.lookup, "g3", 0, await seal(c, "g3", {}), c.writeToken)).status, 507);
  // An existing profile saving within its room is never refused.
  assert.equal((await put(call, a.lookup, "g3", 1, await seal(a, "g3", { more: 1 }), a.writeToken)).status, 200);
  // b expires: its block comes back, and c fits.
  await profiles.get(b.lookup).alarm();
  assert.equal(profiles.get(b.lookup).store.reserved(), 0);
  assert.equal((await put(call, c.lookup, "g3", 0, await seal(c, "g3", {}), c.writeToken)).status, 200);
  // The client names it.
  space.store.setUsed(SPACE_BYTES / BLOCK);
  const d = await keysFor(newKey()), dev = deviceFor("d"); dev.data.counts.clean = 1;
  await assert.rejects(syncGrade(dev.opts(client(call), d)), (e) => e.full === true);
});

test("only encrypted-looking records are kept: plain text and files are refused", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  const text = new TextEncoder().encode("x".repeat(13) + "Not encrypted at all, just text someone wants kept here. ".repeat(60));
  text[0] = 1;
  assert.equal((await put(call, keys.lookup, "g3", 0, text, keys.writeToken)).status, 400);
  const zeros = new Uint8Array(4096); zeros[0] = 1;
  assert.equal((await put(call, keys.lookup, "g3", 0, zeros, keys.writeToken)).status, 400);
  // A real, busy record passes.
  const big = { log: Array.from({ length: 200 }, (_, t) => ({ t: 1790000000000 + t * 86400000, pack: "blends", n: 6, m: t % 3 })), days: Array.from({ length: 300 }, (_, i) => "2026-" + i) };
  const sealed = await seal(keys, "g3", big);
  assert.ok(sealed.length > 1024);
  assert.equal((await put(call, keys.lookup, "g3", 0, sealed, keys.writeToken)).status, 200);
  // Random bytes (what encryption looks like), thousands of sizes: never refused.
  for (let i = 0; i < 3000; i++) {
    const n = 1024 + Math.floor(Math.random() * (MAX_BYTES - 1024));
    assert.ok(looksRandom(crypto.getRandomValues(new Uint8Array(n))), "random bytes of " + n + " refused");
  }
});

test("expiry: only saves count, not reads; a returning profile isn't a new one", async () => {
  const { call, profiles, limiters, alarmAt } = service();
  const keys = await keysFor(newKey()), as = { headers: { "x-write-token": keys.writeToken } };
  assert.equal((await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", {}), keys.writeToken)).status, 200);
  const at = alarmAt(keys.lookup);
  await new Promise((r) => setTimeout(r, 5));
  await call(`/v1/p/${keys.lookup}`, as); await call(`/v1/p/${keys.lookup}/g3`, as);
  assert.equal(alarmAt(keys.lookup), at, "a read moved the expiry");
  // 90 days on: the records go, the owner stays.
  await profiles.get(keys.lookup).alarm();
  assert.deepEqual(await (await call(`/v1/p/${keys.lookup}`, as)).json(), { grades: {} });
  assert.equal((await call(`/v1/p/${keys.lookup}`, { headers: { "x-write-token": (await keysFor(newKey())).writeToken } })).status, 403);
  // Its network has used up today's new profiles, but coming back isn't new.
  const full = new Limiter({ store: memoryLimiterStore() });
  full.store.set(new Date().toISOString().slice(0, 10), NEW_PER_NETWORK);
  limiters.set("net:unknown", full);
  assert.equal((await put(call, keys.lookup, "g3", 0, await seal(keys, "g3", { back: 1 }), keys.writeToken)).status, 200);
});

test("room: a profile from before blocks reserves its room at its next save; a failed give-back errs toward fuller", async () => {
  const { call, profiles, space } = service();
  const old = await keysFor(newKey());
  const sealed = await seal(old, "g3", { log: Array.from({ length: 200 }, (_, t) => ({ t, pack: "blends", n: 6 })) });
  const p = new Profile({ store: memoryStore(), storage: { at: null, async setAlarm(t) { this.at = t; }, async getAlarm() { return this.at; } } }, { SPACE: { idFromName: (n) => n, get: () => ({ fetch: (u, i) => space.fetch(new Request(u, i)) }) } });
  profiles.set(old.lookup, p);
  p.store.put("g3", 1, sealed);
  assert.equal(p.store.reserved(), 0);
  assert.equal((await put(call, old.lookup, "g3", 1, sealed, old.writeToken)).status, 200);
  assert.equal(p.store.reserved(), 1);
  assert.equal(space.store.used(), 1);
  // Giving the room back fails: the records and the profile's count still go, and the shared
  // count stays as it was (fuller than it is, never below).
  p.env = { SPACE: { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("unreachable"); } }) } };
  await p.alarm();
  assert.equal(p.store.reserved(), 0);
  assert.deepEqual(p.store.list(), []);
  assert.equal(space.store.used(), 1);
});

test("a deliberately oversized, realistic record still fits in MAX_BYTES", async () => {
  // Twice today's 3rd-grade packs, every word with every tally on, split over 4 devices, the
  // log full, a year of days, every kind of count, and a long Custom list.
  const { readFileSync } = await import("node:fs");
  const { parse } = await import("smol-toml");
  const { parseList } = await import("../js/crossword.js");
  const packs = parse(readFileSync(new URL("../packs.toml", import.meta.url), "utf8")).pack;
  const progress = {};
  for (const copy of ["", "x"]) for (const p of packs) {
    const ws = parseList(p.words).map((e) => e.w + copy);
    progress[p.id + copy] = { done: Object.fromEntries(ws.map((w) => [w, true])), round: ws, rounds: 9, stats: Object.fromEntries(ws.map((w) => [w, { n: 40, ok: 30, miss: 25, cb: true }])) };
  }
  const data = {
    progress, log: Array.from({ length: 200 }, (_, i) => ({ t: 1790000000000 + i * 86400000, pack: packs[i % packs.length].id, n: 6, m: i % 4 })),
    counts: { clean: 300, comeback: 80, hard: 40, twofer: 30, qwerty: 200, listener: 50, weekend: 90, shared: 3, look: 2, peek: 1, entrances: 30 },
    days: Array.from({ length: 365 }, (_, i) => new Date(1760000000000 + i * 86400000).toISOString().slice(0, 10)),
    achievements: Object.fromEntries(Array.from({ length: 80 }, (_, i) => ["achievement-" + i, 1790000000000 + i])),
    slips: { place: { start: 90, middle: 300, end: 200 }, kind: { vowel: 250, blend: 200, consonant: 140 } },
    stars: Object.fromEntries(Object.keys(progress).map((p) => [p, 60])),
    guessing: { t: Array.from({ length: 200 }, (_, i) => 1790000000000 + i), words: Object.fromEntries(Object.keys(progress.blends.stats).map((w) => [w, 3])) },
    seenEntrances: Array.from({ length: 40 }, (_, i) => "entrance" + i), settings: { syl: true, kb: "abc", speakSel: true, chime: true, custom: true, palette: "ocean" },
    custom: Array.from({ length: 200 }, (_, i) => "wor-dnum" + i.toString(36) + " 🐸 \"A sentence that uses the word in context.\"").join("\n")
  };
  let rec = null;
  for (const dev of ["deviceA0001", "deviceB0002", "deviceC0003", "deviceD0004"]) { rec = toRecord(data, rec, dev); data.counts.clean += 7; }
  const keys = await keysFor(newKey());
  const sealed = await seal(keys, "g3", rec);
  assert.ok(sealed.length < MAX_BYTES, `a busy record sealed to ${sealed.length} bytes, over MAX_BYTES (${MAX_BYTES}): raise it in sync/src/api.js`);
  assert.ok(looksRandom(sealed.subarray(13)));
});

test("a save that's going to be refused reserves and counts nothing", async () => {
  const { call, profiles, space, limiters, alarmAt } = service();
  const k = await keysFor(newKey());
  // A brand-new lookup, saved at a version it doesn't have: refused before the limits or room.
  assert.equal((await put(call, k.lookup, "g3", 7, await seal(k, "g3", {}), k.writeToken, "203.0.113.9")).status, 409);
  assert.equal(space.store.used(), 0);
  assert.equal(profiles.get(k.lookup).store.reserved(), 0);
  assert.equal(limiters.has("net:203.0.113.9"), false);
  assert.equal(alarmAt(k.lookup), null);
  // Any room a profile does hold comes with an alarm, so it's always given back in time.
  assert.equal((await put(call, k.lookup, "g3", 0, await seal(k, "g3", {}), k.writeToken)).status, 200);
  assert.ok(alarmAt(k.lookup) > Date.now());
  assert.equal(space.store.used(), 1);
});

test("a profile from before alarms gets one (only if it has none)", async () => {
  const { call, profiles } = service();
  const old = await keysFor(newKey());
  const storage = { at: null, async setAlarm(t) { this.at = t; }, async getAlarm() { return this.at; } };
  const p = new Profile({ store: memoryStore(), storage }); profiles.set(old.lookup, p);
  p.store.setOwner(await (async () => { const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(old.writeToken))); return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join(""); })());
  p.store.put("g3", 1, await seal(old, "g3", {}));
  await call(`/v1/p/${old.lookup}`, { headers: { "x-write-token": old.writeToken } });
  assert.ok(storage.at > Date.now() + (KEEP_DAYS - 1) * 86400000);
  const set = storage.at;
  await call(`/v1/p/${old.lookup}`, { headers: { "x-write-token": old.writeToken } });
  assert.equal(storage.at, set);
});

test("syncGrade names a record too big to save", async () => {
  const { call } = service();
  const keys = await keysFor(newKey());
  const tooBig = (url, init = {}) => (init.method === "PUT" ? Promise.resolve(new Response("{}", { status: 413 })) : client(call)(url, init));
  const a = deviceFor("a"); a.data.counts.clean = 1;
  await assert.rejects(syncGrade(a.opts(tooBig, keys)), (e) => e.big === true);
});

// The real SQL (sqlStore, limiterStore, spaceStore), on Node's built-in SQLite where there is
// one, shaped like a Durable Object's ctx.storage.sql.
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { /* older Node: skipped */ }
function doSql() {
  const db = new sqlite.DatabaseSync(":memory:");
  const blob = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  return {
    db,
    exec(q, ...params) {
      const st = db.prepare(q), rows = /^\s*SELECT/i.test(q) ? st.all(...params.map(blob)) : (st.run(...params.map(blob)), []);
      return { toArray: () => rows };
    }
  };
}
test("the real SQL: profiles, limits and room", { skip: !sqlite && "node:sqlite isn't available" }, async () => {
  const { sqlStore, limiterStore, spaceStore } = await import("../sync/src/profile.js");
  const sqls = new Map(), sqlFor = (name) => { if (!sqls.has(name)) sqls.set(name, doSql()); return sqls.get(name); };
  const env = {};
  const ns = (make) => {
    const objects = new Map();
    return { objects, idFromName: (n) => n, get: (id) => { if (!objects.has(id)) objects.set(id, make(id)); return { fetch: (u, i) => objects.get(id).fetch(u instanceof Request ? u : new Request(u, i)) }; } };
  };
  env.PROFILE = ns((id) => new Profile({ storage: { sql: sqlFor(id), at: null, async setAlarm(t) { this.at = t; }, async getAlarm() { return this.at; } } }, env));
  env.LIMITER = ns((id) => new Limiter({ store: limiterStore(sqlFor("limiter:" + id)) }));
  env.SPACE = ns((id) => new Space({ store: spaceStore(sqlFor("space:" + id)) }));
  const call = (path, init = {}) => handle(new Request("https://sound-box-sync.asset-data.stream" + path, { ...init, headers: { origin: SITE, ...init.headers } }), env);
  const k = await keysFor(newKey()), as = { headers: { "x-write-token": k.writeToken } };
  // A read of a lookup nobody has saved leaves no tables behind.
  assert.deepEqual(await (await call(`/v1/p/${k.lookup}`, as)).json(), { grades: {} });
  assert.equal(sqlFor(k.lookup).db.prepare("SELECT COUNT(*) AS n FROM sqlite_master").get().n, 0);
  // Save, read back, a stale save, a stranger, a second grade.
  const rec = await seal(k, "g3", { log: Array.from({ length: 200 }, (_, t) => ({ t, pack: "blends", n: 6 })) });
  assert.equal((await put(call, k.lookup, "g3", 0, rec, k.writeToken)).status, 200);
  const got = await call(`/v1/p/${k.lookup}/g3`, as);
  assert.equal(got.headers.get("x-version"), "1");
  assert.deepEqual(await unseal(k, "g3", new Uint8Array(await got.arrayBuffer())), await unseal(k, "g3", rec));
  assert.equal((await put(call, k.lookup, "g3", 0, rec, k.writeToken)).status, 409);
  assert.equal((await call(`/v1/p/${k.lookup}`, { headers: { "x-write-token": (await keysFor(newKey())).writeToken } })).status, 403);
  assert.equal((await put(call, k.lookup, "k", 0, await seal(k, "k", {}), k.writeToken)).status, 200);
  const p = env.PROFILE.objects.get(k.lookup);
  assert.equal(p.store.bytes(""), rec.length + (await seal(k, "k", {})).length);
  assert.equal(p.store.reserved(), 1);
  assert.deepEqual(await (await call(`/v1/p/${k.lookup}`, as)).json(), { grades: { g3: 1, k: 1 } });
  // Expiry: records gone, owner kept, room given back.
  await p.alarm();
  assert.deepEqual(p.store.list(), []);
  assert.ok(p.store.owner());
  assert.equal(env.SPACE.objects.get("everyone").store.used(), 0);
  // Limits on the real tables: a network's count rolls over by day.
  const lim = new Limiter({ store: limiterStore(sqlFor("limiter-test")) });
  for (let i = 0; i < 3; i++) assert.equal((await lim.fetch(new Request("https://limiter/take?limit=3", { method: "POST" }))).status, 200);
  assert.equal((await lim.fetch(new Request("https://limiter/take?limit=3", { method: "POST" }))).status, 429);
  lim.store.set("2000-01-01", 99);
  assert.equal((await lim.fetch(new Request("https://limiter/take?limit=3", { method: "POST" }))).status, 200);
});
