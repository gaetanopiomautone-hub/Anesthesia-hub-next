import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser sotto `node_modules/.cache/playwright` quando possibile.
 * Alcuni ambienti (es. agent) impostano `PLAYWRIGHT_BROWSERS_PATH` verso una cache senza binari: forziamo `0`.
 */
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
if (!browsersPath || browsersPath.includes("cursor-sandbox")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
}

loadEnvConfig(process.cwd());

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000";

/**
 * E2E: avviare l’app prima (`npm run dev` o `npm run build && npm run start`),
 * oppure `PLAYWRIGHT_START_SERVER=1 npm run e2e` per avvio automatico di `next dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.PLAYWRIGHT_START_SERVER === "1"
      ? {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : undefined,
});
