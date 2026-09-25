import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Makes a fresh demonstration course for this run and leaves its ids and
// tokens in e2e/.demo.json for the tests.
export default function globalSetup() {
  const core = process.env.E2E_CORE_URL || 'http://localhost:8080'
  const root = process.env.E2E_ROOT_TOKEN
  const password = process.env.E2E_PASSWORD
  const out = resolve(here, '.demo.json')
  if (process.env.E2E_REUSE_DEMO && existsSync(out)) return
  if (!root || !password) {
    throw new Error('E2E_ROOT_TOKEN and E2E_PASSWORD are required (see playwright.config.ts)')
  }
  execFileSync('node', [resolve(here, '../scripts/seed-demo.mjs'), '--out', out], {
    env: { ...process.env, CORE_URL: core, ROOT_TOKEN: root, DEMO_PASSWORD: password, DEMO_TAG: `e2e${Date.now().toString(36)}` },
    stdio: 'inherit',
  })
}
