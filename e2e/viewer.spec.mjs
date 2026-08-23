// Browser smoke for the refinery viewer: the board is the corpus, a card
// opens its document as an overlay on the lanes, the deep link works cold,
// reports fill the viewport with idea ids linked through to the overlay,
// both themes paint, and nothing but GET gets through.
import { expect, test } from "@playwright/test";

import { BUCKETS, anIdeaId, bucketCounts } from "./corpus.mjs";

async function openBoard(page) {
  await page.goto("/");
  await expect(page.locator("#board .col")).toHaveCount(BUCKETS.length);
}

test("the board shows every bucket with the corpus's own counts", async ({ page }) => {
  await openBoard(page);
  const counts = bucketCounts();
  for (const bucket of BUCKETS) {
    const column = page.locator(`#board .col[data-bucket="${bucket}"]`);
    await expect(column.locator("header .count")).toHaveText(String(counts[bucket]));
    await expect(column.locator(".cards .card")).toHaveCount(counts[bucket]);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(0);
});

test("the header carries the read-only statement and the repo path", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#read-only")).toHaveText("Read-only. Changes happen in Claude Code.");
  await expect(page.locator("#repo-path")).not.toBeEmpty();
});

test("a card opens its document as an overlay; Escape returns to the board", async ({ page }) => {
  await openBoard(page);
  const card = page.locator("#board .card").first();
  const id = await card.getAttribute("data-id");
  await card.click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("#board")).toBeVisible();
  await expect(page.locator("#overlay .doc-id")).toHaveText(id);
  await expect(page.locator("#overlay .prose").first()).not.toBeEmpty();
  await expect(page.locator("#overlay #thread")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay")).toBeHidden();
  await expect(page).toHaveURL(/#board$/);
  await expect(page.locator("#board")).toBeVisible();
});

test("an #idea-NNNN deep link opens the overlay cold, lanes behind it", async ({ page }) => {
  const id = anIdeaId();
  expect(id, "the corpus has at least one idea document").toBeTruthy();
  await page.goto(`/#${id}`);
  await expect(page.locator("#overlay .doc-id")).toHaveText(id);
  await expect(page.locator("#overlay .view-head h1")).not.toBeEmpty();
  await expect(page.locator("#board")).toBeVisible();
});

test("the Ranked tab fills the viewport and its idea ids open the overlay", async ({ page }) => {
  await page.goto("/");
  await page.locator('#tabs a[data-tab="ranked"]').click();
  await expect(page.locator("#view .view-head h1")).toHaveText("Ranked");
  await expect(page.locator("#view .prose table")).toBeVisible();

  const viewBox = await page.locator("#view").boundingBox();
  expect(viewBox.width).toBeGreaterThanOrEqual(page.viewportSize().width - 2);

  const link = page.locator("#view-body a.idea-link").first();
  const id = await link.textContent();
  await link.click();
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("#overlay .doc-id")).toHaveText(id);

  await page.locator("#overlay-close").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await expect(page).toHaveURL(/#ranked$/);
  await expect(page.locator("#view .view-head h1")).toHaveText("Ranked");
});

test("a report's close button lands back on the board", async ({ page }) => {
  await page.goto("/#ranked");
  await expect(page.locator("#view")).toBeVisible();
  await page.locator("#view-close").click();
  await expect(page.locator("#view")).toBeHidden();
  await expect(page.locator("#board .col")).toHaveCount(BUCKETS.length);
});

for (const colorScheme of ["light", "dark"]) {
  test(`the board paints in ${colorScheme}`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    try {
      await openBoard(page);
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const ink = await page.evaluate(() => getComputedStyle(document.body).color);
      expect(background).not.toBe(ink);
      await expect(page.locator("#board .card").first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("a POST is refused", async ({ request }) => {
  for (const path of ["/", "/api/state"]) {
    const response = await request.post(path, { failOnStatusCode: false });
    expect(response.status(), `POST ${path}`).toBe(405);
    expect(response.headers().allow).toBe("GET");
  }
});
