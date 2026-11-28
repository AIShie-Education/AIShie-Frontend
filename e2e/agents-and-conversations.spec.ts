import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  coursePath,
  openCourseTab,
  demo,
  expectToasted,
  hostARAgent,
  releaseARAgent,
  arList,
  arMessages,
  arCall,
  modelRules,
  keepToasts,
  signIn,
} from './support'

test.skip(!process.env.E2E_RUNTIME_URL, 'AR chat requires scripts/ci-runtime.sh start')

// Agents a person owns, told through the app: a student makes an agent hosted
// on AIshie (for good: she is given no token for it), and asks to bring it
// into the course, where bringing in an agent needs an instructor's approval
// (the student preset's agent_delegate is confirm_required); the instructor
// approves it; AIshie's runtime hosts it, issued its one token by Core (the
// runs have no runtime: the test plays it, through Core's API for the
// runtime); the student asks it a question from the chat panel; the agent
// answers through Core's REST API with that token, as the runtime would; and
// the answer appears in the panel by polling. Then an instructor adds a
// course agent hosted on AIshie, which answers the course; once the runtime
// hosts it, a student finds it among those they may ask. (An agent the
// runtime does not run, and one with MCP access, are asked nothing here:
// site-chat.spec.ts, hosting.spec.ts.)

const STAMP = Date.now().toString(36)
const AGENT = `Mei's helper ${STAMP}`
const QUESTION = `When is HW1 due? (${STAMP})`
const ANSWER = `HW1 is due next Friday at noon (${STAMP}).`
const TUTOR = `CS101 tutor ${STAMP}`

let agentId = ''
let agentHostedId = ''
let tutorActorId = ''
let tutorHostedId = ''

/** The chat, opened from its round button: on a course page, it asks in that course. */
async function openChat(page: Page) {
  await chatButton(page).click()
  const panel = page.locator('#chat-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
  return panel
}

test.describe.serial('an agent of one’s own, and a course agent', () => {
  test('a student creates an agent hosted on AIshie on My agents, and is given no token for it', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.mei)
    await page.goto('/account/agents')
    await expect(page.getByRole('heading', { name: 'My agents' })).toBeVisible()
    // The shared browser run may have created another agent for Mei already;
    // the counter's current/limit shape is what this page must make clear.
    await expect(page.locator('.agents-list__count')).toHaveText(/^\d+ of \d+ active$/)

    // The page's own button (the side bar, on My agents' view, has one too).
    await page.locator('.page-header').getByRole('button', { name: 'New agent' }).click()
    const create = page.getByRole('dialog', { name: 'New agent' })
    await create.getByLabel('Name').fill(AGENT)
    await create.locator('.hosting-choice__option--runtime').click()
    await create.getByRole('button', { name: 'Create agent' }).click()
    await expectToasted(page, `${AGENT} is created`)
    await expect(page).toHaveURL(/\/account\/agents\/[0-9a-f-]{36}$/)
    agentId = page.url().split('/').pop()!

    // Hosted on AIshie, for good, as Core holds it: the page offers no token.
    await expect(page.locator('.agent-view__desc')).toContainText('Hosted on AIshie')
    await expect(page.getByRole('button', { name: 'New token' })).toHaveCount(0)
    await expect(page.locator('.tokens-card')).toHaveCount(0)
    const got = await call(d.actors.mei.token, 'GET', `/v1/me/agents/${agentId}`)
    expect(got.body.result.hosting).toBe('runtime')
  })

  test('the student brings it into the course, which sends a request', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.mei)
    await page.goto(`/account/agents/${agentId}`)
    await page.getByRole('button', { name: 'Bring into a course' }).first().click()
    const bring = page.getByRole('dialog', { name: `Bring ${AGENT} into a course` })
    await expect(bring).toBeVisible()
    await bring.locator('.bring__course').filter({ hasText: 'CS101' }).click()
    // A student brings their own assistant, which answers them alone, and only with an instructor's approval.
    await expect(bring.locator('.bring__purpose')).toHaveCount(1)
    await expect(bring).toContainText('Personal agent')
    await expect(bring).toContainText('Only you')
    await expect(bring).toContainText('This sends a request: an instructor approves it before your agent is seated.')
    await bring.getByRole('button', { name: 'Send the request' }).click()
    await expect(bring).toBeHidden()

    const waiting = page
      .locator('.app-card')
      .filter({ has: page.getByRole('heading', { name: 'Waiting for approval' }) })
    await expect(waiting).toContainText('CS101')

    // What Core holds: a proposal that says the agent answers its owner alone.
    const got = await call(d.actors.mei.token, 'GET', `/v1/me/agents/${agentId}`)
    expect(got.body.result.requests ?? []).toHaveLength(1)
    expect(got.body.result.seats ?? []).toHaveLength(0)
  })

  test('the instructor approves it in Approvals', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await openCourseTab(page, 'Approvals')
    const card = page.locator('.action-card').filter({ hasText: AGENT })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Personal agent')
    await card.getByRole('button', { name: 'Approve', exact: true }).click()
    await card.getByRole('button', { name: 'Approve now' }).click()
    await expectToasted(page, 'Approved and carried out')
    await expect(card).toHaveCount(0)

    // Seated as Mei's delegate, answering her alone.
    const got = await call(d.actors.mei.token, 'GET', `/v1/me/agents/${agentId}`)
    const seats = got.body.result.seats ?? []
    expect(seats).toHaveLength(1)
    expect(seats[0].answers_course).toBe(false)
  })

  test('the student asks their agent; it answers through the API; the panel shows it', async ({ page }) => {
    const d = demo()
    // Until AIshie's runtime hosts it, nobody is offered to ask it. The runtime is issued its one
    // token, and answers as the agent with it.
    const respondents = async () => {
      const out = await arCall<{ agents: { display_name: string }[] }>(
        d.actors.mei,
        'GET',
        `/courses/${d.course.id}/chat/agents`,
      )
      expect(out.status).toBe(200)
      return out.body.agents.map((x) => x.display_name)
    }
    expect(await respondents()).not.toContain(AGENT)
    agentHostedId = (await hostARAgent(d.actors.mei, agentId)).id
    expect(await respondents()).toContain(AGENT)

    await signIn(page, d.actors.mei)
    await page.goto(coursePath())
    const panel = await openChat(page)

    const row = panel.locator('.resp-row').filter({ hasText: AGENT })
    await expect(row).toContainText('Your agent')
    await expect(row).toContainText('Personal agent')
    await row.click()
    modelRules([{ match: QUESTION, answer: ANSWER }])
    const composer = panel.locator('textarea')
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    // Generation is scheduled by AR; the deterministic provider may answer at once.

    const c = d.course.id
    await expect
      .poll(async () => {
        const mine = await arList(d.actors.mei, c)
        const conv = mine.find((x) => x.title === QUESTION)
        return conv?.id ?? null
      })
      .not.toBeNull()
    const conv = (await arList(d.actors.mei, c)).find((x) => x.title === QUESTION)!
    const msgs = await arMessages(d.actors.mei, c, conv.id)
    expect(msgs.messages.some((m) => m.role === 'user' && m.body === QUESTION && m.status === 'posted')).toBe(true)

    // The real AR TS Runner calls the deterministic local provider and AR's
    // SSE stream publishes the answer; no Core conversation.answer is called.
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible({ timeout: 20_000 })
    await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)
  })

  test('an instructor adds a course agent, and a student finds it among those to ask', async ({ browser }) => {
    const d = demo()
    const instructor = await browser.newPage()
    await keepToasts(instructor)
    await signIn(instructor, d.actors.instructor)
    await instructor.goto(coursePath('agents'))
    await instructor.getByRole('button', { name: 'Add a course agent' }).first().click()
    const dialog = instructor.getByRole('dialog', { name: 'Add a course agent' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: 'A new agent' }).check({ force: true })
    await dialog.locator('#add-agent-name').fill(TUTOR)
    await dialog.locator('.hosting-choice__option--runtime').click()
    await dialog.getByRole('button', { name: /^(Add course agent|Request to add)$/ }).click()
    await expectToasted(instructor, `${TUTOR} is now a course agent`)
    await expect(dialog).toBeHidden()

    // Seated to answer the course (answers_course), which the member list records.
    const members = await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}/members?limit=200`)
    const seat = (members.body.result.members ?? []).find((m: { display_name: string }) => m.display_name === TUTOR)
    expect(seat, 'the course agent is seated').toBeTruthy()
    expect(seat.answers_course).toBe(true)
    await instructor.close()

    // Nothing runs it yet, so no student is offered to ask it. AIshie's runtime hosts it.
    const before = await arCall<{ agents: { display_name: string }[] }>(
      d.actors.mei,
      'GET',
      `/courses/${d.course.id}/chat/agents`,
    )
    const names = before.body.agents.map((x) => x.display_name)
    expect(names).not.toContain(TUTOR)
    tutorActorId = seat.actor_id
    tutorHostedId = (await hostARAgent(d.actors.instructor, tutorActorId)).id

    const page = await browser.newPage()
    await signIn(page, d.actors.mei)
    await page.goto(coursePath())
    const panel = await openChat(page)
    const row = panel.locator('.resp-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Course agent')
    await expect(row).toContainText('It answers other members too')
    // Course agents are listed before one's own.
    await expect(panel.locator('.resp-row').first()).toContainText('Course agent')

    // Before writing, the student is told it may repeat what they write.
    await row.click()
    await expect(panel.locator('.chat-pane__shared')).toContainText('may repeat to them')

    const resp = await arCall<{ agents: { display_name: string; answers_course: boolean }[] }>(
      d.actors.mei,
      'GET',
      `/courses/${d.course.id}/chat/agents`,
    )
    const r = resp.body.agents.find((x) => x.display_name === TUTOR)
    expect(r?.answers_course).toBe(true)
    await page.close()
  })

  test.afterAll(async () => {
    await releaseARAgent(demo().actors.mei, agentHostedId)
    await releaseARAgent(demo().actors.instructor, tutorHostedId)
  })
})
