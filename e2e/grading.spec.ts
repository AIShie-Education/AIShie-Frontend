import { expect, test } from '@playwright/test'
import { call, coursePath, openCourseTab, demo, expectToasted, keepToasts, signIn } from './support'

// A score as ScoreText shows it, "8 / 10": the gaps around it are margins,
// not spaces, so in a row's text it can run into its neighbours
// ("converter8/ 1080%").
const outOf = (score: number, of: number) => new RegExp(`(?<![\\d.])${score}\\s*/\\s*${of}`)

// Ken's HW1 is a draft in the seeded course: he hands it in first, through
// Core, so that there is work to grade.
test.beforeAll(async () => {
  const d = demo()
  const sub = d.course.submissions.ken_hw1_draft
  const got = await call(d.actors.ken.token, 'GET', `/v1/courses/${d.course.id}/submissions/${sub}`)
  expect(got.status).toBe(200)
  if (got.body.result.state === 'draft') {
    const out = await call(d.actors.ken.token, 'POST', `/v1/courses/${d.course.id}/submissions/${sub}/submit`, {})
    expect(out.body.status).toBe('executed')
  }
})

test.describe.serial('grading a submission', () => {
  test('the TA grades Ken’s HW1 with a breakdown', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.ta)
    await page.goto(coursePath())
    await openCourseTab(page, 'Submissions')
    const row = page.locator('.el-table__row').filter({ hasText: 'Ken Wong' }).filter({ hasText: 'HW1' })
    await expect(row).toContainText('Submitted')
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/submissions/${d.course.submissions.ken_hw1_draft}$`))

    const panel = page.locator('.grade-panel')
    await expect(panel.getByRole('heading', { name: 'Enter a grade' })).toBeVisible()
    // The rubric is shown beside the form.
    await expect(panel.locator('.grade-panel__rubric')).toContainText('Correctness (6)')

    await panel.getByPlaceholder('e.g. 8.5').fill('7')
    await expect(panel).toContainText('out of 10')
    const lines: [string, string, string][] = [
      ['Correctness', '4', '6'],
      ['Testing', '2', '3'],
      ['Style', '1', '1'],
    ]
    for (const [i, [criterion, points, max]] of lines.entries()) {
      await panel.getByRole('button', { name: 'Add a criterion' }).click()
      const line = panel.locator('.breakdown__row').nth(i)
      await line.getByRole('textbox', { name: 'Criterion' }).fill(criterion)
      await line.getByRole('textbox', { name: 'Points' }).fill(points)
      await line.getByRole('textbox', { name: 'Max' }).fill(max)
    }
    await panel
      .locator('.breakdown__row')
      .nth(0)
      .getByRole('textbox', { name: 'Comment (optional)' })
      .fill('2 * c + 30 is off')
    await expect(panel).toContainText('Total 7 / 10')
    await panel
      .getByPlaceholder('What was done well, and what to work on (Markdown)')
      .fill('The formula is wrong: use 9/5.')

    // A feedback file: uploaded, and listed once.
    const uploader = panel.locator('.file-drop')
    await uploader.locator('input[type=file]').setInputFiles({
      name: 'ken-feedback.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Line 2: 2 * c + 30 should be c * 9 / 5 + 32.\n'),
    })
    await expect(uploader.locator('.file-drop__item').filter({ hasText: 'ken-feedback.txt' })).toHaveCount(1)
    await expect(uploader.locator('.file-drop__item')).toHaveCount(1)
    await expect(uploader.locator('.file-drop__item')).toContainText('Uploaded')

    await panel.getByRole('button', { name: 'Save draft grade' }).click()
    await expectToasted(page, 'Draft grade saved')
    await expect(panel.getByRole('link', { name: 'Open the grade' })).toBeVisible()

    // The work's grades list the new draft.
    const grades = page
      .locator('.app-card')
      .filter({ has: page.getByRole('heading', { name: 'Grades for this work' }) })
    await expect(grades).toContainText('Draft')
    await expect(grades).toContainText('7 / 10')

    // Its page shows the breakdown as entered.
    await panel.getByRole('link', { name: 'Open the grade' }).click()
    await expect(page.locator('.page-header')).toContainText('Draft')
    const breakdown = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Breakdown' }) })
    await expect(breakdown).toContainText('Correctness')
    await expect(breakdown).toContainText('2 * c + 30 is off')
    await expect(breakdown).toContainText('Testing')
    await expect(page.getByText('The formula is wrong: use 9/5.')).toBeVisible()
    await expect(page.locator('.grade-view__files')).toContainText('ken-feedback.txt')
    // A TA does not post.
    await expect(page.getByRole('button', { name: 'Post this grade' })).toHaveCount(0)
  })

  test('the instructor posts it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('grades'))
    const row = page.locator('.el-table__row').filter({ hasText: 'Ken Wong' }).filter({ hasText: 'HW1' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Draft')
    await expect(row).toContainText('Lee Ka Man')

    await row.locator('.el-checkbox').click()
    await page.getByRole('button', { name: 'Post selected (1)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Post grades' })
    await expect(dialog).toContainText('Selected drafts: 1')
    await expect(dialog).toContainText('Ken Wong')
    await dialog.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(page.getByText('Grades posted: 1')).toBeVisible()
    await expect(row).toContainText('Posted')
  })

  test('the instructor regrades it; the old grade shows as superseded', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('grades'))
    const posted = page.locator('.el-table__row').filter({ hasText: 'Ken Wong' }).filter({ hasText: 'HW1' })
    await expect(posted).toHaveCount(1)
    await posted.click()
    await expect(page).toHaveURL(/\/grades\/[0-9a-f-]{36}$/)
    const oldUrl = page.url()
    await expect(page.locator('.page-header')).toContainText('Posted')

    await page.getByRole('button', { name: 'Regrade' }).click()
    const dialog = page.getByRole('dialog', { name: 'Regrade' })
    await expect(dialog).toContainText('Current grade for')
    // The form starts from the current grade.
    const score = dialog.locator('.regrade__score-input input')
    await expect(score).toHaveValue('7')
    await expect(dialog.getByPlaceholder('Criterion').first()).toHaveValue('Correctness')
    await score.fill('8')
    await dialog.getByRole('button', { name: 'Regrade and post' }).click()
    await expectToasted(page, /^Regraded and posted\. Totals written or changed: \d+\.$/)

    // The new grade, posted, with the old one in its history as superseded.
    await expect(page).not.toHaveURL(oldUrl)
    await expect(page.locator('.page-header')).toContainText('Posted')
    await expect(page.locator('.grade-view__score')).toContainText(outOf(8, 10))
    const history = page.locator('.grade-view__history')
    await expect(history.locator('.el-table__row')).toHaveCount(2)
    await expect(history.locator('.el-table__row').filter({ hasText: 'Superseded' })).toContainText(outOf(7, 10))
    await expect(history.locator('.el-table__row').filter({ hasText: 'This one' })).toContainText('Posted')

    // The old grade says it has been replaced.
    await page.goto(oldUrl)
    await expect(page.locator('.page-header')).toContainText('Superseded')
    await expect(page.getByText('This grade has been replaced and no longer counts.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regrade' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Open the newer grade' }).click()
    await expect(page.locator('.page-header')).toContainText('Posted')

    // The list shows both.
    await page.goto(coursePath('grades'))
    const rows = page.locator('.el-table__row').filter({ hasText: 'Ken Wong' }).filter({ hasText: 'HW1' })
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Superseded' })).toContainText(outOf(7, 10))
    await expect(rows.filter({ hasText: 'Posted' })).toContainText(outOf(8, 10))
  })

  test('Ken sees only the new grade', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.ken)
    await page.goto(coursePath('grades'))
    const rows = page.locator('.el-table__row').filter({ hasText: 'HW1' })
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(outOf(8, 10))
  })

  test('from a grade, Back returns to the grades for that work', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('grades'))
    const row = page
      .locator('.el-table__row')
      .filter({ hasText: 'Ken Wong' })
      .filter({ hasText: 'HW1' })
      .filter({ hasText: 'Posted' })
    await row.click()
    await expect(page).toHaveURL(/\/grades\/[0-9a-f-]{36}$/)
    await page.locator('.page-header').getByRole('link', { name: 'Back' }).click()
    await expect(page).toHaveURL(new RegExp(`/grades\\?.*assignment=${d.course.assignments.hw1}`))
    await expect(page).toHaveURL(new RegExp(`student=${d.actors.ken.member_id}`))
    await expect(page.locator('.el-table__row').filter({ hasText: 'Ken Wong' })).not.toHaveCount(0)
    await expect(page.locator('.el-table__row').filter({ hasText: 'Yuki Tanaka' })).toHaveCount(0)
  })
})
