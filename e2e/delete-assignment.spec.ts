import { expect, test, type Page } from '@playwright/test'
import {
  call,
  demo,
  expectToasted,
  inTraditionalChinese,
  keepToasts,
  photograph,
  registerPerson,
  root,
  signIn,
  type DemoActor,
} from './support'

// Deleting an assignment for good (AIShie-Core #73), in a course of the
// test's own: one student, Ada, and a bucket of quizzes that is the whole
// grade. She handed in two quizzes, each graded and posted: 5/10 on the one
// that stays, 10/10 on the one deleted, a total of 75%. Sato deletes the
// second from its page, typing its title, as it has work; Ada no longer
// sees it, is told it was deleted, and her total is worked out again
// without it (50%). An empty quiz goes from the list's ⋯ with no title to
// type; one that gets a draft while its dialog is open is refused as stale,
// and the dialog counts again and asks for its title.
//
// With E2E_SHOTS set to a directory, the dialog, the list's menu and the
// page of a deleted assignment are photographed there.

const STAMP = Date.now().toString(36)
const KEPT = `Quiz ${STAMP} — kept`
const DOOMED = `Quiz ${STAMP} — to delete`
const EMPTY = `Quiz ${STAMP} — never started`
const RACED = `Quiz ${STAMP} — started meanwhile`
const ZH = `Quiz ${STAMP} — 中文`
let courseId = ''
let bucket = ''
const ids: Record<'kept' | 'doomed' | 'empty' | 'raced' | 'zh', string> = {} as never
/** Ada's total for the quizzes while the doomed quiz counted: superseded once it is deleted. */
let earlierTotal = ''
let ada: DemoActor & { member_id: string }

function instructor(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

async function quiz(title: string, opts: { publish: boolean }): Promise<string> {
  const a = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/assignments`, {
    title,
    points_possible: 10,
    component_id: bucket,
  })
  if (opts.publish) await ok(instructor().token, 'POST', `/v1/courses/${courseId}/assignments/${a.id}/publish`, {})
  return a.id as string
}

/** Ada hands work in, and Sato grades it and posts the grade. */
async function graded(assignment: string, score: number): Promise<string> {
  const sub = await ok(ada.token, 'POST', `/v1/courses/${courseId}/submissions`, {
    assignment_id: assignment,
    body: 'My answer',
  })
  const subId = (sub.submission_id ?? sub.id) as string
  await ok(ada.token, 'POST', `/v1/courses/${courseId}/submissions/${subId}/submit`, {})
  const g = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades`, {
    submission_id: subId,
    score,
    no_rubric: true,
  })
  await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades/post`, { grade_ids: [g.grade_id] })
  return g.grade_id as string
}

test.beforeAll(async () => {
  const d = demo()
  const made = await ok(root().token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'DEL101',
    section: STAMP,
    title: `Deleting work ${STAMP}`,
  })
  courseId = made.course_id
  await ok(root().token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(root().token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: instructor().actor_id })

  const I = instructor().token
  const tree = await ok(I, 'GET', `/v1/courses/${courseId}/components`)
  const top = (tree.components as { id: string; parent_id?: string | null }[]).find((c) => !c.parent_id)!.id
  bucket = (await ok(I, 'POST', `/v1/courses/${courseId}/components`, { parent_id: top, name: 'Quizzes', weight: 100 }))
    .id

  const who = await registerPerson(`Ada ${STAMP}`, { email: `ada+${STAMP}@delete.test` })
  const seat = await ok(I, 'POST', `/v1/courses/${courseId}/members`, { actor_id: who.actor_id, preset: 'student' })
  ada = { ...who, member_id: seat.member_id as string }

  ids.kept = await quiz(KEPT, { publish: true })
  ids.doomed = await quiz(DOOMED, { publish: true })
  await graded(ids.kept, 5)
  await graded(ids.doomed, 10)

  const grades = await ok(I, 'GET', `/v1/courses/${courseId}/grades?student_member_id=${ada.member_id}&limit=100`)
  const total = (
    grades.grades as { id: string; origin: string; component_id?: string; superseded_by?: string | null }[]
  ).find((g) => g.origin === 'computed' && g.component_id === bucket && !g.superseded_by)
  expect(total, 'Ada has a total for the quizzes').toBeTruthy()
  earlierTotal = total!.id
})

function header(page: Page) {
  return page.locator('.page-header')
}
function deleteDialog(page: Page, name = 'Delete assignment') {
  return page.getByRole('dialog', { name })
}
/** Opens the ⋯ menu named for the assignment, and chooses Delete…. */
async function chooseDelete(page: Page, title: string, within = page.locator('body')) {
  await within.getByRole('button', { name: `More actions for “${title}”` }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
}
const adaTotal = (page: Page) => page.locator('.gradebook__total .gradebook__total-value')

test.describe.serial('deleting an assignment for good', () => {
  test('Ada’s total counts both quizzes', async ({ page }) => {
    await signIn(page, ada)
    await page.goto(`/courses/${courseId}/gradebook`)
    await expect(adaTotal(page)).toHaveText('75%')
  })

  test('Sato deletes a quiz with work from its page, once he has typed its title', async ({ page }) => {
    await keepToasts(page)
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments/${ids.doomed}`)
    await expect(header(page)).toContainText(DOOMED)

    await chooseDelete(page, DOOMED, header(page))
    const box = deleteDialog(page)
    await expect(box).toContainText(`“${DOOMED}” will be deleted for good, with everything listed below.`)
    const lines = box.locator('.delete-assignment__lines li')
    await expect(lines).toHaveText([
      'Submissions: 1 (1 handed in)',
      'Grades: 1 (1 posted)',
      'Totals worked out again: 1 student’s posted totals, with the change recorded',
    ])
    await expect(box).toContainText('Students can see it now.')

    const button = box.getByRole('button', { name: 'Delete for good' })
    await expect(button).toBeDisabled()
    const field = box.getByLabel('To confirm, type the assignment’s title')
    await field.fill(`Quiz ${STAMP}`)
    await field.blur()
    await expect(box).toContainText('That is not its title.')
    await expect(button).toBeDisabled()
    await field.fill(DOOMED)
    await expect(button).toBeEnabled()
    await photograph(page, 'delete-assignment-dialog')
    await button.click()

    await expectToasted(page, `Deleted “${DOOMED}”, with 1 submission and 1 grade.`)
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/assignments$`))
    await expect(page.locator('.el-table__row').filter({ hasText: KEPT })).toBeVisible()
    await expect(page.locator('.el-table__row').filter({ hasText: DOOMED })).toHaveCount(0)
  })

  test('Ada no longer sees it, is told it was deleted, and her total is worked out again without it', async ({
    page,
  }) => {
    const got = await call(ada.token, 'GET', `/v1/courses/${courseId}/assignments/${ids.doomed}`)
    expect(got.body.error?.code, JSON.stringify(got.body)).toBe('not_found')
    expect(got.body.error?.details?.reason).toBe('deleted')

    await signIn(page, ada)
    await page.goto(`/courses/${courseId}/assignments`)
    await expect(page.locator('.el-table__row').filter({ hasText: KEPT })).toBeVisible()
    await expect(page.locator('.el-table__row').filter({ hasText: DOOMED })).toHaveCount(0)

    await page.goto(`/courses/${courseId}/activity`)
    const told = page
      .locator('.event-item')
      .filter({ has: page.locator('.event-item__title', { hasText: 'Assignment deleted' }) })
    await expect(told.first().locator('.event-item__subject')).toHaveText(`“${DOOMED}”`)

    await page.goto(`/courses/${courseId}/gradebook`)
    await expect(adaTotal(page)).toHaveText('50%')

    // Its old address says what became of it.
    await page.goto(`/courses/${courseId}/assignments/${ids.doomed}`)
    await expect(page.getByText('This assignment was deleted.')).toBeVisible()
    await photograph(page, 'delete-assignment-gone')
    await page.getByRole('button', { name: 'Back to assignments' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/assignments$`))
  })

  test('the total written while it counted keeps its number, its line saying only that it was deleted', async ({
    page,
  }) => {
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/grades/${earlierTotal}`)
    const row = page.locator('tr.el-table__row').filter({ hasText: 'An assignment since deleted' })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('100%')
    await expect(page.locator('tr.el-table__row').filter({ hasText: KEPT })).toContainText('50%')
  })

  test('a quiz nobody has started on goes from the list’s ⋯, with no title to type', async ({ page }) => {
    ids.empty = await quiz(EMPTY, { publish: false })
    await keepToasts(page)
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments`)
    const row = page.locator('.el-table__row').filter({ hasText: EMPTY })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: `More actions for “${EMPTY}”` }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete…' })).toBeVisible()
    await photograph(page, 'delete-assignment-row-menu')
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const box = deleteDialog(page)
    await expect(box).toContainText('Nobody has started on it: only the assignment itself goes.')
    await expect(box).not.toContainText('Students can see it now.')
    await expect(box.getByLabel('To confirm, type the assignment’s title')).toHaveCount(0)
    // The row did not open beneath the menu.
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/assignments$`))
    await box.getByRole('button', { name: 'Delete for good' }).click()

    await expectToasted(page, `Deleted “${EMPTY}”.`)
    await expect(box).toBeHidden()
    await expect(page.locator('.el-table__row').filter({ hasText: EMPTY })).toHaveCount(0)
    await expect(page.locator('.el-table__row').filter({ hasText: KEPT })).toBeVisible()
  })

  test('a draft started while the dialog is open is not deleted unseen: the dialog counts again', async ({ page }) => {
    ids.raced = await quiz(RACED, { publish: true })
    await keepToasts(page)
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments/${ids.raced}`)
    await chooseDelete(page, RACED, header(page))
    const box = deleteDialog(page)
    // Nobody has started on it; it counts in the grade, so Ada's total is worked out again.
    const totals = 'Totals worked out again: 1 student’s posted totals, with the change recorded'
    await expect(box.locator('.delete-assignment__lines li')).toHaveText([totals])
    await expect(box.getByLabel('To confirm, type the assignment’s title')).toHaveCount(0)

    // Meanwhile, Ada starts a draft.
    await ok(ada.token, 'POST', `/v1/courses/${courseId}/submissions`, { assignment_id: ids.raced, body: 'A start' })

    await box.getByRole('button', { name: 'Delete for good' }).click()
    await expect(box).toContainText('Something was added after this was shown. Check what goes with it again.')
    await expect(box.locator('.delete-assignment__lines li')).toHaveText(['Submissions: 1 (1 draft)', totals])
    const button = box.getByRole('button', { name: 'Delete for good' })
    await expect(button).toBeDisabled()
    // Still there, draft and all.
    const still = await call(instructor().token, 'GET', `/v1/courses/${courseId}/assignments/${ids.raced}`)
    expect(still.body.result?.title, JSON.stringify(still.body)).toBe(RACED)

    await box.getByLabel('To confirm, type the assignment’s title').fill(RACED)
    await button.click()
    await expectToasted(page, `Deleted “${RACED}”, with 1 submission.`)
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/assignments$`))
  })

  test('in Traditional Chinese, the dialog says it in Chinese', async ({ page }) => {
    ids.zh = await quiz(ZH, { publish: false })
    await signIn(page, instructor())
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/assignments/${ids.zh}`)
    await header(page)
      .getByRole('button', { name: `「${ZH}」的更多操作` })
      .click()
    await page.getByRole('menuitem', { name: '刪除…' }).click()
    const box = deleteDialog(page, '刪除作業')
    await expect(box).toContainText(`「${ZH}」及以下列出的所有內容將被永久刪除，無法復原。`)
    await expect(box).toContainText('還沒有人開始作答：只會刪除作業本身。')
    await expect(box.getByRole('button', { name: '永久刪除' })).toBeEnabled()
    await photograph(page, 'delete-assignment-dialog-zh-hant')
    await box.getByRole('button', { name: '取消' }).click()
    await expect(box).toBeHidden()
  })
})
