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

// Group work (小組作業, AIShie-Core #74), in a course of the test's own. Its
// group set, "Project groups", has three groups: Alpha (Yuki and Ken), Beta
// (Mei) and Gamma (Fay); Eve is in none. Sato makes the assignment group
// work from its form. Eve is told she is in no group and what to do; Yuki
// starts Alpha's draft, Ken writes over it meanwhile and Yuki settles the
// conflict, keeping her text, then loading Ken's; she hands it in for
// herself and Ken. Ken is moved to Beta, and Mei's hand-in for Beta says he
// was left out. Sato reads the roster by group (Gamma recorded missing,
// Eve in no group, Alpha's work late once it is counted so), and finds the
// form's group set fixed. Nobody reads another group's work or grades:
// Mei is refused Alpha's submission, and Yuki sees her grade, never Ken's.
// In Traditional Chinese, and at a phone's width, too, the form's included.
// On a second group assignment, a TA listed for Mei and Fay records Gamma
// missing, and not Beta, whose Ken they do not reach. Mei, moved from Beta
// to Alpha while writing Beta's draft, is told so, keeps what she had not
// saved, and finds her group Alpha; then Yuki hands Alpha's draft in while
// Mei is typing, and Mei's unsaved text stays on her page. It stays, too,
// where Mei finds out by pressing Refresh, and her attempts are read before
// the draft: when Yuki hands the next draft in, and when Mei is moved to
// Gamma.
//
// On a third assignment, Gamma's (Fay and Mei): a hand-in names what Mei
// saw, so a file Fay attached since, which changes no revision, is shown
// first and nothing is handed in; and text Fay saved while Mei's
// confirmation was open stays out of the editor behind it, and out of what
// is handed in. Mei moves to Beta: recording Beta missing names Ken alone,
// whom Core records it for, and says Mei is left out; Mei moves on to
// Delta, alone, which is not offered; and once Gamma starts again, Mei's
// row by student still says her work is Gamma's.
//
// With E2E_SHOTS set to a directory, the pages are photographed there.

const STAMP = Date.now().toString(36)
const SET = `Project groups ${STAMP}`
const TITLE = `Group essay ${STAMP}`
const SECOND = `Group plan ${STAMP}`
const THIRD = `Group poster ${STAMP}`
let courseId = ''
let setId = ''
let assignmentId = ''
let secondId = ''
let thirdId = ''
let alphaWork = ''
const groups: Record<'alpha' | 'beta' | 'gamma', string> = { alpha: '', beta: '', gamma: '' }
type Student = DemoActor & { member_id: string }
const students = {} as Record<'yuki' | 'ken' | 'mei' | 'fay' | 'eve', Student>

function sato(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}
const coursePath = (sub: string) => `/courses/${courseId}/${sub}`
/** Signs someone in, whoever was signed in before; in Traditional Chinese from the next page on, with zh. */
async function as(page: Page, who: Pick<DemoActor, 'email' | 'display_name'>, opts: { zh?: boolean } = {}) {
  await page.context().clearCookies()
  await signIn(page, who)
  if (opts.zh) await inTraditionalChinese(page)
}
const header = (page: Page) => page.locator('.page-header')
const myWork = (page: Page) => page.locator('.my-work')

test.beforeAll(async () => {
  const d = demo()
  const made = await ok(root().token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'GRP101',
    section: STAMP,
    title: `Working in groups ${STAMP}`,
  })
  courseId = made.course_id
  await ok(root().token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(root().token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: sato().actor_id })
  const S = sato().token

  const seat = async (who: DemoActor): Promise<Student> => {
    const s = await ok(S, 'POST', `/v1/courses/${courseId}/members`, { actor_id: who.actor_id, preset: 'student' })
    return { ...who, member_id: s.member_id as string }
  }
  students.yuki = await seat(d.actors.yuki)
  students.ken = await seat(d.actors.ken)
  students.mei = await seat(d.actors.mei)
  students.fay = await seat(await registerPerson(`Fay ${STAMP}`, { email: `fay+${STAMP}@groups.test` }))
  students.eve = await seat(await registerPerson(`Eve ${STAMP}`, { email: `eve+${STAMP}@groups.test` }))

  setId = (await ok(S, 'POST', `/v1/courses/${courseId}/group-sets`, { name: SET })).id
  const made3 = await ok(S, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/groups`, {
    groups: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }],
  })
  ;[groups.alpha, groups.beta, groups.gamma] = made3.group_ids
  await ok(S, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
    placements: [
      { student_member_id: students.yuki.member_id, group_id: groups.alpha },
      { student_member_id: students.ken.member_id, group_id: groups.alpha },
      { student_member_id: students.mei.member_id, group_id: groups.beta },
      { student_member_id: students.fay.member_id, group_id: groups.gamma },
    ],
  })
})

/** The draft of a group's (Alpha's, by default) as Core holds it now, read by one of its members. */
async function alphaDraft(
  assignment = assignmentId,
  group = groups.alpha,
  reader: Student = students.yuki,
): Promise<{ id: string; revision: number; body: string }> {
  const list = await ok(
    sato().token,
    'GET',
    `/v1/courses/${courseId}/submissions?assignment_id=${assignment}&group_id=${group}`,
  )
  const d = (list.submissions as { id: string; state: string }[]).find((s) => s.state === 'draft')!
  return ok(reader.token, 'GET', `/v1/courses/${courseId}/submissions/${d.id}`)
}

/** Uploads a small text file as `token`, for a draft's document; its upload token. */
async function uploadText(token: string, name: string, text: string): Promise<string> {
  const q = `kind=submission&content_type=text%2Fplain&filename=${encodeURIComponent(name)}`
  const u = await call(token, 'GET', `/v1/courses/${courseId}/upload-url?${q}`)
  expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
  const url = new URL(u.body.result.upload_url)
  const put = await fetch(`${demo().core}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain', ...u.body.result.headers },
    body: new TextEncoder().encode(text),
  })
  expect(put.ok).toBe(true)
  return u.body.result.upload_token as string
}

/** How far the open dialog runs past the page's width: its overlay, its body, and the group work tick's label. */
async function dialogOverflow(page: Page) {
  return page.evaluate(() => {
    const overlay = [...document.querySelectorAll<HTMLElement>('.el-overlay-dialog')].find(
      (e) => e.getClientRects().length > 0,
    )!
    const body = overlay.querySelector<HTMLElement>('.el-dialog__body')!
    const label = overlay.querySelector<HTMLElement>('.assignment-form__toggle .el-checkbox__label')!
    return {
      overlay: overlay.scrollWidth - overlay.clientWidth,
      body: body.scrollWidth - body.clientWidth,
      label: label.getBoundingClientRect().right - body.getBoundingClientRect().right,
    }
  })
}

test.describe.serial('group work', () => {
  test('Sato makes an assignment group work from its form, and its page says so', async ({ page }) => {
    await keepToasts(page)
    await as(page, sato())
    await page.goto(coursePath('assignments'))
    await header(page).getByRole('button', { name: 'New assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'New assignment' })
    await dialog.getByLabel('Title', { exact: true }).fill(TITLE)
    await dialog.getByLabel('Points possible').fill('10')
    await dialog.getByText('Each group hands in one piece of work, for all its members').click()
    // The course's one group set is the one meant.
    await expect(dialog.locator('.assignment-form__set')).toContainText(`${SET} (3 groups)`)
    await expect(dialog).toContainText('a student in no group of it hands nothing in')
    await photograph(page, 'group-work-form')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expectToasted(page, 'Assignment created. It is not published yet.')
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/)
    assignmentId = new URL(page.url()).pathname.split('/').pop()!

    const a = await ok(sato().token, 'GET', `/v1/courses/${courseId}/assignments/${assignmentId}`)
    expect(a.group_set_id).toBe(setId)
    await expect(header(page)).toContainText('Group work')
    const details = page.locator('.assignment-view__facts')
    await expect(details).toContainText('Group set')
    await expect(details).toContainText(SET)
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/assignments/${assignmentId}/publish`, {})
  })

  test('Eve, in no group, is told so and what to do, and has nothing to start', async ({ page }) => {
    await as(page, students.eve)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const work = myWork(page)
    await expect(work).toContainText('You are in no group yet')
    await expect(work).toContainText(`each group of “${SET}” hands in one piece of work for its members`)
    await expect(work).toContainText('Sign-up is not open. Ask your teacher to place you in a group.')
    await expect(work.getByRole('button', { name: /Start/ })).toHaveCount(0)
    await expect(page.locator('.assignment-view__facts')).toContainText('None yet')

    // Sign-up opens, with a deadline: she is told until when.
    const closes = new Date(Date.now() + 3 * 86400_000).toISOString()
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/group-sets/${setId}`, {
      signup_open: true,
      signup_closes_at: closes,
    })
    await page.reload()
    await expect(work).toContainText('Sign-up is open until')
    await expect(work).toContainText('choose a group to join')
    await photograph(page, 'group-work-no-group')
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/group-sets/${setId}`, { signup_open: false })
  })

  test('Yuki starts her group’s draft, which names her group and its members', async ({ page }) => {
    await keepToasts(page)
    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const work = myWork(page)
    await expect(work.locator('.my-work__group')).toContainText('Alpha')
    await expect(work.locator('.my-work__group')).toContainText('you and Ken Wong')
    await expect(page.locator('.assignment-view__facts')).toContainText('Your group')
    await expect(work).toContainText('Your group writes one draft together')
    await work.getByRole('button', { name: 'Start your group’s draft' }).click()
    await expectToasted(page, 'Draft started.')
    await expect(work).toContainText('Your group’s answer')
    await work.locator('textarea').fill('Our essay, first lines by Yuki.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await expect(work).toContainText('All changes saved')
    expect((await alphaDraft()).body).toBe('Our essay, first lines by Yuki.')
  })

  test('Ken writes over the draft while Yuki edits it: she keeps hers, then loads his', async ({ page }) => {
    await keepToasts(page)
    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const work = myWork(page)
    const box = work.locator('textarea')
    await expect(box).toHaveValue('Our essay, first lines by Yuki.')
    await box.fill('Our essay, first lines by Yuki. Yuki’s second paragraph.')

    // Meanwhile Ken saves over the revision both read.
    const before = await alphaDraft()
    await ok(students.ken.token, 'POST', `/v1/courses/${courseId}/submissions/${before.id}`, {
      body: 'Ken rewrote the opening.',
      base_revision: before.revision,
    })

    await work.getByRole('button', { name: 'Save draft' }).click()
    const conflict = work.locator('.my-work__conflict')
    await expect(conflict).toContainText('Ken Wong changed the draft')
    await expect(conflict).toContainText('while you were editing it')
    await expect(conflict).toContainText('Load the draft as it is now, which drops your changes here')
    // Hand in waits until it is settled; nothing typed is gone.
    await expect(work.getByRole('button', { name: 'Save draft' })).toBeDisabled()
    await expect(box).toHaveValue('Our essay, first lines by Yuki. Yuki’s second paragraph.')
    await conflict.getByRole('button', { name: 'What the draft says now' }).click()
    await expect(conflict.locator('.my-work__theirs')).toContainText('Ken rewrote the opening.')
    await photograph(page, 'group-work-conflict')

    // She keeps hers, and saves it over his.
    await conflict.getByRole('button', { name: 'Keep editing mine' }).click()
    await expect(conflict).toHaveCount(0)
    await expect(work).toContainText('Unsaved changes')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    let now = await alphaDraft()
    expect(now.body).toBe('Our essay, first lines by Yuki. Yuki’s second paragraph.')
    expect(now.revision).toBe(before.revision + 2)

    // Again, and this time she loads his.
    await box.fill('Something Yuki will drop.')
    await ok(students.ken.token, 'POST', `/v1/courses/${courseId}/submissions/${now.id}`, {
      body: 'Ken’s final wording.',
      base_revision: now.revision,
    })
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: 'Load it as it is now' }).click()
    await expect(box).toHaveValue('Ken’s final wording.')
    await expect(work).toContainText('All changes saved')
    await expect(work.locator('.my-work__revised')).toContainText('Last changed by Ken Wong')
    now = await alphaDraft()
    expect(now.body).toBe('Ken’s final wording.')
  })

  test('Yuki hands it in for herself and Ken, and her attempts say whom it is for and who handed it in', async ({
    page,
  }) => {
    await keepToasts(page)
    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const work = myWork(page)
    await expect(work.locator('textarea')).toHaveValue('Ken’s final wording.')
    await work.getByRole('button', { name: 'Hand in' }).click()
    const confirm = page.getByRole('dialog', { name: 'Hand in attempt 1 for Alpha?' })
    await expect(confirm).toContainText('It is handed in for you and Ken Wong')
    await expect(confirm).toContainText('whatever changes in the group afterwards')
    await photograph(page, 'group-work-hand-in')
    await confirm.getByRole('button', { name: 'Hand in' }).click()
    await expectToasted(page, 'Handed in for you and Ken Wong.')
    const attempt = work.locator('.my-work__attempt').first()
    await expect(attempt).toContainText('Attempt 1')
    await expect(attempt).toContainText('For you and Ken Wong')
    await expect(attempt).toContainText('Handed in by you')

    const list = await ok(
      sato().token,
      'GET',
      `/v1/courses/${courseId}/submissions?assignment_id=${assignmentId}&group_id=${groups.alpha}`,
    )
    alphaWork = list.submissions[0].id
    // Ken reads it as his and Yuki's, handed in by Yuki.
    await as(page, students.ken)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const his = myWork(page).locator('.my-work__attempt').first()
    await expect(his).toContainText('Alpha')
    await expect(his).toContainText('For you and Yuki Tanaka')
    await expect(his).toContainText('Handed in by Yuki Tanaka')
  })

  test('Ken moves to Beta: Mei’s hand-in for Beta says he was left out', async ({ page }) => {
    await keepToasts(page)
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
      placements: [{ student_member_id: students.ken.member_id, group_id: groups.beta }],
      affects_work: true,
    })
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const work = myWork(page)
    await expect(work.locator('.my-work__group')).toContainText('you and Ken Wong')
    await work.getByRole('button', { name: 'Start your group’s draft' }).click()
    await expectToasted(page, 'Draft started.')
    await work.locator('textarea').fill('Beta’s essay, by Mei.')
    await work.getByRole('button', { name: 'Hand in' }).click()
    const confirm = page.getByRole('dialog', { name: 'Hand in attempt 1 for Beta?' })
    await expect(confirm).toContainText('It is handed in for you and Ken Wong')
    await confirm.getByRole('button', { name: 'Hand in' }).click()
    await expectToasted(page, 'Handed in for you.')
    const leftOut = work.locator('.my-work__left-out')
    await expect(leftOut).toContainText('Ken Wong was left out of it')
    await expect(leftOut).toContainText('they are part of another group’s work for this assignment')
    await photograph(page, 'group-work-left-out')

    // Ken, in Beta now, is told his work is Alpha's.
    await as(page, students.ken)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(myWork(page)).toContainText('Your work for this assignment is what you handed in with Alpha')
  })

  test('Sato reads the roster by group, records Gamma missing, and sees Eve in no group', async ({ page }) => {
    await keepToasts(page)
    await as(page, sato())
    await page.goto(coursePath(`submissions?assignment=${assignmentId}`))
    const table = page.locator('.group-roster__table')
    const row = (name: string) => table.locator('.el-table__row').filter({ hasText: name })
    await expect(row('Alpha')).toContainText('Yuki Tanaka')
    await expect(row('Alpha')).toContainText('by Yuki Tanaka')
    // Ken is in Beta now: Alpha's work is still his, and Beta's is not.
    await expect(row('Alpha')).toContainText('Handed in for Ken Wong and Yuki Tanaka')
    await expect(row('Beta')).toContainText('Handed in for Mei Chan')
    await expect(row('Beta')).toContainText('Ken Wong')
    await expect(row('Beta')).toContainText('by Mei Chan')
    await expect(row('Gamma')).toContainText('Not started')
    const noGroup = page.locator('.group-roster__no-group')
    await expect(noGroup).toContainText('In no group: 1 student')
    await expect(noGroup).toContainText(`Eve ${STAMP}`)
    await expect(noGroup).toContainText('are not recorded as missing')
    await photograph(page, 'group-work-roster')

    await row('Gamma').getByRole('button', { name: 'Record missing' }).click()
    const confirm = page.getByRole('dialog', { name: 'Record Gamma as missing?' })
    await expect(confirm).toContainText(`for its members now: Fay ${STAMP}`)
    await confirm.getByRole('button', { name: 'Record missing' }).click()
    await expectToasted(page, 'Gamma recorded as missing.')
    await expect(row('Gamma')).toContainText('Missing')

    // By student, each with their group.
    await page.locator('.group-roster__mode').getByText('By student').click()
    await expect(page.getByRole('radio', { name: 'By student' })).toBeChecked()
    const students_ = page.locator('.roster-table')
    await expect(students_.locator('.el-table__row').filter({ hasText: 'Ken Wong' })).toContainText('Beta')
    await expect(students_.locator('.el-table__row').filter({ hasText: 'Ken Wong' })).toContainText('Alpha’s work')
    await expect(students_.locator('.el-table__row').filter({ hasText: `Eve ${STAMP}` })).toContainText('In no group')
    await expect(students_.getByRole('button', { name: 'Mark missing' })).toHaveCount(0)
  })

  test('Alpha’s work counted late reads as late on the roster and to its members, and the form keeps its group set', async ({
    page,
  }) => {
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/submissions/${alphaWork}/lateness`, { state: 'late' })
    await as(page, sato())
    await page.goto(coursePath(`submissions?assignment=${assignmentId}`))
    const alpha = page.locator('.group-roster__table .el-table__row').filter({ hasText: 'Alpha' })
    await expect(alpha).toContainText('Late')
    await page.locator('.group-roster__mode').getByText('By student').click()
    const ken = page.locator('.roster-table .el-table__row').filter({ hasText: 'Ken Wong' })
    await expect(ken).toContainText('Late')

    await page.goto(coursePath(`assignments/${assignmentId}`))
    await header(page).getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit assignment' })
    await expect(dialog).toContainText('Someone has started on it, so whether it is group work')
    await expect(dialog.locator('.assignment-form__group .el-checkbox')).toHaveClass(/is-disabled/)

    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(myWork(page).locator('.my-work__attempt').first()).toContainText('Late')
  })

  test('nobody reads another group’s work or grades', async ({ page }) => {
    // Alpha's work is graded: Yuki gets the group's 9, Ken a score of his own.
    const graded = await ok(sato().token, 'POST', `/v1/courses/${courseId}/grades`, {
      submission_id: alphaWork,
      score: 9,
      no_rubric: true,
      adjustments: [
        { student_member_id: students.ken.member_id, kind: 'replace', points: 6, reason: 'Missed meetings' },
      ],
    })
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/grades/post`, {
      grade_ids: (graded.member_grades as { grade_id: string }[]).map((g) => g.grade_id),
    })

    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    const attempt = myWork(page).locator('.my-work__attempt').first()
    await expect(attempt).toContainText('9 / 10')
    await expect(myWork(page)).not.toContainText('6 / 10')

    // Mei, in Beta, is refused Alpha's work, and sees nothing of its grades.
    await as(page, students.mei)
    await page.goto(coursePath(`submissions/${alphaWork}`))
    await expect(page.getByText('Ken’s final wording.')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Alpha')
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(myWork(page)).not.toContainText('Alpha')
    await expect(myWork(page)).not.toContainText('/ 10')
    await page.goto(coursePath('submissions'))
    await expect(page.locator('.app-card').last()).toContainText('Beta')
    await expect(page.locator('.app-card').last()).not.toContainText('Alpha')
  })

  test('in Traditional Chinese: the student’s group, and the roster by group', async ({ page }) => {
    await as(page, students.yuki, { zh: true })
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(header(page)).toContainText('小組作業')
    await expect(myWork(page).locator('.my-work__group')).toContainText('你的小組')
    await expect(myWork(page).locator('.my-work__attempt').first()).toContainText('由你繳交')
    await photograph(page, 'group-work-zh-student')

    await as(page, students.eve, { zh: true })
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(myWork(page)).toContainText('你還沒有加入任何小組')
    await expect(myWork(page)).toContainText('請老師把你編入小組')

    await as(page, sato(), { zh: true })
    await page.goto(coursePath(`submissions?assignment=${assignmentId}`))
    await expect(page.getByRole('radio', { name: '按小組' })).toBeChecked()
    await expect(page.locator('.group-roster__no-group')).toContainText('未分組：1位學生')
    // They cannot hand anything in: not excused from it.
    await expect(page.locator('.group-roster__no-group')).toContainText('他們無法繳交這份作業')
    await expect(page.locator('.group-roster__table')).toContainText('缺交')
    await photograph(page, 'group-work-zh-roster')
  })

  test('at a phone’s width: the student’s group work and the roster’s cards, with no sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const sideways = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await as(page, students.yuki)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(myWork(page).locator('.my-work__group')).toContainText('Alpha')
    await expect(myWork(page).locator('.my-work__attempt').first()).toContainText('Handed in by you')
    expect(await sideways()).toBeLessThanOrEqual(0)
    await photograph(page, 'group-work-phone-student')

    await as(page, sato())
    await page.goto(coursePath(`submissions?assignment=${assignmentId}`))
    const cards = page.locator('.group-cards')
    await expect(cards.locator('li').filter({ hasText: 'Alpha' })).toContainText('Late')
    await expect(cards.locator('li').filter({ hasText: 'Gamma' })).toContainText('Missing')
    await expect(page.locator('.group-roster__no-group')).toContainText(`Eve ${STAMP}`)
    expect(await sideways()).toBeLessThanOrEqual(0)
    await photograph(page, 'group-work-phone-roster')
  })
  test('at a phone’s width, the form’s group work wraps, new and locked, with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await as(page, sato())
    await page.goto(coursePath('assignments'))
    await header(page).getByRole('button', { name: 'New assignment' }).click()
    const made = page.getByRole('dialog', { name: 'New assignment' })
    await made.locator('.assignment-form__toggle').click()
    await expect(made).toContainText('a student in no group of it hands nothing in')
    const fresh = await dialogOverflow(page)
    expect(fresh.overlay).toBeLessThanOrEqual(0)
    expect(fresh.body).toBeLessThanOrEqual(0)
    expect(fresh.label).toBeLessThanOrEqual(0.5)
    // The label is read whole, over more than one line.
    const label = made.locator('.assignment-form__toggle .el-checkbox__label')
    await expect(label).toHaveText('Each group hands in one piece of work, for all its members')
    expect((await label.boundingBox())!.height).toBeGreaterThan(30)
    await photograph(page, 'group-work-phone-form')
    await made.getByRole('button', { name: 'Cancel' }).click()

    await page.goto(coursePath(`assignments/${assignmentId}`))
    await header(page).getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit assignment' })
    await expect(edit).toContainText('Someone has started on it, so whether it is group work')
    const locked = await dialogOverflow(page)
    expect(locked.overlay).toBeLessThanOrEqual(0)
    expect(locked.body).toBeLessThanOrEqual(0)
    expect(locked.label).toBeLessThanOrEqual(0.5)
    await photograph(page, 'group-work-phone-form-locked')
  })

  test('a TA listed for Mei and Fay records Gamma missing, and not Beta, whose Ken they do not reach', async ({
    page,
  }) => {
    await keepToasts(page)
    const S = sato().token
    const ta = demo().actors.ta
    await ok(S, 'POST', `/v1/courses/${courseId}/members`, {
      actor_id: ta.actor_id,
      preset: 'ta',
      student_scope: 'listed',
      listed_students: [students.mei.member_id, students.fay.member_id],
    })
    secondId = (
      await ok(S, 'POST', `/v1/courses/${courseId}/assignments`, {
        title: SECOND,
        points_possible: 10,
        group_set_id: setId,
      })
    ).id
    await ok(S, 'POST', `/v1/courses/${courseId}/assignments/${secondId}/publish`, {})

    await as(page, ta)
    await page.goto(coursePath(`submissions?assignment=${secondId}`))
    const table = page.locator('.group-roster__table')
    const row = (name: string) => table.locator('.el-table__row').filter({ hasText: name })
    // Beta is Mei and Ken now: the TA is shown Mei, told of one more, and offered nothing.
    await expect(row('Beta')).toContainText('Mei Chan')
    await expect(row('Beta')).toContainText(
      '1 more member your seat does not reach, so someone whose seat reaches every member records the group as missing',
    )
    await expect(row('Beta').getByRole('button', { name: 'Record missing' })).toHaveCount(0)
    // Alpha, Yuki alone now, is nobody the TA reaches.
    await expect(row('Alpha')).toHaveCount(0)
    await photograph(page, 'group-work-roster-listed')

    await row('Gamma').getByRole('button', { name: 'Record missing' }).click()
    const confirm = page.getByRole('dialog', { name: 'Record Gamma as missing?' })
    await expect(confirm).toContainText(`for its members now: Fay ${STAMP}`)
    await confirm.getByRole('button', { name: 'Record missing' }).click()
    await expectToasted(page, 'Gamma recorded as missing.')
    await expect(row('Gamma')).toContainText('Missing')
  })

  test('Mei, moved from Beta to Alpha while writing Beta’s draft, is told so, keeps her unsaved text, and finds Alpha', async ({
    page,
  }) => {
    await keepToasts(page)
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${secondId}`))
    const work = myWork(page)
    await expect(work.locator('.my-work__group')).toContainText('Beta')
    await work.getByRole('button', { name: 'Start your group’s draft' }).click()
    await expectToasted(page, 'Draft started.')
    await work.locator('textarea').fill('Beta’s plan, by Mei.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await work.locator('textarea').fill('Beta’s plan, by Mei. A paragraph she has not saved.')

    await ok(sato().token, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
      placements: [{ student_member_id: students.mei.member_id, group_id: groups.alpha }],
      affects_work: true,
    })
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expect(work).toContainText(
      'You are no longer in Beta, so its draft is not yours to change or hand in any more.',
    )
    await expect(work.locator('.my-work__kept-text')).toHaveText('Beta’s plan, by Mei. A paragraph she has not saved.')
    // Her group is read again: Alpha, with Yuki, which has no draft yet.
    await expect(work.locator('.my-work__group')).toContainText('Alpha')
    await expect(work.locator('.my-work__group')).toContainText('you and Yuki Tanaka')
    await expect(page.locator('.assignment-view__facts')).toContainText('Alpha')
    await expect(work.locator('textarea')).toHaveCount(0)
    await expect(work.getByRole('button', { name: 'Start your group’s draft' })).toBeVisible()
    await photograph(page, 'group-work-moved')
    // Beta's draft is as she saved it, and hers to read no more.
    expect((await alphaDraft(secondId, groups.beta, students.ken)).body).toBe('Beta’s plan, by Mei.')

    await work.getByRole('button', { name: 'Discard it' }).click()
    await page
      .getByRole('dialog', { name: 'Discard what you had not saved?' })
      .getByRole('button', { name: 'Discard it' })
      .click()
    await expect(work.locator('.my-work__kept')).toHaveCount(0)
  })

  test('Yuki hands Alpha’s draft in while Mei is typing: Mei’s unsaved text stays on her page, to copy', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await keepToasts(page)
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${secondId}`))
    const work = myWork(page)
    await work.getByRole('button', { name: 'Start your group’s draft' }).click()
    await expectToasted(page, 'Draft started.')
    await work.locator('textarea').fill('Alpha’s plan.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await work.locator('textarea').fill('Alpha’s plan. Mei’s paragraph, not saved.')

    const d = await alphaDraft(secondId, groups.alpha, students.yuki)
    await ok(students.yuki.token, 'POST', `/v1/courses/${courseId}/submissions/${d.id}/submit`, {})
    // The draft is read again every 20 seconds.
    await expect(work).toContainText(
      'Yuki Tanaka has handed the draft in, without the changes you had not saved. They are kept below, for you to copy.',
      { timeout: 30_000 },
    )
    await expect(work.locator('.my-work__kept-text')).toHaveText('Alpha’s plan. Mei’s paragraph, not saved.')
    await expect(work.locator('textarea')).toHaveCount(0)
    await expect(work.getByRole('button', { name: 'Start attempt 2' })).toBeVisible()
    await photograph(page, 'group-work-kept')
    // It stays while she starts again.
    await work.getByRole('button', { name: 'Start attempt 2' }).click()
    await expectToasted(page, 'Draft started.')
    await expect(work.locator('textarea')).toBeVisible()
    await expect(work.locator('.my-work__kept-text')).toHaveText('Alpha’s plan. Mei’s paragraph, not saved.')
  })

  test('Refresh keeps what Mei had not saved, too: when Yuki hands Alpha’s draft in, and when Mei is moved out of Alpha', async ({
    page,
  }) => {
    await keepToasts(page)
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${secondId}`))
    const work = myWork(page)
    const refresh = page.getByRole('button', { name: 'Refresh' })
    await work.locator('textarea').fill('Attempt two.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await work.locator('textarea').fill('Attempt two. A line Mei has not saved.')

    // Refresh reads her attempts and the draft side by side. The draft's
    // reading answers last from here on, as it may: her attempts have no
    // draft by then, and the editor goes before the page knows why.
    await page.route(/\/v1\/courses\/[^/]+\/submissions\/[^/?]+(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    const two = await alphaDraft(secondId, groups.alpha, students.yuki)
    await ok(students.yuki.token, 'POST', `/v1/courses/${courseId}/submissions/${two.id}/submit`, {})
    await refresh.click()
    await expect(work).toContainText(
      'Yuki Tanaka has handed the draft in, without the changes you had not saved. They are kept below, for you to copy.',
    )
    await expect(work.locator('.my-work__kept-text')).toHaveText('Attempt two. A line Mei has not saved.')
    await expect(work.locator('textarea')).toHaveCount(0)

    await work.getByRole('button', { name: 'Start attempt 3' }).click()
    await expectToasted(page, 'Draft started.')
    await work.locator('textarea').fill('Attempt three.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await work.locator('textarea').fill('Attempt three. Another line Mei has not saved.')
    await ok(sato().token, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
      placements: [{ student_member_id: students.mei.member_id, group_id: groups.gamma }],
      affects_work: true,
    })
    await refresh.click()
    await expect(work).toContainText(
      'You are no longer in Alpha, so its draft is not yours to change or hand in any more.',
    )
    await expect(work.locator('.my-work__kept-text')).toHaveText('Attempt three. Another line Mei has not saved.')
    await expect(work.locator('textarea')).toHaveCount(0)
    await expect(work.locator('.my-work__group')).toContainText('Gamma')
  })

  test('a hand-in names what Mei saw: a file Fay attached meanwhile is shown first, and nothing is handed in', async ({
    page,
  }) => {
    const S = sato().token
    thirdId = (
      await ok(S, 'POST', `/v1/courses/${courseId}/assignments`, {
        title: THIRD,
        points_possible: 10,
        group_set_id: setId,
      })
    ).id
    await ok(S, 'POST', `/v1/courses/${courseId}/assignments/${thirdId}/publish`, {})
    await keepToasts(page)
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${thirdId}`))
    const work = myWork(page)
    await expect(work.locator('.my-work__group')).toContainText('Gamma')
    await work.getByRole('button', { name: 'Start your group’s draft' }).click()
    await expectToasted(page, 'Draft started.')
    await work.locator('textarea').fill('Our text.')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expectToasted(page, 'Draft saved.')
    await expect(work).toContainText('No files attached.')

    // Fay attaches a file from her own browser: the draft's revision stays as it was.
    const before = await alphaDraft(thirdId, groups.gamma, students.fay)
    const token = await uploadText(students.fay.token, 'fays-unrelated-notes.txt', 'Not for the poster.')
    await ok(students.fay.token, 'POST', `/v1/courses/${courseId}/documents`, {
      kind: 'submission',
      submission_id: before.id,
      title: 'fays-unrelated-notes.txt',
      files: [{ upload_token: token, filename: 'fays-unrelated-notes.txt' }],
    })
    expect((await alphaDraft(thirdId, groups.gamma, students.fay)).revision).toBe(before.revision)

    await work.getByRole('button', { name: 'Hand in' }).click()
    await expect(work).toContainText(
      'The draft’s files changed before it was handed in: someone in your group attached or removed one. Check them, then hand it in.',
    )
    await expect(page.getByRole('dialog', { name: 'Hand in attempt 1 for Gamma?' })).toHaveCount(0)
    // The page shows it now, and nothing was handed in.
    await expect(work).toContainText('fays-unrelated-notes.txt')
    const still = await call(students.fay.token, 'GET', `/v1/courses/${courseId}/submissions/${before.id}`)
    expect(still.body.result.state).toBe('draft')
  })

  test('text Fay saves while Mei’s confirmation is open stays out of the editor behind it and out of the hand-in', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await keepToasts(page)
    await as(page, students.mei)
    await page.goto(coursePath(`assignments/${thirdId}`))
    const work = myWork(page)
    await expect(work.locator('textarea')).toHaveValue('Our text.')
    await expect(work).toContainText('fays-unrelated-notes.txt')
    await work.getByRole('button', { name: 'Hand in' }).click()
    const confirm = page.getByRole('dialog', { name: 'Hand in attempt 1 for Gamma?' })
    await expect(confirm).toBeVisible()
    const d = await alphaDraft(thirdId, groups.gamma, students.fay)
    const fays = 'FAY CHANGED IT while Mei’s confirmation was open.'
    await ok(students.fay.token, 'POST', `/v1/courses/${courseId}/submissions/${d.id}`, {
      body: fays,
      base_revision: d.revision,
    })
    // Past the 20-second read: what is behind the confirmation is what Mei saw.
    await page.waitForTimeout(25_000)
    await expect(work.locator('textarea')).toHaveValue('Our text.')
    await confirm.getByRole('button', { name: 'Hand in' }).click()
    await expect(work).toContainText(`The draft changed before it was handed in: Fay ${STAMP} changed it`)
    await expect(work.locator('textarea')).toHaveValue(fays)
    const kept = await call(students.fay.token, 'GET', `/v1/courses/${courseId}/submissions/${d.id}`)
    expect(kept.body.result.state).toBe('draft')
    expect(kept.body.result.body).toBe(fays)

    // Read now, it is handed in as she sees it: Fay's text and Fay's file.
    await work.getByRole('button', { name: 'Hand in' }).click()
    await page.getByRole('dialog', { name: 'Hand in attempt 1 for Gamma?' }).getByRole('button', { name: 'Hand in' }).click()
    await expectToasted(page, `Handed in for you and Fay ${STAMP}.`)
    const done = await call(sato().token, 'GET', `/v1/courses/${courseId}/submissions/${d.id}`)
    expect(done.body.result.state).toBe('submitted')
    expect(done.body.result.body).toBe(fays)
    expect((done.body.result.files as { title: string }[]).map((f) => f.title)).toEqual(['fays-unrelated-notes.txt'])
  })

  test('recording Beta missing names Ken alone, whom Core records it for; Delta, Mei alone, is not offered; and Mei’s row keeps Gamma’s work', async ({
    page,
  }) => {
    const S = sato().token
    // Mei, part of Gamma's work, moves to Beta, Ken's.
    await ok(S, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
      placements: [{ student_member_id: students.mei.member_id, group_id: groups.beta }],
      affects_work: true,
    })
    await keepToasts(page)
    await as(page, sato())
    await page.goto(coursePath(`submissions?assignment=${thirdId}`))
    const table = page.locator('.group-roster__table')
    const row = (name: string) => table.locator('.el-table__row').filter({ hasText: name })
    await expect(row('Beta')).toContainText('Ken Wong and Mei Chan')
    await expect(row('Beta')).toContainText(
      'Mei Chan is part of another group’s work for this assignment, so recording the group as missing leaves them out',
    )
    await row('Beta').getByRole('button', { name: 'Record missing' }).click()
    const confirm = page.getByRole('dialog', { name: 'Record Beta as missing?' })
    await expect(confirm).toContainText(`for “${THIRD}”, for Ken Wong.`)
    await expect(confirm).toContainText('Mei Chan is left out: they are part of another group’s work for this assignment.')
    await confirm.getByRole('button', { name: 'Record missing' }).click()
    await expectToasted(page, 'Beta recorded as missing.')
    await expect(row('Beta')).toContainText('Recorded as missing for Ken Wong')
    const missing = await ok(
      S,
      'GET',
      `/v1/courses/${courseId}/submissions?assignment_id=${thirdId}&group_id=${groups.beta}`,
    )
    expect((missing.submissions[0].members as { member_id: string }[]).map((m) => m.member_id)).toEqual([
      students.ken.member_id,
    ])

    // Mei moves on to Delta, alone: every member of it is part of other work, and there is nobody to record.
    const delta = (
      await ok(S, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/groups`, { groups: [{ name: 'Delta' }] })
    ).group_ids[0] as string
    await ok(S, 'POST', `/v1/courses/${courseId}/group-sets/${setId}/members`, {
      placements: [{ student_member_id: students.mei.member_id, group_id: delta }],
      affects_work: true,
    })
    // Gamma starts again: its latest is a draft now, not the work Mei is part of.
    await ok(students.fay.token, 'POST', `/v1/courses/${courseId}/submissions`, { assignment_id: thirdId })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(row('Delta')).toContainText('Mei Chan')
    await expect(row('Delta')).toContainText(
      'Mei Chan is part of another group’s work for this assignment, so there is nobody here to record as missing',
    )
    await expect(row('Delta').getByRole('button', { name: 'Record missing' })).toHaveCount(0)
    await expect(row('Gamma')).toContainText('Draft')

    await page.locator('.group-roster__mode').getByText('By student').click()
    const mei = page.locator('.roster-table .el-table__row').filter({ hasText: 'Mei Chan' })
    await expect(mei).toContainText('Delta')
    await expect(mei).toContainText('Gamma’s work')
    await expect(mei).toContainText('Submitted')
  })
})
