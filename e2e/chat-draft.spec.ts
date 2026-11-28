/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  arCall,
  arList,
  arMessages,
  call,
  coursePath,
  demo,
  hostARAgent,
  releaseARAgent,
  inTraditionalChinese,
  modelRules,
  photograph,
  signIn,
  type CoreReply,
} from './support'

test.skip(!process.env.E2E_RUNTIME_URL, 'AR chat requires scripts/ci-runtime.sh start')

// A real AR generation writes the draft shown over SSE. The deterministic
// provider is delayed only to let the browser observe that working state; no
// Core conversation.answer, inbox, draft or agent-token write is involved.

const STAMP = Date.now().toString(36)
const TUTOR = `Draft tutor ${STAMP}`
const QUESTION = `攝氏怎樣換成華氏？ (${STAMP})`
const HIDDEN_QUESTION = `幫我檢查我的思路 (${STAMP})`
const HIDDEN_ANSWER = 'This text is not for the asker to see yet.'

const w = { tutorId: '', hostedId: '', seatId: '', pending: new Set<string>() }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A course agent seated in Core, hosted and given the deterministic model in AR. */
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
  w.hostedId = (await hostARAgent(d.actors.instructor, w.tutorId)).id
}

/** Core still owns the seat's answer level; AR owns the answer and its approval. */
async function answersAt(level: 'autonomous' | 'confirm_required') {
  const d = demo()
  done(
    await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/members/${w.seatId}/perms`, {
      perms: { conversation_answer: level },
    }),
    'member.update_perms',
  )
}

async function conversationTitled(title: string) {
  const d = demo()
  let id: string | undefined
  await expect
    .poll(async () => {
      id = (await arList(d.actors.yuki, d.course.id)).find((c) => c.title === title)?.id
      return id ?? null
    })
    .not.toBeNull()
  return id!
}

async function pendingApproval(conversationId: string) {
  const d = demo()
  let id: string | undefined
  await expect
    .poll(async () => {
      const out = await arCall<{ approvals: { id: string; conversation_id: string }[] }>(
        d.actors.instructor,
        'GET',
        `/chat/approvals?course_id=${d.course.id}&state=pending&limit=100`,
      )
      id = out.body.approvals.find((a) => a.conversation_id === conversationId)?.id
      return id ?? null
    })
    .not.toBeNull()
  w.pending.add(id!)
  return id!
}

async function rejectIfPending(id: string) {
  const d = demo()
  const got = await arCall<{ approval: { state: string } }>(d.actors.instructor, 'GET', `/chat/approvals/${id}`)
  if (got.status === 200 && got.body.approval.state === 'pending') {
    const rejected = await arCall(d.actors.instructor, 'POST', `/chat/approvals/${id}/decision`, {
      decision: 'reject',
      reason: 'draft test complete',
      idempotency_key: `draft-cleanup-${STAMP}-${id}`,
    })
    expect(rejected.status).toBe(200)
  }
  w.pending.delete(id)
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
  await expect(panel.locator('.chat-pane__draft .chat-draft')).toBeVisible()
  return panel
}

test.describe.serial('an AR answer in the making', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    await seatTutor(TUTOR)
  })

  test.afterAll(async () => {
    for (const id of [...w.pending]) await rejectIfPending(id)
    if (w.seatId) await answersAt('autonomous')
    await releaseARAgent(demo().actors.instructor, w.hostedId)
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test.beforeEach(async ({ page }) => {
    await signIn(page, demo().actors.yuki)
    await inTraditionalChinese(page)
  })

  test('shows the real runner’s working steps before the deterministic answer takes their place', async ({ page }) => {
    const text =
      '華氏等於攝氏乘以 9/5，再加 32：\n\n```python\ndef c_to_f(c):\n    return c * 9 / 5 + 32\n```\n\n所以 **100°C** 就是'
    modelRules([{ match: QUESTION, answer: `${text} 212°F。`, delayMs: 1_200 }])
    const panel = await ask(page, TUTOR, QUESTION)
    const draft = panel.locator('.chat-pane__draft .chat-draft')

    // The first delta has not arrived yet: this is AR's own working step.
    await expect(draft).toBeVisible()
    await expect(draft.locator('.chat-steps__text').filter({ hasText: '思考中…' }).first()).toBeVisible()
    await expect(draft.locator('.chat-steps__step.is-running .chat-spinner')).toBeVisible()
    await expect(panel.locator('.chat-pane__typing .chat-status')).toHaveCount(0)
    await page.mouse.move(900, 200)
    await photograph(page, 'draft-ar-steps')

    // The real provider's posted answer replaces the draft; its Markdown is intact.
    const answer = panel.locator('.chat-msg.is-agent').filter({ hasText: '212°F' })
    await expect(answer).toBeVisible({ timeout: 20_000 })
    await expect(answer.locator('.md-code__lang')).toHaveText('python')
    await expect(answer.locator('strong')).toHaveText('100°C')
    await expect(panel.locator('.chat-draft')).toHaveCount(0)
    await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)

    const id = await conversationTitled(QUESTION)
    const stored = await arMessages(demo().actors.yuki, demo().course.id, id)
    expect(stored.messages.some((m) => m.role === 'assistant' && m.status === 'posted' && m.body?.endsWith('212°F。'))).toBe(true)
  })

  test('shows only AR steps while its answer awaits confirmation, then an AR pending answer', async ({ page }) => {
    await answersAt('confirm_required')
    modelRules([{ match: HIDDEN_QUESTION, answer: HIDDEN_ANSWER, delayMs: 1_200 }])
    const panel = await ask(page, TUTOR, HIDDEN_QUESTION)
    const draft = panel.locator('.chat-pane__draft .chat-draft')

    await expect(draft.locator('.chat-draft__hidden')).toHaveText('答案需經確認後才會顯示。')
    await expect(draft.locator('.chat-steps__text').filter({ hasText: '思考中…' }).first()).toBeVisible()
    await expect(panel).not.toContainText('not for the asker')
    await page.mouse.move(900, 200)
    await photograph(page, 'draft-ar-hidden')

    // Generation has finished into AR's own pending approval. Its text stays hidden.
    await expect(panel.locator('.chat-msg__lifecycle').filter({ hasText: '正在等待批准。' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(panel.locator('.chat-draft')).toHaveCount(0)
    await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)
    await expect(panel).not.toContainText('not for the asker')

    const id = await conversationTitled(HIDDEN_QUESTION)
    const stored = await arMessages(demo().actors.yuki, demo().course.id, id)
    expect(stored.conversation.state).toBe('reply_pending_approval')
    const approval = await pendingApproval(id)
    await rejectIfPending(approval)
  })
})
