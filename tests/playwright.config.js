// @ts-check
const { defineConfig, devices } = require( "@playwright/test" );

const PORT = 8765;

module.exports = defineConfig( {
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${ PORT }`,
    trace: "on-first-retry",
  },

  webServer: {
    command: `python3 -m http.server ${ PORT } --directory ../client`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    /* ── Chromium ────────────────────────────────────── */
    {
      name: "chromium-desktop",
      use: {
        ...devices[ "Desktop Chrome" ],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium-portrait",
      use: {
        ...devices[ "iPhone 12" ],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "chromium-landscape",
      use: {
        ...devices[ "iPhone 12 landscape" ],
        viewport: { width: 667, height: 375 },
      },
    },

    /* ── Firefox ─────────────────────────────────────── */
    {
      name: "firefox-desktop",
      use: {
        ...devices[ "Desktop Firefox" ],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "firefox-portrait",
      use: {
        browserName: "firefox",
        viewport: { width: 375, height: 667 },
        hasTouch: true,
      },
    },
    {
      name: "firefox-landscape",
      use: {
        browserName: "firefox",
        viewport: { width: 667, height: 375 },
        hasTouch: true,
      },
    },

    /* ── WebKit ──────────────────────────────────────── */
    {
      name: "webkit-desktop",
      use: {
        ...devices[ "Desktop Safari" ],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "webkit-portrait",
      use: {
        ...devices[ "iPhone 12" ],
        viewport: { width: 375, height: 667 },
        browserName: "webkit",
      },
    },
    {
      name: "webkit-landscape",
      use: {
        ...devices[ "iPhone 12 landscape" ],
        viewport: { width: 667, height: 375 },
        browserName: "webkit",
      },
    },
  ],
} );
