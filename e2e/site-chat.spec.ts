import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  coursePath,
  demo,
  hostOnRuntime,
  photograph,
  signIn,
  stopHosting,
  type CoreReply,
} from './support'

// People in the site ask an agent only while AIshie's runtime hosts it: one
// created as hosted on AIshie, while the runtime holds its one token. One
// with MCP access, used from its owner's own tools, is never asked here.
// Nothing is declared, and its owner switches nothing: its page says which it
// is. Told through two agents made for this run: the instructor's course
// agent, hosted on AIshie, and Ken's own assistant, with MCP access. Neither
// is offered at first, and Core refuses each, saying why. Once the runtime
// hosts the course agent, Ken opens a conversation with it, and it answers.
// When the runtime stops hosting it, the conversation stays readable, and says
// why in place of its composer; and a question sent just as it stops is
// refused, in the words the page has for it. (The runs have no runtime: the
// test plays it, through Core's API for the runtime.)

const STAMP = Date.now().toString(36)
const TUTOR = `Lab tutor ${STAMP}`
const HELPER = `Ken's notes ${STAMP}`
const QUESTION = `Does the lab start at nine? (${STAMP})`
const ANSWER = `It does, in room 2 (${STAMP}).`
const LATE = `And where do we meet? (${STAMP})`
/** Core refused a question: the runtime does not run it now (agent_not_hosted). */
const NOT_RUNNING = 'This agent isn’t running right now, so it can’t be asked here.'
/** Opened afresh, with no refusal to say why. */
const NOT_NOW = 'This agent can’t be asked here just now.'
const MCP_NOTE =
  'Nobody can ask it on the site: it has MCP access, and is used from your own tools. An agent people ask here is one created as hosted on AIshie.'

const w = { tutorId: '', tutorMember: '', tutorToken: '', helperId: '', helperMember: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

async function respondentNames(token: string): Promise<string[]> {
  const r = await call(token, 'GET', `/v1/courses/${demo().course.id}/conversations/respondents`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body.result.respondents ?? []).map((x: { display_name: string }) => x.display_name)
}

/** Why Core refuses Ken a conversation with an agent seated in the course: its reason. */
async function openRefused(memberId: string): Promise<unknown> {
  const r = await call(demo().actors.ken.token, 'POST', `/v1/courses/${demo().course.id}/conversations`, {
    respondent_member_id: memberId,
    body: `Anyone there? (${STAMP})`,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(422)
  return r.body.error?.details?.reason
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

/** The conversation Ken started with the course agent, as Core lists his. */
async function kensConversation(): Promise<string> {
  const d = demo()
  const r = await call(d.actors.ken.token, 'GET', `/v1/courses/${d.course.id}/conversations?as=opener&limit=200`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const c = (r.body.result.conversations ?? []).find(
    (x: { respondent: { display_name: string } }) => x.respondent.display_name === TUTOR,
  )
  expect(c, 'Ken’s conversation with the course agent').toBeTruthy()
  return c.id as string
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
    w.tutorMember = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id
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
    const helper = await call(K, 'GET', `/v1/me/agents/${w.helperId}`)
    w.helperMember = helper.body.result.seats[0].member_id
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
    if (w.tutorId) await call(d.actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
    if (w.helperId) await call(d.actors.ken.token, 'POST', `/v1/me/agents/${w.helperId}/suspend`, {})
  })

  test('a student is offered neither: one with MCP access never, one the runtime does not run yet', async ({
    page,
  }) => {
    const d = demo()
    // Core offers neither, and refuses each, saying why.
    const names = await respondentNames(d.actors.ken.token)
    expect(names).not.toContain(TUTOR)
    expect(names).not.toContain(HELPER)
    expect(await openRefused(w.helperMember)).toBe('mcp_agent')
    expect(await openRefused(w.tutorMember)).toBe('agent_not_hosted')
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
    w.tutorToken = await hostOnRuntime(w.tutorId)
    expect(await respondentNames(d.actors.ken.token)).toContain(TUTOR)

    await signIn(page, d.actors.ken)
    const panel = await openChat(page)
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Course agent')
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

    // It answers, as the runtime would, with the token the runtime holds.
    const c = d.course.id
    const got = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/${w.conversationId}`)
    expect(got.status, JSON.stringify(got.body)).toBe(200)
    done(
      await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${w.conversationId}/answer`, {
        in_reply_to_message_id: got.body.result.latest_opener_message_id,
        body: ANSWER,
      }),
      'conversation.answer',
    )
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible({ timeout: 20_000 })

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
    const stopped = await stopHosting(w.tutorId)
    expect(stopped.revoked).toHaveLength(1)
    const agent = done(await call(d.actors.instructor.token, 'GET', `/v1/me/agents/${w.tutorId}`), 'agent.get')
    expect(agent.site_chat).toBe(false)
    expect(await respondentNames(d.actors.ken.token)).not.toContain(TUTOR)
    // The token the runtime held is refused from then on.
    expect((await call(w.tutorToken, 'GET', '/v1/me')).status).toBe(401)

    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${w.tutorId}`)
    await expect(siteChatCard(page).locator('.el-tag')).toHaveText('Not running')

    // A link to it (a notification, a bookmark) opens it in the panel, beside the course.
    const student = await browser.newPage()
    await signIn(student, d.actors.ken)
    await student.goto(coursePath(`conversations/${w.conversationId}`))
    await expect(student).toHaveURL(new RegExp(`${coursePath()}$`))
    const panel = student.locator('#chat-panel')
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
    await expect(panel.locator('.hist-row').filter({ hasText: TUTOR })).toContainText('CS101')

    // Core refuses a question to it, and says why.
    const refused = await call(
      d.actors.ken.token,
      'POST',
      `/v1/courses/${d.course.id}/conversations/${w.conversationId}/ask`,
      { body: 'Anyone there?' },
    )
    expect(refused.status).toBe(422)
    expect(refused.body.error?.details?.reason).toBe('agent_not_hosted')
    await student.close()
  })

  test('a question sent just as the runtime stops is refused, in the words the page has for it', async ({ page }) => {
    const d = demo()
    // The runtime hosts it again: the student may ask it once more.
    w.tutorToken = await hostOnRuntime(w.tutorId)
    await signIn(page, d.actors.ken)
    await page.goto(coursePath(`conversations/${w.conversationId}`))
    const composer = page.locator('#chat-panel .chat-pane textarea')
    await expect(composer).toBeEnabled()

    // It stops while the page is open, before the page has looked again.
    await stopHosting(w.tutorId)
    await composer.fill(LATE)
    await composer.press('Enter')
    await expect(page.locator('.el-notification').filter({ hasText: NOT_RUNNING })).toBeVisible()
    await expect(page.locator('.chat-pane__notice.is-elsewhere')).toHaveText(NOT_RUNNING)
    await expect(page.locator('.chat-pane textarea')).toHaveCount(0)
    await photograph(page, 'hosting-not-running')
    await expect(page.locator('.chat-msg').filter({ hasText: LATE })).toHaveCount(0)
    await expect(page.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()
  })
})
