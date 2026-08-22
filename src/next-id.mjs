#!/usr/bin/env node
// src/next-id.mjs — prints the next zero-padded idea id.
//
// Scans every file in the ideas-* buckets (all of them, including
// ideas-killed and ideas-archive) for an idea-NNNN pattern in the filename
// and prints one past the highest number found, or idea-0001 on an empty
// tree.

import fs from "node:fs";
import path from "node:path";

const ID_PATTERN = /idea-(\d{4})/g;

function highestId() {
  let max = 0;
  for (const file of fs.globSync("ideas-*/**/*")) {
    for (const match of path.basename(file).matchAll(ID_PATTERN)) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

const next = highestId() + 1;
console.log(`idea-${String(next).padStart(4, "0")}`);
