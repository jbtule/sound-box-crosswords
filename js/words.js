// Loads the word packs from packs.toml. See the comments at the top of that file
// for the format. "smol-toml" resolves through the import map in index.html in the
// browser, and from node_modules in Node (scripts/check.mjs).
import { parse } from "smol-toml";

// Always last: the grown-up's own list, saved in localStorage.
const MINE = { name: "My words", note: "Your own list. Change it under Grown-ups.", list: "" };

// TOML text → { packs: { id: { name, note, list } } in file order, starter: "..." }.
export function readPacks(text) {
  var data = parse(text), packs = {};
  (data.pack || []).forEach(function (p) { packs[p.id] = { name: p.name, note: p.note, list: p.words }; });
  packs.mine = MINE;
  return { packs: packs, starter: data.custom ? data.custom.words.trim() : "" };
}

export async function loadPacks() {
  var res = await fetch(new URL("../packs.toml", import.meta.url));
  if (!res.ok) throw new Error("packs.toml: HTTP " + res.status);
  return readPacks(await res.text());
}
