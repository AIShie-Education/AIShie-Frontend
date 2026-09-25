import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run the app against a real Core. They make their own
// demonstration course first (e2e/global-setup.ts), so they need a Core that
// may be written to — never one people use:
//
//   E2E_CORE_URL=http://localhost:8080 E2E_ROOT_TOKEN=ais_… E2E_PASSWORD=… npm run e2e
//
// The dev server is started (or reused) with its proxy pointed at that Core.
const core = process.env.E2E_CORE_URL || 'http://localhost:8080'
const port = Number(process.env.E2E_PORT || 5173)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    env: { AISHITERU_API_TARGET: core },
  },
})
