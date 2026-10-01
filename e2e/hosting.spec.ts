import { expect, test, type Page, type Route } from '@playwright/test'
import {
  asAgentRuntime,
  call,
  chatButton,
  coursePath,
  demo,
  hostOnRuntime,
  photograph,
  registerPerson,
  signIn,
  signInAsRoot,
  stopHosting,
  toast,
  type CoreReply,
  type DemoActor,
} from './support'

// How an agent runs is chosen once, when it is created, and kept for good:
// hosted on AIshie (runtime), which AIshie's runtime runs by the agent's id,
// alone issued its one token, and people in its courses ask on the site; or
// MCP access (mcp), which its owner's own tools use over MCP with tokens the
// owner issues, and nobody asks on the site. Told through a student made for
// this run (each person may have five agents), with the real Core: she
// creates one of each; neither can be made the other; she issues and revokes
// the MCP one's tokens, which nobody is offered to ask or to host; the
// hosted one has no token anywhere for her, and once she hosts it, by its id,
// people can ask it until its hosting is paused. The runs have no runtime:
// where the page talks to it, it is played in the browser from its contract,
// and it calls the real Core as the runtime does (Core's API for the runtime,
// with its own credential). Last, an administrator registers one of each.

const STAMP = Date.now().toString(36)
const MCP_AGENT = `Hana's tools ${STAMP}`
const RT_AGENT = `Hana's tutor ${STAMP}`
const NOT_FIXED = 'This cannot be changed after it is created.'

const w: { hana: DemoActor | null; hanaMember: string; mcpId: string; rtId: string } = {
  hana: null,
  hanaMember: '',
  mcpId: '',
  rtId: '',
}
const hana = () => w.hana!

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** Core's reason for refusing a write: its details.reason, with its status. */
function refusal(r: { status: number; body: CoreReply }) {
  return { status: r.status, reason: r.body.error?.details?.reason }
}

async function respondentNames(token: string): Promise<string[]> {
  const r = await call(token, 'GET', `/v1/courses/${demo().course.id}/conversations/respondents`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body.result.respondents ?? []).map((x: { display_name: string }) => x.display_name)
}

/** Hana brings an agent of hers into the course, and the instructor approves it: its seat. */
async function seat(agentId: string): Promise<string> {
  const d = demo()
  const asked = await call(hana().token, 'POST', `/v1/courses/${d.course.id}/delegates`, {
    actor_id: agentId,
    preset: 'delegate',
    answers_course: false,
  })
  expect(asked.body.status, JSON.stringify(asked.body)).toBe('proposed')
  done(
    await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/actions/${asked.body.action_id}/decide`, {
      decision: 'approve',
    }),
    'action.decide',
  )
  const got = done(await call(hana().token, 'GET', `/v1/me/agents/${agentId}`), 'agent.get')
  return got.seats[0].member_id as string
}

/** The dialog My agents opens to create an agent, with its name filled in. */
async function newAgent(page: Page, name: string) {
  await page.goto('/account/agents')
  await page.locator('.page-header').getByRole('button', { name: 'New agent' }).click()
  const create = page.getByRole('dialog', { name: 'New agent' })
  await create.getByLabel('Name').fill(name)
  return create
}

// --- The runtime, played ------------------------------------------------------------------

const SCHOOL_OFFER = { id: 'standard', label: 'School AI (standard)', provider: 'openai', model: 'gpt-4.1-mini' }

/**
 * AIshie's agent runtime from its contract (runtime-hosting-api.md), answering
 * in the browser for the owner: it hosts by the agent's id, asks Core whether
 * she owns the agent (agent_runtime.check_owner), and once it has a model is
 * issued the agent's token by Core (agent_runtime.issue_token); pausing
 * revokes it there. What the page sent it is kept; the token goes nowhere
 * near the page.
 */
function playRuntime(page: Page, owner: () => DemoActor) {
  const sent: { method: string; path: string; body: any }[] = []
  const rows = new Map<string, any>()
  const answer = (route: Route, status: number, json: unknown) => route.fulfill({ status, json })
  let token = ''

  function row(view: { agent_id: string; display_name: string }) {
    const now = new Date().toISOString()
    return {
      id: `hosted-${view.agent_id.slice(0, 8)}`,
      version: 1,
      core_actor_id: view.agent_id,
      owner_actor_id: owner().actor_id,
      display_name: view.display_name,
      status: 'needs_model',
      problem: null,
      paused: false,
      model: { own: null, school: null },
      own_key: null,
      seats: [],
      seats_as_of: now,
      proposals_waiting: 0,
      today: { since: `${now.slice(0, 10)}T00:00:00Z`, answers: 0, cost_usd: '0', school: null },
      created_at: now,
      updated_at: now,
    }
  }
  const byId = (id: string) => [...rows.values()].find((r) => r.id === id)

  async function handle(route: Route) {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/runtime/api/v1', '')
    const method = req.method()
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined
    if (path !== '/info') sent.push({ method, path, body })
    if (path === '/info')
      return answer(route, 200, {
        api: 'aishie-runtime',
        api_version: 1,
        version: 'e2e',
        commit: STAMP,
        audience: 'https://e2e.test/runtime',
        issuer: 'https://e2e.test',
        features: { host_by_id: true, own_key: false, school_key: true },
      })
    if (path === '/models')
      return answer(route, 200, {
        own_key: { offered: false, providers: [] },
        school_key: {
          offered: true,
          offers: [{ ...SCHOOL_OFFER, priced: true }],
          limits: { per_owner_day: 100, per_asker_day: 20 },
        },
      })
    if (path === '/agents' && method === 'GET') return answer(route, 200, { agents: [...rows.values()] })
    if ((path === '/agents/inspect' || path === '/agents') && method === 'POST') {
      // Whether she owns it, and whether it may be hosted, as Core tells the runtime.
      const asked = await asAgentRuntime('GET', `/owners/${owner().actor_id}/agents/${body.agent_id}`)
      const out = done(asked, 'agent_runtime.check_owner')
      if (!out.owns)
        return answer(route, 404, {
          error: { code: 'not_found', message: 'no such agent', details: { reason: 'agent_not_found' } },
        })
      const view = out.agent
      const reason = view.hostable ? null : view.reason === 'not_runtime_hosted' ? 'mcp_agent' : view.reason
      if (path === '/agents/inspect')
        return answer(route, 200, {
          core_actor_id: view.agent_id,
          display_name: view.display_name,
          owner_actor_id: owner().actor_id,
          hosting: view.hosting,
          hostable: view.hostable,
          reason,
          live_seats: view.live_seats,
          site_chat: view.site_chat,
          hosted: rows.has(view.agent_id) ? { id: rows.get(view.agent_id).id, by_you: true } : null,
        })
      if (reason)
        return answer(route, 422, { error: { code: 'failed_precondition', message: reason, details: { reason } } })
      const made = row(view)
      rows.set(view.agent_id, made)
      return answer(route, 201, made)
    }
    const one = path.match(/^\/agents\/([^/]+)$/)
    if (one && method === 'GET') return answer(route, 200, byId(one[1]))
    if (one && method === 'PATCH') {
      // Its model chosen, the runtime runs it, and is issued its token by Core.
      const r = byId(one[1])
      r.model.school = { ...SCHOOL_OFFER, offer: body.model.school.offer, offered: true, fallback: false }
      token = await hostOnRuntime(r.core_actor_id)
      Object.assign(r, { status: 'running', version: r.version + 1, updated_at: new Date().toISOString() })
      return answer(route, 200, r)
    }
    const pause = path.match(/^\/agents\/([^/]+)\/pause$/)
    if (pause && method === 'POST') {
      const r = byId(pause[1])
      const revoked = await stopHosting(r.core_actor_id)
      Object.assign(r, { status: 'paused', paused: true, version: r.version + 1 })
      return answer(route, 200, {
        ...r,
        revocation: { outcome: revoked.revoked.length ? 'revoked' : 'none', problem: null },
      })
    }
    return answer(route, 404, { error: { code: 'not_found', message: 'no route', details: { reason: 'no_route' } } })
  }

  return {
    sent,
    /** The token Core issued the runtime for the agent: never shown, and never printed. */
    token: () => token,
    async install() {
      await page.route('**/runtime/api/v1/**', handle)
      await page.route('**/v1/auth/assertion', (route) =>
        answer(route, 200, {
          assertion: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJoYW5hIn0.ZTJl',
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }),
      )
    },
  }
}

test.describe.serial('how an agent runs, chosen once when it is created', () => {
  test.beforeAll(async () => {
    const d = demo()
    w.hana = await registerPerson(`Hana ${STAMP}`, { email: `hana+${STAMP}@e2e.test` })
    w.hanaMember = done(
      await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/members`, {
        actor_id: hana().actor_id,
        preset: 'student',
      }),
      'member.add',
    ).member_id
  })

  test('creating an agent asks how it runs, with nothing chosen for one, and says it is for good', async ({ page }) => {
    await signIn(page, hana())
    const create = await newAgent(page, MCP_AGENT)
    const choice = create.locator('.hosting-choice')
    await expect(choice.locator('.hosting-choice__option--runtime')).toContainText('Hosted on AIshie')
    await expect(choice.locator('.hosting-choice__option--runtime')).toContainText(
      'AIshie runs it; members of its courses can ask it on the site.',
    )
    await expect(choice.locator('.hosting-choice__option--mcp')).toContainText('MCP access')
    await expect(choice.locator('.hosting-choice__option--mcp')).toContainText(
      'Your own tools, such as Claude Desktop or an editor, use it over MCP; nobody can ask it on the site.',
    )
    await expect(choice.locator('.hosting-choice__fixed')).toHaveText(NOT_FIXED)
    await expect(create.getByRole('radio', { checked: true })).toHaveCount(0)
    await photograph(page, 'hosting-create')

    // Not chosen: nothing is created, and the dialog says what is missing.
    await create.getByRole('button', { name: 'Create agent' }).click()
    await expect(create.getByText('Choose how it runs')).toBeVisible()
    const none = done(await call(hana().token, 'GET', '/v1/me/agents'), 'agent.list')
    expect(none.agents ?? []).toHaveLength(0)

    // MCP access.
    await create.locator('.hosting-choice__option--mcp').click()
    await create.getByRole('button', { name: 'Create agent' }).click()
    await expect(toast(page, `${MCP_AGENT} is created`)).toBeVisible()
    await expect(page).toHaveURL(/\/account\/agents\/[0-9a-f-]{36}$/)
    w.mcpId = page.url().split('/').pop()!
    await expect(page.locator('.page-header .hosting-tag__mode')).toHaveText('MCP access')

    // Hosted on AIshie.
    const again = await newAgent(page, RT_AGENT)
    await again.locator('.hosting-choice__option--runtime').click()
    await again.getByRole('button', { name: 'Create agent' }).click()
    await expect(toast(page, `${RT_AGENT} is created`)).toBeVisible()
    await expect(page).toHaveURL(/\/account\/agents\/[0-9a-f-]{36}$/)
    w.rtId = page.url().split('/').pop()!
    await expect(page.locator('.page-header .hosting-tag__mode')).toHaveText('Hosted on AIshie')

    // Core holds each as chosen; My agents shows how each runs.
    const mine = done(await call(hana().token, 'GET', '/v1/me/agents'), 'agent.list').agents as {
      actor_id: string
      hosting: string
    }[]
    expect(Object.fromEntries(mine.map((a) => [a.actor_id, a.hosting]))).toEqual({
      [w.mcpId]: 'mcp',
      [w.rtId]: 'runtime',
    })
    await page.goto('/account/agents')
    await expect(page.locator('.agents-item').filter({ hasText: MCP_AGENT })).toContainText('MCP access')
    await expect(page.locator('.agents-item').filter({ hasText: RT_AGENT })).toContainText('Hosted on AIshie')
  })

  test('how it runs is never changed: its page offers no way, and Core refuses one', async ({ page }) => {
    const H = hana().token
    expect(refusal(await call(H, 'POST', `/v1/me/agents/${w.mcpId}`, { hosting: 'runtime' }))).toEqual({
      status: 422,
      reason: 'hosting_fixed',
    })
    expect(refusal(await call(H, 'POST', `/v1/me/agents/${w.rtId}`, { hosting: 'mcp' }))).toEqual({
      status: 422,
      reason: 'hosting_fixed',
    })
    // Nor is whether people ask it declared any more: that follows how it runs.
    expect(refusal(await call(H, 'POST', `/v1/me/agents/${w.rtId}`, { site_chat: true }))).toEqual({
      status: 400,
      reason: 'site_chat_follows_hosting',
    })
    for (const [id, hosting] of [
      [w.mcpId, 'mcp'],
      [w.rtId, 'runtime'],
    ]) {
      expect(done(await call(H, 'GET', `/v1/me/agents/${id}`), 'agent.get').hosting).toBe(hosting)
    }

    await signIn(page, hana())
    await page.goto(`/account/agents/${w.rtId}`)
    const about = page.locator('.agent-view__desc')
    await expect(about).toContainText('Hosted on AIshie')
    await expect(about).toContainText('Chosen when it was created, and never changed.')
    await expect(page.locator('.hosting-choice')).toHaveCount(0)
    // Renaming it asks for its name alone.
    await page.locator('.page-header').getByRole('button', { name: 'Rename' }).click()
    const rename = page.getByRole('dialog', { name: 'Rename agent' })
    await expect(rename).toBeVisible()
    await expect(rename.locator('.hosting-choice')).toHaveCount(0)
    await expect(rename.getByRole('radio')).toHaveCount(0)
  })

  test('an agent with MCP access: its owner issues a token, with how to connect a tool, and revokes it', async ({
    page,
  }) => {
    await signIn(page, hana())
    await page.goto(`/account/agents/${w.mcpId}`)
    const card = page.locator('.mcp-card')
    await expect(card).toContainText('People cannot ask this agent on the site')
    // How to connect a tool: Core's MCP endpoint, the header, and Claude Desktop's configuration.
    await expect(card.locator('.tool-steps__endpoint .copy-block__text')).toHaveText(/^https?:\/\/[^ ]+\/mcp$/)
    await expect(card.locator('.tool-steps__header')).toContainText('Authorization: Bearer <token>')
    await card.locator('.tool-steps__claude summary').click()
    await expect(card.locator('.tool-steps__claude-config')).toContainText('mcp-remote')
    await expect(page.locator('.site-chat .el-tag')).toHaveText('MCP access')
    await photograph(page, 'hosting-mcp-page')

    // A token, issued for one tool, and shown once with how to use it.
    await card.locator('.mcp-card__issue').click()
    const issue = page.getByRole('dialog', { name: `New token for ${MCP_AGENT}` })
    await issue.getByLabel('Label').fill(`Claude Desktop ${STAMP}`)
    await issue.getByRole('button', { name: 'Create token' }).click()
    const reveal = page.getByRole('dialog', { name: `The new token for ${MCP_AGENT}` })
    await expect(reveal.getByRole('heading', { name: 'Connect your tool' })).toBeVisible()
    const token = (await reveal.locator('.reveal__block .copy-block__text').innerText()).trim()
    expect(/^ais_/.test(token)).toBe(true)
    // The header and Claude Desktop's configuration carry it, ready to copy.
    expect((await reveal.locator('.tool-steps__header').innerText()).includes(`Bearer ${token}`)).toBe(true)
    expect((await reveal.locator('.tool-steps__claude-config').innerText()).includes(`Bearer ${token}`)).toBe(true)
    await reveal.getByRole('button', { name: 'I have copied it' }).click()
    await page.getByRole('button', { name: 'Close anyway' }).click()
    await expect(reveal).toBeHidden()
    // It works, over Core's API as over MCP: the agent is who it says it is.
    const me = await call(token, 'GET', '/v1/me')
    expect(me.status).toBe(200)
    expect(me.body.result.id).toBe(w.mcpId)

    // Listed, then revoked: refused from its next call.
    const row = page.locator('.tokens-card .token').filter({ hasText: `Claude Desktop ${STAMP}` })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Revoke' }).click()
    const confirm = page.getByRole('dialog', { name: 'Revoke this token?' })
    await confirm.getByRole('button', { name: 'Revoke' }).click()
    await expect(toast(page, 'Token revoked')).toBeVisible()
    expect((await call(token, 'GET', '/v1/me')).status).toBe(401)
  })

  test('an agent with MCP access is never offered to ask, its owner included, nor to host', async ({ page }) => {
    const d = demo()
    const member = await seat(w.mcpId)
    // Not even its owner, whom it answers alone.
    expect(await respondentNames(hana().token)).not.toContain(MCP_AGENT)
    const opened = await call(hana().token, 'POST', `/v1/courses/${d.course.id}/conversations`, {
      respondent_member_id: member,
      body: `Hello? (${STAMP})`,
    })
    expect(refusal(opened)).toEqual({ status: 422, reason: 'mcp_agent' })
    // Nor is the runtime issued a token for it.
    expect(refusal(await asAgentRuntime('POST', `/agents/${w.mcpId}/token`, {}))).toEqual({
      status: 422,
      reason: 'not_runtime_hosted',
    })

    const runtime = playRuntime(page, hana)
    await runtime.install()
    await signIn(page, hana())
    await page.goto(coursePath())
    await chatButton(page).click()
    const panel = page.locator('#chat-panel')
    await expect(panel.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
    await expect(panel.locator('.resp-row').filter({ hasText: MCP_AGENT })).toHaveCount(0)

    // Hosting on AIshie offers only the agent created to be hosted there.
    await page.goto('/account/agents')
    await page.locator('.agents-view__host').click()
    const host = page.getByRole('dialog', { name: 'Host an agent on AIshie' })
    await host.locator('.host-dialog__select').click()
    const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    await expect(options).toHaveText([RT_AGENT])
    await page.keyboard.press('Escape')
    // Its page has no hosting to offer at all: nothing asks the runtime about it.
    await page.goto(`/account/agents/${w.mcpId}`)
    await expect(page.locator('.mcp-card')).toBeVisible()
    await expect(page.locator('.hosting-offer')).toHaveCount(0)
    await expect(page.locator('.hosted-card')).toHaveCount(0)
    expect(runtime.sent.filter((x) => JSON.stringify(x.body ?? {}).includes(w.mcpId))).toHaveLength(0)
  })

  test('an agent hosted on AIshie has no token for its owner anywhere, and Core issues her none', async ({ page }) => {
    const H = hana().token
    expect(refusal(await call(H, 'POST', `/v1/me/agents/${w.rtId}/tokens`, { label: 'mine' }))).toEqual({
      status: 403,
      reason: 'hosted_by_runtime',
    })
    expect(
      done(await call(H, 'GET', `/v1/me/agents/${w.rtId}/credentials`), 'agent.list_credentials').credentials,
    ).toEqual([])

    await signIn(page, hana())
    await page.goto(`/account/agents/${w.rtId}`)
    await expect(page.locator('.hosting-offer')).toContainText('AIshie’s agent runtime is not available on this server')
    await expect(page.locator('.site-chat .el-tag')).toHaveText('Not running')
    await expect(page.getByRole('button', { name: 'New token' })).toHaveCount(0)
    await expect(page.locator('.tokens-card')).toHaveCount(0)
    await expect(page.locator('.mcp-card')).toHaveCount(0)
    await expect(page.getByText('Authorization')).toHaveCount(0)
    await expect(page.locator('.agent-view__desc')).toContainText('Hosted on AIshie')
  })

  test('she hosts it by its id; people can ask it once the runtime is issued its token, and not once it pauses', async ({
    page,
  }) => {
    // Seated as her own assistant, answering her alone: she is offered it once it runs.
    await seat(w.rtId)
    expect(await respondentNames(hana().token)).not.toContain(RT_AGENT)

    const runtime = playRuntime(page, hana)
    await runtime.install()
    await signIn(page, hana())
    await page.goto('/account/agents')
    // From My agents: the agent, then its model.
    await page.locator('.agents-view__host').click()
    const host = page.getByRole('dialog', { name: 'Host an agent on AIshie' })
    await expect(host.locator('.host-dialog__select')).toContainText(RT_AGENT)
    await expect(host.locator('.host-dialog__seats')).toHaveText('It is in one course.')
    await expect(host).toContainText('The runtime is issued the agent’s token itself: you never see one.')
    await photograph(page, 'hosting-host-dialog')
    await host.locator('.host-dialog__submit').click()
    await expect(page).toHaveURL(new RegExp(`/account/agents/${w.rtId}$`))
    const model = page.locator('.model-dialog')
    await expect(model.locator('.model-dialog__steps')).toContainText('Model and key')
    await expect(model).toContainText('School AI (standard)')
    await model.locator('.model-dialog__save').click()
    await expect(model).toBeHidden()

    // The page asked the runtime by the agent's id alone, and no token went anywhere near it.
    expect(runtime.sent.filter((x) => x.method === 'POST').map((x) => [x.path, x.body])).toEqual([
      ['/agents/inspect', { agent_id: w.rtId }],
      ['/agents', { agent_id: w.rtId }],
    ])
    expect(runtime.sent.find((x) => x.method === 'PATCH')?.body).toEqual({ model: { school: { offer: 'standard' } } })
    expect(runtime.token().length > 0).toBe(true)
    expect((await page.content()).includes(runtime.token())).toBe(false)

    // Running, and asked on the site.
    await expect(page.locator('.hosted-card__tag')).toHaveText('Running')
    await expect(page.locator('.site-chat .el-tag')).toHaveText('Can be asked on the site')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await photograph(page, 'hosting-runtime-running')
    expect(done(await call(hana().token, 'GET', `/v1/me/agents/${w.rtId}`), 'agent.get').site_chat).toBe(true)
    expect(await respondentNames(hana().token)).toContain(RT_AGENT)
    // Core lists the runtime's token, issued to it: still none for her to issue or to see whole.
    const creds = done(await call(hana().token, 'GET', `/v1/me/agents/${w.rtId}/credentials`), 'agent.list_credentials')
    expect(creds.credentials.map((c: { issued_to?: string }) => c.issued_to)).toEqual(['agent_runtime'])
    await expect(page.locator('.tokens-card')).toHaveCount(0)

    // Paused: the runtime's token is revoked in Core, and nobody can ask it.
    await page.locator('.hosted-card__pause').click()
    await expect(page.locator('.hosted-card__tag')).toHaveText('Paused')
    await expect(page.locator('.site-chat .el-tag')).toHaveText('Not running')
    expect(done(await call(hana().token, 'GET', `/v1/me/agents/${w.rtId}`), 'agent.get').site_chat).toBe(false)
    expect(await respondentNames(hana().token)).not.toContain(RT_AGENT)
    expect((await call(runtime.token(), 'GET', '/v1/me')).status).toBe(401)
  })

  test('an administrator registers one of each, and is offered tokens to issue only for the one with MCP access', async ({
    page,
  }) => {
    await signInAsRoot(page)
    for (const [hosting, name] of [
      ['mcp', `ops-grader-${STAMP}`],
      ['runtime', `ops-tutor-${STAMP}`],
    ] as const) {
      await page.goto('/admin/actors')
      await page.locator('.page-header').getByRole('button', { name: 'Register' }).click()
      const dialog = page.getByRole('dialog', { name: 'Register a person or agent' })
      await dialog.locator('.el-radio-button').filter({ hasText: 'Agent' }).click()
      await dialog.getByLabel('Display name').fill(name)
      await expect(dialog.locator('.hosting-choice__fixed')).toHaveText(NOT_FIXED)
      await expect(dialog.getByRole('radio', { checked: true, name: /Hosted on AIshie|MCP access/ })).toHaveCount(0)
      await dialog.locator(`.hosting-choice__option--${hosting}`).click()
      if (hosting === 'mcp') await photograph(page, 'hosting-admin-register')
      await dialog.getByRole('button', { name: 'Register' }).click()
      await expect(toast(page, `${name} is registered`)).toBeVisible()
      // The directory says how it runs.
      await page.getByPlaceholder('Search by name, email or student/staff number, or paste an ID').fill(name)
      const row = page.locator('.actors__table .el-table__body tr').filter({ hasText: name })
      await expect(row.locator('.hosting-tag__mode')).toHaveText(hosting === 'mcp' ? 'MCP access' : 'Hosted on AIshie')
      await row.getByRole('link', { name }).click()
      await expect(page.locator('.page-header')).toContainText(name)
      if (hosting === 'mcp') {
        await expect(page.getByRole('button', { name: 'Issue token' })).toBeVisible()
        await expect(page.locator('.token__runtime')).toHaveCount(0)
      } else {
        await expect(page.locator('.token__runtime')).toContainText(
          'None is issued here: this agent is hosted on AIshie',
        )
        await expect(page.getByRole('button', { name: 'Issue token' })).toHaveCount(0)
      }
    }
  })

  // A person may have five agents at once: Hana's are suspended when they are done with.
  test.afterAll(async () => {
    if (!w.hana) return
    for (const id of [w.mcpId, w.rtId]) if (id) await call(hana().token, 'POST', `/v1/me/agents/${id}/suspend`, {})
  })
})
