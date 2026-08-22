// src/front-matter.mjs — the one parser for the refinery's front matter.
//
// Refinery front matter is plain "key: value" lines between --- fences, plus
// the one list shape "tags: [a, b]". Values are raw strings, never coerced,
// so a title or url passes through byte-for-byte. A YAML parser would quote,
// coerce and re-type these values; this stays a line grammar on purpose.

// Returns { fm, body } for a doc that opens with a --- fence, else null.
export function parseFrontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  return { fm: match[1], body: raw.slice(match[0].length) };
}

// The raw value of a "key: value" line, trimmed, or null when absent.
export function fmField(fm, key) {
  const match = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

// The entries of a "tags: [a, b]" line, or [] when absent or empty.
export function fmTags(fm) {
  const match = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
