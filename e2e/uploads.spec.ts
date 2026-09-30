import { expect, test, type Page } from '@playwright/test'
import { call, courseTab, coursePath, demo, dropFiles, photograph, signIn, toast, type FileSpec } from './support'

// Uploading, with the real Core: files dropped on the materials page become
// material, one each; a new version is a file dropped in its dialog, or on
// the document's page; a student hands in files dropped on their draft; a
// file over Core's limit is refused before it is sent; and an upload that
// breaks off on the way is tried again by itself.
const tag = Date.now().toString(36)
const LECTURE = `Week 4 — Recursion (e2e ${tag})`
const EXERCISES = `Week 4 — Exercises (e2e ${tag})`

const pdf = (name: string, text: string): FileSpec => ({
  name,
  mimeType: 'application/pdf',
  // Not a real PDF: Core keeps what it is given, as it is.
  buffer: Buffer.from(`%PDF-1.4\n% ${text}\n`),
})
const txt = (name: string, text: string): FileSpec => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })

/** The PUTs of files to Core's store. */
function blobPuts(page: Page): string[] {
  const puts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname.startsWith('/v1/blobs/')) puts.push(r.url())
  })
  return puts
}

test.describe.serial('uploading', () => {
  test('two files dropped on the materials page become two materials, titled from their names', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Materials').click()
    await expect(page.getByText('Drop files anywhere on this page to add each one as new material.')).toBeVisible()

    await dropFiles(page.locator('.material-list'), [
      pdf(`${LECTURE}.pdf`, 'recursion slides'),
      txt(`week4-exercises-${tag}.txt`, '1. Write factorial(n) recursively.\n'),
    ])
    const dialog = page.getByRole('dialog', { name: 'New material' })
    await expect(dialog).toBeVisible()
    const rows = dialog.locator('.file-drop__item')
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Uploaded' })).toHaveCount(2)
    // Titled from the files' names, and the second one retitled.
    await expect(dialog.getByRole('textbox', { name: `Title for “${LECTURE}.pdf”` })).toHaveValue(LECTURE)
    const second = dialog.getByRole('textbox', { name: `Title for “week4-exercises-${tag}.txt”` })
    await expect(second).toHaveValue(`week4-exercises-${tag}`)
    await second.fill(EXERCISES)
    await expect(dialog).toContainText('Each file becomes material of its own')
    await photograph(page, 'upload-materials-dialog')

    await dialog.getByRole('button', { name: 'Create 2 materials' }).click()
    await expect(toast(page, '2 materials created')).toBeVisible()
    await expect(dialog).toBeHidden()
    const lecture = page.locator('.material-row').filter({ hasText: LECTURE })
    const exercises = page.locator('.material-row').filter({ hasText: EXERCISES })
    await expect(lecture).toContainText('Not published')
    await expect(exercises).toContainText('Not published')
    // In the order they were dropped.
    const order = async (row: typeof lecture) => Number(await row.locator('.material-row__order').innerText())
    expect(await order(exercises)).toBe((await order(lecture)) + 1)

    await lecture.click()
    await expect(page.locator('.page-header')).toContainText(LECTURE)
    await expect(page.locator('.doc-file')).toContainText('application/pdf')
    await expect(page.getByText('This version has no text; its content is the file.')).toBeVisible()
  })

  test('a new version opens on its drop zone, and takes a file dropped in it, or on the document’s page', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('materials'))
    await page.locator('.material-row').filter({ hasText: LECTURE }).click()
    await expect(page.locator('.page-header')).toContainText(LECTURE)

    await page.getByRole('button', { name: 'New version' }).click()
    const dialog = page.getByRole('dialog', { name: `New version of “${LECTURE}”` })
    const zone = dialog.getByRole('button', { name: /^The new version’s file/ })
    await expect(zone).toBeVisible()
    await expect(dialog.getByPlaceholder('Markdown')).toHaveCount(0)
    await expect(dialog).toContainText('Version 1 has a file')
    await dropFiles(zone, [pdf('recursion-v2.pdf', 'recursion slides, second edition')])
    await expect(dialog.locator('.file-drop__item')).toContainText('Uploaded')
    await expect(dialog).toContainText('Text: none.')
    // Text as well, the second choice.
    await dialog.getByRole('button', { name: 'Write text instead' }).click()
    await dialog.getByPlaceholder('Markdown').fill('Read chapter 4 before the lecture.')
    await expect(dialog).toContainText('With the file “recursion-v2.pdf”')
    await photograph(page, 'upload-new-version-text')
    await dialog.getByRole('button', { name: 'Save version' }).click()
    await expect(toast(page, 'New version saved')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.doc-content__meta')).toContainText('Version 2')
    await expect(page.locator('.doc-content')).toContainText('Read chapter 4 before the lecture.')
    await expect(page.locator('.doc-file')).toContainText('application/pdf')

    // A file dropped anywhere on the page opens a new version with it.
    await dropFiles(page.locator('.doc-content'), [txt('recursion-notes.txt', 'Base case first.\n')])
    const again = page.getByRole('dialog', { name: `New version of “${LECTURE}”` })
    await expect(again.locator('.file-drop__item')).toContainText('recursion-notes.txt')
    await expect(again.locator('.file-drop__item')).toContainText('Uploaded')
    // The latest version's text comes with it unless it is left out.
    await expect(again).toContainText('Text: version 2’s, as it is')
    await again.getByRole('button', { name: 'Leave the text out' }).click()
    await expect(again).toContainText('Text: none.')
    await again.getByRole('button', { name: 'Save version' }).click()
    await expect(again).toBeHidden()
    await expect(page.locator('.doc-content__meta')).toContainText('Version 3')
    await expect(page.locator('.doc-file')).toContainText('text/plain')
    await expect(page.getByText('This version has no text; its content is the file.')).toBeVisible()
  })

  test('a file larger than Core takes is refused before it is sent', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    // Core as one that takes files of 64 bytes at most.
    await page.route(/\/v1\/courses\/[^/]+\/upload-url\?/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.result.max_bytes = 64
      await route.fulfill({ response: res, json: body })
    })
    const puts = blobPuts(page)
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    await expect(dialog.locator('.file-drop__zone')).toContainText('Up to 64 B each')
    await dropFiles(dialog.locator('.file-drop__zone'), [txt('huge.txt', 'x'.repeat(200))])
    const row = dialog.locator('.file-drop__item')
    await expect(row).toContainText('Too large to upload: it is 200 B, and a file can be at most 64 B.')
    await expect(row.getByRole('button', { name: 'Upload “huge.txt” again' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    expect(puts).toEqual([])
  })

  test('an upload that breaks off on the way is tried again by itself, and one on its way can be cancelled', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    let broken = 0
    let hold: (() => void) | null = null
    await page.route('**/v1/blobs/**', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      const name = route.request().headers()['content-type']
      // The first PUT of flaky.txt breaks off; slow.txt is held until cancelled.
      if (name === 'text/csv') {
        await new Promise<void>((r) => (hold = r))
        return route.abort('aborted').catch(() => {})
      }
      if (broken++ === 0) return route.abort('connectionreset')
      return route.continue()
    })
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    await dropFiles(dialog.locator('.file-drop__zone'), [txt('flaky.txt', 'try, try again\n')])
    const flaky = dialog.locator('.file-drop__item').filter({ hasText: 'flaky.txt' })
    await expect(flaky).toContainText('Uploaded')
    expect(broken).toBe(2)

    await dropFiles(dialog.locator('.file-drop__zone'), [
      { name: 'slow.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') },
    ])
    const slow = dialog.locator('.file-drop__item').filter({ hasText: 'slow.csv' })
    await expect(slow.getByRole('button', { name: 'Cancel uploading “slow.csv”' })).toBeVisible()
    await slow.getByRole('button', { name: 'Cancel uploading “slow.csv”' }).click()
    await expect(slow).toContainText('Cancelled')
    ;(hold as (() => void) | null)?.()
    await expect(slow.getByRole('button', { name: 'Upload “slow.csv” again' })).toBeVisible()
    // What did upload is still there to create.
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
    await expect(dialog).toContainText('One file was not uploaded')
  })

  test('a student drops files on her draft, anywhere on the page, and hands them in', async ({ page }) => {
    const d = demo()
    // An assignment of this run's own, published, that Mei has not started.
    const made = await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/assignments`, {
      title: `HW3 — Hand in by drop (e2e ${tag})`,
      points_possible: 5,
    })
    expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
    const hw3 = made.body.result.id as string
    const pub = await call(
      d.actors.instructor.token,
      'POST',
      `/v1/courses/${d.course.id}/assignments/${hw3}/publish`,
      {},
    )
    expect(pub.body.status, JSON.stringify(pub.body)).toBe('executed')

    await signIn(page, d.actors.mei)
    await page.goto(coursePath(`assignments/${hw3}`))
    const work = page.locator('.my-work')
    await work.getByRole('button', { name: 'Start a draft' }).click()
    await expect(toast(page, 'Draft started.')).toBeVisible()
    const zone = work.getByRole('button', { name: /^Files for your work/ })
    await expect(zone).toBeVisible()

    // One on the zone, and one anywhere on the page.
    await dropFiles(zone, [
      txt(`mei-recursion-${tag}.py`, 'def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\n'),
    ])
    await expect(toast(page, `“mei-recursion-${tag}.py” attached.`)).toBeVisible()
    await dropFiles(page.locator('.page-header'), [txt(`mei-tests-${tag}.txt`, 'fact(0) = 1\nfact(5) = 120\n')])
    await expect(toast(page, `“mei-tests-${tag}.txt” attached.`)).toBeVisible()
    await expect(work.locator('.my-work__files')).toContainText(`mei-recursion-${tag}.py`)
    await expect(work.locator('.my-work__files')).toContainText(`mei-tests-${tag}.txt`)
    await expect(work.locator('.file-drop__list')).toHaveCount(0)
    await photograph(page, 'upload-student-draft')

    await work.getByRole('button', { name: 'Hand in' }).click()
    await page.getByRole('dialog', { name: 'Hand in attempt 1?' }).getByRole('button', { name: 'Hand in' }).click()
    await expect(toast(page, 'Handed in.')).toBeVisible()
    const attempt = work.locator('.my-work__attempt').filter({ hasText: 'Attempt 1' })
    await expect(attempt).toContainText('Submitted')
    await attempt.getByRole('link', { name: 'View' }).click()
    await expect(page.locator('.submission-view__files')).toContainText(`mei-recursion-${tag}.py`)
    await expect(page.locator('.submission-view__files')).toContainText(`mei-tests-${tag}.txt`)
  })

  test('on a phone the drop zone is a big button to choose files', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    const choose = dialog.getByRole('button', { name: 'Choose files' })
    await expect(choose).toBeVisible()
    await expect(dialog.locator('.file-drop__zone')).toHaveCount(0)
    const box = await choose.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(40)
    // It fills the dialog's width, and nothing runs off the screen.
    expect(box!.width).toBeGreaterThan(250)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'upload-phone')
  })
})
