import { expect, test, type Page, type Route } from '@playwright/test'
import { demo, showSideView, signIn, signInAsRoot, toast } from './support'

// The agent runtime's settings, AI and documents (/admin/runtime), for
// platform administrators. The Core these tests run against has no runtime
// beside it: there the side bar does not offer the page, and the page says
// there is none. With a runtime, played in the browser from its contract
// (its admin routes, and the assertion Core would make for it), root adds a
// model to the school's plan, turns it off, and sets OCR's languages.

const STAMP = Date.now().toString(36)

test.describe('without an agent runtime', () => {
  test('the page says this server has none, and the side bar does not offer it', async ({ page }) => {
    await signInAsRoot(page)
    const side = await showSideView(page, 'Administration')
    await expect(side.getByRole('link', { name: 'Permission presets' })).toBeVisible()
    await expect(side.getByRole('link', { name: 'AI and documents' })).toHaveCount(0)
    await page.goto('/admin/runtime')
    await expect(page.getByRole('heading', { name: 'AI and documents', level: 1 })).toBeVisible()
    await expect(page.getByText('This server has no agent runtime')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })

  test('is a platform administrator’s alone', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto('/admin/runtime')
    await expect(page).toHaveURL(/\/$/)
  })
})

/** A runtime from its contract, answering in the browser; what it was sent is kept. */
function playRuntime(page: Page) {
  const sent: { method: string; path: string; body: any; ifMatch?: string }[] = []
  const offers: any[] = [
    {
      id: 'standard',
      source: 'config',
      label: 'School AI (standard)',
      provider: 'openai',
      adapter: 'openai_chat',
      model: 'gpt-4.1-mini',
      endpoint: null,
      resource: null,
      region: null,
      base_url: null,
      max_output_tokens: null,
      reasoning_effort: null,
      enabled: true,
      status: 'offered',
      priced: true,
      agents: 2,
      key_hint: null,
      key_status: null,
      version: null,
      created_at: null,
      created_by: null,
      updated_at: null,
      updated_by: null,
    },
  ]
  const ocr = {
    available: true,
    unavailable_reason: null,
    unavailable_detail: null,
    enabled: true,
    languages: ['chi_tra', 'eng'],
    default_languages: ['chi_sim', 'chi_tra', 'eng'],
    available_languages: ['chi_sim', 'chi_tra', 'eng', 'jpn'],
    updated_at: null,
    updated_by: null,
  }
  const plan = () => ({
    offers,
    quotas: { per_owner_day: 100, per_asker_day: 20, per_day: null },
    quota_defaults: { per_owner_day: 100, per_asker_day: 20, per_day: null },
    quotas_set: false,
    quotas_updated_at: null,
    quotas_updated_by: null,
  })
  const providers = [
    {
      provider: 'openai',
      label: 'OpenAI',
      adapters: ['openai_chat', 'openai_responses'],
      endpoint: { kind: 'fixed', base_url: 'https://api.openai.com/v1' },
      key_prefix: 'sk-',
      suggested_models: [{ model: 'gpt-4.1-mini', priced: true }],
    },
  ]
  const answer = (route: Route, status: number, json: unknown) => route.fulfill({ status, json })

  async function handle(route: Route) {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/runtime/api/v1', '')
    const method = req.method()
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined
    if (path !== '/info') sent.push({ method, path, body, ifMatch: req.headers()['if-match'] })
    if (path === '/info')
      return answer(route, 200, {
        api: 'aishie-runtime',
        api_version: 1,
        version: 'e2e',
        commit: STAMP,
        audience: 'https://e2e.test/runtime',
        issuer: 'https://e2e.test',
        features: { connect_by_token: true, own_key: true, school_key: true },
      })
    if (path === '/me')
      return answer(route, 200, { actor_id: 'root', display_name: 'root', is_admin: true, hosted_agents: 0 })
    if (path === '/models')
      return answer(route, 200, { own_key: { offered: true, providers }, school_key: { offered: true, offers: [] } })
    if (path === '/admin/school-plan') return answer(route, 200, plan())
    if (path === '/admin/settings') {
      if (method === 'PATCH') {
        if (body.ocr.enabled !== undefined) ocr.enabled = body.ocr.enabled
        if ('languages' in body.ocr) ocr.languages = body.ocr.languages ?? [...ocr.default_languages]
      }
      return answer(route, 200, { ocr })
    }
    if (path === '/admin/school-plan/offers' && method === 'POST') {
      const o = {
        ...offers[0],
        ...body,
        source: 'site',
        endpoint: null,
        agents: 0,
        key_hint: 'sk-…e2e0',
        key_status: 'tested',
        status: 'offered',
        version: 1,
      }
      delete o.key
      offers.push(o)
      return answer(route, 201, o)
    }
    const m = path.match(/^\/admin\/school-plan\/offers\/([^/]+)$/)
    if (m && method === 'PATCH') {
      const o = offers.find((x) => x.id === m[1] && x.source === 'site')
      Object.assign(o, body, { status: body.enabled === false ? 'disabled' : 'offered', version: o.version + 1 })
      return answer(route, 200, o)
    }
    return answer(route, 404, { error: { code: 'not_found', message: 'no route', details: { reason: 'no_route' } } })
  }

  return {
    sent,
    async install() {
      await page.route('**/runtime/api/v1/**', handle)
      await page.route('**/v1/auth/assertion', (route) =>
        answer(route, 200, {
          assertion: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJyb290In0.ZTJl',
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }),
      )
    },
  }
}

test.describe('with an agent runtime', () => {
  test('root adds a model to the school’s plan, turns it off, and sets OCR’s languages', async ({ page }) => {
    const runtime = playRuntime(page)
    await runtime.install()
    await signInAsRoot(page)
    const side = await showSideView(page, 'Administration')
    await side.getByRole('link', { name: 'AI and documents' }).click()
    await expect(page).toHaveURL(/\/admin\/runtime$/)
    await expect(page.getByRole('tab', { name: 'School AI plan' })).toHaveAttribute('aria-selected', 'true')
    const offers = page.locator('.offers-card')
    await expect(offers.locator('[data-offer="config:standard"]')).toContainText('School AI (standard)')
    await expect(offers.getByText('Read-only')).toBeVisible()

    // A model of the site's, with the school's key.
    const KEY = `sk-e2e${STAMP}${'0'.repeat(24)}`
    await offers.getByRole('button', { name: 'Add a model' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a model to the school’s plan' })
    await dialog.getByLabel('ID', { exact: true }).fill(`quick-${STAMP}`)
    await dialog.getByLabel('Name shown to owners').fill('School AI (quick)')
    await dialog.locator('.offer-form__provider').click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: 'OpenAI' }).click()
    await dialog.getByLabel('Model', { exact: true }).fill('gpt-4.1-mini')
    await dialog.getByLabel('The school’s API key').fill(KEY)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(toast(page, 'School AI (quick) is on the school’s plan.')).toBeVisible()
    await expect(dialog).toBeHidden()
    const made = runtime.sent.find((x) => x.method === 'POST')!
    expect(made.body).toEqual({
      id: `quick-${STAMP}`,
      label: 'School AI (quick)',
      provider: 'openai',
      adapter: 'openai_chat',
      model: 'gpt-4.1-mini',
      enabled: true,
      key: KEY,
    })
    // The key went to the runtime once, and is on the page nowhere.
    expect(runtime.sent.filter((x) => JSON.stringify(x).includes(KEY))).toHaveLength(1)
    expect(await page.content()).not.toContain(KEY)
    const row = offers.locator('tr').filter({ has: page.locator(`[data-offer="site:quick-${STAMP}"]`) })
    await expect(row.getByText('sk-…e2e0')).toBeVisible()
    await expect(row.getByText('Tested')).toBeVisible()

    // Turned off, from the keyboard: no agent is on it, so nothing is asked first.
    await row.getByRole('switch', { name: 'Offer School AI (quick) to owners' }).focus()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'School AI (quick) is turned off.')).toBeVisible()
    await expect(row.getByText('Turned off')).toBeVisible()
    const off = runtime.sent.find((x) => x.method === 'PATCH' && x.path.startsWith('/admin/school-plan/offers/'))!
    expect(off.body).toEqual({ enabled: false })
    expect(off.ifMatch).toBe('"1"')

    // OCR reads Japanese too, then the server's languages again.
    await page.getByRole('tab', { name: 'Documents' }).click()
    await expect(page).toHaveURL(/tab=documents/)
    const ocr = page.locator('.ocr-card')
    await expect(ocr.getByText('Read in this order: 繁體中文, English')).toBeVisible()
    const japanese = ocr.getByRole('checkbox', { name: /日本語/ })
    await expect(japanese).not.toBeChecked()
    await ocr.getByText('日本語').click()
    await expect(japanese).toBeChecked()
    await ocr.getByRole('button', { name: 'Save languages' }).click()
    await expect(toast(page, 'OCR reads in 繁體中文, English, 日本語.')).toBeVisible()
    await ocr.getByRole('button', { name: 'Use the server’s default' }).click()
    await expect(ocr.getByText('Read in this order: 简体中文, 繁體中文, English')).toBeVisible()
    expect(runtime.sent.filter((x) => x.path === '/admin/settings' && x.method === 'PATCH').map((x) => x.body)).toEqual(
      [{ ocr: { languages: ['chi_tra', 'eng', 'jpn'] } }, { ocr: { languages: null } }],
    )
  })
})
