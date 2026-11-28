import { expect, test, type Page } from '@playwright/test'
import {
  arCall,
  arMessages,
  call,
  chatButton,
  coursePath,
  demo,
  expectCourseAgentRow,
  hostARAgent,
  releaseARAgent,
  modelRules,
  photograph,
  signIn,
  type CoreReply,
} from './support'

test.skip(!process.env.E2E_RUNTIME_URL, 'AR chat requires scripts/ci-runtime.sh start')

// People in the site ask an agent only while AR hosts it. This suite uses the
// real AR API, SSE and deterministic local model: no Core conversation writes.
// One agent has MCP access and is never offered; the instructor's course agent
// is hosted, paused and resumed through AR. Its AR history remains readable
// while hosting is paused, and a question raced with pausing is not published.

const STAMP = Date.now().toString(36)
const TUTOR = `Lab tutor ${STAMP}`
const HELPER = `Ken's notes ${STAMP}`
const QUESTION = `Does the lab start at nine? (${STAMP})`
const ANSWER = `It does, in room 2 (${STAMP}).`
const LATE = `And where do we meet? (${STAMP})`
/** Opened afresh, with no refusal to say why. */
const NOT_NOW = 'This agent can’t be asked here just now.'
const MCP_NOTE =
  'Nobody can ask it on the site: it has MCP access, and is used from your own tools. An agent people ask here is one created as hosted on AIshie.'

const w = { tutorId: '', hostedId: '', helperId: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

async function respondentNames(token: string): Promise<string[]> {
  const r = await arCall<{ agents: { display_name: string }[] }>(
    { token },
    'GET',
    `/courses/${demo().course.id}/chat/agents`,
  )
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.agents.map((x) => x.display_name)
}

/** AR makes an unknown agent and one Ken may not ask indistinguishable. */
async function openRefused(agentId: string): Promise<void> {
  const r = await arCall(demo().actors.ken, 'POST', `/courses/${demo().course.id}/conversations`, {
    agent_id: agentId,
    body: `Anyone there? (${STAMP})`,
    idempotency_key: `site-chat-refused-${STAMP}-${agentId}`,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(404)
  expect(r.body.error?.code).toBe('not_found')
}

/** The card on an agent's page that says whether people can ask it on the site. */
function siteChatCard(page: Page) {
  return page.locator('.site-chat')
}

/** The chat, opened from its round button on the course's overview: it asks in the course. */
async function openChat(page: Page) {
  await page.goto(coursePath())
  await chatButton(page).click()
  const panel = page.locator('#chat-panel')
  await expect(panel.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
  return panel
}

/** Ken's own AR conversation, never a Core conversation with the same agent. */
async function kensConversation(): Promise<string> {
  const d = demo()
  const r = await arCall<{ conversations: { id: string; agent_id: string; title: string }[] }>(
    d.actors.ken,
    'GET',
    `/courses/${d.course.id}/conversations?limit=100`,
  )
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const c = r.body.conversations.find((x) => x.agent_id === w.tutorId && x.title === QUESTION)
  expect(c, 'Ken’s AR conversation with the course agent').toBeTruthy()
  return c!.id
}

/** Opens this run's AR conversation through its history, not a legacy Core URL. */
async function openStoredConversation(page: Page) {
  await page.goto(coursePath())
  const panel = page.locator('#chat-panel')
  if (!(await panel.isVisible())) await chatButton(page).click()
  const history = panel.getByRole('button', { name: 'History', exact: true })
  const row = panel.locator('.hist-row').filter({ hasText: QUESTION })
  await expect(async () => {
    if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
    await expect(row).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await row.click()
  await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
  return panel
}

async function tutorPaused(paused: boolean) {
  const r = await arCall<{ paused: boolean; revocation?: { outcome: string } }>(
    demo().actors.instructor,
    'POST',
    `/agents/${w.hostedId}/${paused ? 'pause' : 'resume'}`,
    {},
  )
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  expect(r.body.paused).toBe(paused)
  return r.body
}

test.describe.serial('site chat: an agent is asked here only while AIshie’s runtime hosts it', () => {
  test.beforeAll(async () => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    const K = d.actors.ken.token
    // The instructor's course agent, hosted on AIshie, seated to answer the course; not hosted yet.
    w.tutorId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    // Ken's own assistant, with MCP access, brought in with the instructor's approval.
    w.helperId = done(
      await call(K, 'POST', '/v1/me/agents', { display_name: HELPER, hosting: 'mcp' }),
      'agent.create',
    ).actor_id
    const asked = await call(K, 'POST', `/v1/courses/${c}/delegates`, {
      actor_id: w.helperId,
      preset: 'delegate',
      answers_course: false,
    })
    expect(asked.body.status, JSON.stringify(asked.body)).toBe('proposed')
    done(
      await call(I, 'POST', `/v1/courses/${c}/actions/${asked.body.action_id}/decide`, { decision: 'approve' }),
      'action.decide',
    )
    const token = done(
      await call(K, 'POST', `/v1/me/agents/${w.helperId}/tokens`, { label: `claude ${STAMP}` }),
      'agent.issue_token',
    ).token
    // It is used, as Claude would use it over MCP; nothing it does makes it asked here.
    expect((await call(token, 'GET', '/v1/me')).status).toBe(200)
  })

  // A person may have five agents at once: this run's are suspended when they are done with, for the specs after it.
  test.afterAll(async () => {
    const d = demo()
    await releaseARAgent(d.actors.instructor, w.hostedId)
    if (w.tutorId) await call(d.actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
    if (w.helperId) await call(d.actors.ken.token, 'POST', `/v1/me/agents/${w.helperId}/suspend`, {})
  })

  test('a student is offered neither: one with MCP access never, one the runtime does not run yet', async ({
    page,
  }) => {
    const d = demo()
    // AR offers neither and makes both denied creates indistinguishable.
    const names = await respondentNames(d.actors.ken.token)
    expect(names).not.toContain(TUTOR)
    expect(names).not.toContain(HELPER)
    await openRefused(w.helperId)
    await openRefused(w.tutorId)
    const agent = done(await call(d.actors.ken.token, 'GET', `/v1/me/agents/${w.helperId}`), 'agent.get')
    expect(agent.hosting).toBe('mcp')
    expect(agent.site_chat).toBe(false)

    await signIn(page, d.actors.ken)
    const panel = await openChat(page)
    // Nothing to click for either, his own included: no chat box can be opened with them.
    await expect(panel.locator('.resp-row').filter({ hasText: TUTOR })).toHaveCount(0)
    await expect(panel.locator('.resp-row').filter({ hasText: HELPER })).toHaveCount(0)
    await expect(page.locator('.chat-pane textarea')).toHaveCount(0)

    // His agent's page says how it runs, that nobody asks it here, and switches nothing.
    await page.goto(`/account/agents/${w.helperId}`)
    await expect(page.locator('.agent-view__desc')).toContainText('MCP access')
    const card = siteChatCard(page)
    await expect(card.getByRole('heading', { name: 'Questions on the site' })).toBeVisible()
    await expect(card.locator('.el-tag')).toHaveCount(0)
    await expect(card).toContainText(MCP_NOTE)
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(page.locator('.mcp-card')).toContainText('People cannot ask this agent on the site')
  })

  test('the owner of a course agent the runtime does not run is told so, on its page and the course’s agents', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${w.tutorId}`)
    await expect(page.locator('.agent-view__desc')).toContainText('Hosted on AIshie')
    const card = siteChatCard(page)
    await expect(card.locator('.el-tag')).toHaveText('Not running')
    await expect(card).toContainText('AIshie’s agent service is not running it')
    await expect(card.getByRole('button')).toHaveCount(0)

    // Staff see which of the course's agents nobody can ask here, and why.
    await page.goto(coursePath('agents'))
    const row = page.locator('.agent-row').filter({ hasText: TUTOR })
    // Whether it can be asked is a dot before its name, amber, saying so; how it runs is left to its page.
    await expect(row.locator('.askable-dot')).toHaveAttribute('aria-label', 'Not running')
    await expect(row.locator('.hosting-tag')).toHaveCount(0)
    await expect(row.locator('.agent-row__not-askable')).toHaveText(
      'Students cannot ask it on the site until AIshie runs it again: its owner hosts it from My agents.',
    )
    await photograph(page, 'hosting-course-agents')
    // Its owner is offered nothing to ask it in the chat either. (The address the course's
    // conversations once had opens the panel on the course.)
    await page.goto(coursePath('conversations'))
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    const panel = page.locator('#chat-panel')
    await expect(panel.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
    await expect(panel.locator('.resp-row').filter({ hasText: TUTOR })).toHaveCount(0)
  })

  test('once the runtime hosts it, the student finds it, opens a conversation, and it answers', async ({
    page,
    browser,
  }) => {
    const d = demo()
    const hosted = await hostARAgent(d.actors.instructor, w.tutorId)
    w.hostedId = hosted.id
    modelRules([{ match: QUESTION, answer: ANSWER, delayMs: 1_500 }])
    expect(await respondentNames(d.actors.ken.token)).toContain(TUTOR)

    await signIn(page, d.actors.ken)
    const panel = await openChat(page)
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expectCourseAgentRow(panel, row)
    // Whether it can be asked, by a dot before its name; how it runs is its owner's concern.
    await expect(row.locator('.askable-dot')).toHaveAttribute('aria-label', 'Can be asked')
    await expect(row.locator('.hosting-tag')).toHaveCount(0)
    await photograph(page, 'hosting-respondents')
    await row.click()
    const composer = panel.locator('.chat-pane textarea')
    await expect(composer).toBeVisible()
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    // The agent at work (the runtime runs it): the working line, counting the seconds.
    await expect(panel.locator('.chat-pane__typing .chat-status')).toContainText('Thinking…')
    await expect(panel.locator('.chat-pane__notice.is-elsewhere')).toHaveCount(0)
    // The page stays where it was; the conversation is in the panel.
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    w.conversationId = await kensConversation()

    // The real AR Runner and deterministic model publish the answer over AR SSE.
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () =>
        (await arMessages(d.actors.ken, d.course.id, w.conversationId)).messages.some(
          (m) => m.role === 'assistant' && m.status === 'posted' && m.body === ANSWER,
        ),
      )
      .toBe(true)

    // Its owner's page says people can ask it now, and offers no switch: pausing its hosting stops them.
    const owner = await browser.newPage()
    await signIn(owner, d.actors.instructor)
    await owner.goto(`/account/agents/${w.tutorId}`)
    const card = siteChatCard(owner)
    await expect(card.locator('.el-tag')).toHaveText('Can be asked on the site')
    await expect(card).toContainText('To stop people asking it, pause its hosting, or suspend it.')
    await expect(card.getByRole('button')).toHaveCount(0)
    await owner.close()
  })

  test('the runtime stops hosting it: the conversation stays readable, and says why in place of its composer', async ({
    page,
    browser,
  }) => {
    const d = demo()
    const stopped = await tutorPaused(true)
    expect(stopped.revocation?.outcome).toBe('revoked')
    const agent = done(await call(d.actors.instructor.token, 'GET', `/v1/me/agents/${w.tutorId}`), 'agent.get')
    expect(agent.site_chat).toBe(false)
    expect(await respondentNames(d.actors.ken.token)).not.toContain(TUTOR)

    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${w.tutorId}`)
    await expect(siteChatCard(page).locator('.el-tag')).toHaveText('Not running')

    // Open the AR history in the panel; old Core conversation URLs are not AR links.
    const student = await browser.newPage()
    await signIn(student, d.actors.ken)
    const panel = await openStoredConversation(student)
    await expect(student).toHaveURL(new RegExp(`${coursePath()}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()
    await expect(panel.locator('.chat-pane__notice.is-elsewhere')).toHaveText(NOT_NOW)
    await expect(panel.locator('.chat-pane textarea')).toHaveCount(0)
    // Seen moments ago, but nobody can ask it here now: it is not said to be online.
    await expect(panel.locator('.chat-pane__presence')).toHaveCount(0)
    // Its menu says who can read it and ends nothing; it is still listed among his conversations.
    await panel.getByRole('button', { name: 'Conversation options' }).click()
    await expect(student.getByRole('menuitem', { name: 'Who can read this' })).toBeVisible()
    await expect(student.getByRole('menuitem', { name: 'Close conversation' })).toHaveCount(0)
    await student.keyboard.press('Escape')
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    await expect(panel.locator('.hist-row').filter({ hasText: QUESTION })).toContainText('CS101')

    // AR refuses another question without publishing it while hosting is paused.
    const refused = await arCall(
      d.actors.ken,
      'POST',
      `/courses/${d.course.id}/conversations/${w.conversationId}/messages`,
      { body: 'Anyone there?', idempotency_key: `site-chat-paused-${STAMP}` },
    )
    expect(refused.status).toBe(404)
    await student.close()
  })

  test('a question sent just as the runtime stops is refused, in the words the page has for it', async ({ page }) => {
    const d = demo()
    // Resume the same AR-hosted row; no Core hosting/token helper is involved.
    await tutorPaused(false)
    await signIn(page, d.actors.ken)
    const panel = await openStoredConversation(page)
    const composer = panel.locator('.chat-pane textarea')
    await expect(composer).toBeEnabled()
    await composer.fill(LATE)

    // It stops while the page is open, before the page has looked again.
    await tutorPaused(true)
    await composer.press('Enter')
    await expect(page.locator('.el-message').filter({ hasText: 'no such agent or conversation' })).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: LATE })).toHaveCount(0)
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()

    // A fresh agents read says only that it cannot be asked now; AR's 404 does
    // not disclose whether it is unknown, MCP-only or simply not hosted.
    await page.reload()
    const reopened = await openStoredConversation(page)
    await expect(reopened.locator('.chat-pane__notice.is-elsewhere')).toHaveText(NOT_NOW)
    await expect(reopened.locator('.chat-pane textarea')).toHaveCount(0)
    await photograph(page, 'hosting-not-running')
    await expect(reopened.locator('.chat-msg').filter({ hasText: LATE })).toHaveCount(0)
    await expect(reopened.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()
  })
})
