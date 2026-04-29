import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";

function resolveChromiumExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const fallback = path.join(
    process.cwd(),
    ".playwright-browsers/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  );
  if (fs.existsSync(fallback)) return fallback;
  return undefined;
}

const chromiumExecutablePath = resolveChromiumExecutable();
const headless = process.env.PLAYWRIGHT_HEADED === "1" ? false : true;
const launchOptions = chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {};

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/logo-visual.spec.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ["json", { outputFile: "playwright/test-results/logo-visual/report.json" }],
  ],
  use: {
    baseURL,
    headless,
    launchOptions,
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_VIDEO === "1" ? "retain-on-failure" : "off",
  },
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
    ? {}
    : {
        webServer:
          process.env.PLAYWRIGHT_START_API === "1"
            ? [
                {
                  command: "npm run dev",
                  url: baseURL,
                  reuseExistingServer: true,
                  timeout: 120_000,
                },
                {
                  command: "npm run server",
                  url: "http://localhost:5179/api/health",
                  reuseExistingServer: true,
                  timeout: 90_000,
                },
              ]
            : {
                command: "npm run dev",
                url: baseURL,
                reuseExistingServer: true,
                timeout: 120_000,
              },
      }),
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "logo-visual-chromium-desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      name: "logo-visual-chromium-mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 812 },
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  outputDir: "playwright/test-results/logo-visual",
});
