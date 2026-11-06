// Tests for js/seal.js (sealing sync records). Run by `npm run check`, or alone:
// node --test scripts/seal.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { newKey, isKey, keysFor, seal, unseal, linkFor, keyFromLink, FORMAT, KEY_CHARS } from "../js/seal.js";

test("a new key is 43 base64url characters, different every time", () => {
  const a = newKey(), b = newKey();
  assert.equal(a.length, KEY_CHARS);
  assert.ok(isKey(a));
  assert.notEqual(a, b);
});

test("the same key always gives the same lookup ID, which isn't the key", async () => {
  const k = newKey();
  const [x, y] = [await keysFor(k), await keysFor(k)];
  assert.equal(x.lookup, y.lookup);
  assert.equal(x.lookup.length, 43);
  assert.notEqual(x.lookup, k);
  assert.notEqual((await keysFor(newKey())).lookup, x.lookup);
});

test("a record round-trips, sealed small and unreadable", async () => {
  const keys = await keysFor(newKey());
  const value = { progress: { blends: { done: { frog: 1, stop: 1 } } }, log: Array.from({ length: 200 }, (_, t) => ({ t, pack: "blends", n: 6, m: 0 })) };
  const sealed = await seal(keys, "g3", value);
  assert.equal(sealed[0], FORMAT);
  assert.ok(sealed.length < JSON.stringify(value).length / 3, "compressed");
  assert.ok(!new TextDecoder().decode(sealed).includes("frog"));
  assert.deepEqual(await unseal(keys, "g3", sealed), value);
  // A fresh IV each time: the same value seals differently.
  assert.notDeepEqual(await seal(keys, "g3", value), sealed);
});

test("a record won't open as another grade's, another profile's, or once changed", async () => {
  const keys = await keysFor(newKey()), other = await keysFor(newKey());
  const sealed = await seal(keys, "g3", { a: 1 });
  await assert.rejects(unseal(keys, "kindergarten", sealed));
  await assert.rejects(unseal(other, "g3", sealed));
  const bent = sealed.slice(); bent[bent.length - 1] ^= 1;
  await assert.rejects(unseal(keys, "g3", bent));
  const wrongFormat = sealed.slice(); wrongFormat[0] = 2;
  await assert.rejects(unseal(keys, "g3", wrongFormat));
});

test("the link carries the key after #, and only a whole key is read back", () => {
  const k = newKey(), site = "https://tools.tuley.name/sound-box-crosswords/";
  const link = linkFor(site + "#old", k);
  assert.equal(link, site + "#link=" + k);
  assert.equal(keyFromLink(link), k);
  assert.equal(keyFromLink("look: " + link + " (from Sam's iPad)"), k);
  assert.equal(keyFromLink(site + "#link=" + k.slice(1)), null);
  assert.equal(keyFromLink(site + "#link=" + k + "x"), null);
  assert.equal(keyFromLink(""), null);
});
