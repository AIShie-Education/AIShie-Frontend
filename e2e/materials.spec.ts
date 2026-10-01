import { expect, test } from '@playwright/test'
import { courseTab, coursePath, demo, signIn, toast } from './support'

const TITLE = `Week 3 — Loops (e2e ${Date.now().toString(36)})`
const BODY = [
  '# Loops',
  '',
  'A `for` loop runs once **per item**:',
  '',
  '```python',
  'for i in range(3):',
  '    print(i)',
  '```',
  '',
  '- while',
  '- break',
].join('\n')

test.describe.serial('course material', () => {
  test('the instructor writes material in Markdown and publishes it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Materials').click()
    // The instructor also sees the unpublished Week 2, marked as such.
    const week2 = page.locator('.material-row').filter({ hasText: 'Week 2 — Variables and types' })
    await expect(week2).toContainText('Not published')

    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    // Files come first, a text note folded under them; material that is text
    // alone is the second choice.
    await expect(dialog.getByRole('button', { name: /^Files for new material/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Add a text note (optional)' })).toBeVisible()
    await expect(dialog.getByPlaceholder('Markdown')).toBeHidden()
    await dialog.getByRole('button', { name: 'Write text instead' }).click()
    await dialog.getByPlaceholder('e.g. Week 3 — Loops').fill(TITLE)
    await dialog.getByPlaceholder('Markdown').fill(BODY)
    // The preview renders it.
    await dialog.getByRole('tab', { name: 'Preview' }).click()
    await expect(dialog.getByRole('heading', { name: 'Loops' })).toBeVisible()
    await expect(dialog.locator('strong')).toHaveText('per item')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(toast(page, 'Material created')).toBeVisible()
    await expect(dialog).toBeHidden()

    const row = page.locator('.material-row').filter({ hasText: TITLE })
    await expect(row).toContainText('Not published')
    await row.click()
    await expect(page.locator('.page-header')).toContainText(TITLE)
    await expect(page.locator('.doc-content').getByRole('heading', { name: 'Loops' })).toBeVisible()
    await expect(page.locator('.doc-content pre')).toContainText('for i in range(3):')

    await page.getByRole('button', { name: 'Publish this version' }).click()
    const box = page.getByRole('dialog', { name: 'Publish version 1?' })
    await box.getByRole('button', { name: 'Publish' }).click()
    await expect(toast(page, 'Version 1 published')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish this version' })).toHaveCount(0)
    await expect(page.locator('.doc-content__meta')).toContainText('Published')

    await courseTab(page, 'Materials').click()
    await expect(row).toContainText('Published')
  })

  test('Yuki sees the published material and reads it, but not the unpublished Week 2', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await courseTab(page, 'Materials').click()
    await expect(page.getByText('The course material that has been published', { exact: false })).toBeVisible()

    const row = page.locator('.material-row').filter({ hasText: TITLE })
    await expect(row).toBeVisible()
    await expect(page.locator('.material-row').filter({ hasText: 'Week 1 — Welcome and setup' })).toBeVisible()
    await expect(page.locator('.material-row').filter({ hasText: 'Week 2' })).toHaveCount(0)
    // A reader is not shown drafts' labels, nor anything to write with.
    await expect(page.getByText('Not published')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New material' })).toHaveCount(0)

    await row.click()
    await expect(page.locator('.page-header')).toContainText(TITLE)
    await expect(page.locator('.doc-content').getByRole('heading', { name: 'Loops' })).toBeVisible()
    await expect(page.locator('.doc-content pre')).toContainText('print(i)')
    await expect(page.getByRole('button', { name: 'New version' })).toHaveCount(0)

    // Week 2 cannot be opened directly either.
    await page.goto(coursePath(`documents/${d.course.documents.week2}`))
    await expect(page.getByText('Not found.', { exact: false })).toBeVisible()
    await expect(page.getByText('Variables and types', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Draft — not yet published.')).toHaveCount(0)
  })

  test('a file chosen for new material is listed, titled from its name, and can be taken off again', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    const zone = dialog.locator('.file-drop')
    await zone.locator('input[type=file]').setInputFiles({
      name: 'slides.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Week 3 slides\n'),
    })
    const row = zone.locator('.file-drop__item')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('slides.txt')
    await expect(row).toContainText('Uploaded')
    // The material is titled after it.
    await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('slides')
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: 'Remove “slides.txt”' }).click()
    await expect(row).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    await expect(dialog).toContainText('Drop or choose files, or write text instead.')
  })
})
