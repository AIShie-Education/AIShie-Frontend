import { expect, test, type Page } from '@playwright/test'
import { call, coursePath, demo, signIn, toast, type CoreReply } from './support'

// An agent takes conversations in the site only while whatever runs it says
// so with its token (me.site_chat), as an AIShie runtime does each time it
// starts it; one operated from an external tool, such as Claude through MCP,
// never does, and has no chat box anywhere in the site. Told through two
// agents made for this run: the instructor's course agent, and Ken's own
// assistant. Neither is offered while nothing has said so, and the page says
// why, to the student and to the owner. Once the course agent's runtime says
// it answers, Ken opens a conversation with it. When its owner switches that
// off, the conversation stays readable, and says why in place of its
// composer; and a question sent just as it is switched off is refused in the
// same words.

const STAMP = Date.now().toString(36)
const TUTOR = `Lab tutor ${STAMP}`
const HELPER = `Ken's notes ${STAMP}`
const QUESTION = `Does the lab start at nine? (${STAMP})`
const ANSWER = `It does, in room 2 (${STAMP}).`
const LATE = `And where do we meet? (${STAMP})`
const NOTE =
  'This agent is operated from an external tool (such as Claude through MCP); it does not take conversations on the site.'
const OWNER_LINE = 'When AIshie’s runtime hosts it, it takes conversations on the site by itself.'

const w = { tutorId: '', tutorMember: '', tutorToken: '', helperId: '', helperMember: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** What runs the course agent says, with its token, whether it answers in the site. */
async function tutorSays(on: boolean) {
  const out = done(await call(w.tutorToken, 'POST', '/v1/me/site-chat', { on }), 'me.site_chat')
  expect(out.site_chat).toBe(on)
}

async function respondentNames(token: string): Promise<string[]> {
  const r = await call(token, 'GET', `/v1/courses/${demo().course.id}/conversations/respondents`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body.result.respondents ?? []).map((x: { display_name: string }) => x.display_name)
}

/** The site chat card on an agent's page. */
function siteChatCard(page: Page) {
  return page.locator('.site-chat')
}

/** The chat panel, opened from the header's button on the course's overview: it asks in the course. */
async function openChat(page: Page) {
  await page.goto(coursePath())
  await page.getByRole('button', { name: /^Chat with agents/ }).click()
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

test.describe.serial('site chat: an agent is asked here only while something that answers here runs it', () => {
  test.beforeAll(async () => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    const K = d.actors.ken.token
    // The instructor's course agent, seated to answer the course, and a token for what will run it.
    w.tutorId = done(await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR }), 'agent.create').actor_id
    w.tutorMember = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id
    w.tutorToken = done(
      await call(I, 'POST', `/v1/me/agents/${w.tutorId}/tokens`, { label: `lab runtime ${STAMP}` }),
      'agent.issue_token',
    ).token
    // Ken's own assistant, brought in with the instructor's approval, and used from a tool of his.
    w.helperId = done(await call(K, 'POST', '/v1/me/agents', { display_name: HELPER }), 'agent.create').actor_id
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
    // It is used, as Claude would use it over MCP, and never says it answers in the site.
    expect((await call(token, 'GET', '/v1/me')).status).toBe(200)
  })

  test('a student is offered no chat box with an agent operated from outside, and told why of their own', async ({
    page,
  }) => {
    const d = demo()
    // Core offers neither: nothing has said either answers in the site.
    expect(await respondentNames(d.actors.ken.token)).not.toContain(TUTOR)
    expect(await respondentNames(d.actors.ken.token)).not.toContain(HELPER)
    const agent = done(await call(d.actors.ken.token, 'GET', `/v1/me/agents/${w.helperId}`), 'agent.get')
    expect(agent.site_chat).toBe(false)

    await signIn(page, d.actors.ken)
    const panel = await openChat(page)
    // Nothing to click for either: no chat box can be opened with them.
    await expect(panel.locator('button.resp-row').filter({ hasText: TUTOR })).toHaveCount(0)
    await expect(panel.locator('button.resp-row').filter({ hasText: HELPER })).toHaveCount(0)
    await expect(panel.locator('.resp-row').filter({ hasText: TUTOR })).toHaveCount(0)
    // His own is listed, with why he cannot ask it here, and what would change that.
    const own = panel.locator('.resp-row.is-elsewhere').filter({ hasText: HELPER })
    await expect(own).toBeVisible()
    await expect(own).toContainText('Your agent')
    await expect(own).toContainText('Personal assistant')
    await expect(own).toContainText('Operated from outside')
    await expect(own).toContainText(NOTE)
    await expect(own).toContainText(OWNER_LINE)
    await expect(own.getByRole('button')).toHaveCount(0)
    await expect(page.locator('.chat-pane textarea')).toHaveCount(0)

    // Its page tells its owner the same, and offers nothing to switch on.
    await own.getByRole('link', { name: 'Go to its page' }).click()
    await expect(page).toHaveURL(new RegExp(`/account/agents/${w.helperId}$`))
    const card = siteChatCard(page)
    await expect(card.getByRole('heading', { name: 'Conversations on the site' })).toBeVisible()
    await expect(card).toContainText('Operated from outside')
    await expect(card).toContainText(NOTE)
    await expect(card).toContainText(OWNER_LINE)
    await expect(card.getByRole('button')).toHaveCount(0)
  })

  test('the owner of a course agent operated from outside is told so on its page and on the course’s agents', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${w.tutorId}`)
    const card = siteChatCard(page)
    await expect(card).toContainText('Operated from outside')
    await expect(card).toContainText(NOTE)
    await expect(card).toContainText(OWNER_LINE)
    await expect(card.getByRole('button')).toHaveCount(0)

    // Staff see which of the course's agents nobody can ask here.
    await page.goto(coursePath('agents'))
    const row = page.locator('.agent-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Operated from outside')
    await expect(row).toContainText('Students cannot ask it on the site: it is operated from an external tool.')
    // Its owner asks it nothing here either: listed among their own agents, with why. (The address
    // the course's conversations once had opens the panel on the course.)
    await page.goto(coursePath('conversations'))
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    const panel = page.locator('#chat-panel')
    await expect(panel.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
    await expect(panel.locator('button.resp-row').filter({ hasText: TUTOR })).toHaveCount(0)
    await expect(panel.locator('.resp-row.is-elsewhere').filter({ hasText: TUTOR })).toContainText(NOTE)
  })

  test('once its runtime says it answers in the site, the student finds it and opens a conversation', async ({
    page,
    browser,
  }) => {
    const d = demo()
    await tutorSays(true)
    expect(await respondentNames(d.actors.ken.token)).toContain(TUTOR)

    await signIn(page, d.actors.ken)
    const panel = await openChat(page)
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Course agent')
    await row.click()
    const composer = panel.locator('.chat-pane textarea')
    await expect(composer).toBeVisible()
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(panel.locator('.chat-pane__typing')).toContainText(`Waiting for ${TUTOR}`)
    await expect(panel.locator('.chat-pane__notice.is-elsewhere')).toHaveCount(0)
    // The page stays where it was; the conversation is in the panel.
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    w.conversationId = await kensConversation()

    // Its owner's page says it takes them now, and offers to switch them off.
    const owner = await browser.newPage()
    await signIn(owner, d.actors.instructor)
    await owner.goto(`/account/agents/${w.tutorId}`)
    const card = siteChatCard(owner)
    await expect(card).toContainText('Takes conversations on the site')
    await expect(card.getByRole('button', { name: 'Switch off' })).toBeVisible()
    await owner.close()
  })

  test('its owner switches it off: the conversation stays readable, and says why in place of its composer', async ({
    page,
    browser,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${w.tutorId}`)
    const card = siteChatCard(page)
    await card.getByRole('button', { name: 'Switch off' }).click()
    const confirm = page.getByRole('dialog', { name: `Switch off conversations with ${TUTOR} on the site?` })
    await expect(confirm).toContainText('will no longer be able to start conversations with it on the site')
    await expect(confirm).toContainText('switches them on again the next time it starts the agent')
    await expect(confirm).toContainText('ending its hosting on AIshie, ends them too')
    await confirm.getByRole('button', { name: 'Switch off' }).click()
    await expect(toast(page, `${TUTOR} no longer takes conversations on the site`)).toBeVisible()
    await expect(card).toContainText('Operated from outside')
    await expect(card.getByRole('button')).toHaveCount(0)
    const agent = done(await call(d.actors.instructor.token, 'GET', `/v1/me/agents/${w.tutorId}`), 'agent.get')
    expect(agent.site_chat).toBe(false)
    expect(await respondentNames(d.actors.ken.token)).not.toContain(TUTOR)

    // The agent may still answer what it was asked.
    const c = d.course.id
    const got = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/${w.conversationId}`)
    expect(got.status, JSON.stringify(got.body)).toBe(200)
    const conv = got.body.result
    done(
      await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${w.conversationId}/answer`, {
        in_reply_to_message_id: conv.latest_opener_message_id,
        body: ANSWER,
      }),
      'conversation.answer',
    )

    // A link to it as it once was (a notification, a bookmark) opens it in the panel, beside the course.
    const student = await browser.newPage()
    await signIn(student, d.actors.ken)
    await student.goto(coursePath(`conversations/${w.conversationId}`))
    await expect(student).toHaveURL(new RegExp(`${coursePath()}$`))
    const panel = student.locator('#chat-panel')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()
    await expect(panel.locator('.chat-pane__notice.is-elsewhere')).toHaveText(NOTE)
    await expect(panel.locator('.chat-pane textarea')).toHaveCount(0)
    // His to close, and still listed among his conversations.
    await expect(panel.locator('.chat-pane').getByRole('button', { name: 'Close' })).toBeVisible()
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    await expect(panel.locator('.hist-row').filter({ hasText: TUTOR })).toContainText('CS101')

    // Core refuses a question to it, and says why.
    const refused = await call(d.actors.ken.token, 'POST', `/v1/courses/${c}/conversations/${w.conversationId}/ask`, {
      body: 'Anyone there?',
    })
    expect(refused.status).toBe(422)
    expect(refused.body.error?.details?.reason).toBe('agent_answers_elsewhere')
    await student.close()
  })

  test('a question sent just as it is switched off is refused, in the words the page has for it', async ({ page }) => {
    const d = demo()
    // Its runtime starts again, and says so: the student may ask it once more.
    await tutorSays(true)
    await signIn(page, d.actors.ken)
    await page.goto(coursePath(`conversations/${w.conversationId}`))
    const composer = page.locator('#chat-panel .chat-pane textarea')
    await expect(composer).toBeEnabled()

    // Switched off while the page is open, before it has looked again.
    done(
      await call(d.actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}`, { site_chat: false }),
      'agent.update',
    )
    await composer.fill(LATE)
    await composer.press('Enter')
    await expect(page.locator('.el-notification').filter({ hasText: NOTE })).toBeVisible()
    await expect(page.locator('.chat-pane__notice.is-elsewhere')).toHaveText(NOTE)
    await expect(page.locator('.chat-pane textarea')).toHaveCount(0)
    await expect(page.locator('.chat-msg').filter({ hasText: LATE })).toHaveCount(0)
    await expect(page.locator('.chat-msg').filter({ hasText: ANSWER })).toBeVisible()
  })
})
