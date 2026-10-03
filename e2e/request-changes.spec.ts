import { expect, test, type Locator } from '@playwright/test'
import {
  call,
  coursePath,
  courseTab,
  demo,
  expectToasted,
  hostOnRuntime,
  keepToasts,
  openCourseTab,
  registerPerson,
  signIn,
  type CoreReply,
  type DemoActor,
} from './support'

// A teacher sends an agent's proposed grade back for changes, with a note of
// what to change, instead of rejecting it (AIShie-Core#68), from the keyboard
// alone. The agent, which does not sign in to the app, reads the note through
// Core and proposes again, naming the proposal it revises (the Revises
// header); the queue and the revision's page link to the earlier one, which
// stays on its line at a phone's width. A student who owns an agent, and
// decides nothing else, reads beside its revision what she asked it to
// change. A course agent's answer is not sent back yet: the site's runtime of
// today would leave it waiting for good.

const STAMP = Date.now().toString(36)
const FEEDBACK = `First try (${STAMP}): the code runs.`
const NOTE = `Say which tests fail, and why, before the score (${STAMP}).`
const REVISED = `Second try (${STAMP}): two edge cases fail, so 8.`
const TUTOR = `Answers-on-approval tutor ${STAMP}`
const QUESTION = `Is 0 °C 32 °F? (${STAMP})`
const ANSWER = `Yes: 0 × 9/5 + 32 = 32 (${STAMP}).`
const DRAFTER = `Sam's drafter ${STAMP}`
const DRAFT = `c_to_f drafted by Sam's agent (${STAMP})`
const DRAFT_NOTE = `Handle negative temperatures too (${STAMP}).`
const DRAFT_REVISED = `c_to_f, negatives handled, drafted by Sam's agent (${STAMP})`
let proposalId = ''
let revisionId = ''

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** An action's status as Core has it, read as whoever may read it. */
async function statusOf(token: string, id: string) {
  const got = await call(token, 'GET', `/v1/courses/${demo().course.id}/actions/${id}`)
  return got.body.result?.status as string | undefined
}

/** Takes back a proposal that still waits, as whoever may (its proposer, or its agent's owner). */
async function withdrawIfWaiting(reader: string, withdrawer: string, id: string) {
  if (!id || (await statusOf(reader, id)) !== 'proposed') return
  const out = await call(withdrawer, 'POST', `/v1/courses/${demo().course.id}/actions/${id}/withdraw`, {})
  expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
}

/**
 * Where a revision's line puts its icon: beside the first line of its link's
 * words, its middle within that line's height, and to its left.
 */
async function iconOnFirstLine(line: Locator) {
  const at = await line.evaluate((el) => {
    const icon = el.querySelector('.el-icon')!.getBoundingClientRect()
    const words = document.createRange()
    words.selectNodeContents(el.querySelector('a')!)
    const first = words.getClientRects()[0]!
    const lines = new Set([...words.getClientRects()].map((r) => Math.round(r.top))).size
    return {
      middle: icon.top + icon.height / 2,
      top: first.top,
      bottom: first.bottom,
      right: icon.right,
      left: first.left,
      lines,
    }
  })
  expect(at.middle, JSON.stringify(at)).toBeGreaterThan(at.top)
  expect(at.middle, JSON.stringify(at)).toBeLessThan(at.bottom)
  expect(at.right, JSON.stringify(at)).toBeLessThanOrEqual(at.left)
  return at
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
    // The run's course is shared by every spec: whatever of the grader's still
    // waits (the first proposal, if a test failed before it was sent back, or
    // the revision) is taken back by the agent, or a spec after this one would
    // find it in the queue.
    const d = demo()
    const I = d.actors.instructor.token
    await withdrawIfWaiting(I, d.actors.grader.token, proposalId)
    await withdrawIfWaiting(I, d.actors.grader.token, revisionId)
  })

  test('the instructor sends the grader’s proposal back with a note, from the keyboard; an empty note is refused, here and by Core', async ({
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

    // Request changes, from the keyboard: the focus goes to the note's field,
    // named for what it asks, required, and described by what it needs.
    await card.getByRole('button', { name: 'Request changes' }).focus()
    await page.keyboard.press('Enter')
    await expect(card).toContainText('The proposer is told what to change, and may propose it again')
    const note = card.getByRole('textbox', { name: 'What to change' })
    await expect(note).toBeFocused()
    await expect(note).toHaveAttribute('placeholder', 'What should change? (required: the proposer reads it)')
    await expect(note).toHaveAttribute('aria-required', 'true')
    await expect(note).toHaveAccessibleDescription(/a request for changes needs a note/)
    // Nothing is sent without a note, nor with spaces alone; the confirm
    // button says why, where Tab reaches it.
    const send = card.locator('.decide-panel__confirm').getByRole('button', { name: 'Send back for changes' })
    await expect(send).toBeDisabled()
    await expect(send).toHaveAccessibleDescription(
      'Say what should change: a request for changes needs a note, of up to 2000 characters.',
    )
    await page.keyboard.type('   ')
    await expect(send).toBeDisabled()
    await page.keyboard.press('Tab')
    await expect(send).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(note).toBeFocused()
    await note.fill('')
    await page.keyboard.type(NOTE)
    await expect(card.locator('.el-input__count')).toContainText(`${NOTE.length} / 2000`)
    await expect(send).toBeEnabled()
    await expect(note).not.toHaveAccessibleDescription(/needs a note/)
    // Type, Tab, Enter.
    await page.keyboard.press('Tab')
    await expect(send).toBeFocused()
    await page.keyboard.press('Enter')
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

    // The revision's own page says, once, that it revises the earlier one,
    // and what to change in it, in the words My actions uses.
    await card.getByRole('link', { name: 'Details' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${revisionId}$`))
    const facts = page.locator('.action-view__facts')
    const revises = facts.locator('div').filter({ has: page.locator('dt', { hasText: /^Revises$/ }) })
    await expect(revises.locator('dd')).toContainText('An earlier proposal that was sent back')
    await expect(revises.locator('dd')).toContainText(`What to change: ${NOTE}`)
    expect((await facts.innerText()).match(/Revises/g)).toHaveLength(1)
    await expect(facts).not.toContainText('What was asked')

    await revises.getByRole('link', { name: 'An earlier proposal that was sent back' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${proposalId}$`))
    await expect(page.locator('.page-header')).toContainText('Changes requested')
    await expect(page.getByText(`What to change: ${NOTE}`)).toBeVisible()
    // The earlier one says nothing of what revised it.
    await expect(page.locator('.action-view__facts')).not.toContainText('Revises')

    // The course's activity lists this proposal's request for changes.
    await page.goto(coursePath('activity'))
    const sentBack = page
      .locator('.event-item')
      .filter({ hasText: 'Proposal sent back for changes' })
      .filter({ has: page.locator(`a.event-item__subject[href$="/actions/${proposalId}"]`) })
    await expect(sentBack).toHaveCount(1)
    await expect(sentBack).toBeVisible()
  })

  test('at a phone’s width, the queue card’s revision line keeps its icon beside its words', async ({ page }) => {
    const d = demo()
    await page.setViewportSize({ width: 375, height: 812 })
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('approvals'))
    const card = page.locator('.action-card').filter({ hasText: REVISED })
    await expect(card).toHaveCount(1)
    const line = card.locator('.revises-line')
    await expect(line).toBeVisible()
    // The words wrap at this width, and the icon stays with the first line of them.
    const at = await iconOnFirstLine(line)
    expect(at.lines, JSON.stringify(at)).toBeGreaterThan(1)

    await page.goto(coursePath(`actions/${revisionId}`))
    await iconOnFirstLine(page.locator('.action-view__facts .revises-line'))
  })
})

test.describe.serial('the owner of the agent that revises, who decides nothing else', () => {
  const sam = {
    who: null as (DemoActor & { member_id: string }) | null,
    agent: { actor_id: '', token: '' },
    proposalId: '',
    revisionId: '',
  }

  test.afterAll(async () => {
    if (!sam.who) return
    // What still waits is taken back by her agent, which is suspended.
    await withdrawIfWaiting(sam.who.token, sam.agent.token, sam.proposalId)
    await withdrawIfWaiting(sam.who.token, sam.agent.token, sam.revisionId)
    if (sam.agent.actor_id) await call(sam.who.token, 'POST', `/v1/me/agents/${sam.agent.actor_id}/suspend`, {})
  })

  test('a student sends her agent’s draft back from the keyboard, and reads what to change beside its revision', async ({
    page,
  }) => {
    await keepToasts(page)
    const d = demo()
    const c = d.course.id
    // Sam, a student of the course, who decides nothing, brings in an agent
    // of her own, which writes her work only by proposal.
    const email = `sam+${STAMP}@revises.test`
    const person = await registerPerson(`Sam Ho ${STAMP}`, { email })
    const seat = await call(d.actors.instructor.token, 'POST', `/v1/courses/${c}/members`, {
      actor_id: person.actor_id,
      preset: 'student',
    })
    expect(seat.body.status, JSON.stringify(seat.body)).toBe('executed')
    sam.who = { ...person, email, member_id: seat.body.result.member_id }
    const agent = await call(person.token, 'POST', '/v1/me/agents', { display_name: DRAFTER, hosting: 'mcp' })
    sam.agent.actor_id = agent.body.result.actor_id
    const tok = await call(person.token, 'POST', `/v1/me/agents/${sam.agent.actor_id}/tokens`, {
      label: `e2e ${STAMP}`,
    })
    sam.agent.token = tok.body.result.token
    const req = await call(person.token, 'POST', `/v1/courses/${c}/delegates`, {
      actor_id: sam.agent.actor_id,
      preset: 'delegate',
      answers_course: false,
      perms: { submission_write: 'confirm_required' },
    })
    expect(req.body.status, JSON.stringify(req.body)).toBe('proposed')
    const seated = await call(
      d.actors.instructor.token,
      'POST',
      `/v1/courses/${c}/actions/${req.body.action_id}/decide`,
      {
        decision: 'approve',
      },
    )
    expect(seated.body.result?.outcome, JSON.stringify(seated.body)).toBe('executed')
    const draft = await call(sam.agent.token, 'POST', `/v1/courses/${c}/submissions`, {
      assignment_id: d.course.assignments.hw1,
      student_member_id: sam.who.member_id,
      body: DRAFT,
    })
    expect(draft.body.status, JSON.stringify(draft.body)).toBe('proposed')
    sam.proposalId = draft.body.action_id!

    // She sends it back, as its owner: Request changes, type, Tab, Enter.
    await signIn(page, sam.who)
    await page.goto(coursePath())
    await openCourseTab(page, 'Your agents’ proposals')
    const card = page.locator('.action-card').filter({ hasText: DRAFTER })
    await expect(card).toHaveCount(1)
    await card.getByRole('button', { name: 'Request changes' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('textbox', { name: 'What to change' })).toBeFocused()
    await page.keyboard.type(DRAFT_NOTE)
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: 'Send back for changes' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expectToasted(page, 'Sent back for changes, as its owner')
    expect(await statusOf(sam.who.token, sam.proposalId)).toBe('changes_requested')

    // Her agent proposes the draft again, naming the one it revises.
    const again = await proposeRevising(
      sam.agent.token,
      `/v1/courses/${c}/submissions`,
      { assignment_id: d.course.assignments.hw1, student_member_id: sam.who.member_id, body: DRAFT_REVISED },
      sam.proposalId,
    )
    expect(again.body.status, JSON.stringify(again.body)).toBe('proposed')
    sam.revisionId = again.body.action_id!

    // Its page, which she reads as its agent's owner, says what she asked it to change.
    await page.goto(coursePath(`actions/${sam.revisionId}`))
    await expect(page.locator('.page-header')).toContainText('Awaiting approval')
    // Read with action.get, as its agent's owner: not from her own actions.
    await expect(page.getByText('This is your own agent’s action.')).toBeVisible()
    const facts = page.locator('.action-view__facts')
    await expect(facts).toContainText('An earlier proposal that was sent back')
    await expect(facts).toContainText(`What to change: ${DRAFT_NOTE}`)
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
