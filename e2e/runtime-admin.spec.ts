import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import {
  call,
  demo,
  expectToasted,
  keepToasts,
  photograph,
  root,
  showSideView,
  signIn,
  signInAsRoot,
  wordsBelowAA,
} from './support'

// The agent runtime's settings, AI and documents (/admin/runtime), for
// platform administrators. The Core these tests run against has no runtime
// beside it: there the side bar does not offer the page, and the page says
// there is none. With a runtime, played in the browser from its contract
// (its admin routes, and the assertion Core would make for it), root adds a
// model to the school's plan, turns it off, adds a price, and sets OCR's
// languages; and sets up the transcriber of documents' text versions,
// giving it a credential the real Core issues, which the played runtime
// receives and the page never shows, and revoking it again; and adds a
// model of OpenRouter's with its upstream routing, chosen from the upstream
// providers the played runtime lists (OpenRouter itself is never called),
// sets their order from the keyboard, on a phone, and where the table folds
// each upstream provider's figures under its name (a window narrower than
// it, a touch screen), and adds one without it on a runtime that does not
// take upstream routing yet.
// What the page said of each write is checked from the messages it kept
// (keepToasts), as a message closes itself after 3 s, which a busy machine
// can let pass before the check.

const STAMP = Date.now().toString(36)

test.describe('without an agent runtime', () => {
  test('the page says this server has none, and the side bar does not offer it', async ({ page }) => {
    await signInAsRoot(page)
    const side = await showSideView(page, 'Administration')
    await expect(side.getByRole('link', { name: 'Permission presets' })).toBeVisible()
    await expect(side.getByRole('link', { name: 'AI and documents' })).toHaveCount(0)
    await page.goto('/admin/runtime')
    await expect(page.getByRole('heading', { name: 'AI and documents', level: 1 })).toBeVisible()
    await expect(page.getByText('This server has no agent service')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })

  test('is a platform administrator’s alone', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto('/admin/runtime')
    await expect(page).toHaveURL(/\/$/)
  })
})

/** The model the played runtime lists OpenRouter's upstream providers for. */
const LLAMA = 'meta-llama/llama-3.3-70b-instruct'

/** One upstream provider's endpoint, as the runtime answers GET admin/openrouter/endpoints. */
function upstream(over: Record<string, unknown>) {
  return {
    slug: 'groq',
    provider: 'groq',
    provider_name: 'Groq',
    quantization: 'unknown',
    usd_per_mtok: { input: '0.590000', output: '0.790000', cache_read: null, cache_write: null },
    usd_per_request: null,
    usd_per_image: null,
    discount: 0,
    higher_above_tokens: null,
    context_length: 131072,
    max_output_tokens: 32768,
    max_prompt_tokens: null,
    tools: true,
    tool_choice: true,
    reasoning: false,
    zdr: true,
    status: 0,
    uptime_30m: 99.26,
    uptime_1d: 99.1,
    latency: null,
    throughput: null,
    headquarters: 'US',
    datacenters: ['US'],
    privacy_policy_url: 'https://groq.com/privacy-policy/',
    terms_of_service_url: 'https://groq.com/terms-of-use/',
    status_page_url: 'https://groqstatus.com/',
    ...over,
  }
}

/** The four upstream providers (five endpoints: Google Vertex's base slug and one region) the unit tests' fixture has. */
const UPSTREAMS = {
  model: LLAMA,
  name: 'Meta: Llama 3.3 70B Instruct',
  fetched_at: new Date().toISOString(),
  stale: false,
  price: null,
  endpoints: [
    upstream({}),
    upstream({
      slug: 'deepinfra/turbo',
      provider: 'deepinfra',
      provider_name: 'DeepInfra',
      quantization: 'fp8',
      usd_per_mtok: { input: '0.100000', output: '0.320000', cache_read: null, cache_write: null },
      discount: 0.2,
      max_output_tokens: 16384,
      zdr: false,
      uptime_30m: 98.85,
      uptime_1d: 98.48,
      privacy_policy_url: 'https://deepinfra.com/privacy',
      terms_of_service_url: 'https://deepinfra.com/terms',
      status_page_url: 'https://status.deepinfra.com/',
    }),
    upstream({
      slug: 'cloudflare/fp8',
      provider: 'cloudflare',
      provider_name: 'Cloudflare',
      quantization: 'fp8',
      usd_per_mtok: { input: '0.293000', output: '2.253000', cache_read: null, cache_write: null },
      context_length: 24000,
      max_output_tokens: 21600,
      tools: false,
      tool_choice: false,
      zdr: false,
      uptime_30m: 99.43,
      uptime_1d: 99.2,
    }),
    upstream({
      slug: 'google-vertex',
      provider: 'google-vertex',
      provider_name: 'Google',
      usd_per_mtok: { input: '0.720000', output: '0.720000', cache_read: '0.360000', cache_write: null },
      context_length: 128000,
      max_output_tokens: 115200,
      zdr: false,
      uptime_30m: null,
      uptime_1d: null,
    }),
    upstream({
      slug: 'google-vertex/us-central1',
      provider: 'google-vertex',
      provider_name: 'Google',
      usd_per_mtok: { input: '0.720000', output: '0.720000', cache_read: '0.360000', cache_write: null },
      context_length: 128000,
      max_output_tokens: 8192,
      zdr: false,
      status: -1,
      uptime_30m: null,
      uptime_1d: null,
    }),
  ],
}

/** A runtime from its contract, answering in the browser; what it was sent is kept. */
function playRuntime(page: Page) {
  const sent: { method: string; path: string; body: any; ifMatch?: string }[] = []
  /** A refusal the next offer's PATCH is answered with, once. */
  let refuseNextPatch: { status: number; code: string; reason: string; field: string } | null = null
  /** A runtime from before upstream routing: no list of upstream providers, and an offer's routing an unknown member. */
  let noRouting = false
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
      openrouter: null,
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
  const noCredential = {
    status: 'none',
    hint: null,
    credential_id: null,
    set_at: null,
    set_by: null,
    last_ok_at: null,
    last_error: null,
  }
  const transcription: any = {
    available: true,
    unavailable_reason: null,
    unavailable_detail: null,
    enabled: false,
    offer: null,
    offer_status: null,
    max_pages: 300,
    per_day_pages: null,
    concurrency: 2,
    credential: { ...noCredential },
    state: 'off',
    blocked_reason: null,
    today: { pages: 0, documents: 0, failed: 0, skipped: 0, cost_usd: '0.000000' },
    updated_at: null,
    updated_by: null,
  }
  /** Its state and why it is blocked, as the runtime works them out. */
  const settleTranscription = () => {
    const blocked = !transcription.offer
      ? 'no_offer'
      : transcription.credential.status === 'none'
        ? 'no_credential'
        : null
    transcription.state = !transcription.enabled ? 'off' : blocked ? 'blocked' : 'running'
    transcription.blocked_reason = transcription.enabled ? blocked : null
  }
  const jobs = [
    {
      id: 'job-e2e-1',
      version_id: '0192f3c1-0000-7000-8000-000000000001',
      document_id: '0192f3c1-0000-7000-8000-000000000002',
      course_id: '0192f3c1-0000-7000-8000-000000000003',
      status: 'skipped',
      reason: 'too_many_pages',
      backfill: false,
      content_type: 'application/pdf',
      byte_size: 9_000_000,
      pages: 812,
      offer: 'standard',
      model: 'gpt-4.1-mini',
      cost_usd: null,
      input_tokens: null,
      output_tokens: null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    },
  ]
  const plan = () => ({
    offers,
    quotas: { per_owner_day: 100, per_asker_day: 20, per_day: null },
    quota_defaults: { per_owner_day: 100, per_asker_day: 20, per_day: null },
    quotas_set: false,
    quotas_updated_at: null,
    quotas_updated_by: null,
  })
  const prices: any = {
    version: '2026-09-27',
    file_version: '2026-09-27',
    site_version: null,
    site_changed_at: null,
    rows: [
      {
        id: '0',
        source: 'file',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        glob: false,
        from: '2026-01-01',
        usd_per_mtok: { input: '0.4', cache_read: '0.1', cache_write: '0.4', output: '1.6' },
        version: '2026-09-27/0',
        overridden: false,
        row_version: null,
        created_at: null,
        created_by: null,
        updated_at: null,
        updated_by: null,
      },
    ],
    unpriced_offers: [],
  }
  const providers = [
    {
      provider: 'openai',
      label: 'OpenAI',
      adapters: ['openai_chat', 'openai_responses'],
      endpoint: { kind: 'fixed', base_url: 'https://api.openai.com/v1' },
      key_prefix: 'sk-',
      suggested_models: [{ model: 'gpt-4.1-mini', priced: true }],
    },
    {
      provider: 'openrouter',
      label: 'OpenRouter',
      adapters: ['openai_chat'],
      endpoint: { kind: 'fixed', base_url: 'https://openrouter.ai/api/v1' },
      key_prefix: 'sk-or-',
      suggested_models: [],
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
        features: { host_by_id: true, own_key: true, school_key: true },
      })
    if (path === '/me')
      return answer(route, 200, { actor_id: 'root', display_name: 'root', is_admin: true, hosted_agents: 0 })
    if (path === '/models')
      return answer(route, 200, { own_key: { offered: true, providers }, school_key: { offered: true, offers: [] } })
    if (path === '/admin/school-plan') return answer(route, 200, plan())
    if (path === '/admin/prices' && method === 'GET') return answer(route, 200, prices)
    if (path === '/admin/prices' && method === 'POST') {
      const row = {
        ...prices.rows[0],
        ...body,
        source: 'site',
        glob: false,
        usd_per_mtok: {
          ...body.usd_per_mtok,
          cache_read: body.usd_per_mtok.input,
          cache_write: body.usd_per_mtok.input,
        },
        version: `site-e2e/${body.id}`,
        row_version: 1,
      }
      prices.rows.unshift(row)
      return answer(route, 201, row)
    }
    if (path === '/admin/settings') {
      if (method === 'PATCH' && body.ocr) {
        if (body.ocr.enabled !== undefined) ocr.enabled = body.ocr.enabled
        if ('languages' in body.ocr) ocr.languages = body.ocr.languages ?? [...ocr.default_languages]
      }
      if (method === 'PATCH' && body.transcription) {
        Object.assign(transcription, body.transcription)
        if ('offer' in body.transcription) transcription.offer_status = body.transcription.offer ? 'ok' : null
        settleTranscription()
      }
      return answer(route, 200, { ocr, transcription })
    }
    if (path === '/admin/transcription/credential' && method === 'PUT') {
      // The runtime would try it against Core first: a service token of Core's shape is taken here.
      if (!/^aissvc_[a-z2-7]{12}_[A-Za-z0-9_-]{43}$/.test(body.token))
        return answer(route, 400, {
          error: {
            code: 'invalid_argument',
            message: 'not a token',
            details: { reason: 'invalid_field', field: '/token' },
          },
        })
      transcription.credential = {
        status: 'ok',
        hint: `${body.token.slice(0, 'aissvc_'.length + 12)}…`,
        credential_id: body.credential_id ?? null,
        set_at: new Date().toISOString(),
        set_by: null,
        last_ok_at: new Date().toISOString(),
        last_error: null,
      }
      settleTranscription()
      return answer(route, 200, transcription)
    }
    if (path === '/admin/transcription/credential' && method === 'DELETE') {
      transcription.credential = { ...noCredential }
      settleTranscription()
      return answer(route, 200, transcription)
    }
    if (path === '/admin/transcription/jobs') return answer(route, 200, { jobs, next: null })
    // OpenRouter's upstream providers, for the one model it lists here; any other it has not.
    if (path === '/admin/openrouter/endpoints' && !noRouting) {
      const model = new URL(req.url()).searchParams.get('model')
      if (model === LLAMA) return answer(route, 200, UPSTREAMS)
      return answer(route, 404, {
        error: {
          code: 'not_found',
          message: 'OpenRouter has no such model',
          details: { reason: 'openrouter_model_not_found', field: 'model' },
        },
      })
    }
    if (noRouting && path.startsWith('/admin/school-plan/offers') && body && 'openrouter' in body)
      return answer(route, 400, {
        error: {
          code: 'invalid_argument',
          message: 'unknown field "openrouter"',
          details: { reason: 'unknown_field', field: '/openrouter' },
        },
      })
    if (path === '/admin/school-plan/offers' && method === 'POST') {
      const o = {
        ...offers[0],
        ...body,
        openrouter: body.openrouter ?? null,
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
      if (refuseNextPatch) {
        const r = refuseNextPatch
        refuseNextPatch = null
        return answer(route, r.status, {
          error: { code: r.code, message: 'refused', details: { reason: r.reason, field: r.field } },
        })
      }
      const o = offers.find((x) => x.id === m[1] && x.source === 'site')
      // The routing sent replaces the one kept, null removing it.
      Object.assign(o, body, { status: body.enabled === false ? 'disabled' : 'offered', version: o.version + 1 })
      return answer(route, 200, o)
    }
    return answer(route, 404, { error: { code: 'not_found', message: 'no route', details: { reason: 'no_route' } } })
  }

  return {
    sent,
    refuseNextPatch(r: { status: number; code: string; reason: string; field: string }) {
      refuseNextPatch = r
    },
    /** Plays a runtime from before upstream routing. */
    takeNoRouting() {
      noRouting = true
    },
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
  test('root adds a model to the school’s plan, turns it off, prices a model, and sets OCR’s languages', async ({
    page,
  }) => {
    const runtime = playRuntime(page)
    await runtime.install()
    await keepToasts(page)
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
    await expectToasted(page, 'School AI (quick) is on the school’s plan.')
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
    await expectToasted(page, 'School AI (quick) is turned off.')
    await expect(row.getByText('Turned off')).toBeVisible()
    const off = runtime.sent.find((x) => x.method === 'PATCH' && x.path.startsWith('/admin/school-plan/offers/'))!
    expect(off.body).toEqual({ enabled: false })
    expect(off.ifMatch).toBe('"1"')

    // A price of the site's, from today, its ID made from the model and the day.
    await page.getByRole('tab', { name: 'Pricing' }).click()
    await expect(page).toHaveURL(/tab=pricing/)
    const priceCard = page.locator('.prices-card')
    await expect(priceCard.getByText('Server’s price file', { exact: true })).toBeVisible()
    await priceCard.getByRole('button', { name: 'Add a price' }).click()
    const priceDialog = page.getByRole('dialog', { name: 'Add a price' })
    await priceDialog.locator('.price-form__provider').click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: 'OpenAI' }).click()
    await priceDialog.getByLabel('Model', { exact: true }).fill('gpt-4.1-nano')
    await priceDialog.getByLabel('Input', { exact: true }).fill('0.1')
    await priceDialog.getByLabel('Output', { exact: true }).fill('0.4')
    const today = new Date().toISOString().slice(0, 10)
    await expect(priceDialog.getByLabel('ID', { exact: true })).toHaveValue(`gpt-4.1-nano-${today}`)
    await priceDialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expectToasted(page, `The price of gpt-4.1-nano from ${today} is saved.`)
    const priced = runtime.sent.find((x) => x.method === 'POST' && x.path === '/admin/prices')!
    expect(priced.body).toEqual({
      id: `gpt-4.1-nano-${today}`,
      provider: 'openai',
      model: 'gpt-4.1-nano',
      from: today,
      usd_per_mtok: { input: '0.1', output: '0.4' },
    })
    await expect(priceCard.locator(`[data-price="site:gpt-4.1-nano-${today}"]`)).toBeVisible()

    // OCR reads Japanese too, then the server's languages again.
    await page.getByRole('tab', { name: 'Documents' }).click()
    await expect(page).toHaveURL(/tab=documents/)
    const ocr = page.locator('.ocr-card')
    await expect(ocr.getByText('Read in this order: 繁體中文 and English')).toBeVisible()
    const japanese = ocr.getByRole('checkbox', { name: /日本語/ })
    await expect(japanese).not.toBeChecked()
    await ocr.getByText('日本語').click()
    await expect(japanese).toBeChecked()
    await ocr.getByRole('button', { name: 'Save languages' }).click()
    await expectToasted(page, 'OCR reads in 繁體中文, English, and 日本語.')
    await ocr.getByRole('button', { name: 'Use the server’s default' }).click()
    await expect(ocr.getByText('Read in this order: 简体中文, 繁體中文, and English')).toBeVisible()
    expect(runtime.sent.filter((x) => x.path === '/admin/settings' && x.method === 'PATCH').map((x) => x.body)).toEqual(
      [{ ocr: { languages: ['chi_tra', 'eng', 'jpn'] } }, { ocr: { languages: null } }],
    )
  })
})

test.describe('a model of OpenRouter’s, with an agent runtime', () => {
  test('root adds one with its upstream routing, chosen from OpenRouter’s list, and finds it as it was saved', async ({
    page,
  }) => {
    const runtime = playRuntime(page)
    await runtime.install()
    await keepToasts(page)
    await signInAsRoot(page)
    await page.goto('/admin/runtime')
    const offers = page.locator('.offers-card')
    await offers.getByRole('button', { name: 'Add a model' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a model to the school’s plan' })
    await dialog.getByLabel('ID', { exact: true }).fill(`llama-${STAMP}`)
    await dialog.getByLabel('Name shown to owners').fill('School AI (Llama)')
    await dialog.locator('.offer-form__provider').click()
    await page
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: 'OpenRouter' })
      .click()

    // The section, wider for its table, asks for the model before it can list anything.
    const section = dialog.locator('.or-routing')
    await expect(dialog.getByRole('heading', { name: 'OpenRouter upstream routing' })).toBeVisible()
    await expect(section.locator('.or-state--need')).toHaveText(
      'Enter the model, such as meta-llama/llama-3.3-70b-instruct, to list its upstream providers.',
    )
    expect(Math.round((await page.locator('.offer-dialog').boundingBox())!.width)).toBe(760)

    // A model OpenRouter has not is said on the section; the one typed after it is listed.
    const model = dialog.getByLabel('Model', { exact: true })
    await model.fill('meta-llama/llama-nope')
    await expect(section.locator('.or-state--not-found')).toContainText(
      'OpenRouter has no model meta-llama/llama-nope. Check the model’s ID.',
    )
    await model.fill(LLAMA)
    const rows = section.locator('.or-table .el-table__body tr')
    await expect(rows).toHaveCount(5)
    await expect(section.locator('.or-table [data-slug]')).toHaveText([
      /^Groq\s*groq/,
      /^DeepInfra\s*deepinfra\/turbo/,
      /^Cloudflare\s*cloudflare\/fp8/,
      /^Google\s*google-vertex/,
      /^Google\s*google-vertex\/us-central1/,
    ])
    await expect(rows.nth(0)).toContainText('ZDR')
    await expect(rows.nth(4)).toContainText('Not running normally')
    await expect(rows.nth(2).locator('.or-tools')).toHaveText('No')
    await dialog.getByLabel('The school’s API key').fill(`sk-or-e2e${STAMP}${'0'.repeat(24)}`)

    // Only Groq and Cloudflare may answer; Cloudflare calls no tools, and the page says so.
    await section.locator('.or-mode').getByText('Only those turned on').click()
    await expect(section.locator('.or-warn-none')).toContainText('every call would fail')
    // A switch is clicked where it is drawn: its input is hidden under it.
    const flip = (name: string) =>
      section
        .locator('.el-switch')
        .filter({ has: page.getByRole('switch', { name }) })
        .click()
    await flip('Use Groq (groq)')
    await flip('Use Cloudflare (cloudflare/fp8)')
    await expect(section.locator('.or-warn-none')).toHaveCount(0)
    await expect(section.locator('.or-note-no-tools')).toHaveText(
      'Cloudflare cannot call tools, so agents’ calls skip them.',
    )

    // Groq first: OpenRouter's own sorting is then not used, and the page says so.
    await rows.nth(0).getByRole('button', { name: 'Try first' }).click()
    await expect(rows.nth(0).locator('.or-order__position')).toHaveText('No. 1')
    await expect(section.locator('.or-sort__hint')).toHaveText(
      'Not used while some upstream providers are tried first.',
    )

    const routing = {
      order: ['groq'],
      allow_fallbacks: true,
      require_parameters: true,
      data_collection: 'deny',
      only: ['groq', 'cloudflare/fp8'],
    }
    await section.getByRole('button', { name: 'What is sent to OpenRouter' }).click()
    await expect(section.locator('.or-preview .json-view')).toHaveText(JSON.stringify({ provider: routing }, null, 2))
    await photograph(page, 'openrouter-routing')

    // The dialog's own Add, not the one that adds a slug ("Add by slug").
    await dialog.locator('footer').getByRole('button', { name: 'Add', exact: true }).click()
    await expectToasted(page, 'School AI (Llama) is on the school’s plan.')
    await expect(dialog).toBeHidden()
    const made = runtime.sent.find((x) => x.method === 'POST' && x.path === '/admin/school-plan/offers')!
    expect(JSON.stringify(made.body.openrouter)).toBe(
      '{"order":["groq"],"allow_fallbacks":true,"require_parameters":true,"data_collection":"deny","only":["groq","cloudflare/fp8"]}',
    )

    // The plan says the model has upstream routing, and shows what is sent.
    const row = offers.locator('tr').filter({ has: page.locator(`[data-offer="site:llama-${STAMP}"]`) })
    await row.getByRole('button', { name: 'Upstream routing' }).click()
    const popover = page.locator('.el-popover:visible')
    await expect(popover).toContainText('Sent to OpenRouter with each call')
    await expect(popover.locator('.json-view')).toHaveText(JSON.stringify({ provider: routing }, null, 2))
    await page.keyboard.press('Escape')

    // Opened again, it is as it was saved.
    await row.getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit School AI (Llama)' })
    const again = edit.locator('.or-routing')
    await expect(again.getByRole('radio', { name: 'Only those turned on' })).toBeChecked()
    await expect(again.getByRole('switch', { name: 'Use Groq (groq)' })).toBeChecked()
    await expect(again.getByRole('switch', { name: 'Use Cloudflare (cloudflare/fp8)' })).toBeChecked()
    await expect(again.getByRole('switch', { name: 'Use DeepInfra (deepinfra/turbo)' })).not.toBeChecked()
    await expect(again.locator('.or-table .el-table__body tr').nth(0).locator('.or-order__position')).toHaveText(
      'No. 1',
    )
    await expect(again.getByRole('switch', { name: 'Only upstream providers that keep no data' })).toBeChecked()
    await expect(
      again.getByRole('switch', { name: 'Only upstream providers that take every setting of a call' }),
    ).toBeChecked()
    await again.getByRole('button', { name: 'What is sent to OpenRouter' }).click()
    await expect(again.locator('.or-preview .json-view')).toHaveText(JSON.stringify({ provider: routing }, null, 2))

    // A highest price the server refuses is said under its own field, and nothing is saved.
    const input = again.locator('.or-max-prompt')
    await input.locator('input').fill('0.6')
    runtime.refuseNextPatch({
      status: 400,
      code: 'invalid_argument',
      reason: 'invalid_field',
      field: '/openrouter/max_price/prompt',
    })
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(input.locator('.el-form-item__error')).toHaveText(
      'Dollars: 0 or more, up to 1,000,000, at most 6 decimal places.',
    )
    await expect(edit).toBeVisible()
    // Mended, it is sent alone: the whole routing, and nothing else of the offer.
    await input.locator('input').fill('0.59')
    await expect(input.locator('.el-form-item__error')).toHaveCount(0)
    await edit.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'School AI (Llama) is saved.')
    const patches = runtime.sent.filter(
      (x) => x.method === 'PATCH' && x.path === `/admin/school-plan/offers/llama-${STAMP}`,
    )
    expect(patches.map((x) => x.body)).toEqual([
      { openrouter: { ...routing, max_price: { prompt: '0.6' } } },
      { openrouter: { ...routing, max_price: { prompt: '0.59' } } },
    ])
  })
})

/**
 * Opens the dialog that adds a model to the plan, as root, for a model of
 * OpenRouter's with an ID and a name of its own, the model typed (its
 * upstream providers listed, where the runtime lists them) and a key given.
 */
async function newOpenRouterOffer(page: Page, runtime: ReturnType<typeof playRuntime>, id: string, label: string) {
  await runtime.install()
  await keepToasts(page)
  await signInAsRoot(page)
  await page.goto('/admin/runtime')
  await page.locator('.offers-card').getByRole('button', { name: 'Add a model' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a model to the school’s plan' })
  await dialog.getByLabel('ID', { exact: true }).fill(id)
  await dialog.getByLabel('Name shown to owners').fill(label)
  await dialog.locator('.offer-form__provider').click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: 'OpenRouter' }).click()
  await dialog.getByLabel('Model', { exact: true }).fill(LLAMA)
  await dialog.getByLabel('The school’s API key').fill(`sk-or-e2e${STAMP}${'0'.repeat(24)}`)
  return { dialog, section: dialog.locator('.or-routing') }
}

/** An upstream provider's row of the section's table, by slug. */
const upstreamRow = (section: Locator, slug: string) =>
  section.locator('.or-table .el-table__body tr').filter({ has: section.page().locator(`[data-slug="${slug}"]`) })

/** The section's table where it scrolls sideways, which nothing should make it. */
const tableScroller = (section: Locator) => section.locator('.or-table .el-table__body-wrapper .el-scrollbar__wrap')
/** How far the section's table is wider than the dialog shows of it, in px: 0 where it fits. */
const sideways = (section: Locator) => tableScroller(section).evaluate((el) => el.scrollWidth - el.clientWidth)

/**
 * Whether a row, and everything drawn in it, is at full strength: nothing
 * faded, it or what it is in (a switch's own box, which it draws in its
 * place, aside).
 */
const unfaded = (row: Locator) =>
  row.evaluate((el) => {
    const full = (e: Element) => getComputedStyle(e).opacity === '1'
    for (let up: Element | null = el; up; up = up.parentElement) if (!full(up)) return false
    return [...el.querySelectorAll('*')].filter((e) => !e.matches('.el-switch__input')).every(full)
  })

test.describe('a model of OpenRouter’s, with a runtime from before upstream routing', () => {
  test('the dialog says the server does not take it yet, and adds the model without it when root asks', async ({
    page,
  }) => {
    const runtime = playRuntime(page)
    runtime.takeNoRouting()
    const { dialog, section } = await newOpenRouterOffer(page, runtime, `old-${STAMP}`, 'School AI (Llama, older)')
    await expect(section.locator('.or-state--not-offered')).toContainText(
      'This server cannot list OpenRouter’s upstream providers yet.',
    )
    const posts = () => runtime.sent.filter((x) => x.method === 'POST' && x.path === '/admin/school-plan/offers')
    await dialog.locator('footer').getByRole('button', { name: 'Add', exact: true }).click()
    const error = dialog.locator('.offer-dialog__error')
    await expect(error).toContainText(
      'This server does not take upstream routing yet. Save without it, or ask the server’s operator to update.',
    )
    // Nothing is sent again by itself: the new offer's routing was sent, and refused.
    expect(posts().map((x) => x.body.openrouter)).toEqual([
      { allow_fallbacks: true, require_parameters: true, data_collection: 'deny' },
    ])
    await photograph(page, 'openrouter-routing-unsupported')
    await error.getByRole('button', { name: 'Save without upstream routing' }).click()
    await expectToasted(page, 'School AI (Llama, older) is on the school’s plan.')
    await expect(dialog).toBeHidden()
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body).not.toHaveProperty('openrouter')
    expect(posts()[1].body).toMatchObject({ id: `old-${STAMP}`, provider: 'openrouter', model: LLAMA })
  })
})

test.describe('a model of OpenRouter’s upstream routing, from the keyboard', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('root sets the order with the keyboard, told each place, and reads on each row why it is left out and its policies', async ({
    page,
  }) => {
    const runtime = playRuntime(page)
    const { section } = await newOpenRouterOffer(page, runtime, `keys-${STAMP}`, 'School AI (Llama, keys)')
    await expect(section.locator('.or-table [data-slug]')).toHaveCount(5)
    const said = section.locator('.or-announce')
    await expect(said).toHaveAttribute('role', 'status')
    const button = (name: string) => section.getByRole('button', { name, exact: true })

    // Groq first, alone: its earlier and later cannot be pressed, and the focus goes to taking it back.
    await button('Try first: Groq (groq)').focus()
    await page.keyboard.press('Enter')
    await expect(button('Do not try first: Groq (groq)')).toBeFocused()
    await expect(said).toHaveText('Groq (groq) is tried first, No. 1 of 1.')
    // DeepInfra second: it can be tried earlier.
    await button('Try first: DeepInfra (deepinfra/turbo)').focus()
    await page.keyboard.press(' ')
    await expect(button('Try earlier: DeepInfra (deepinfra/turbo)')).toBeFocused()
    await expect(said).toHaveText('DeepInfra (deepinfra/turbo) is tried first, No. 2 of 2.')
    // Earlier, to No. 1, where it can go no earlier: the focus goes to later.
    await page.keyboard.press('Enter')
    await expect(upstreamRow(section, 'deepinfra/turbo').locator('.or-order__position')).toHaveText('No. 1')
    await expect(button('Try later: DeepInfra (deepinfra/turbo)')).toBeFocused()
    await expect(said).toHaveText('DeepInfra (deepinfra/turbo) is tried first, No. 1 of 2.')
    // Taken back: the focus is on trying it first again.
    await page.keyboard.press('Tab')
    await expect(button('Do not try first: DeepInfra (deepinfra/turbo)')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(button('Try first: DeepInfra (deepinfra/turbo)')).toBeFocused()
    await expect(said).toHaveText('DeepInfra (deepinfra/turbo) is no longer tried first.')
    // Each button is 24 px square at least.
    for (const name of ['Try earlier: Groq (groq)', 'Try later: Groq (groq)', 'Do not try first: Groq (groq)']) {
      const box = (await button(name).boundingBox())!
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(24)
    }
    // The table's six columns fit the dialog: nothing in it scrolls sideways.
    await expect(section.locator('.or-table .el-table__header th')).toHaveCount(6)
    expect(await sideways(section)).toBe(0)

    // Only ZDR endpoints: DeepInfra, on, is left out, which its row and its switch say, faded nowhere.
    await section.locator('.or-zdr').click()
    const deepinfra = upstreamRow(section, 'deepinfra/turbo')
    await expect(deepinfra.locator('.or-excluded')).toHaveText('Left out by: Only zero-data-retention (ZDR) endpoints')
    await expect(
      section.getByRole('switch', {
        name: 'Use DeepInfra (deepinfra/turbo), left out by: Only zero-data-retention (ZDR) endpoints',
        exact: true,
      }),
    ).toBeChecked()
    await expect(section.getByRole('switch', { name: 'Use Groq (groq)', exact: true })).toBeChecked()
    expect(await unfaded(deepinfra)).toBe(true)
    await photograph(page, 'openrouter-routing-left-out')

    // Its policies are links on the row, one after another to the keyboard; then its price's discount, on focus.
    await deepinfra.getByRole('link', { name: 'Privacy policy' }).focus()
    await page.keyboard.press('Tab')
    await expect(deepinfra.getByRole('link', { name: 'Terms of service' })).toBeFocused()
    await expect(deepinfra.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
      'href',
      'https://deepinfra.com/terms',
    )
    await page.keyboard.press('Tab')
    await expect(deepinfra.getByRole('link', { name: 'Service status' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(deepinfra.locator('.or-price')).toBeFocused()
    await expect(page.locator('.el-popper:visible').filter({ hasText: '20% off' })).toBeVisible()

    // Every word of the section reads at AA, in both themes.
    expect(await wordsBelowAA(page, '.or-routing')).toEqual([])
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.waitForTimeout(400)
    expect(await wordsBelowAA(page, '.or-routing')).toEqual([])
    await photograph(page, 'openrouter-routing-left-out-dark')
  })
})

test.describe('a model of OpenRouter’s upstream routing, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('every control of the order is a finger’s size, and a card says why it is left out and links its policies', async ({
    page,
  }) => {
    const runtime = playRuntime(page)
    const { section } = await newOpenRouterOffer(page, runtime, `phone-${STAMP}`, 'School AI (Llama, phone)')
    const cards = section.locator('.or-card')
    await expect(cards).toHaveCount(5)
    const groq = section.locator('.or-card[data-slug="groq"]')
    const deepinfra = section.locator('.or-card[data-slug="deepinfra/turbo"]')
    const finger = async (target: Locator, what: string) => {
      const box = (await target.boundingBox())!
      expect(Math.min(box.width, box.height), what).toBeGreaterThanOrEqual(44)
      return box
    }
    await finger(groq.locator('.or-try-first'), 'Try first')
    await groq.locator('.or-try-first').tap()
    await deepinfra.locator('.or-try-first').tap()
    await expect(deepinfra.locator('.or-order__position')).toHaveText('No. 2')
    const boxes = []
    for (const cls of ['.or-order__up', '.or-order__down', '.or-order__remove'])
      boxes.push(await finger(deepinfra.locator(cls), cls))
    // Side by side, none over the next.
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width)
    await deepinfra.locator('.or-order__up').tap()
    await expect(deepinfra.locator('.or-order__position')).toHaveText('No. 1')
    await expect(groq.locator('.or-order__position')).toHaveText('No. 2')

    // Only ZDR endpoints: DeepInfra's card says it is left out, at full strength, and links its policies.
    await section
      .locator('.el-switch')
      .filter({ has: page.locator('#or-zdr') })
      .tap()
    await expect(deepinfra.locator('.or-excluded')).toHaveText('Left out by: Only zero-data-retention (ZDR) endpoints')
    expect(await unfaded(deepinfra)).toBe(true)
    for (const name of ['Privacy policy', 'Terms of service', 'Service status'])
      await finger(deepinfra.getByRole('link', { name }), name)
    const card = (await deepinfra.boundingBox())!
    expect(card.x + card.width).toBeLessThanOrEqual(390)
    await deepinfra.scrollIntoViewIfNeeded()
    await photograph(page, 'openrouter-routing-390')
    expect(await wordsBelowAA(page, '.or-routing')).toEqual([])
  })
})

// Where the dialog is narrower than the table's six columns, and on any touch
// screen, whose order's buttons need a wider column than the dialog has
// beside the rest, an upstream provider's price, tools and uptime fold under
// its name: the table never scrolls sideways, and the order is in sight.
for (const { width, height, touch } of [
  { width: 768, height: 1024, touch: true },
  { width: 1024, height: 768, touch: true },
  { width: 700, height: 900, touch: false },
]) {
  test.describe(`a model of OpenRouter’s upstream routing, ${width} px wide${touch ? ', on a touch screen' : ''}`, () => {
    test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

    test('the table fits the dialog, each upstream provider’s figures under its name, and its order’s buttons whole in sight', async ({
      page,
    }) => {
      const runtime = playRuntime(page)
      const { section } = await newOpenRouterOffer(
        page,
        runtime,
        `fold-${width}-${STAMP}`,
        `School AI (Llama, ${width})`,
      )
      await expect(section.locator('.or-table [data-slug]')).toHaveCount(5)
      await expect(section.locator('.or-table .el-table__header th')).toHaveText([
        'Upstream provider',
        'Use',
        'Try first',
      ])
      const deepinfra = upstreamRow(section, 'deepinfra/turbo')
      await expect(deepinfra.locator('.or-figures')).toHaveText(
        'Input / output, per million tokens: US$0.10 / US$0.32 · 20% off · Calls tools: Yes · Uptime, 30 min / 1 day: 98.8% / 98.5%',
      )

      const press = (target: Locator) => (touch ? target.tap() : target.click())
      await press(upstreamRow(section, 'groq').locator('.or-try-first'))
      await press(deepinfra.locator('.or-try-first'))
      await expect(deepinfra.locator('.or-order__position')).toHaveText('No. 2')
      expect(await sideways(section)).toBe(0)
      // Each of the order's buttons is whole within what the table shows, a finger's size on a touch screen.
      const shown = (await tableScroller(section).boundingBox())!
      for (const cls of ['.or-order__up', '.or-order__down', '.or-order__remove']) {
        const box = (await deepinfra.locator(cls).boundingBox())!
        expect(Math.min(box.width, box.height), cls).toBeGreaterThanOrEqual(touch ? 44 : 24)
        expect(box.x, cls).toBeGreaterThanOrEqual(shown.x)
        expect(box.x + box.width, cls).toBeLessThanOrEqual(shown.x + shown.width)
      }
      await photograph(page, `openrouter-routing-${width}${touch ? '-touch' : ''}`)
      await press(deepinfra.locator('.or-order__remove'))
      await expect(deepinfra.locator('.or-try-first')).toBeVisible()
      await expect(upstreamRow(section, 'groq').locator('.or-order__position')).toHaveText('No. 1')
    })
  })
}

test.describe('a price’s day, with an agent runtime, read west of UTC', () => {
  const ZONE = 'America/New_York'
  test.use({ timezoneId: ZONE })

  test('the price dialog says the day chosen is UTC’s, and when it begins on the reader’s clock', async ({ page }) => {
    const runtime = playRuntime(page)
    await runtime.install()
    await signInAsRoot(page)
    await page.goto('/admin/runtime?tab=pricing')
    await page.locator('.prices-card').getByRole('button', { name: 'Add a price' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a price' })
    // The day chosen is today's in UTC, which begins on the evening before it in New York.
    const today = new Date().toISOString().slice(0, 10)
    await expect(dialog.locator('.price-form__from input')).toHaveValue(today)
    const at = new Date(`${today}T00:00:00Z`)
    const part = (lang: string, opts: Intl.DateTimeFormatOptions, type: Intl.DateTimeFormatPartTypes) =>
      new Intl.DateTimeFormat(lang, { timeZone: ZONE, ...opts }).formatToParts(at).find((p) => p.type === type)!.value
    const day = ['year', 'month', 'day'].map((t) =>
      part('en', { year: 'numeric', month: '2-digit', day: '2-digit' }, t as Intl.DateTimeFormatPartTypes),
    )
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(at)
    const start = `${day.join('-')} ${clock}`
    expect(start < `${today} 00:00`, 'the day begins in New York on the evening before').toBe(true)
    const zone = part('en', { timeZoneName: 'long' }, 'timeZoneName')
    const hint = dialog.locator('.price-form__from-hint')
    await expect(hint).toHaveText(
      `The price starts at ${start} (${zone}), when the day chosen begins in UTC. It may be in the future.`,
    )
    await hint.locator('time').hover()
    await expect(page.getByRole('tooltip').filter({ hasText: 'UTC' })).toContainText(`${today} 00:00 UTC`)
  })
})

/** The transcription service's live credentials in Core, as root lists them. */
async function liveServiceCredentials(): Promise<{ id: string; token_prefix: string }[]> {
  const out = await call(root().token, 'GET', '/v1/services/document_text/credentials')
  expect(out.body.status, JSON.stringify(out.body.error)).toBe('executed')
  return (out.body.result.credentials ?? []).filter((c: { live: boolean }) => c.live)
}

test.describe('the transcriber, with an agent runtime', () => {
  test('root turns it on, chooses its model, gives it a credential Core issues, and revokes it', async ({ page }) => {
    const runtime = playRuntime(page)
    await runtime.install()
    await keepToasts(page)
    await signInAsRoot(page)
    await page.goto('/admin/runtime?tab=documents')
    const card = page.locator('.transcription-card')
    await expect(card.getByRole('heading', { name: /Transcribing documents \(text versions\)/ })).toBeVisible()
    await expect(card.locator('.transcription-card__state')).toHaveText('Off')

    // On at once, with the switch: blocked until it has a model and a credential.
    await card.locator('.transcription-card__enabled').click()
    await expectToasted(page, 'Transcription is on.')
    await expect(card.locator('.transcription-card__state')).toHaveText('Blocked: no model chosen')

    // Its model, from the plan, and fewer pages a document.
    await card.locator('.transcription-card__offer-select').click()
    await page
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: 'School AI (standard)' })
      .click()
    await card.locator('.transcription-card__max-pages input').fill('200')
    await card.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Transcription settings saved.')
    await expect(card.locator('.transcription-card__state')).toHaveText('Blocked: no credential')
    const patches = runtime.sent.filter((x) => x.method === 'PATCH' && x.path === '/admin/settings').map((x) => x.body)
    expect(patches).toEqual([
      { transcription: { enabled: true } },
      { transcription: { offer: 'standard', max_pages: 200 } },
    ])

    // One button: Core issues the service a credential, and the runtime is given it.
    await card.getByRole('button', { name: 'Issue and give to the agent service' }).click()
    await expectToasted(page, 'The agent service has a new credential.')
    await expect(card.locator('.transcription-card__state')).toHaveText('Running')
    await expect(card.locator('.transcription-card__credential-status')).toHaveText('Accepted')
    const put = runtime.sent.filter((x) => x.method === 'PUT' && x.path === '/admin/transcription/credential')
    // Nothing that holds the token is ever printed, a failure's message included.
    expect(put.length).toBe(1)
    const token: string = put[0].body.token
    expect(/^aissvc_[a-z2-7]{12}_/.test(token)).toBe(true)
    // Only the runtime's is live in Core, and the token was sent once, to the runtime, and shown nowhere.
    const live = await liveServiceCredentials()
    expect(live.map((c) => c.id)).toEqual([put[0].body.credential_id])
    expect(token.startsWith(`aissvc_${live[0].token_prefix}`)).toBe(true)
    expect(runtime.sent.filter((x) => JSON.stringify(x).includes(token)).length).toBe(1)
    expect((await page.content()).includes(token)).toBe(false)
    await expect(card.locator('.transcription-card__hint')).toHaveText(`aissvc_${live[0].token_prefix}…`)

    // What it did.
    const job = card.locator('[data-job="job-e2e-1"]')
    await expect(job.locator('.job-cell__status')).toHaveText('Skipped')
    await expect(job.locator('.job-cell__reason')).toHaveText('More pages than the limit')
    await photograph(page, 'transcription-card')

    // Revoked: the runtime forgets it, and Core revokes it.
    await card.getByRole('button', { name: 'Revoke' }).click()
    const box = page.getByRole('dialog', { name: 'Revoke the transcription credential?' })
    await box.getByRole('button', { name: 'Revoke' }).click()
    await expectToasted(page, 'The credential is revoked.')
    await expect(card.locator('.transcription-card__credential-status')).toHaveText('None')
    expect(runtime.sent.filter((x) => x.method === 'DELETE')).toHaveLength(1)
    expect(await liveServiceCredentials()).toEqual([])
  })
})

/** The agent runtime's credentials in Core, as root lists them. */
async function agentRuntimeCredentials(): Promise<{ id: string; label: string; live: boolean }[]> {
  const out = await call(root().token, 'GET', '/v1/services/agent_runtime/credentials')
  expect(out.body.status, JSON.stringify(out.body.error)).toBe('executed')
  return out.body.result.credentials ?? []
}

test.describe('the agent runtime’s own credential, with an agent runtime', () => {
  test('root sees it, issues one shown once, and revokes it, with the real Core', async ({ page }) => {
    const LABEL = `e2e hosting ${STAMP}`
    const runtime = playRuntime(page)
    await runtime.install()
    await keepToasts(page)
    await signInAsRoot(page)
    await page.goto('/admin/runtime')
    await page.getByRole('tab', { name: 'Agent hosting' }).click()
    await expect(page).toHaveURL(/tab=hosting/)
    const card = page.locator('.agent-runtime-card')
    await expect(card.getByRole('heading', { name: 'The agent service’s credential for AIshie' })).toBeVisible()
    // Setup makes it, and the server's command rotates it.
    await expect(card.locator('.agent-runtime-card__setup')).toContainText('aishie runtime-credential')

    // Issued here, without revoking the others: the runs' own runtime credential (support's) goes on working.
    await card.getByRole('button', { name: 'Issue a credential' }).click()
    await expect(page.getByRole('dialog', { name: 'Issue a credential for the agent service' })).toBeVisible()
    // The same dialog, its title saying what to do once it is issued.
    const dialog = page.locator('.agent-runtime-issue')
    await dialog.locator('.agent-runtime-issue__label input').fill(LABEL)
    await dialog.getByRole('button', { name: 'Issue', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Copy the credential now' })).toBeVisible()
    await expect(dialog.getByText('This is the only time it is shown')).toBeVisible()
    await expect(dialog).toContainText('/etc/aishie/runtime/secrets/core/agent_runtime')
    // The credential is on the page once, in the dialog; it is never printed here.
    const shown = (await dialog.locator('.agent-runtime-issue__token .copy-block__text').textContent()) ?? ''
    expect(/^aissvc_[a-z2-7]{12}_/.test(shown)).toBe(true)
    const made = (await agentRuntimeCredentials()).find((c) => c.label === LABEL)!
    expect(made.live).toBe(true)
    await dialog.getByRole('button', { name: 'I have copied it' }).click()
    await expect(dialog).toBeHidden()
    expect((await page.content()).includes(shown)).toBe(false)
    // The runtime is given nothing by the page: that is the server's to do.
    expect(runtime.sent.filter((x) => JSON.stringify(x).includes(shown)).length).toBe(0)

    // Listed, by its label, with who issued it; then revoked.
    const item = card.locator(`[data-credential="${made.id}"]`)
    await expect(item).toContainText(LABEL)
    await expect(item).toContainText('Live')
    await photograph(page, 'agent-runtime-card')
    await item.getByRole('button', { name: 'Revoke' }).click()
    const box = page.getByRole('dialog', { name: 'Revoke this credential?' })
    await expect(box).toContainText('The tokens of the agents it hosts are not revoked.')
    await box.getByRole('button', { name: 'Revoke' }).click()
    await expectToasted(page, 'The credential is revoked.')
    await expect(item).toHaveCount(0)
    expect((await agentRuntimeCredentials()).find((c) => c.id === made.id)?.live).toBe(false)
  })
})
