#!/usr/bin/env node
// Captures the viewer screenshots README.md embeds, plus the 1280x640 card
// GitHub and GitLab want for a repository's social preview. Starts a viewer
// of its own on its own port, shoots, stops. Reruns overwrite the same four
// files in place, so `npm run -s viz:shots` is always safe to repeat.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import { ideaFiles, repoRoot } from "./corpus.mjs";

const SHOTS_PORT = 4644;
const ORIGIN = `http://127.0.0.1:${SHOTS_PORT}`;
const BOARD_VIEWPORT = { width: 1600, height: 1000 };
const SOCIAL_VIEWPORT = { width: 1280, height: 640 };
const OUT_DIR = path.join(repoRoot, "assets", "viz");
const READY_TIMEOUT_MS = 20_000;

// The board's own cards are the signal that /api/state has landed and the
// page has painted the corpus. A blind timeout would shoot the empty shell.
const waitForBoard = (page) =>
  page.locator("#board .col .card").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });

// The lane sorts by score, so its first card is the refinery's best idea.
const TOP_RANKED_CARD = '#board .col[data-bucket="4-ranked"] .cards .card';

/** A PNG's pixel size, read straight out of the IHDR chunk. Big-endian
 *  width then height at bytes 16 and 20, the only fields this file needs. */
function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG buffer");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** A blank capture is the failure mode worth catching. A shot of an
 *  unpainted page is one flat colour end to end, which deflates to a tiny,
 *  low-variety byte stream. Sampling the compressed data tells flat from
 *  painted without decoding the image. */
function looksPainted(buffer) {
  const body = buffer.subarray(0x21);
  const seen = new Set();
  const stride = Math.max(1, Math.floor(body.length / 4096));
  for (let i = 0; i < body.length; i += stride) seen.add(body[i]);
  return seen.size > 16;
}

async function startViewer() {
  const child = spawn(process.execPath, ["src/viz/server.mjs", "--port", String(SHOTS_PORT)], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ORIGIN}/api/state`);
      if (res.ok) return child;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`the viewer never answered on ${ORIGIN}`);
}

async function shoot(browser, shot) {
  const context = await browser.newContext({ viewport: shot.viewport, colorScheme: shot.colorScheme });
  const page = await context.newPage();
  try {
    await page.goto(`${ORIGIN}/${shot.hash ?? ""}`, { waitUntil: "networkidle" });
    await shot.ready(page);
    // the overlay fades and rises on open, and a shot taken during that
    // catches the board bleeding through it
    return await page.screenshot({ type: "png", animations: "disabled" });
  } finally {
    await context.close();
  }
}

async function main() {
  if (!ideaFiles("4-ranked").length) throw new Error("the ranked bucket is empty — nothing to shoot");

  const shots = [
    { file: "board-light.png", viewport: BOARD_VIEWPORT, colorScheme: "light", ready: waitForBoard },
    { file: "board-dark.png", viewport: BOARD_VIEWPORT, colorScheme: "dark", ready: waitForBoard },
    {
      file: "idea-view.png",
      viewport: BOARD_VIEWPORT,
      colorScheme: "light",
      // opened by clicking the top card of the ranked lane, the way a
      // reader would, so the shot shows the document floating over the
      // board it came from
      ready: async (page) => {
        await waitForBoard(page);
        const topRanked = page.locator(TOP_RANKED_CARD).first();
        await topRanked.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
        await topRanked.click();
        await page.locator("#overlay-body .prose").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
      },
    },
    { file: "social-preview.png", viewport: SOCIAL_VIEWPORT, colorScheme: "dark", ready: waitForBoard },
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const viewer = await startViewer();
  const browser = await chromium.launch();
  try {
    for (const shot of shots) {
      const png = await shoot(browser, shot);
      const dims = pngDimensions(png);
      if (dims.width !== shot.viewport.width || dims.height !== shot.viewport.height) {
        throw new Error(`${shot.file} captured at ${dims.width}x${dims.height}, expected ${shot.viewport.width}x${shot.viewport.height}`);
      }
      if (!looksPainted(png)) throw new Error(`${shot.file} came out blank`);
      writeFileSync(path.join(OUT_DIR, shot.file), png);
      console.log(`wrote assets/viz/${shot.file} (${dims.width}x${dims.height}, ${png.length} bytes)`);
    }
  } finally {
    await browser.close();
    viewer.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
