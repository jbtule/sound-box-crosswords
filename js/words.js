// Loads the word-list editions (editions.toml) and their packs (packs.toml and
// editions/*.toml, all in the format described at the top of packs.toml). "smol-toml"
// resolves through the import map in the browser, and from node_modules in Node.
import { parse } from "smol-toml";

// Always last: the custom list, saved in localStorage.
const MINE = { name: "Custom", note: "Your own word list. Change it in Settings.", list: "" };

// TOML text → { packs: { id: { name, note, list } } in file order, starter: "..." }.
export function readPacks(text) {
  var data = parse(text), packs = {};
  (data.pack || []).forEach(function (p) { packs[p.id] = { name: p.name, note: p.note, list: p.words }; });
  packs.mine = MINE;
  return { packs: packs, starter: data.custom ? data.custom.words.trim() : "" };
}

// TOML text → [{ id, name, file, keyboard, soundItOut }] in offer order.
export function readEditions(text) {
  return (parse(text).edition || []).map(function (e) {
    return { id: e.id, name: e.name, short: e.short || e.name, file: e.file, keyboard: e.keyboard || "qwerty", soundItOut: e.sound_it_out === true, raw: e };
  });
}

// Where an edition's saved data lives. packs.toml's edition keeps the plain prefix it had
// before there were editions, so existing progress stays put.
export function storagePrefix(edition) {
  return edition.file === "packs.toml" ? "sbx:" : "sbx:" + edition.id + ":";
}

// Fetches a site file, carrying this module's ?v= cache-busting stamp (added at deploy).
async function fetchText(file) {
  var url = new URL("../" + file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  var res = await fetch(url);
  if (!res.ok) throw new Error(file + ": HTTP " + res.status);
  return res.text();
}

export async function loadEditions() { return readEditions(await fetchText("editions.toml")); }
export async function loadPacks(file) { return readPacks(await fetchText(file || "packs.toml")); }
