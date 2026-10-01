/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  hostOnRuntime,
  inTraditionalChinese,
  photograph,
  signIn,
  type CoreReply,
} from './support'

// While a course agent writes its answer, the one who asked watches it come:
// its runtime writes a draft (conversation.draft) as it works, and the open
// conversation, waiting on Core with the draft's version, shows it at once:
// the steps, done and running, then the text so far with a caret, the steps
// done summed up above it. The posted answer takes its place. Where the
// agent's answers wait for someone's confirmation, the asker sees the steps
// alone, and that the answer shows once confirmed. This test plays the
// runtime, through Core's API, as the agent. Against a Core without drafts
// (its catalogue has no conversation.draft), there is nothing to watch.

const STAMP = Date.now().toString(36)
const TUTOR = `Draft tutor ${STAMP}`
const QUESTION = `攝氏怎樣換成華氏？ (${STAMP})`
const HIDDEN_QUESTION = `幫我檢查我的思路 (${STAMP})`

const w = { tutorToken: '', tutorId: '', seatId: '', drafts: false }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A course agent of the instructor's, seated to answer the course, with a runtime that takes conversations here. */
async function seatTutor(name: string) {
  const d = demo()
  const I = d.actors.instructor.token
  w.tutorId = done(
    await call(I, 'POST', '/v1/me/agents', { display_name: name, hosting: 'runtime' }),
    'agent.create',
  ).actor_id
  w.seatId = done(
    await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
      actor_id: w.tutorId,
      preset: 'course_tutor',
      answers_course: true,
    }),
    'member.add_delegate',
  ).member_id as string
  // Hosted as the site's runtime hosts it: issued its one token, which answers as the agent.
  w.tutorToken = await hostOnRuntime(w.tutorId)
}

/** How the agent's answers are posted: at once (autonomous), or once someone confirms them. */
async function answersAt(level: 'autonomous' | 'confirm_required') {
  const d = demo()
  done(
    await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/members/${w.seatId}/perms`, {
      perms: { conversation_answer: level },
    }),
    'member.update_perms',
  )
}

/** The conversation waiting in an agent's inbox, and the question it waits on. */
async function waitingFor(token: string) {
  const c = demo().course.id
  let conv: { id: string; latest_opener_message_id: string } | undefined
  await expect
    .poll(async () => {
      const inbox = await call(token, 'GET', `/v1/courses/${c}/conversations/inbox`)
      conv = (inbox.body.result?.conversations ?? [])[0]
      return conv?.latest_opener_message_id ?? null
    })
    .not.toBeNull()
  return conv!
}

/** Writes the agent's draft of its answer, as its runtime does (an ephemeral write: no idempotency key needed). */
async function writeDraft(token: string, conversationId: string, draft: Record<string, unknown>) {
  const r = await call(token, 'POST', `/v1/courses/${demo().course.id}/conversations/${conversationId}/draft`, {
    attempt: `attempt-${STAMP}`,
    ...draft,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  if (!draft.done) expect(r.body.result?.stored, JSON.stringify(r.body)).toBe(true)
}

async function ask(page: Page, agent: string, question: string) {
  await page.goto(coursePath())
  await expect(page.locator('.course-head')).toBeVisible()
  await page.locator('#chat-panel-toggle').click()
  const panel = page.locator('#chat-panel')
  await panel.locator('button.resp-row').filter({ hasText: agent }).click()
  const composer = panel.locator('textarea')
  await composer.fill(question)
  await composer.press('Enter')
  await expect(panel.locator('.chat-msg').filter({ hasText: question })).toBeVisible()
  await expect(panel.locator('.chat-pane__typing')).toBeVisible()
  return panel
}

test.describe.serial('an answer in the making', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    const tools = await fetch(`${demo().core}/v1/tools`).then((r) => r.json())
    w.drafts = (tools.tools ?? []).some((t: { name: string }) => t.name === 'conversation.draft')
    if (!w.drafts) return
    await seatTutor(TUTOR)
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test.beforeEach(async ({ page }) => {
    test.skip(!w.drafts, 'this Core keeps no drafts (no conversation.draft in its catalogue)')
    await signIn(page, demo().actors.yuki)
    await inTraditionalChinese(page)
  })

  test('shows the agent’s steps as it works, then its text with a caret, until the answer takes its place', async ({
    page,
  }) => {
    const panel = await ask(page, TUTOR, QUESTION)
    const conv = await waitingFor(w.tutorToken)
    const draft = panel.locator('.chat-pane__draft .chat-draft')

    await writeDraft(w.tutorToken, conv.id, {
      version: 1,
      steps: [
        { kind: 'thinking', state: 'done' },
        { kind: 'reading_assignment', target: 'HW1 — Temperature converter', state: 'done' },
        { kind: 'reading_document', target: 'Week 1 — Welcome and setup', state: 'done' },
        { kind: 'searching_memory', state: 'running' },
      ],
    })
    await expect(draft.locator('.chat-steps__text')).toHaveText([
      '已思考',
      '已閱讀作業《HW1 — Temperature converter》',
      '已閱讀《Week 1 — Welcome and setup》',
      '正在搜尋記憶…',
    ])
    await expect(draft.locator('.chat-steps__step.is-running .chat-spinner')).toBeVisible()
    await expect(panel.locator('.chat-pane__typing .chat-status')).toHaveCount(0)
    await page.mouse.move(900, 200)
    await photograph(page, 'draft-steps')

    const steps = [
      { kind: 'thinking', state: 'done' },
      { kind: 'reading_assignment', target: 'HW1 — Temperature converter', state: 'done' },
      { kind: 'reading_document', target: 'Week 1 — Welcome and setup', state: 'done' },
      { kind: 'searching_memory', state: 'done' },
      { kind: 'writing', state: 'running' },
    ]
    await writeDraft(w.tutorToken, conv.id, { version: 2, steps, text: '華氏等於攝氏乘以 9/5' })
    await expect(draft.locator('.is-streaming')).toContainText('華氏等於攝氏乘以 9/5')
    const text =
      '華氏等於攝氏乘以 9/5，再加 32：\n\n```python\ndef c_to_f(c):\n    return c * 9 / 5 + 32\n```\n\n所以 **100°C** 就是'
    await writeDraft(w.tutorToken, conv.id, { version: 3, text })
    await expect(draft.locator('.is-streaming strong')).toHaveText('100°C')
    await expect(draft.locator('.md-code__lang')).toHaveText('python')
    // The steps done, in one line, which opens to list them.
    const summary = draft.getByRole('button', { name: '已查閱 3 項' })
    await expect(summary).toHaveAttribute('aria-expanded', 'false')
    await page.mouse.move(900, 200)
    await photograph(page, 'draft-streaming')
    await summary.click()
    await expect(draft.locator('.chat-steps__text')).toHaveCount(5)

    // Posted: the answer takes the draft's place.
    done(
      await call(w.tutorToken, 'POST', `/v1/courses/${demo().course.id}/conversations/${conv.id}/answer`, {
        in_reply_to_message_id: conv.latest_opener_message_id,
        body: `${text} 212°F。`,
      }),
      'conversation.answer',
    )
    await expect(panel.locator('.chat-msg.is-agent').filter({ hasText: '212°F' })).toBeVisible()
    await expect(panel.locator('.chat-draft')).toHaveCount(0)
    await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)
  })

  test('shows only the steps where the answer waits for confirmation, and says it shows once confirmed', async ({
    page,
  }) => {
    // Its answers now wait for someone's confirmation.
    await answersAt('confirm_required')
    const panel = await ask(page, TUTOR, HIDDEN_QUESTION)
    const conv = await waitingFor(w.tutorToken)
    await writeDraft(w.tutorToken, conv.id, {
      version: 1,
      steps: [
        { kind: 'reading_submission', target: 'HW1 — Temperature converter', state: 'done' },
        { kind: 'writing', state: 'running' },
      ],
      text: 'This text is not for the asker to see yet.',
    })
    const draft = panel.locator('.chat-pane__draft .chat-draft')
    await expect(draft.locator('.chat-draft__hidden')).toHaveText('答案需經確認後才會顯示。')
    await expect(draft.locator('.chat-steps__text')).toHaveText([
      '已查看提交《HW1 — Temperature converter》',
      '正在撰寫回答…',
    ])
    await expect(panel).not.toContainText('not for the asker')
    await page.mouse.move(900, 200)
    await photograph(page, 'draft-hidden')
    // Given up: the draft goes, and the working line is back.
    await writeDraft(w.tutorToken, conv.id, { version: 2, done: true })
    await expect(panel.locator('.chat-draft')).toHaveCount(0)
    await expect(panel.locator('.chat-pane__typing .chat-status')).toBeVisible()
  })
})
