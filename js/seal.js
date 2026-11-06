// No DOM. Sealing a profile's sync records so the sync server (sync/) stores them without
// being able to read or change them. Only the browser's own Web Crypto (also in Node, for
// the tests); nothing calls it yet.
//
// A profile key is 32 random bytes, written as 43 base64url characters: short enough for a
// small QR code, and it travels only in a link's #fragment, which never reaches a server.
// From it, HKDF-SHA-256 makes three things: the lookup ID (all the server sees; it can't work
// back to the key), the AES-256-GCM key that seals each record, and a write token sent with
// every save (the server keeps only its hash and takes saves only with it). A sealed record is
//   [format 1][12-byte random IV][gzip'd JSON, encrypted, with GCM's 16-byte tag]
// and its "additional data" names the lookup ID, the grade and the format, so a record
// can't be passed off as another profile's or another grade's.
export const FORMAT = 1;
export const KEY_CHARS = 43;
const IV_BYTES = 12;
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function toB64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(text) {
  const s = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export const isKey = (k) => typeof k === "string" && /^[A-Za-z0-9_-]{43}$/.test(k);

export function newKey() {
  return toB64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

// The lookup ID (string), the sealing key (CryptoKey) and the write token for a profile key.
export async function keysFor(key) {
  if (!isKey(key)) throw new Error("not a profile key");
  const base = await subtle().importKey("raw", fromB64url(key), "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (label) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(label) });
  const lookup = toB64url(new Uint8Array(await subtle().deriveBits(hkdf("sbx lookup v1"), base, 256)));
  const sealKey = await subtle().deriveKey(hkdf("sbx seal v1"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  // Sent with every save; the server keeps only its hash and refuses saves without it.
  const writeToken = toB64url(new Uint8Array(await subtle().deriveBits(hkdf("sbx write v1"), base, 256)));
  return { lookup, sealKey, writeToken };
}

const aad = (lookup, grade) => enc.encode(`sbx|${FORMAT}|${lookup}|${grade}`);

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function seal(keys, grade, value) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const packed = await pipe(enc.encode(JSON.stringify(value)), new CompressionStream("gzip"));
  const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(keys.lookup, grade) }, keys.sealKey, packed));
  const out = new Uint8Array(1 + IV_BYTES + sealed.length);
  out[0] = FORMAT; out.set(iv, 1); out.set(sealed, 1 + IV_BYTES);
  return out;
}

// Throws if the record isn't this profile's and grade's, or was changed.
export async function unseal(keys, grade, bytes) {
  const b = new Uint8Array(bytes);
  if (b[0] !== FORMAT || b.length < 1 + IV_BYTES + 16) throw new Error("not a sealed record");
  const packed = await subtle().decrypt({ name: "AES-GCM", iv: b.subarray(1, 1 + IV_BYTES), additionalData: aad(keys.lookup, grade) }, keys.sealKey, b.subarray(1 + IV_BYTES));
  return JSON.parse(new TextDecoder().decode(await pipe(packed, new DecompressionStream("gzip"))));
}

// The link Send shows (and its QR code holds): the site's address with the key after #link=.
export function linkFor(site, key) { return site.replace(/#.*$/, "") + "#link=" + key; }
export function keyFromLink(text) {
  const m = String(text || "").match(/#link=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}
