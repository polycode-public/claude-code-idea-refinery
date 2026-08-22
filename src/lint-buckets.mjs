// Bucket integrity linter. One idea id lives in exactly one bucket, and a bucket
// implies its status. Prints one line per violation and exits non-zero on any,
// because a duplicate id across buckets has corrupted the ranking twice already.
import fs from "node:fs";
import path from "node:path";
import { parseFrontMatter, fmField } from "./front-matter.mjs";

const ROOT = process.argv[2] || ".";

const BUCKET_STATUS = {
  "0-seeds": ["seeded"],
  "1-scored": ["scored"],
  "2-contested": ["contested"],
  "3-refined": ["refined"],
  "4-ranked": ["ranked"],
  killed: ["killed"],
  archive: ["split", "merged"],
  "operator-rejected": ["rejected"],
  "operator-selected": ["seeded", "scored", "contested", "refined", "ranked"],
};

function statusOf(file) {
  const parsed = parseFrontMatter(fs.readFileSync(file, "utf8"));
  return parsed ? fmField(parsed.fm, "status") : null;
}

const seen = new Map();
const violations = [];

for (const bucket of Object.keys(BUCKET_STATUS)) {
  const dir = path.join(ROOT, `ideas-${bucket}`);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).sort()) {
    const m = name.match(/^(idea-\d{4}[a-z]?)-.*\.md$/) || name.match(/^(idea-\d{4}[a-z]?)\.md$/);
    if (!m) continue;
    const id = m[1];
    const file = path.join(dir, name);
    if (seen.has(id)) {
      violations.push(`duplicate: ${id} in ${seen.get(id)} and ${bucket}`);
    } else {
      seen.set(id, bucket);
    }
    const status = statusOf(file);
    if (!BUCKET_STATUS[bucket].includes(status)) {
      violations.push(`status: ${id} in ${bucket} has status ${status}, expected one of ${BUCKET_STATUS[bucket].join("|")}`);
    }
  }
}

for (const v of violations) console.log(v);
process.exit(violations.length ? 1 : 0);
