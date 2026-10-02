import { expect, test } from '@playwright/test'
import {
  call,
  coursePath,
  courseTab,
  demo,
  expectToasted,
  keepToasts,
  registerPerson,
  root,
  signIn,
  signInAsRoot,
} from './support'

const STAMP = Date.now().toString(36)
const FEEDBACK = `Second opinion (${STAMP}): the testing is thin.`
const REASON = `Already graded at 9.5; this one misreads the rubric (${STAMP}).`
const PIA_FEEDBACK = `A third opinion (${STAMP}).`
const PIA_REASON = `Leave HW1 to its grader (${STAMP}).`
let proposalId = ''

test.describe.serial('rejecting a proposal, then archiving the course', () => {
  test.afterAll(async () => {
    // The run's course is shared by every spec: open it again for whatever
    // runs after this file.
    const d = demo()
    const got = await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}`)
    if (got.body.result?.status !== 'archived') return
    const out = await call(root().token, 'POST', `/v1/courses/${d.course.id}/activate`, {})
    expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  })

  test('the grader proposes a grade; the instructor rejects it with a reason', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    const out = await call(d.actors.grader.token, 'POST', `/v1/courses/${d.course.id}/grades`, {
      submission_id: d.course.submissions.yuki_hw1,
      score: '6',
      feedback: FEEDBACK,
    })
    expect(out.body.status, JSON.stringify(out.body)).toBe('proposed')
    proposalId = out.body.action_id!

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Approvals').click()
    const card = page.locator('.action-card').filter({ hasText: FEEDBACK })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('grader-v2')
    await expect(card).toContainText('6 / 10')

    await card.getByRole('button', { name: 'Reject' }).click()
    await expect(card).toContainText('Nothing is carried out. The proposer is told.')
    await card.getByPlaceholder('Why? (optional, but it helps whoever proposed it)').fill(REASON)
    await card.locator('.decide-panel__confirm').getByRole('button', { name: 'Reject' }).click()
    await expectToasted(page, 'Rejected')

    // Gone from the queue, and listed as decided just now.
    await expect(card).toHaveCount(0)
    const recent = page.locator('.approvals__recent')
    await expect(recent).toContainText('Enter a grade')
    await expect(recent).toContainText('Rejected')

    // Rejecting made no grade.
    const grades = await call(
      d.actors.instructor.token,
      'GET',
      `/v1/courses/${d.course.id}/grades?student_member_id=${d.actors.yuki.member_id}`,
    )
    expect((grades.body.result.grades ?? []).some((g: { score: string | number }) => Number(g.score) === 6)).toBe(false)
  })

  // The grader, an agent, learns it from Core (it does not sign in to the
  // app); the proposal's page says the same to the people in the course.
  test('the grader learns it was rejected, and why; the proposal’s page says so', async ({ page }) => {
    const d = demo()
    const mine = await call(d.actors.grader.token, 'GET', `/v1/courses/${d.course.id}/actions/mine?limit=100`)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const theirs = (mine.body.result.actions as { id: string; status: string; result?: any }[]).find(
      (a) => a.id === proposalId,
    )
    expect(theirs?.status, JSON.stringify(theirs)).toBe('rejected')
    expect(theirs?.result?.decision?.reason).toBe(REASON)

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`actions/${proposalId}`))
    await expect(page.locator('.page-header')).toContainText('Enter a grade')
    await expect(page.locator('.page-header')).toContainText('Rejected')
    await expect(page.locator('.action-timeline')).toContainText('Rejected by')
    await expect(page.getByText(`Why: ${REASON}`)).toBeVisible()
  })

  test('a person whose grades need approval sees in My actions that one was rejected, and why', async ({ page }) => {
    const d = demo()
    const I = d.actors.instructor.token
    // A teaching assistant of the test's own, whose grades wait for the instructor.
    const pia = await registerPerson(`Pia Proposer ${STAMP}`, { email: `pia+${STAMP}@e2e.test` })
    const seat = await call(I, 'POST', `/v1/courses/${d.course.id}/members`, {
      actor_id: pia.actor_id,
      preset: 'ta',
      perms: { grade_submit: 'confirm_required' },
    })
    expect(seat.body.status, JSON.stringify(seat.body)).toBe('executed')
    const proposed = await call(pia.token, 'POST', `/v1/courses/${d.course.id}/grades`, {
      submission_id: d.course.submissions.yuki_hw1,
      score: '7',
      feedback: PIA_FEEDBACK,
    })
    expect(proposed.body.status, JSON.stringify(proposed.body)).toBe('proposed')
    const piaProposal = proposed.body.action_id!
    const rejected = await call(I, 'POST', `/v1/courses/${d.course.id}/actions/${piaProposal}/decide`, {
      decision: 'reject',
      reason: PIA_REASON,
    })
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200)

    await signIn(page, pia)
    await page.goto(coursePath())
    await courseTab(page, 'My actions').click()
    const row = page.locator('.el-table__row').filter({ hasText: PIA_REASON })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Enter a grade')
    await expect(row).toContainText('7 / 10')
    await expect(row).toContainText('Rejected')
    await expect(row).toContainText(`Why: ${PIA_REASON}`)

    await row.getByRole('link', { name: 'Enter a grade' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${piaProposal}$`))
    await expect(page.locator('.page-header')).toContainText('Rejected')
    await expect(page.locator('.action-timeline')).toContainText('Rejected by')
    await expect(page.getByText(`Why: ${PIA_REASON}`)).toBeVisible()

    // The run's course is shared: the seat goes again.
    const gone = await call(I, 'POST', `/v1/courses/${d.course.id}/members/${seat.body.result.member_id}/remove`, {})
    expect(gone.body.status, JSON.stringify(gone.body)).toBe('executed')
  })

  // Last: it archives the run's course (reopened again after the file).
  test('root archives the course; the instructor finds it read-only', async ({ page, browser }) => {
    await keepToasts(page)
    const d = demo()
    await signInAsRoot(page)
    await page.goto(`/admin/courses/${d.course.id}`)
    const header = page.locator('.page-header')
    await expect(header).toContainText('Introduction to Programming')
    await expect(header).toContainText('Active')
    await header.getByRole('button', { name: 'Archive' }).click()
    const box = page.getByRole('dialog', { name: 'Archive CS101 · A?' })
    await box.getByRole('button', { name: 'Archive' }).click()
    await expectToasted(page, 'The course is archived')
    await expect(header).toContainText('Archived')
    await expect(header.getByRole('button', { name: 'Reopen' })).toBeVisible()

    // The instructor, in a browser of their own.
    const context = await browser.newContext()
    const ip = await context.newPage()
    await signIn(ip, d.actors.instructor)
    await ip.goto(coursePath())
    await expect(
      ip.getByText('This course is archived: it can be read, but nothing in it can be changed.'),
    ).toBeVisible()
    await expect(ip.locator('.course-head')).toContainText('Archived')

    await courseTab(ip, 'Materials').click()
    await expect(ip.getByRole('button', { name: 'New material' })).toBeDisabled()
    await ip.locator('.material-row').filter({ hasText: 'Week 2 — Variables and types' }).click()
    await expect(ip.getByRole('button', { name: 'New version' })).toBeDisabled()
    await expect(ip.getByRole('button', { name: 'Publish this version' })).toBeDisabled()

    await courseTab(ip, 'Assignments').click()
    await expect(ip.getByRole('button', { name: 'New assignment' })).toBeDisabled()
    await ip.goto(coursePath(`assignments/${d.course.assignments.hw2}`))
    await expect(ip.locator('.page-header').getByRole('button', { name: 'Edit' })).toBeDisabled()
    await expect(ip.locator('.page-header').getByRole('button', { name: 'Publish' })).toBeDisabled()

    await ip.goto(coursePath(`submissions/${d.course.submissions.yuki_hw1}`))
    await expect(ip.getByText('The course is archived: grades can no longer be entered.')).toBeVisible()
    await expect(ip.getByRole('button', { name: 'Mark as late' })).toBeDisabled()

    await courseTab(ip, 'Grades').click()
    await expect(ip.getByRole('button', { name: 'Enter a component grade' })).toBeDisabled()

    await courseTab(ip, 'Grading scheme').click()
    await expect(ip.getByRole('button', { name: 'Add component' })).toBeDisabled()

    await courseTab(ip, 'Members').click()
    await expect(ip.getByRole('button', { name: 'Add member' })).toBeDisabled()
    await ip.locator('.el-table__row').filter({ hasText: 'Ken Wong' }).click()
    await expect(ip.locator('.page-header').getByRole('button', { name: 'Pause' })).toBeDisabled()
    await expect(ip.getByRole('button', { name: 'Edit permissions' })).toBeDisabled()

    await courseTab(ip, 'Approvals').click()
    // Whatever still waits (the seeded proposal, unless the worked example has
    // approved it) cannot be decided now.
    const pending = ip.locator('.action-card').first()
    await expect(pending.or(ip.getByText('Nothing is waiting for approval.'))).toBeVisible()
    if (await pending.count()) {
      await expect(pending.getByRole('button', { name: 'Approve' })).toBeDisabled()
      await expect(pending.getByRole('button', { name: 'Reject' })).toBeDisabled()
      await expect(pending).toContainText('The course is archived: nothing can be decided in it.')
    }
    await context.close()
  })
})
