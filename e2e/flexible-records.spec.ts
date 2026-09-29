import { expect, test, type Page } from '@playwright/test'
import {
  call,
  demo,
  inTraditionalChinese,
  photograph,
  registerPerson,
  root,
  signIn,
  signInWithToken,
  toast,
  type DemoActor,
} from './support'

// Records that change after the fact (AIShie-Core#33), in a course of the
// test's own: an instructor changes a seat's roster role, saying it changes
// nothing else; renames the course from their seat, its code and term shown
// as the administrators'; changes what graded work is worth, choosing between
// rescaling the grades and keeping them, each explained in the actual
// numbers; overrides a student's course total with a reason and comments on
// it, which the student sees without who or why; undoes final grades; and
// renames, archives and brings back material. The platform's root, seated in
// the course, purges material and one version of it, which then reads as a
// tombstone.
//
// With E2E_SHOTS set to a directory, the new screens are photographed there
// in English and Traditional Chinese.

const STAMP = Date.now().toString(36)
let courseId = ''
let rootComponent = ''
let homework = ''
let midterm = ''
let essay = ''
let sam: DemoActor & { member_id: string }
let tia: DemoActor & { member_id: string }
let uma: DemoActor & { member_id: string }
const TITLE = `Records that change ${STAMP}`

function instructor(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

async function student(key: string, name: string) {
  const who = await registerPerson(name, { email: `${key}+${STAMP}@flex.test` })
  const seat = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: who.actor_id,
    preset: 'student',
  })
  return { ...who, member_id: seat.member_id as string }
}

/** A student hands in the essay and the instructor grades it, as a draft. */
async function gradeEssay(who: { token: string; member_id: string }, score: number): Promise<string> {
  const sub = await ok(who.token, 'POST', `/v1/courses/${courseId}/submissions`, {
    assignment_id: essay,
    body: 'My essay',
  })
  await ok(who.token, 'POST', `/v1/courses/${courseId}/submissions/${sub.submission_id ?? sub.id}/submit`, {})
  const g = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades`, {
    submission_id: sub.submission_id ?? sub.id,
    score,
    no_rubric: true,
  })
  return g.grade_id as string
}

async function gradeMidterm(who: { member_id: string }, score: number): Promise<string> {
  const g = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades`, {
    component_id: midterm,
    student_member_id: who.member_id,
    score,
  })
  return g.grade_id as string
}

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  const made = await ok(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'FLEX101',
    section: STAMP,
    title: TITLE,
  })
  courseId = made.course_id
  await ok(token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: d.actors.instructor.actor_id })

  const tree = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/components`)
  rootComponent = (tree.components as { id: string; parent_id?: string | null }[]).find((c) => !c.parent_id)!.id
  homework = (
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/components`, {
      parent_id: rootComponent,
      name: 'Homework',
      weight: 1,
    })
  ).id
  midterm = (
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/components`, {
      parent_id: rootComponent,
      name: 'Midterm',
      weight: 1,
      points_possible: 50,
    })
  ).id
  essay = (
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/assignments`, {
      title: 'Essay',
      points_possible: 100,
      component_id: homework,
    })
  ).id
  await ok(instructor().token, 'POST', `/v1/courses/${courseId}/assignments/${essay}/publish`, {})

  sam = await student('sam', `Sam Rescale ${STAMP}`)
  tia = await student('tia', `Tia Final ${STAMP}`)
  uma = await student('uma', `Uma Roster ${STAMP}`)

  // Sam: 85/100 on the essay and 40/50 on the midterm, posted as a grade so far.
  // Tia: 30/100 and 20/50, her midterm posted as final.
  const samEssay = await gradeEssay(sam, 85)
  const tiaEssay = await gradeEssay(tia, 30)
  const samMid = await gradeMidterm(sam, 40)
  const tiaMid = await gradeMidterm(tia, 20)
  await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades/post`, {
    grade_ids: [samEssay, tiaEssay, samMid],
  })
  await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades/post`, {
    grade_ids: [tiaMid],
    treat_ungraded_as_zero: true,
  })
})

async function asInstructor(page: Page, path: string) {
  await signIn(page, instructor())
  await page.goto(`/courses/${courseId}${path}`)
}

test.describe.serial('records that change after the fact', () => {
  test.use({ viewport: { width: 1280, height: 1000 } })

  test('an instructor changes a seat’s roster role, which changes nothing else, and it is in the activity', async ({
    page,
  }) => {
    await asInstructor(page, `/members/${uma.member_id}`)
    const header = page.locator('.page-header')
    await expect(header).toContainText(uma.display_name)
    await page.getByRole('button', { name: 'Change role' }).click()
    const dialog = page.getByRole('dialog', { name: `Change the roster role of ${uma.display_name}` })
    await expect(dialog).toContainText('This changes the roster role only')
    await expect(dialog).toContainText('permissions and reach stay exactly as they are')
    // Its own role is not offered, and the way to what it may do is.
    await expect(dialog.locator('.role-dialog__role').filter({ hasText: 'Student' })).toHaveClass(/is-disabled/)
    await expect(dialog.getByRole('button', { name: 'Edit permissions' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Change reach' })).toBeVisible()
    await dialog.locator('.role-dialog__role').filter({ hasText: 'Teaching assistant' }).click()
    await expect(dialog).toContainText(`${uma.display_name} leaves the roster`)
    await photograph(page, 'role-change-en')
    await dialog.getByRole('button', { name: 'Change to Teaching assistant' }).click()
    await expect(toast(page, `${uma.display_name} is now Teaching assistant`)).toBeVisible()
    await expect(header).toContainText('Teaching assistant')
    // Nothing it may do changed: the student's preset still.
    await expect(page.getByText('All as the preset “Student” gave them.')).toBeVisible()

    // Never on one's own seat.
    const me = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/members?role=instructor`)
    const mine = (me.members as { id: string; actor_id: string }[]).find((m) => m.actor_id === instructor().actor_id)!
    await page.goto(`/courses/${courseId}/members/${mine.id}`)
    await expect(page.getByText('This is your own seat.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change role' })).toHaveCount(0)

    // Nor on an agent's, which says why.
    const d = demo()
    await page.goto(`/courses/${d.course.id}/members/${d.actors.grader.member_id}`)
    await expect(page.getByText('An agent’s seat is on no roster: its role does not change here.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change role' })).toHaveCount(0)

    await page.goto(`/courses/${courseId}/activity`)
    const item = page.locator('.event-item').filter({ hasText: 'Roster role changed' }).first()
    await expect(item).toContainText('Student → Teaching assistant')

    // And in Traditional Chinese.
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/members/${uma.member_id}`)
    await page.getByRole('button', { name: '更改角色' }).click()
    const zh = page.getByRole('dialog', { name: `更改 ${uma.display_name} 的名冊角色` })
    await expect(zh).toContainText('這只會更改名冊角色')
    await zh.locator('.role-dialog__role').filter({ hasText: '學生' }).click()
    await expect(zh).toContainText('將加入名冊')
    await photograph(page, 'role-change-zh-Hant')
    await zh.getByRole('button', { name: '改為學生' }).click()
    await expect(toast(page, '現在是學生')).toBeVisible()
  })

  test('an instructor renames the course and describes it; its code and term are the administrators’', async ({
    page,
  }) => {
    await asInstructor(page, '')
    const about = page.locator('.about')
    await about.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Course title and description' })
    await expect(dialog).toContainText('Set by the course’s administrators')
    await expect(dialog.locator('.details__facts')).toContainText('FLEX101')
    await expect(dialog.locator('.details__facts')).toContainText(STAMP)
    await expect(dialog).toContainText('changed only by its administrators')
    await dialog.locator('input[name=title]').fill(`${TITLE} (renamed)`)
    await dialog
      .getByPlaceholder('What the course is about, in Markdown')
      .fill('Grades that **change** after the fact.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'The course’s title and description are saved')).toBeVisible()
    await expect(page.locator('.course-head__title')).toHaveText(`${TITLE} (renamed)`)
    await expect(about.locator('.about__desc strong')).toHaveText('change')

    await page.goto(`/courses/${courseId}/activity`)
    const item = page.locator('.event-item').filter({ hasText: 'Course updated' }).first()
    await expect(item).toContainText('Title changed')
    await expect(item).toContainText('Description changed')
  })

  test('changing what graded work is worth asks what becomes of its grades, with an example in the actual numbers', async ({
    page,
  }) => {
    await asInstructor(page, `/assignments/${essay}`)
    await page.locator('.page-header').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit assignment' })
    const points = dialog.locator('.assignment-form__points input')
    await expect(points).toHaveValue('100')
    await points.fill('50')
    const choice = dialog.locator('.existing-grades')
    await expect(choice).toContainText('2 grades have been entered for it')
    await expect(choice).toContainText('Its points change from 100 to 50.')
    const rescale = choice.locator('[data-choice="rescale"]')
    const keep = choice.locator('[data-choice="keep_scores"]')
    await expect(rescale).toContainText('For example, 85/100 becomes 42.5/50 (85% either way).')
    // 85 would be above 50: keeping the scores is greyed out, saying why.
    await expect(keep).toHaveClass(/is-disabled/)
    await expect(keep).toContainText('1 score would be above 50, what the work is now worth')
    // Saving without a choice is not allowed.
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toContainText('Say what becomes of the grades already entered.')
    await rescale.click()
    await photograph(page, 'points-change-en')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, /Saved: 2 grades rescaled, \d+ totals written again\./)).toBeVisible()

    // Sam's 85 is now 42.5 of 50.
    await page.goto(`/courses/${courseId}/grades?assignment=${essay}&student=${sam.member_id}`)
    await expect(page.locator('.el-table').first()).toContainText('42.5')

    await page.goto(`/courses/${courseId}/activity`)
    const item = page.locator('.event-item').filter({ hasText: 'Assignment updated' }).first()
    await expect(item).toContainText('Points changed')
    await expect(item).toContainText('Grades rescaled: 2')

    // A directly graded component, on the scheme page, in Traditional Chinese:
    // keeping the scores out of more points is allowed.
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/scheme`)
    const row = page.locator('.st-row').filter({ hasText: 'Midterm' })
    await row.locator('.st-actions button').click()
    await page.locator('.el-dropdown-menu:visible').getByText('編輯').click()
    const edit = page.getByRole('dialog', { name: /Midterm/ })
    await edit.locator('.el-form-item').filter({ hasText: '滿分' }).first().locator('input').fill('100')
    const zh = edit.locator('.existing-grades')
    await expect(zh).toContainText('已輸入 2 份成績')
    await expect(zh.locator('[data-choice="rescale"]')).toContainText('例如 40/50 會變成 80/100')
    await expect(zh.locator('[data-choice="keep_scores"]')).toContainText('例如 40/50（80%）會變成 40/100（40%）')
    await zh.locator('[data-choice="keep_scores"]').click()
    await photograph(page, 'points-change-zh-Hant')
    await edit.getByRole('button', { name: '儲存' }).click()
    await expect(toast(page, /已儲存評分項目：重新記錄了 \d+ 項總分。/)).toBeVisible()
  })

  test('a grader overrides a student’s course total with a reason and comments on it; the student sees neither who nor why', async ({
    page,
    browser,
  }) => {
    await asInstructor(page, `/gradebook/${sam.member_id}`)
    const card = page.locator('.gradebook__total')
    const worked = (await card.locator('.gradebook__total-value').innerText()).trim()
    await card.getByRole('button', { name: 'Total: Course total' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('Override').click()
    const dialog = page.getByRole('dialog', { name: 'Override: Course total' })
    await expect(dialog).toContainText(`Worked out now: ${worked}`)
    await dialog.locator('input[name=score]').fill('92')
    await dialog.locator('textarea[name=reason]').fill('Moderated at the exam board')
    await dialog.getByRole('button', { name: 'Override' }).click()
    await expect(toast(page, 'Overridden.')).toBeVisible()
    await expect(card.locator('.gradebook__total-value')).toHaveText('92%')
    await expect(card).toContainText(`Worked out: ${worked}`)
    await expect(card).toContainText('Overridden')

    await card.getByRole('button', { name: 'Total: Course total' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('Comment').click()
    const comment = page.getByRole('dialog', { name: 'Comment: Course total' })
    await comment.locator('textarea').fill('A strong term, well done.')
    await comment.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Comment saved')).toBeVisible()
    await expect(card.locator('.gradebook__comment')).toContainText('A strong term, well done.')
    await photograph(page, 'total-override-en')

    // A component graded directly has no total of its own to override: greyed out.
    const midtermRow = page.locator('.gradebook__table .el-table__row').filter({ hasText: 'Midterm' })
    await expect(midtermRow.getByRole('button', { name: /^Total: / })).toBeDisabled()
    await expect(
      page
        .locator('.gradebook__table .el-table__row')
        .filter({ hasText: 'Homework' })
        .getByRole('button', { name: /^Total: / }),
    ).toBeEnabled()

    // Sam sees the override and the comment, not who made it or why.
    const other = await browser.newPage()
    await signIn(other, sam)
    await other.goto(`/courses/${courseId}/gradebook`)
    const own = other.locator('.gradebook__total')
    await expect(own.locator('.gradebook__total-value')).toHaveText('92%')
    await expect(own).toContainText('Overridden')
    await expect(own.locator('.gradebook__comment')).toContainText('A strong term, well done.')
    await expect(other.locator('body')).not.toContainText('Moderated at the exam board')
    await expect(own.getByRole('button', { name: /^Total: / })).toHaveCount(0)
    await own.locator('.gradebook__snapshot a').click()
    await expect(other.locator('.grade-view__override')).toContainText('Overridden')
    await expect(other.locator('.grade-view__override')).not.toContainText('Moderated')
    await expect(other.locator('.grade-view__override')).not.toContainText('By ')
    await other.close()

    // The grader sees who and why on the total's page, in Traditional Chinese.
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/gradebook/${sam.member_id}`)
    await expect(page.locator('.gradebook__total')).toContainText('已覆寫')
    await expect(page.locator('.gradebook__total')).toContainText('計算所得')
    await photograph(page, 'total-override-zh-Hant')
    await page.locator('.gradebook__snapshot a').click()
    await expect(page.locator('.grade-view__override')).toContainText('原因：Moderated at the exam board')

    // Taking it off: the total worked out counts again.
    await page.getByRole('button', { name: '總分: ' + '課程總成績' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('取消覆寫').click()
    await page.getByRole('dialog', { name: '取消覆寫？' }).getByRole('button', { name: '取消覆寫' }).click()
    await expect(toast(page, /已取消覆寫/)).toBeVisible()
    await expect(page.locator('.grade-view__override')).toHaveCount(0)
  })

  test('final grades are undone where posting is, and undoing them again is refused in words', async ({ page }) => {
    await asInstructor(page, `/gradebook/${tia.member_id}`)
    await expect(page.locator('.gradebook__final')).toContainText('written as final grades')
    await page.goto(`/courses/${courseId}/grades`)
    await page.getByRole('button', { name: 'Undo final grades…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Undo final grades' })
    await expect(dialog).toContainText('Grades themselves are not touched')
    await dialog.getByText('Every student whose totals count ungraded work as zero').click()
    await dialog.getByRole('button', { name: 'Undo final grades' }).click()
    await page
      .getByRole('dialog', { name: 'Undo final grades?' })
      .getByRole('button', { name: 'Undo final grades' })
      .click()
    await expect(
      toast(page, /^1 student’s totals no longer count ungraded work as zero: \d+ totals written again\.$/),
    ).toBeVisible()

    await page.goto(`/courses/${courseId}/gradebook/${tia.member_id}`)
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await expect(page.locator('.gradebook__final')).toHaveCount(0)

    // Nothing is left to undo: Core refuses, and says so in words.
    await page.goto(`/courses/${courseId}/grades`)
    await page.getByRole('button', { name: 'Undo final grades…' }).click()
    await page
      .getByRole('dialog', { name: 'Undo final grades' })
      .getByRole('button', { name: 'Undo final grades' })
      .click()
    await page
      .getByRole('dialog', { name: 'Undo final grades?' })
      .getByRole('button', { name: 'Undo final grades' })
      .click()
    await expect(page.getByText('No totals count ungraded work as zero here: there is nothing to undo.')).toBeVisible()

    await page.goto(`/courses/${courseId}/activity`)
    await expect(page.locator('.event-item').filter({ hasText: 'Final grades undone' }).first()).toBeVisible()
  })

  test('material is renamed, archived and brought back; an administrator purges it, which leaves a tombstone', async ({
    page,
    browser,
  }) => {
    const handout = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/documents`, {
      kind: 'material',
      title: 'Handout',
      body_md: 'The first draft, with **a name in it**.',
    })
    const docId = (handout.document_id ?? handout.id) as string
    const v2 = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/documents/${docId}/versions`, {
      body_md: 'The second draft, without it.',
    })
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/documents/${docId}/publish`, {
      version_id: v2.version_id,
    })

    await asInstructor(page, `/documents/${docId}`)
    const header = page.locator('.page-header')
    // Purging is not a seat's to do: the instructor is offered none.
    await expect(header.getByRole('button', { name: 'Purge…' })).toHaveCount(0)
    await header.getByRole('button', { name: 'Title and place' }).click()
    const details = page.getByRole('dialog', { name: 'Title and place of “Handout”' })
    await details.locator('input[name=title]').fill('Week 1 handout')
    await details.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(header).toContainText('Week 1 handout')

    await header.getByRole('button', { name: 'Archive' }).click()
    await page
      .getByRole('dialog', { name: 'Archive “Week 1 handout”?' })
      .getByRole('button', { name: 'Archive' })
      .click()
    await expect(toast(page, 'Document archived')).toBeVisible()
    await header.getByRole('button', { name: 'Bring back' }).click()
    await page
      .getByRole('dialog', { name: 'Bring back “Week 1 handout”?' })
      .getByRole('button', { name: 'Bring back' })
      .click()
    await expect(toast(page, 'Document brought back')).toBeVisible()
    await expect(header.getByRole('button', { name: 'Archive' })).toBeVisible()

    // The platform's root, seated in the course, purges the first version.
    const rootMe = await ok(root().token, 'GET', '/v1/me')
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/members`, { actor_id: rootMe.id, preset: 'ta' })
    const admin = await browser.newPage()
    await signInWithToken(admin, root())
    await admin.goto(`/courses/${courseId}/documents/${docId}`)
    const history = admin.locator('.version-list')
    await history
      .locator('.version-item')
      .filter({ hasText: 'v1' })
      .getByRole('button', { name: 'Purge this version' })
      .click()
    const purge1 = admin.getByRole('dialog', { name: 'Purge version 1 of “Week 1 handout”' })
    await expect(purge1).toContainText('This cannot be undone')
    await expect(purge1.getByRole('button', { name: 'Purge' })).toBeDisabled()
    await purge1.locator('textarea[name=reason]').fill('A student’s name was in it')
    await purge1.getByText('I understand that this removes it for good').click()
    await purge1.getByRole('button', { name: 'Purge' }).click()
    await expect(toast(admin, 'Purged: 1 versions, 0 files deleted from storage.')).toBeVisible()
    await expect(history.locator('.version-item').filter({ hasText: 'v1' })).toContainText('Purged')

    // The whole document, in Traditional Chinese.
    await inTraditionalChinese(admin)
    await admin.reload()
    await admin.locator('.page-header').getByRole('button', { name: '清除…' }).click()
    const purge = admin.getByRole('dialog', { name: '清除「Week 1 handout」' })
    await expect(purge).toContainText('此操作無法復原')
    await purge.locator('textarea[name=reason]').fill('整份講義誤傳')
    await purge.getByText('我明白此操作會永久移除內容').click()
    await photograph(admin, 'purge-dialog-zh-Hant')
    await purge.getByRole('button', { name: '清除' }).click()
    await expect(toast(admin, /已清除：/)).toBeVisible()
    await expect(admin.locator('.tombstone--document')).toContainText('由 你 清除')
    await expect(admin.locator('.tombstone--document')).toContainText('原因：整份講義誤傳')
    await photograph(admin, 'tombstone-zh-Hant')
    await admin.close()

    // The instructor reads the tombstone: who, when and why, and no download.
    await page.reload()
    const stone = page.locator('.tombstone--document')
    await expect(stone).toContainText('This document was purged')
    await expect(stone).toContainText('Why: 整份講義誤傳')
    await expect(page.getByText('Download the file')).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Bring back' })).toHaveCount(0)
    await photograph(page, 'tombstone-en')
    await page.goto(`/courses/${courseId}/materials`)
    await page.getByText('Show archived').click()
    await expect(page.locator('.material-row').filter({ hasText: 'Week 1 handout' })).toContainText('Purged')

    await page.goto(`/courses/${courseId}/activity`)
    await expect(page.locator('.event-item').filter({ hasText: 'Document purged' }).first()).toBeVisible()
  })

  test('the purge dialog in English', async ({ page }) => {
    const doc = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/documents`, {
      kind: 'material',
      title: 'Seating plan',
      body_md: 'Names and seats.',
    })
    await signInWithToken(page, root())
    await page.goto(`/courses/${courseId}/documents/${doc.document_id ?? doc.id}`)
    await page.locator('.page-header').getByRole('button', { name: 'Purge…' }).click()
    const purge = page.getByRole('dialog', { name: 'Purge “Seating plan”' })
    await expect(purge).toContainText('uploaded by mistake')
    await purge.locator('textarea[name=reason]').fill('Personal data')
    await purge.getByText('I understand that this removes it for good').click()
    await photograph(page, 'purge-dialog-en')
    await purge.getByRole('button', { name: 'Cancel' }).click()
  })
})
