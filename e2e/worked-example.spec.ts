import { expect, test } from '@playwright/test'
import { courseTab, coursePath, demo, pickOption, signIn, signInWithToken, toast } from './support'

// Core's schema §5, told through the app: a grading agent proposes a grade,
// the instructor approves it, posts it, and the student sees it.
test.describe.serial('the worked example', () => {
  test('the instructor finds the grader’s proposal in Approvals and approves it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Approvals').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('approvals')}$`))

    // The grader's proposal waits, with what it proposes: 9.5 out of 10 for Yuki.
    const card = page.locator('.action-card').filter({ hasText: 'Correct formula and good edge cases' })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('grader-v2')
    await expect(card.getByRole('link', { name: 'Enter a grade' })).toBeVisible()
    await expect(card).toContainText('9.5 / 10')
    await expect(card).toContainText('Yuki Tanaka')

    // Open it, and approve it there.
    await card.getByRole('link', { name: 'Enter a grade' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${d.course.proposed_grade_action}$`))
    await expect(page.locator('.page-header').getByText('Awaiting approval')).toBeVisible()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: 'Approve now' }).click()
    await expect(toast(page, 'Approved and carried out')).toBeVisible()
    await expect(page.locator('.page-header').getByText('Executed')).toBeVisible()
    await expect(page.locator('.action-timeline')).toContainText('Approved by Sato Hiroshi')

    // What it made: a draft grade, which the page links to.
    const made = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'What came of it' }) })
    await made.locator('a .id-text__code').click()
    await expect(page).toHaveURL(/\/grades\/[0-9a-f-]{36}$/)
    await expect(page.locator('.page-header')).toContainText('Draft')
    await expect(page.getByText('Draft: the student cannot see it until it is posted.')).toBeVisible()
    await expect(page.locator('.grade-view__score')).toContainText('9.5 / 10')

    // Nothing is left waiting.
    await courseTab(page, 'Approvals').click()
    await expect(page.getByText('Nothing is waiting for approval.')).toBeVisible()
  })

  test('while it is a draft, Yuki does not see it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath('grades'))
    await expect(page.getByRole('heading', { name: 'My grades' })).toBeVisible()
    await expect(page.getByText('No grades have been posted to you yet')).toBeVisible()
    await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
    const attempt = page.locator('.my-work__attempt').filter({ hasText: 'Attempt 1' })
    await expect(attempt).toContainText('No grade yet')
  })

  test('the approved grade is a draft, and the instructor posts HW1’s grades', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Grades').click()

    const yukiRow = page.locator('.el-table__row').filter({ hasText: 'Yuki Tanaka' }).filter({ hasText: 'HW1' })
    await expect(yukiRow).toHaveCount(1)
    await expect(yukiRow).toContainText('9.5')
    await expect(yukiRow).toContainText('Draft')
    await expect(yukiRow).toContainText('grader-v2')

    // Filter by HW1 and post every draft waiting for it.
    await pickOption(page, page.locator('.grades-view__filter').first(), 'HW1 — Temperature converter')
    await expect(page).toHaveURL(new RegExp(`assignment=${d.course.assignments.hw1}`))
    await page.getByRole('button', { name: 'Post all drafts for this assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Post grades' })
    await expect(dialog).toContainText('HW1 — Temperature converter')
    await dialog.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(page.getByText(/Grades posted: [1-9]/)).toBeVisible()
    await expect(yukiRow).toContainText('Posted')
  })

  test('Yuki sees her posted grade, on the grades page, the assignment and her gradebook', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await courseTab(page, 'Grades').click()
    await expect(page.getByRole('heading', { name: 'My grades' })).toBeVisible()
    const row = page.locator('.el-table__row').filter({ hasText: 'HW1 — Temperature converter' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('9.5')
    await expect(row).toContainText('/ 10')

    // The grade in full, with the grader's feedback.
    await row.click()
    await expect(page).toHaveURL(/\/grades\/[0-9a-f-]{36}$/)
    await expect(page.getByText('Correct formula and good edge cases', { exact: false })).toBeVisible()

    // On the assignment, her attempt shows its grade.
    await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
    const attempt = page.locator('.my-work__attempt').filter({ hasText: 'Attempt 1' })
    await expect(attempt.locator('.my-work__grade')).toContainText('9.5 / 10')

    // Her gradebook counts it: HW1 at 95%.
    await page.goto(coursePath('grades'))
    await page.getByRole('button', { name: 'My gradebook' }).click()
    await expect(page).toHaveURL(new RegExp(`/gradebook/${d.actors.yuki.member_id}$`))
    const hw1 = page.locator('.el-table__row').filter({ hasText: 'HW1 — Temperature converter' })
    await expect(hw1).toContainText('95%')
    await expect(hw1).toContainText('9.5')
    await expect(page.locator('.gradebook__total-value')).not.toHaveText('—')
  })

  test('the grader sees in My actions that its proposal was approved and carried out', async ({ page }) => {
    const d = demo()
    await signInWithToken(page, d.actors.grader)
    await page.goto(coursePath())
    await courseTab(page, 'My actions').click()
    // (Other specs may have had the grader propose more; this is the 9.5.)
    const row = page.locator('.el-table__row').filter({ hasText: 'Enter a grade' }).filter({ hasText: '9.5 / 10' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Executed')
    // The grader may not read the member list, so who decided is not named here.

    await row.getByRole('link', { name: 'Enter a grade' }).click()
    await expect(page).toHaveURL(new RegExp(`/actions/${d.course.proposed_grade_action}$`))
    await expect(page.locator('.page-header').getByText('Executed')).toBeVisible()
    const history = page.locator('.action-timeline')
    await expect(history).toContainText('Approved by')
    await expect(history).toContainText('Carried out')
  })
})
