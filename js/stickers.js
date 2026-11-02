// Stickers for picture-less (listen-only) words in the picture collection: sound-themed so
// they still mean "you heard it", and different from each other on a pack's page so it
// isn't a row of identical waves. None of these may be a pack word's picture (the check
// enforces it), so a sticker never looks like a different word. (Its own module, not
// words.js: that one loads the TOML parser from the CDN and is imported lazily.)
export const LISTEN_STICKERS = ["🎷", "🎺", "🎸", "🎻", "🪕", "🪗", "🪈", "🪇", "🎵", "🎶", "🎼"];

// { word: sticker } for a pack's entries: picture-less words in pack order get the
// stickers in turn, so a page shows up to 11 different ones.
export function listenStickers(entries) {
  var out = {}, n = 0;
  entries.forEach(function (e) { if (!e.pic) out[e.w] = LISTEN_STICKERS[n++ % LISTEN_STICKERS.length]; });
  return out;
}
