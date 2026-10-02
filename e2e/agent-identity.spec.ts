import { expect, test } from '@playwright/test'
import {
  call,
  coursePath,
  courseTab,
  demo,
  inTraditionalChinese,
  registerPerson,
  signIn,
  type CoreReply,
} from './support'

// An agent looks like one wherever it is shown: its avatar, a rounded square
// with its initials (a person is a circle), and "AI" after its name, in every
// language; agents as a kind take the person-beside-a-seat icon, never a
// chip. What it made says so: a draft grade names the agent that drafted it,
// and what its draft fills into the form is marked until the grader changes
// it; the course's activity says who proposed and who approved. Told through
// a student registered for this run, whose HW1 the grading agent drafts a
// grade for, which the instructor approves.

const STAMP = Date.now().toString(36)
const w = { submission: '', proposal: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

test.describe.serial('an agent is shown as one, and what it made says so', () => {
  test.beforeAll(async () => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    const ada = await registerPerson(`Ada ${STAMP}`, { email: `ada+${STAMP}@identity.test` })
    done(await call(I, 'POST', `/v1/courses/${c}/members`, { actor_id: ada.actor_id, preset: 'student' }), 'member.add')
    w.submission = done(
      await call(ada.token, 'POST', `/v1/courses/${c}/submissions`, {
        assignment_id: d.course.assignments.hw1,
        body: `def c_to_f(c):\n    return (c + 32) * 9 / 5  # ${STAMP}`,
      }),
      'submission.create',
    ).submission_id
    done(
      await call(ada.token, 'POST', `/v1/courses/${c}/submissions/${w.submission}/submit`, { files: [] }),
      'submission.submit',
    )
    // The grading agent drafts her grade: its seat grades only by proposal.
    const proposed = await call(d.actors.grader.token, 'POST', `/v1/courses/${c}/grades`, {
      submission_id: w.submission,
      score: '7',
      feedback: `The formula should be c × 9/5 + 32 (${STAMP}).`,
      breakdown: [{ criterion: 'Correctness', points: 4, max: 6 }],
    })
    expect(proposed.body.status, JSON.stringify(proposed.body)).toBe('proposed')
    w.proposal = proposed.body.action_id!
    done(
      await call(I, 'POST', `/v1/courses/${c}/actions/${w.proposal}/decide`, { decision: 'approve' }),
      'action.decide',
    )
  })

  test('agents as a kind take the seat icon, and a proposal’s proposer its avatar and “AI”', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('approvals'))
    // The course's Agents tab and the activity bar's Agents view: the seat, not a chip.
    await expect(courseTab(page, 'Agents').locator('svg.agent-seat-icon')).toBeVisible()
    await expect(page.locator('.activity-bar svg.agent-seat-icon')).toBeVisible()
    // The grading agent's proposal from the demo, still waiting.
    const actor = page.locator('.action-card').filter({ hasText: 'grader-v2' }).first().locator('.action-actor')
    await expect(actor.locator('.agent-avatar')).toBeVisible()
    await expect(actor.locator('.ai-badge')).toHaveText('AI')
    await expect(actor.locator('.agent-avatar__initials')).toHaveAttribute('data-initials', 'GV')
    // The "AI" says it: no tag of "Agent" besides.
    await expect(actor).not.toContainText('Agent')
  })

  test('the activity says who proposed and who approved', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('activity'))
    const who = page
      .locator('.event-item')
      .filter({ hasText: 'Proposal approved' })
      .locator('.event-item__who')
      .filter({ hasText: 'grader-v2' })
      .first()
    await expect(who).toContainText(/grader-v2\s*AI\s*proposed\s*→\s*Sato Hiroshi.*approved/)
    await expect(who.locator('.agent-avatar')).toHaveCount(1)
  })

  test('a draft grade names the agent that drafted it, and marks what it filled in until it is changed', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`submissions/${w.submission}`))
    const panel = page.locator('.grade-panel')
    const drafter = panel.locator('.grade-panel__drafter')
    await expect(drafter).toContainText(/Drafted by\s*grader-v2\s*AI/)
    await expect(drafter.locator('.agent-avatar')).toBeVisible()

    await panel.getByRole('button', { name: 'Start from the current draft' }).click()
    const score = panel.locator('.el-form-item').filter({ has: page.getByPlaceholder('e.g. 8.5') })
    const feedback = panel.locator('.el-form-item').filter({ hasText: 'Feedback' }).first()
    await expect(score).toHaveClass(/is-prefilled/)
    await expect(feedback).toHaveClass(/is-prefilled/)
    await expect(panel.locator('.grade-panel__prefilled-note')).toContainText('as grader-v2 drafted them')

    // Changed, the score is the grader's: its mark goes, the feedback's stays.
    await page.getByPlaceholder('e.g. 8.5').fill('8')
    await expect(score).not.toHaveClass(/is-prefilled/)
    await expect(feedback).toHaveClass(/is-prefilled/)
    // Cleared, nothing is the agent's.
    await panel.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(panel.locator('.is-prefilled')).toHaveCount(0)
    await expect(panel.locator('.grade-panel__prefilled-note')).toHaveCount(0)
  })

  test('in Chinese, the “AI” stays “AI”, and a personal agent is called one', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await inTraditionalChinese(page)
    await page.goto(coursePath('approvals'))
    const actor = page.locator('.action-card').filter({ hasText: 'grader-v2' }).first().locator('.action-actor')
    await expect(actor.locator('.ai-badge')).toHaveText('AI')
    await page.goto(coursePath('agents'))
    await expect(page.locator('.course-agents')).toContainText('個人代理')
    await expect(page.locator('.course-agents')).not.toContainText('個人助手')
  })
})
