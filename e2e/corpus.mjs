// Reads the checkout's own idea buckets straight off disk, so the browser
// assertions compare the page against the corpus it is actually serving
// rather than against numbers frozen into a test file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BUCKETS = [
  "0-seeds",
  "1-scored",
  "2-contested",
  "3-refined",
  "4-ranked",
  "operator-selected",
  "operator-rejected",
  "killed",
  "archive",
];

// A bucket also holds notes the funnel does not track, such as REASONS.md.
// So an idea is a markdown file that opens with a front-matter fence, the
// same rule the viewer's own state route applies.
export function ideaFiles(bucket) {
  const dir = path.join(repoRoot, `ideas-${bucket}`);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => fs.readFileSync(path.join(dir, name), "utf8").startsWith("---\n"))
    .sort();
}

export function bucketCounts() {
  return Object.fromEntries(BUCKETS.map((bucket) => [bucket, ideaFiles(bucket).length]));
}

/** The id of some idea that exists right now, for the document-view tests.
 *  Prefers the deepest funnel bucket that has one, so the shot and the
 *  assertions land on a document with a real score and thread. */
export function anIdeaId() {
  for (const bucket of ["operator-selected", "4-ranked", "3-refined", "2-contested", "1-scored", "0-seeds"]) {
    const file = ideaFiles(bucket)[0];
    if (file) return file.match(/^(idea-\d{4}[a-z]?)/)?.[1] ?? null;
  }
  return null;
}
