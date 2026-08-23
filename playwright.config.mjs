// playwright.config.mjs — the browser smoke layer for the refinery viewer.
//
// The suite lives in e2e/ rather than test/ so `npm run -s check` stays a
// pure-Node gate with no browser to download. Playwright starts its own
// viewer on a port the operator's own `npm run -s viz` never uses, reading
// this checkout's real corpus.
import { defineConfig, devices } from "@playwright/test";

export const VIZ_PORT = 4643;
export const VIZ_ORIGIN = `http://127.0.0.1:${VIZ_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: VIZ_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node src/viz/server.mjs --port ${VIZ_PORT}`,
    url: VIZ_ORIGIN,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
