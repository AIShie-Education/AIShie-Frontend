import { expect, test } from '@playwright/test'
import { call, courseTab, coursePath, demo, root, signIn, signInWithToken, toast } from './support'

const STAMP = Date.now().toString(36)
const FEEDBACK = `Second opinion (${STAMP}): the testing is thin.`
const REASON = `Already graded at 9.5; this one misreads the rubric (${STAMP}).`
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
    await expect(toast(page, 'Rejected')).toBeVisible()

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

  test('the grader sees in My actions that it was rejected, and why', async ({ page }) => {
    const d = demo()
    await signInWithToken(page, d.actors.grader)
    await page.goto(coursePath('my-actions'))
    const row = page.locator('.el-table__row').filter({ hasText: REASON })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Enter a grade')
    await expect(row).toContainText('6 / 10')
    await expect(row).toContainText('Rejected')
    await expect(row).toContainText(`Why: ${REASON}`)

    await row.getByRole('link', { name: 'Enter a grade' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${proposalId}$`))
    await expect(page.locator('.page-header')).toContainText('Rejected')
    await expect(page.locator('.action-timeline')).toContainText('Rejected by')
    await expect(page.getByText(`Why: ${REASON}`)).toBeVisible()
  })

  // Last: it archives the run's course (reopened again after the file).
  test('root archives the course; the instructor finds it read-only', async ({ page, browser }) => {
    const d = demo()
    await signInWithToken(page, root())
    await page.goto(`/admin/courses/${d.course.id}`)
    const header = page.locator('.page-header')
    await expect(header).toContainText('Introduction to Programming')
    await expect(header).toContainText('Active')
    await header.getByRole('button', { name: 'Archive' }).click()
    const box = page.getByRole('dialog', { name: 'Archive CS101 · A?' })
    await box.getByRole('button', { name: 'Archive' }).click()
    await expect(toast(page, 'The course is archived')).toBeVisible()
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
