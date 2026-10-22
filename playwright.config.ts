import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

// Local/private test targets must bypass any host-level HTTP proxy.
for (const key of ["NO_PROXY", "no_proxy"]) {
  const current = process.env[key] ?? "";
  if (!current.split(",").includes("10.66.66.2")) {
    process.env[key] = [current, "10.66.66.2"].filter(Boolean).join(",");
  }
}

// Some sandboxes cannot install browser system packages system-wide. If the
// repo-local fallback exists, expose it to the browser process.
const bundledLibs = path.join(process.cwd(), ".pwlibs");
if (fs.existsSync(bundledLibs)) {
  process.env.LD_LIBRARY_PATH = [bundledLibs, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":");
  const fontsConf = path.join(bundledLibs, "fonts.conf");
  if (fs.existsSync(fontsConf)) {
    process.env.FONTCONFIG_FILE = fontsConf;
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.E2E_BASE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: `${process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm labs:dev",
      url: `${process.env.NEXT_PUBLIC_LABS_ORIGIN ?? "http://localhost:4310"}/`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
