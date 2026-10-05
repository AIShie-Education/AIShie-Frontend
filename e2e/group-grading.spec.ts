import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { expectToasted, inTraditionalChinese, keepToasts, photograph, pickOption, signIn } from './support'
import { buildGroupGradingWorld, toolCaller, type GroupGradingWorld, type WorldPerson } from './group-grading-world'

// Grading a group's work: one group grade every member of the work is given,
// a member's score set apart from it with a reason (when grading, and on its
// own afterwards), posting as before, correcting whose work it is, and
// regrading the group; what a member reads of their grade; the gradebooks'
// marks; and that a student never sees another group's work, or another
// member's grade, on these pages. A course of its own (group-grading-world.ts).

let w: GroupGradingWorld
const REASON_CAI = 'Missed two of the group’s meetings'
const REASON_ANA = 'Wrote most of the report'

test.beforeAll(async () => {
  test.setTimeout(180_000)
  w = await buildGroupGradingWorld(process.env.E2E_CORE_URL!, process.env.E2E_ROOT_TOKEN!, process.env.E2E_PASSWORD!)
})

const path = (sub: string) => `/courses/${w.course.id}/${sub}`
const grades = (page: Page) =>
  page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Grades for this work' }) })
const memberLine = (page: Page, name: string) => grades(page).locator('.group-grades__item').filter({ hasText: name })

async function as(page: Page, who: WorldPerson) {
  await signIn(page, { email: who.email, display_name: who.display_name })
}

/** The page scrolls up and down only: nothing on it is wider than the window. */
async function expectNoSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'the page is no wider than the window').toBeLessThanOrEqual(0)
}

test.describe.serial('grading group work', () => {
  test('the teacher grades Team A once, setting Cai’s score apart with a reason', async ({ page }) => {
    await keepToasts(page)
    await as(page, w.people.teacher)
    await page.goto(path(`submissions/${w.submissions.a}`))

    await expect(page.locator('.page-header')).toContainText('Team A')
    const members = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Whose work this is' }) })
    await expect(members.locator('.group-work__item')).toHaveCount(3)
    await expect(members.locator('.group-work__item').filter({ hasText: 'Ben Ho' })).toContainText('Handed it in')

    const panel = page.locator('.grade-panel')
    await expect(panel.getByText('Group score', { exact: true })).toBeVisible()
    await panel.getByPlaceholder('e.g. 8.5').fill('80')
    const cai = panel.locator('.group-adjust__item').filter({ hasText: 'Cai Lam' })
    await expect(cai).toContainText('Comes to 80 / 100')
    await pickOption(page, cai.locator('.el-select'), 'Plus or minus')
    await cai.getByRole('textbox', { name: 'Points added (below zero to take away)' }).fill('-10')
    // A line set apart is not saved without its reason.
    await panel.getByRole('button', { name: 'Save draft grade' }).click()
    await expect(cai.getByRole('alert')).toHaveText('Say why: the member reads it.')
    await cai.getByRole('textbox', { name: 'Reason (the member reads it)' }).fill(REASON_CAI)
    await expect(cai).toContainText('Comes to 70 / 100')
    await expect(cai.getByRole('alert')).toHaveCount(0)
    await cai.scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-form')

    await panel
      .getByPlaceholder('What was done well, and what to work on (Markdown)')
      .fill('A sturdy bridge; say how you tested it.')
    const uploader = panel.locator('.file-drop')
    await uploader.locator('input[type=file]').setInputFiles({
      name: 'team-a-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Load test: say how the 2 kg was placed.\n'),
    })
    await expect(uploader.locator('.file-drop__item')).toContainText('Uploaded')
    await panel.getByRole('button', { name: 'Save draft grade' }).click()
    await expectToasted(page, 'Draft grade saved')
    await expect(panel).toContainText('A draft grade for each of the 3 members of the work.')

    // Each member's own grade, from the group's.
    await expect(grades(page)).toContainText('Team A’s score')
    await expect(memberLine(page, 'Ana Chan')).toContainText('80')
    await expect(memberLine(page, 'Ana Chan')).toContainText('The group’s score')
    await expect(memberLine(page, 'Cai Lam')).toContainText('70')
    await expect(memberLine(page, 'Cai Lam')).toContainText('The group’s score minus 10')
    await expect(memberLine(page, 'Cai Lam')).toContainText(`Reason: ${REASON_CAI}`)
    await expect(memberLine(page, 'Cai Lam')).toContainText('Set by Teacher Wong')
    await grades(page).scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-grades')
    // The form starts again from what the grades carry: Cai's line is still set apart.
    await expect(
      panel
        .locator('.group-adjust__item')
        .filter({ hasText: 'Cai Lam' })
        .getByRole('textbox', { name: 'Reason (the member reads it)' }),
    ).toHaveValue(REASON_CAI)
  })

  test('the TA adjusts a member’s draft grade, and takes the adjustment back', async ({ page }) => {
    await keepToasts(page)
    await as(page, w.people.ta)
    await page.goto(path(`submissions/${w.submissions.a}`))
    await memberLine(page, 'Ben Ho').getByRole('button', { name: 'Adjust' }).click()
    const dialog = page.getByRole('dialog', { name: 'Adjust Ben Ho’s grade' })
    await expect(dialog).toContainText('A new draft takes this one’s place.')
    const how = dialog.getByRole('radiogroup', { name: 'How their score is given' })
    await how.getByText('A score of their own', { exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Their score' }).fill('82')
    await dialog.getByRole('textbox', { name: 'Reason (the member reads it)' }).fill('Ran the load tests')
    await expect(dialog).toContainText('Their score will be 82 / 100')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Grade adjusted')
    await expect(memberLine(page, 'Ben Ho')).toContainText('A score of their own: 82')
    // Taken back to the group's score, by the same way.
    await memberLine(page, 'Ben Ho').getByRole('button', { name: 'Adjust' }).click()
    await how.getByText('The group’s score', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Grade adjusted')
    await expect(memberLine(page, 'Ben Ho')).toContainText('The group’s score')
    await expect(memberLine(page, 'Ben Ho')).not.toContainText('82')
  })

  test('a TA whose seat reaches Ana and Ben alone is told Cai is outside it, and offered nothing Core refuses', async ({
    page,
  }) => {
    // Core shows Ivy Team A's work (she reaches one of its members), but the grades, the group's members and their
    // history of Ana and Ben alone; it grades the work, and corrects its members and lateness, only for a seat that
    // reaches all three.
    await as(page, w.people.ivy)
    await page.goto(path(`submissions/${w.submissions.a}`))
    const members = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Whose work this is' }) })
    const caiThere = members.locator('.group-work__item').filter({ hasText: 'Cai Lam' })
    await expect(caiThere).toContainText('Outside the students your seat reaches')
    await expect(members).not.toContainText('Not in the group')
    await expect(members).toContainText('whether they are in the group now is not shown to you')
    await expect(page.getByRole('button', { name: 'Correct members' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark as late' })).toHaveCount(0)

    // Cai's grade is not shown to her: said so, never that he has none.
    await expect(memberLine(page, 'Ana Chan')).toContainText('80')
    await expect(memberLine(page, 'Cai Lam')).toContainText(
      'Outside the students your seat reaches: their grade is not shown to you',
    )
    await expect(grades(page)).not.toContainText('No grade from this work yet')
    await expect(grades(page)).not.toContainText('A member with no grade')
    // Adjusting Ana alone is within her reach.
    await expect(memberLine(page, 'Ana Chan').getByRole('button', { name: 'Adjust' })).toBeVisible()

    // No form to grade the group with: a group's grade is every member's.
    const panel = page.locator('.grade-panel')
    await expect(panel).toContainText('Some members of this work are outside the students your seat reaches.')
    await expect(panel.getByRole('button', { name: 'Save draft grade' })).toHaveCount(0)
    await members.scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-partial-reach')
  })

  test('the teacher posts, adjusts Ana’s posted grade, corrects the members and regrades the group', async ({
    page,
  }) => {
    await keepToasts(page)
    await as(page, w.people.teacher)
    // Posting as before: every member's draft for the assignment.
    await page.goto(path(`grades?assignment=${w.assignment.id}`))
    await page.getByRole('button', { name: 'Post all drafts for this assignment' }).click()
    const post = page.getByRole('dialog', { name: 'Post grades' })
    await post.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(page.getByText('Grades posted: 3')).toBeVisible()
    // The list says which grades are a group's, and which member was set apart.
    const caiRow = page.locator('.el-table__row').filter({ hasText: 'Cai Lam' })
    await expect(caiRow).toContainText('Team A · Adjusted')
    await expect(page.locator('.el-table__row').filter({ hasText: 'Ana Chan' })).toContainText('Team A')

    await page.goto(path(`submissions/${w.submissions.a}`))
    await expect(page.locator('.grade-panel')).toContainText('The group’s grade is posted.')
    await memberLine(page, 'Ana Chan').getByRole('button', { name: 'Adjust' }).click()
    const dialog = page.getByRole('dialog', { name: 'Adjust Ana Chan’s grade' })
    await expect(dialog).toContainText('A new posted grade takes this one’s place at once')
    await dialog.getByRole('radiogroup', { name: 'How their score is given' }).getByText('A score of their own').click()
    await dialog.getByRole('textbox', { name: 'Their score' }).fill('90')
    await dialog.getByRole('textbox', { name: 'Reason (the member reads it)' }).fill(REASON_ANA)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Grade adjusted')
    await expect(memberLine(page, 'Ana Chan')).toContainText('A score of their own: 90')
    await expect(memberLine(page, 'Ana Chan')).toContainText('Posted')

    // Fay, whom the teacher never placed, worked with Team A: she is added to its work.
    await page.getByRole('button', { name: 'Correct members' }).click()
    const correct = page.getByRole('dialog', { name: 'Correct whose work this is' })
    await expect(correct.getByRole('checkbox', { name: 'Take Cai Lam off' })).toBeDisabled()
    await expect(correct).toContainText('Has a grade on this work, which stays theirs')
    await pickOption(page, correct.locator('.el-select'), 'Fay Yip')
    await page.keyboard.press('Escape')
    await expect(correct).toContainText('Adds Fay Yip')
    await correct.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Members corrected')
    const members = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Whose work this is' }) })
    await expect(members.locator('.group-work__item').filter({ hasText: 'Fay Yip' })).toBeVisible()
    await members.scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-members')
    await expect(memberLine(page, 'Fay Yip')).toContainText('No grade from this work yet')
    await expect(grades(page)).toContainText('regrading the group gives them a grade from it')

    // Regrading the group, from Ben's grade: every member's grade written again, adjustments carried.
    await memberLine(page, 'Ben Ho').getByRole('link', { name: 'Open Ben Ho’s grade' }).click()
    const card = page.locator('.group-grade')
    await expect(card).toContainText('Team A')
    await expect(card).toContainText('The group’s score')
    await photograph(page, 'group-grading-member-grade')
    await page.getByRole('button', { name: 'Regrade the group' }).click()
    const regrade = page.getByRole('dialog', { name: 'Regrade the group' })
    const line = (name: string) => regrade.locator('.group-adjust__item').filter({ hasText: name })
    await expect(line('Fay Yip')).toBeVisible()
    await regrade.getByRole('textbox', { name: 'New group score' }).fill('84')
    await expect(line('Ana Chan')).toContainText('Comes to 90 / 100')
    await expect(line('Ben Ho')).toContainText('Comes to 84 / 100')
    await expect(line('Cai Lam')).toContainText('Comes to 74 / 100')
    await expect(line('Fay Yip')).toContainText('Comes to 84 / 100')
    await photograph(page, 'group-grading-regrade')
    await regrade.getByRole('button', { name: 'Regrade and post' }).click()
    await expect(page.locator('.group-grade')).toContainText('84')

    await page.goto(path(`submissions/${w.submissions.a}`))
    await expect(memberLine(page, 'Ana Chan')).toContainText('90')
    await expect(memberLine(page, 'Ben Ho')).toContainText('84')
    await expect(memberLine(page, 'Cai Lam')).toContainText('74')
    await expect(memberLine(page, 'Fay Yip')).toContainText('84')
    await expect(grades(page)).toContainText('Team A’s score')
  })

  test('the class’s gradebook marks group grades and adjusted members, and its CSV says so', async ({ page }) => {
    await as(page, w.people.teacher)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path('gradebook'))
    const row = (name: string) => page.locator('.matrix__row').filter({ hasText: name })
    const cell = (name: string) => row(name).locator('.matrix__cell.is-assignment')
    await expect(cell('Cai Lam')).toContainText('74')
    await expect(cell('Cai Lam').locator('.matrix__adj')).toHaveText('±')
    await expect(cell('Cai Lam')).toContainText('From Team A’s grade, adjusted for this member.')
    await expect(cell('Ben Ho').locator('.matrix__adj')).toHaveCount(0)
    await expect(cell('Ben Ho')).toContainText('From Team A’s grade.')
    await expect(page.locator('.classbook__legend')).toContainText(
      'a member’s score a grader set apart from the group’s',
    )
    await photograph(page, 'group-grading-classbook')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ])
    const csv = readFileSync((await download.path())!, 'utf8')
    const lines = csv.replace(/^﻿/, '').split('\r\n')
    expect(lines[0]).toContain('Group: Projects')
    const cai = lines.find((l) => l.startsWith('Cai Lam'))!
    expect(cai).toContain('Team A')
    expect(cai).toContain('74 (adjusted)')
    const fay = lines.find((l) => l.startsWith('Fay Yip'))!
    // Fay is in no group, though part of Team A's work.
    expect(fay.split(',')[4]).toBe('')
  })

  test('Cai reads his own grade and its reason on a phone, in Chinese, and nobody else’s', async ({ page }) => {
    await as(page, w.people.cai)
    await inTraditionalChinese(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path('grades'))
    const item = page.locator('.grades-list__item').filter({ hasText: w.assignment.title })
    await expect(item).toContainText('74')
    await expect(item).toContainText('Team A · 已調整')
    await expectNoSidewaysScroll(page)
    await item.click()
    const card = page.locator('.group-grade')
    await expect(card).toContainText('你的分數')
    await expect(card).toContainText('74')
    await expect(card).toContainText('小組分數')
    await expect(card).toContainText('84')
    await expect(card).toContainText('小組分數減10分')
    await expect(card).toContainText(`原因：${REASON_CAI}`)
    // Who set it is for those who grade.
    await expect(card).not.toContainText('Teacher Wong')
    await photograph(page, 'group-grading-student-grade-390')
    await expect(page.getByRole('button', { name: '調整' })).toHaveCount(0)
    await expectNoSidewaysScroll(page)

    // His group's work: whose it is, and his grade from it alone.
    await page.goto(path(`submissions/${w.submissions.a}`))
    await expect(page.locator('.group-work__item')).toHaveCount(4)
    await expect(page.getByRole('button', { name: '更正成員' })).toHaveCount(0)
    const mine = page.locator('.group-grades')
    await expect(mine.locator('.group-grades__item')).toHaveCount(1)
    await expect(mine).toContainText('你的成績')
    await expect(mine).toContainText('74')
    await expect(mine).not.toContainText('90')
    await expect(mine).not.toContainText(REASON_ANA)
    await mine.scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-student-work-390')
    await expectNoSidewaysScroll(page)

    // His gradebook marks the assignment as his group's, adjusted.
    await page.goto(path('gradebook'))
    await expect(page.locator('.group-mark').first()).toContainText('Team A · 已調整')
  })

  test('a student never sees another group’s work or another member’s grade', async ({ page }) => {
    const call = await toolCaller(w.core)
    const anaGrade = (
      await call(w.people.teacher.token, 'grade.list', {
        course_id: w.course.id,
        student_member_id: w.people.ana.member_id,
      })
    ).result.grades.find((g: { state: string }) => g.state === 'posted').id as string
    await as(page, w.people.dev)
    // Team A's work, by its address: refused, and nothing of it shown.
    await page.goto(path(`submissions/${w.submissions.a}`))
    await expect(page.locator('.el-result, .async-state__error, .app-empty').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Team A’s report')
    await expect(page.locator('body')).not.toContainText('Ana Chan')
    // Ana's grade, by its address.
    await page.goto(path(`grades/${anaGrade}`))
    await expect(page.locator('.el-result, .async-state__error, .app-empty').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText(REASON_ANA)
    // His own grades: none yet, and nothing of Team A's.
    await page.goto(path('grades'))
    await expect(page.locator('main')).not.toContainText('Team A')
    await expect(page.locator('main')).not.toContainText('84')
    // His own group's work lists Team B's members alone.
    await page.goto(path(`submissions/${w.submissions.b}`))
    await expect(page.locator('.group-work__item')).toHaveCount(2)
    await expect(page.locator('main')).not.toContainText('Ana Chan')
  })

  test('a grading agent’s group grade, with an adjustment, reads as one in the approvals', async ({ page }) => {
    await keepToasts(page)
    const call = await toolCaller(w.core)
    const proposed = await call(w.people.grader.token, 'grade.submit', {
      course_id: w.course.id,
      submission_id: w.submissions.b,
      score: 70,
      feedback: 'A tall tower; brace its base.',
      adjustments: [{ student_member_id: w.people.eva.member_id, kind: 'delta', points: 5, reason: 'Built the model' }],
    })
    expect(proposed.status, JSON.stringify(proposed)).toBe('proposed')
    await as(page, w.people.teacher)
    await page.goto(path('approvals'))
    const card = page.locator('.action-card').filter({ hasText: 'Team B' })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('70')
    await expect(card).toContainText('one member adjusted')
    await card.getByRole('link', { name: 'Enter a grade' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${proposed.action_id}$`))
    await photograph(page, 'group-grading-proposal')
    const fields = page.locator('.fields-view').first()
    await expect(fields).toContainText('Each member’s score')
    await expect(fields.locator('.group-field__item').filter({ hasText: 'Eva Ng' })).toContainText(
      'The group’s score plus 5',
    )
    await expect(fields.locator('.group-field__item').filter({ hasText: 'Eva Ng' })).toContainText(
      'Reason: Built the model',
    )
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: 'Approve now' }).click()
    await expectToasted(page, 'Approved and carried out')
    await expect(page.locator('.page-header').getByText('Executed')).toBeVisible()
  })

  test('the TA adjusts a member of Team B on a phone, in Chinese', async ({ page }) => {
    await keepToasts(page)
    await as(page, w.people.ta)
    await inTraditionalChinese(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path(`submissions/${w.submissions.b}`))
    const eva = page.locator('.group-grades__item').filter({ hasText: 'Eva Ng' })
    await expect(eva).toContainText('75')
    await expect(eva).toContainText('小組分數加5分')
    await expectNoSidewaysScroll(page)
    await eva.getByRole('button', { name: '調整' }).click()
    const dialog = page.getByRole('dialog', { name: '調整Eva Ng的成績' })
    // It opens on Eva's adjustment as it is, the reason with it.
    await expect(dialog.getByRole('textbox', { name: '原因（組員會看到）' })).toHaveValue('Built the model')
    await dialog.getByRole('radiogroup', { name: '他的分數怎樣給' }).getByText('加減分').click()
    await dialog.getByRole('textbox', { name: '加的分數（負數即扣分）' }).fill('8')
    await expect(dialog).toContainText('他的分數會是78 / 100')
    await photograph(page, 'group-grading-adjust-390')
    await dialog.getByRole('button', { name: '儲存' }).click()
    await expectToasted(page, '成績已調整')
    await expect(eva).toContainText('78')
    await expect(eva).toContainText('小組分數加8分')
    // The grading form, on a phone: each member's line fits.
    const panel = page.locator('.grade-panel')
    await expect(panel.locator('.group-adjust__item')).toHaveCount(2)
    await panel.locator('.group-adjust').scrollIntoViewIfNeeded()
    await photograph(page, 'group-grading-form-390')
    await expectNoSidewaysScroll(page)

    // Team A's grades are posted: adjusting one is a regrade, which a TA does not post.
    await page.goto(path(`submissions/${w.submissions.a}`))
    await expect(page.locator('.group-grades__item')).toHaveCount(4)
    await expect(page.locator('.group-grades').getByRole('button', { name: '調整' })).toHaveCount(0)
  })

  test('a TA who may not read grades grades Team B again, and Eva’s adjustment is kept, unseen', async ({ page }) => {
    await keepToasts(page)
    await as(page, w.people.kit)
    await page.goto(path(`submissions/${w.submissions.b}`))
    await expect(grades(page)).toContainText('You cannot read grades in this course.')
    const panel = page.locator('.grade-panel')
    const lines = panel.locator('.group-adjust__item')
    await expect(lines).toHaveCount(2)
    // Each line as the member's grade has it, which is not shown to Kit: never "the group's score".
    for (const name of ['Dev Patel', 'Eva Ng']) {
      const line = lines.filter({ hasText: name })
      await expect(line).toContainText('As their grade has it now')
      await expect(line.locator('.el-select')).toContainText('Kept as it is')
    }
    await expect(panel).toContainText('each member’s line keeps what their grade has now')
    await panel.getByPlaceholder('e.g. 8.5').fill('72')
    await panel.getByRole('button', { name: 'Save draft grade' }).click()
    await expectToasted(page, 'Draft grade saved')

    // Eva's new draft carries the TA's adjustment, with its reason.
    const call = await toolCaller(w.core)
    const listed = await call(w.people.teacher.token, 'grade.list', {
      course_id: w.course.id,
      assignment_id: w.assignment.id,
      student_member_id: w.people.eva.member_id,
    })
    const draft = listed.result.grades.find((g: { state: string }) => g.state === 'draft')
    expect(Number(draft.score)).toBe(80)
    expect(Number(draft.group.score)).toBe(72)
    expect(draft.group.adjustment).toMatchObject({ kind: 'delta', reason: 'Built the model' })
    expect(Number(draft.group.adjustment.points)).toBe(8)
  })

  test('the class’s gradebook shows a member’s adjusted draft whole, in English and in Chinese', async ({ page }) => {
    // Team B's drafts: Dev's the group's 72, Eva's set apart from it (80), each with the group's mark and a draft's
    // flag, Eva's with ± too.
    await as(page, w.people.teacher)
    await page.setViewportSize({ width: 1280, height: 800 })
    for (const [locale, flag] of [
      ['en', 'Draft'],
      ['zh-Hant', '草稿'],
      ['zh-Hans', '草稿'],
    ] as const) {
      await page.addInitScript((l) => localStorage.setItem('aishie.locale', l), locale)
      await page.goto(path('gradebook'))
      const eva = page.locator('.matrix__row').filter({ hasText: 'Eva Ng' }).locator('.matrix__cell.is-assignment')
      await expect(eva.locator('.matrix__adj')).toHaveText('±')
      await expect(eva.locator('.matrix__flag.is-draft')).toHaveText(flag)
      await expect(eva.locator('.matrix__score')).toHaveText('80')
      // Not cut short: the figure is whole in the cell, and in its tooltip.
      const cut = await eva
        .locator('.matrix__score')
        .evaluate(
          (el) =>
            el.scrollWidth > el.clientWidth ||
            el.getBoundingClientRect().right > el.closest('td')!.getBoundingClientRect().right,
        )
      expect(cut, `Eva’s score is cut short in ${locale}`).toBe(false)
      await expect(eva.locator('.matrix__value')).toHaveAttribute('title', /^80 /)
      if (locale === 'zh-Hant') await photograph(page, 'group-grading-classbook-draft-zh-Hant')
    }
  })

  test('a refusal of grading group work reads in the app’s words on the approvals and actions pages', async ({
    page,
  }) => {
    const call = await toolCaller(w.core)
    // The agent proposes Team B's grade again; the teacher posts Team B's drafts meanwhile.
    const proposed = await call(w.people.grader.token, 'grade.submit', {
      course_id: w.course.id,
      submission_id: w.submissions.b,
      score: 72,
    })
    expect(proposed.status, JSON.stringify(proposed)).toBe('proposed')
    const drafts = (
      await call(w.people.teacher.token, 'grade.list', { course_id: w.course.id, assignment_id: w.assignment.id })
    ).result.grades
      .filter(
        (g: { state: string; submission_id: string }) => g.state === 'draft' && g.submission_id === w.submissions.b,
      )
      .map((g: { id: string }) => g.id)
    const posted = await call(w.people.teacher.token, 'grade.post', { course_id: w.course.id, grade_ids: drafts })
    expect(posted.status, JSON.stringify(posted)).toBe('executed')

    await as(page, w.people.teacher)
    await inTraditionalChinese(page)
    await page.goto(path(`actions/${proposed.action_id}`))
    await page.getByRole('button', { name: '批准', exact: true }).click()
    await page.getByRole('button', { name: '立即批准' }).click()
    const toast = page.locator('.el-notification')
    await expect(toast).toContainText('已批准，但未能執行')
    await expect(toast).toContainText('由這份小組成績而來的成績已經發佈')
    await expect(toast).not.toContainText('grade.regrade')
    // The action's result says it too, and nothing of Core's own words (which its raw JSON, on request, still has).
    const result = page.locator('.action-view__error')
    await expect(result).toContainText('由這份小組成績而來的成績已經發佈')
    await expect(result).not.toContainText('grade.regrade')
    await expect(page.locator('.outcome-alert')).not.toContainText('grade.regrade')

    // Adding Ben, part of Team A's work, to Team B's: refused, and listed among the teacher's actions in words.
    await page.goto(path(`submissions/${w.submissions.b}`))
    await page.getByRole('button', { name: '更正成員' }).click()
    const correct = page.getByRole('dialog', { name: '更正這份作業屬於誰' })
    await pickOption(page, correct.locator('.el-select'), 'Ben Ho')
    await page.keyboard.press('Escape')
    await correct.getByRole('button', { name: '儲存' }).click()
    await expect(page.locator('.el-notification, .el-message').filter({ hasText: '另一小組' }).first()).toBeVisible()
    await page.goto(path('my-actions'))
    const row = page.locator('.el-table__row').filter({ hasText: 'Ben Ho' }).first()
    await expect(row).toContainText('你加入的學生已是另一小組在同一份作業中所交作業的成員。')
    await expect(row).not.toContainText('part_of_other_work')
  })
})
