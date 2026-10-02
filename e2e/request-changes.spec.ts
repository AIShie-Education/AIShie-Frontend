import { expect, test } from '@playwright/test'
import {
  call,
  coursePath,
  courseTab,
  demo,
  expectToasted,
  hostOnRuntime,
  keepToasts,
  signIn,
  type CoreReply,
} from './support'

// A teacher sends an agent's proposed grade back for changes, with a note of
// what to change, instead of rejecting it (AIShie-Core#68). The agent, which
// does not sign in to the app, reads the note through Core and proposes again,
// naming the proposal it revises (the Revises header); the queue and the
// revision's page link to the earlier one. A course agent's answer is not
// sent back yet: the site's runtime of today would leave it waiting for good.

const STAMP = Date.now().toString(36)
const FEEDBACK = `First try (${STAMP}): the code runs.`
const NOTE = `Say which tests fail, and why, before the score (${STAMP}).`
const REVISED = `Second try (${STAMP}): two edge cases fail, so 8.`
const TUTOR = `Answers-on-approval tutor ${STAMP}`
const QUESTION = `Is 0 °C 32 °F? (${STAMP})`
const ANSWER = `Yes: 0 × 9/5 + 32 = 32 (${STAMP}).`
let proposalId = ''
let revisionId = ''

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A write as the agent makes it, naming the proposal it revises: Core's Revises header. */
async function proposeRevising(token: string, path: string, body: unknown, revises: string) {
  const res = await fetch(demo().core + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      Revises: revises,
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as CoreReply }
}

test.describe.serial('sending a proposal back for changes, and its revision', () => {
  test.afterAll(async () => {
    // The run's course is shared by every spec: the revision, if it still
    // waits, is taken back by the agent.
    if (!revisionId) return
    const d = demo()
    const mine = await call(d.actors.grader.token, 'GET', `/v1/courses/${d.course.id}/actions/mine?limit=200`)
    const revision = (mine.body.result?.actions as { id: string; status: string }[] | undefined)?.find(
      (a) => a.id === revisionId,
    )
    if (revision?.status !== 'proposed') return
    const withdraw = `/v1/courses/${d.course.id}/actions/${revisionId}/withdraw`
    const out = await call(d.actors.grader.token, 'POST', withdraw, {})
    expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  })

  test('the instructor sends the grader’s proposal back with a note; an empty note is refused, here and by Core', async ({
    page,
  }) => {
    await keepToasts(page)
    const d = demo()
    const out = await call(d.actors.grader.token, 'POST', `/v1/courses/${d.course.id}/grades`, {
      submission_id: d.course.submissions.yuki_hw1,
      score: '7',
      feedback: FEEDBACK,
    })
    expect(out.body.status, JSON.stringify(out.body)).toBe('proposed')
    proposalId = out.body.action_id!

    // Core refuses a request for changes that says nothing, before anything is recorded.
    for (const reason of [undefined, '   ']) {
      const refused = await call(
        d.actors.instructor.token,
        'POST',
        `/v1/courses/${d.course.id}/actions/${proposalId}/decide`,
        { decision: 'request_changes', reason },
      )
      expect(refused.status, JSON.stringify(refused.body)).toBe(400)
      expect(refused.body.error?.details?.reason).toBe('note_required')
    }

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Approvals').click()
    const card = page.locator('.action-card').filter({ hasText: FEEDBACK })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('grader-v2')
    await expect(card).toContainText('7 / 10')

    await card.getByRole('button', { name: 'Request changes' }).click()
    await expect(card).toContainText('The proposer is told what to change, and may propose it again')
    const send = card.locator('.decide-panel__confirm').getByRole('button', { name: 'Send back for changes' })
    const note = card.getByPlaceholder('What should change? (required: the proposer reads it)')
    // Nothing is sent without a note, nor with spaces alone.
    await expect(send).toBeDisabled()
    await expect(card).toContainText('a request for changes needs a note')
    await note.fill('   ')
    await expect(send).toBeDisabled()
    await note.fill(NOTE)
    await expect(card.locator('.el-input__count')).toContainText(`${NOTE.length} / 2000`)
    await expect(send).toBeEnabled()
    await send.click()
    await expectToasted(page, 'Sent back for changes')

    // Gone from the queue, and listed as decided just now.
    await expect(card).toHaveCount(0)
    const recent = page.locator('.approvals__recent')
    await expect(recent).toContainText('Enter a grade')
    await expect(recent).toContainText('Sent back for changes')
  })

  test('the proposal’s page says it was sent back, by whom, and what to change; the grader reads the same', async ({
    page,
  }) => {
    const d = demo()
    const mine = await call(d.actors.grader.token, 'GET', `/v1/courses/${d.course.id}/actions/mine?limit=200`)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const theirs = (mine.body.result.actions as { id: string; status: string; result?: any }[]).find(
      (a) => a.id === proposalId,
    )
    expect(theirs?.status, JSON.stringify(theirs)).toBe('changes_requested')
    expect(theirs?.result?.decision?.decision).toBe('request_changes')
    expect(theirs?.result?.decision?.reason).toBe(NOTE)

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`actions/${proposalId}`))
    await expect(page.locator('.page-header')).toContainText('Enter a grade')
    await expect(page.locator('.page-header')).toContainText('Changes requested')
    await expect(page.locator('.action-timeline')).toContainText('Changes requested by')
    await expect(page.locator('.action-timeline')).toContainText(d.actors.instructor.display_name)
    await expect(page.getByText(`What to change: ${NOTE}`)).toBeVisible()
    // Nothing is left to decide on it.
    await expect(page.getByRole('button', { name: 'Request changes' })).toHaveCount(0)
  })

  test('the grader’s revision, naming the proposal it revises, leads back to it', async ({ page }) => {
    const d = demo()
    const out = await proposeRevising(
      d.actors.grader.token,
      `/v1/courses/${d.course.id}/grades`,
      { submission_id: d.course.submissions.yuki_hw1, score: '8', feedback: REVISED },
      proposalId,
    )
    expect(out.body.status, JSON.stringify(out.body)).toBe('proposed')
    revisionId = out.body.action_id!

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Approvals').click()
    const card = page.locator('.action-card').filter({ hasText: REVISED })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('8 / 10')
    const back = card.getByRole('link', { name: 'Revises an earlier proposal that was sent back' })
    await expect(back).toBeVisible()

    // The revision's own page says what was asked of the one it revises.
    await card.getByRole('link', { name: 'Details' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${revisionId}$`))
    const facts = page.locator('.action-view__facts')
    await expect(facts).toContainText('Revises an earlier proposal that was sent back')
    await expect(facts).toContainText(`What was asked: ${NOTE}`)

    await facts.getByRole('link', { name: 'Revises an earlier proposal that was sent back' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${proposalId}$`))
    await expect(page.locator('.page-header')).toContainText('Changes requested')
    await expect(page.getByText(`What to change: ${NOTE}`)).toBeVisible()
    // The earlier one says nothing of what revised it.
    await expect(page.locator('.action-view__facts')).not.toContainText('Revises')

    // The course's activity lists the request for changes.
    await page.goto(coursePath('activity'))
    await expect(page.getByText('Proposal sent back for changes').first()).toBeVisible()
  })
})

test.describe('a course agent’s answer, which the runtime of today does not revise', () => {
  const w = { tutorId: '', tutorToken: '', answerId: '' }

  test.afterAll(async () => {
    const d = demo()
    // The answer, if it still waits, is taken back by the agent; the agent is
    // suspended, as a person may have five agents at once, for the specs after it.
    if (w.answerId) await call(w.tutorToken, 'POST', `/v1/courses/${d.course.id}/actions/${w.answerId}/withdraw`, {})
    if (w.tutorId) await call(d.actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test('is approved or rejected, and not sent back for changes', async ({ page }) => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    // The instructor's course agent, hosted on the site's runtime (the test
    // plays it), whose answers wait for someone's confirmation.
    w.tutorId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    const seatId = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id as string
    done(
      await call(I, 'POST', `/v1/courses/${c}/members/${seatId}/perms`, {
        perms: { conversation_answer: 'confirm_required' },
      }),
      'member.update_perms',
    )
    w.tutorToken = await hostOnRuntime(w.tutorId)

    // Yuki asks it, and its answer waits for approval.
    const conv = done(
      await call(d.actors.yuki.token, 'POST', `/v1/courses/${c}/conversations`, {
        respondent_member_id: seatId,
        body: QUESTION,
      }),
      'conversation.open',
    )
    const answer = await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${conv.conversation_id}/answer`, {
      in_reply_to_message_id: conv.message_id,
      body: ANSWER,
    })
    expect(answer.body.status, JSON.stringify(answer.body)).toBe('proposed')
    w.answerId = answer.body.action_id!

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Approvals').click()
    const card = page.locator('.action-card').filter({ hasText: TUTOR })
    await expect(card).toHaveCount(1)
    await expect(card.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Request changes' })).toHaveCount(0)
  })
})
