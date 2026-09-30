import { expect, test } from '@playwright/test'
import { courseTab, coursePath, demo, signIn, toast } from './support'

const ANSWER = [
  '```python',
  'def c_to_f(c):',
  '    return c * 1.8 + 32',
  '```',
  '',
  'Mei tested -40, 0 and 37.5.',
].join('\n')
const FILE = 'mei_converter.py'

test.describe.serial('a student hands in work', () => {
  test('Mei starts a draft of HW1, writes, attaches a file and hands it in', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.mei)
    await page.goto(coursePath())
    await courseTab(page, 'Assignments').click()
    const hw1Row = page.locator('.el-table__row').filter({ hasText: 'HW1 — Temperature converter' })
    await expect(hw1Row).toContainText('Not started')
    await hw1Row.getByRole('link', { name: 'HW1 — Temperature converter' }).click()
    await expect(page).toHaveURL(new RegExp(`/assignments/${d.course.assignments.hw1}$`))

    const work = page.locator('.my-work')
    await expect(work).toContainText('You have not started this assignment yet.')
    await work.getByRole('button', { name: 'Start a draft' }).click()
    await expect(toast(page, 'Draft started.')).toBeVisible()
    await expect(work).toContainText('Attempt 1')

    // Write a first line and save it; then the rest, left unsaved.
    const text = work.getByPlaceholder('Write your answer here. Markdown is supported.')
    await text.fill('A first try.')
    await expect(work).toContainText('Unsaved changes')
    await work.getByRole('button', { name: 'Save draft' }).click()
    await expect(toast(page, 'Draft saved.')).toBeVisible()
    await expect(work).toContainText('All changes saved')
    await text.fill(ANSWER)
    await expect(work).toContainText('Unsaved changes')

    // Attach a file: it uploads, then is attached to the draft.
    await work.locator('input[type=file]').setInputFiles({
      name: FILE,
      mimeType: 'text/x-python',
      buffer: Buffer.from('def c_to_f(c):\n    return c * 1.8 + 32\n'),
    })
    await expect(toast(page, `“${FILE}” attached.`)).toBeVisible()
    await expect(work.locator('.my-work__files')).toContainText(FILE)
    // Once attached it is no longer listed as an upload waiting to be attached.
    await expect(work.locator('.file-drop__list')).toHaveCount(0)
    // What was being typed survives the draft being read again.
    await expect(text).toHaveValue(ANSWER)
    await expect(work).toContainText('Unsaved changes')

    // Hand in.
    await work.getByRole('button', { name: 'Hand in' }).click()
    const box = page.getByRole('dialog', { name: 'Hand in attempt 1?' })
    await expect(box).toBeVisible()
    await box.getByRole('button', { name: 'Hand in' }).click()
    await expect(toast(page, 'Handed in.')).toBeVisible()

    // The attempt is listed as submitted, and there is no open draft.
    const attempt = work.locator('.my-work__attempt').filter({ hasText: 'Attempt 1' })
    await expect(attempt).toContainText('Submitted')
    await expect(attempt).toContainText('No grade yet')
    await expect(work.getByRole('button', { name: 'Start attempt 2' })).toBeVisible()

    // Its page shows what was handed in: the text as last typed (handing in
    // saved it first) and the file.
    await attempt.getByRole('link', { name: 'View' }).click()
    await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/)
    await expect(page.locator('.page-header')).toContainText('Submitted')
    await expect(page.getByText('Mei tested -40, 0 and 37.5.')).toBeVisible()
    await expect(page.locator('.submission-view__files')).toContainText(FILE)
    await expect(page.getByText('A first try.')).toHaveCount(0)

    // The assignment list says so too.
    await courseTab(page, 'Assignments').click()
    await expect(hw1Row).toContainText('Submitted')
    await expect(hw1Row).toContainText('attempt 1')
  })

  test('the instructor sees Mei’s hand-in in Submissions', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Submissions').click()
    const row = page.locator('.el-table__row').filter({ hasText: 'Mei Chan' }).filter({ hasText: 'HW1' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Submitted')
    await expect(row).not.toContainText('Not handed in')

    await row.click()
    await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/)
    await expect(page.getByText('Mei tested -40, 0 and 37.5.')).toBeVisible()
    await expect(page.locator('.submission-view__files')).toContainText(FILE)
    // Being handed in, it can be graded here.
    await expect(page.getByRole('button', { name: 'Save draft grade' })).toBeVisible()
  })
})
