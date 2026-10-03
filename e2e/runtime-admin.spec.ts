import { expect, test, type Page, type Route } from '@playwright/test'
import { call, demo, expectToasted, keepToasts, photograph, root, showSideView, signIn, signInAsRoot } from './support'

// The agent runtime's settings, AI and documents (/admin/runtime), for
// platform administrators. The Core these tests run against has no runtime
// beside it: there the side bar does not offer the page, and the page says
// there is none. With a runtime, played in the browser from its contract
// (its admin routes, and the assertion Core would make for it), root adds a
// model to the school's plan, turns it off, adds a price, and sets OCR's
// languages; and sets up the transcriber of documents' text versions,
// giving it a credential the real Core issues, which the played runtime
// receives and the page never shows, and revoking it again. What the page
// said of each write is checked from the messages it kept (keepToasts), as
// a message closes itself after 3 s, which a busy machine can let pass
// before the check.

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
