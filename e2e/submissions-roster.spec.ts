import { expect, test } from '@playwright/test'
import { call, demo, expectToasted, keepToasts, pickOption, root, signIn } from './support'

// From a pilot tester: Submissions said it listed work marked missing, but
// nothing could be marked missing, and a published assignment did not list
// the student who had not started. Filtered by an assignment, the page now
// shows every student on it (submission.roster), each with where they stand,
// and one who has not started can be marked missing
// (submission.record_missing), so that it can be graded.
const stamp = Date.now().toString(36)
const TITLE = `Roster check ${stamp}`
let courseId = ''
let assignmentId = ''
let yukiMemberId = ''

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  return out.body.result
}

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  // A course of its own, so that nothing here changes what other tests count:
  // the demo's instructor teaches it, and Yuki and Ken are its two students.
  const made = await ok(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'ROST101',
    section: stamp,
    title: `Who has not started ${stamp}`,
  })
  courseId = made.course_id
  await ok(token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: d.actors.instructor.actor_id })
  const teacher = d.actors.instructor.token
  for (const who of [d.actors.yuki, d.actors.ken]) {
    const seated = await ok(teacher, 'POST', `/v1/courses/${courseId}/members`, {
      actor_id: who.actor_id,
      preset: 'student',
    })
    if (who === d.actors.yuki) yukiMemberId = seated.member_id
  }

  // A published assignment.
  const hw = await ok(teacher, 'POST', `/v1/courses/${courseId}/assignments`, { title: TITLE, points_possible: 10 })
  assignmentId = hw.id
  await ok(teacher, 'POST', `/v1/courses/${courseId}/assignments/${assignmentId}/publish`, {})

  // Yuki hands work in; Ken has not started.
  const yuki = d.actors.yuki.token
  const draft = await ok(yuki, 'POST', `/v1/courses/${courseId}/submissions`, {
    assignment_id: assignmentId,
    body: 'Yuki’s answer.',
  })
  await ok(yuki, 'POST', `/v1/courses/${courseId}/submissions/${draft.submission_id}/submit`, {})
})

test('the instructor sees who has not started on an assignment, and marks them missing', async ({ page }) => {
  await keepToasts(page)
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(`/courses/${courseId}/submissions`)

  // Without an assignment, the page lists the work that exists, and says how
  // to see everyone.
  await expect(page.locator('.page-header')).toContainText('including those who have not started')
  await expect(page.locator('.submissions-hint')).toContainText('Choose an assignment to see every student on it')
  // Once the list has loaded, Ken, who has no submission, is not in it.
  const listed = page.locator('.submissions-table .el-table__row')
  await expect(listed.filter({ hasText: 'Yuki Tanaka' })).toBeVisible()
  await expect(listed.filter({ hasText: 'Ken Wong' })).toHaveCount(0)

  // Filtered by the assignment: both students, with where each stands.
  await pickOption(page, page.locator('.app-toolbar .assignment-select'), TITLE)
  await expect(page).toHaveURL(new RegExp(`assignment=${assignmentId}`))
  await expect(page.locator('.submissions-hint')).toHaveCount(0)
  // The counts by state are the roster's filter: all of them first.
  const summary = page.locator('.roster-summary')
  await expect(summary.getByRole('radio', { name: 'All 2' })).toHaveAttribute('aria-checked', 'true')
  await expect(summary.getByRole('radio', { name: 'Not started 1' })).toBeVisible()
  await expect(summary.getByRole('radio', { name: 'Submitted 1' })).toBeVisible()
  // Pressed, one state's students alone, and pressed again all of them.
  await summary.getByRole('radio', { name: 'Submitted 1' }).click()
  await expect(page.locator('.roster-table .el-table__row')).toHaveCount(1)
  await expect(page.locator('.roster-table .el-table__row')).toContainText('Yuki Tanaka')
  await summary.getByRole('radio', { name: 'Submitted 1' }).click()
  await expect(page.locator('.roster-table .el-table__row')).toHaveCount(2)
  // Filtered to one student, there is nothing left to filter: no counts that would hold students the
  // roster does not show.
  await page.goto(`/courses/${courseId}/submissions?assignment=${assignmentId}&student=${yukiMemberId}`)
  await expect(page.locator('.roster-table .el-table__row')).toHaveCount(1)
  await expect(page.locator('.roster-table .el-table__row')).toContainText('Yuki Tanaka')
  await expect(summary.getByRole('radio')).toHaveCount(0)
  await page.goto(`/courses/${courseId}/submissions?assignment=${assignmentId}`)
  await expect(summary.getByRole('radio', { name: 'All 2' })).toBeVisible()

  const yuki = page.locator('.roster-table .el-table__row').filter({ hasText: 'Yuki Tanaka' })
  const ken = page.locator('.roster-table .el-table__row').filter({ hasText: 'Ken Wong' })
  await expect(yuki).toContainText('Submitted')
  await expect(yuki.getByRole('button', { name: 'Mark missing' })).toHaveCount(0)
  await expect(ken).toContainText('Not started')
  await expect(ken).toContainText('Not handed in')

  // Marking Ken missing says what it does before it does it.
  await ken.getByRole('button', { name: 'Mark missing' }).click()
  const box = page.getByRole('dialog', { name: 'Mark Ken Wong as missing?' })
  await expect(box).toContainText(`handed in nothing for “${TITLE}”`)
  await expect(box).toContainText('If they hand in work later, it takes the place of this record')
  await box.getByRole('button', { name: 'Mark missing' }).click()
  await expectToasted(page, 'Ken Wong is marked as missing.')

  // The roster is read again: Ken is missing now, and nobody is left to mark.
  await expect(ken).toContainText('Missing')
  await expect(ken).not.toContainText('Not started')
  await expect(page.getByRole('button', { name: 'Mark missing' })).toHaveCount(0)
  await expect(summary).toContainText('Missing')
  await expect(summary).not.toContainText('Not started')

  // The missing work has a page of its own, where it can be graded.
  await ken.click()
  await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/)
  await expect(page.locator('.page-header')).toContainText('Missing')
  await expect(page.getByText('this is recorded as missing, when the due date passed or by hand')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save draft grade' })).toBeVisible()
})
