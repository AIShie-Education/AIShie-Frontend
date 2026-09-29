import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run the app against a real Core. They make their own
// demonstration course first (e2e/global-setup.ts), so they need a Core that
// may be written to — never one people use. scripts/ci-core.sh starts one:
//
//   E2E_CORE_URL=http://localhost:8080 E2E_ROOT_TOKEN=ais_… E2E_PASSWORD=… npm run e2e
//
// E2E_ROOT_TOKEN is root's signed-in session (the ais_session cookie of a
// POST /v1/auth/login), not an API token: people hold none. E2E_PASSWORD is
// root's password, which root signs in to the app with, and the one the
// tests give the people they register.
//
// The dev server is started (or reused) with its proxy pointed at that Core.
// With E2E_PREVIEW set, the build in dist/ is served instead (vite preview,
// with the same proxy): CI does that, so that the tests pass on the very
// files it deploys.
const core = process.env.E2E_CORE_URL || 'http://localhost:8080'
const port = Number(process.env.E2E_PORT || 5173)
const serve = process.env.E2E_PREVIEW ? 'vite preview' : 'vite'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // In CI, failures are also annotated on the run, and the HTML report is
  // kept with the traces for the job to upload.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx ${serve} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    env: { AISHIE_API_TARGET: core },
  },
})
