import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  dropFiles,
  expectToasted,
  keepToasts,
  photograph,
  root,
  signIn,
  type FileSpec,
} from './support'

// Several files to one document's version (一份文件含多個檔案), with the real
// Core: an instructor drops three files and a note on the materials page,
// which make one material whose version lists the three, each downloaded
// under its name; a new version takes two files, put in another order; a
// student reads the published version's files; the text version of the
// version's second file is read and corrected on its own (the test, as the
// transcription service, claims that file from Core's queue and writes its
// text back); what a version holds is said before anything is sent, and
// Core's own refusal of too many files is said in words; and on a phone.
//
// The service's token is kept in this file's memory alone: never printed,
// logged or put in a message.
const tag = Date.now().toString(36)
const TITLE = `Week 5 — Recursion (e2e ${tag})`

const pdf = (name: string, text: string): FileSpec => ({
  name,
  mimeType: 'application/pdf',
  // Not a real PDF: Core keeps what it is given, as it is.
  buffer: Buffer.from(`%PDF-1.4\n% ${text}\n`),
})
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SLIDES = pdf(`week5-slides-${tag}.pdf`, 'recursion slides')
const HANDOUT: FileSpec = { name: `week5-handout-${tag}.docx`, mimeType: DOCX_TYPE, buffer: Buffer.from('PK\u0003\u0004 handout') }
const EXERCISES: FileSpec = {
  name: `week5-exercises-${tag}.txt`,
  mimeType: 'text/plain',
  buffer: Buffer.from('1. Write factorial(n) recursively.\n'),
}
const SLIDES_V2 = pdf(`week5-slides-v2-${tag}.pdf`, 'recursion slides, second edition')
const PROGRAM: FileSpec = {
  name: `fact-${tag}.py`,
  mimeType: 'text/x-python',
  buffer: Buffer.from('def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\n'),
}

/** The document made here, once made. */
let documentId = ''
/** The service's credential in Core, to revoke at the end; its token is in serviceToken alone. */
let credentialId = ''
let serviceToken = ''

/** A call as the transcription service: its token as the bearer; a write under an idempotency key. */
async function asService(path: string, body: unknown, key?: string) {
  const res = await fetch(demo().core + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/** The document's version as the instructor reads it through Core. */
async function versionOf(versionId?: string) {
  const d = demo()
  const q = versionId ? `?version_id=${versionId}` : ''
  const got = await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}/documents/${documentId}${q}`)
  expect(got.body.status, JSON.stringify(got.body.error)).toBe('executed')
  return got.body.result.version as { id: string; seq: number; files: { id: string; position: number; filename: string }[] }
}

/** Downloads a file listed on the page, and checks it is saved under its name with its bytes. */
async function downloads(page: Page, file: FileSpec) {
  const row = page.locator(`.version-file[data-file="${file.name}"]`)
  const download = page.waitForEvent('download')
  await row.getByRole('button', { name: `Download “${file.name}”` }).click()
  const saved = await download
  expect(saved.suggestedFilename()).toBe(file.name)
  expect((await readFile((await saved.path())!)).equals(file.buffer)).toBe(true)
}

/** Uploads a file as `token` for a document of `kind`, named at its upload URL; its upload token. */
async function uploadAs(token: string, kind: string, file: FileSpec): Promise<string> {
  const d = demo()
  const q = `kind=${kind}&content_type=${encodeURIComponent(file.mimeType)}&filename=${encodeURIComponent(file.name)}`
  const u = await call(token, 'GET', `/v1/courses/${d.course.id}/upload-url?${q}`)
  expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
  const url = new URL(u.body.result.upload_url)
  const put = await fetch(`${d.core}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.mimeType, ...u.body.result.headers },
    body: new Uint8Array(file.buffer),
  })
  expect(put.ok).toBe(true)
  return u.body.result.upload_token as string
}

/** A write through Core that must be carried out; its result. */
async function done(token: string, path: string, body: unknown) {
  const out = await call(token, 'POST', path, body)
  expect(out.body.status, JSON.stringify(out.body.error)).toBe('executed')
  return out.body.result
}

/** What the page said of a write: a message, or, for one Core recorded as failed, a notification. */
function said(page: Page, text: string) {
  return page.locator('.el-message, .el-notification').filter({ hasText: text })
}

test.describe.serial('several files to a version', () => {
  test.afterAll(async () => {
    serviceToken = ''
    if (credentialId)
      await call(root().token, 'POST', `/v1/services/document_text/credentials/${credentialId}/revoke`, {})
  })

  test('three files and a note dropped on the materials page make one material, whose version lists them to download', async ({
    page,
  }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('materials'))
    await expect(page.getByText('Drop files anywhere on this page to make new material of them.')).toBeVisible()
    await dropFiles(page.locator('.material-list'), [SLIDES, HANDOUT, EXERCISES])

    const dialog = page.getByRole('dialog', { name: 'New material' })
    await expect(dialog).toBeVisible()
    const rows = dialog.locator('.file-drop__item')
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: 'Uploaded' })).toHaveCount(3)
    await expect(dialog.locator('.file-drop__n')).toHaveText(['1', '2', '3'])
    await expect(dialog).toContainText('The files all go into this one material, in the order listed')
    // Titled after the first file until it is written.
    const title = dialog.getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue(`week5-slides-${tag}`)
    await title.fill(TITLE)
    await dialog.getByRole('button', { name: 'Add a text note (optional)' }).click()
    await dialog.getByPlaceholder('Markdown').fill('## Before the lecture\n\nRead the **slides** first.')
    await photograph(page, 'multifile-create-dialog')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expectToasted(page, 'Material created')
    await expect(dialog).toBeHidden()

    // One material, not three.
    await expect(page.locator('.material-row').filter({ hasText: tag })).toHaveCount(1)
    await page.locator('.material-row').filter({ hasText: TITLE }).click()
    await expect(page.locator('.page-header')).toContainText(TITLE)
    documentId = new URL(page.url()).pathname.split('/').at(-1)!
    await expect(page.locator('.doc-content__meta')).toContainText('Version 1')
    const files = page.locator('.version-file')
    await expect(files).toHaveCount(3)
    await expect(files.nth(0)).toHaveAttribute('data-file', SLIDES.name)
    await expect(files.nth(1)).toHaveAttribute('data-file', HANDOUT.name)
    await expect(files.nth(2)).toHaveAttribute('data-file', EXERCISES.name)
    await expect(files.nth(0).locator('.version-file__meta')).toHaveText(`PDF · ${SLIDES.buffer.length} B`)
    await expect(files.nth(1).locator('.version-file__icon')).toHaveClass(/is-word/)
    await expect(files.nth(2).locator('.version-file__icon')).toHaveClass(/is-text/)
    await expect(page.locator('.doc-content').getByRole('heading', { name: 'Before the lecture' })).toBeVisible()
    await photograph(page, 'multifile-document')

    // Each downloads under its name, as it was uploaded.
    for (const f of [SLIDES, HANDOUT, EXERCISES]) await downloads(page, f)

    // Core holds them as one version of three files, named, in order.
    const v = await versionOf()
    expect(v.files.map((f) => [f.position, f.filename])).toEqual([
      [1, SLIDES.name],
      [2, HANDOUT.name],
      [3, EXERCISES.name],
    ])
  })

  test('a new version takes two files, put in another order, and the history counts and names each version’s', async ({
    page,
  }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    await page.getByRole('button', { name: 'New version' }).click()
    const dialog = page.getByRole('dialog', { name: `New version of “${TITLE}”` })
    await expect(dialog).toContainText(`Version 1 has 3 files: ${SLIDES.name}`)
    await dropFiles(dialog.getByRole('button', { name: /^The new version’s files/ }), [SLIDES_V2, PROGRAM])
    await expect(dialog.locator('.file-drop__item').filter({ hasText: 'Uploaded' })).toHaveCount(2)
    // The program first.
    await dialog.getByRole('button', { name: `Move “${PROGRAM.name}” up` }).click()
    await expect(dialog.locator('.file-drop__item').first()).toHaveAttribute('data-file', PROGRAM.name)
    await expect(dialog).toContainText('Text: version 1’s, as it is')
    await photograph(page, 'multifile-new-version')
    await dialog.getByRole('button', { name: 'Save version' }).click()
    await expectToasted(page, 'New version saved')
    await expect(dialog).toBeHidden()

    await expect(page.locator('.doc-content__meta')).toContainText('Version 2')
    const files = page.locator('.version-file')
    await expect(files).toHaveCount(2)
    await expect(files.nth(0)).toHaveAttribute('data-file', PROGRAM.name)
    await expect(files.nth(1)).toHaveAttribute('data-file', SLIDES_V2.name)
    const history = page.locator('.version-list')
    const v2 = history.locator('.version-item').filter({ hasText: 'v2' })
    const v1 = history.locator('.version-item').filter({ hasText: 'v1' })
    await expect(v2).toContainText('2 files')
    await expect(v2.locator('.version-item__file')).toHaveText([PROGRAM.name, SLIDES_V2.name])
    await expect(v1).toContainText('3 files')
    await expect(v1.locator('.version-item__file')).toHaveText([SLIDES.name, HANDOUT.name, EXERCISES.name])
    await downloads(page, PROGRAM)
  })

  test('a student reads the published version’s files, and downloads one under its name', async ({ page }) => {
    const d = demo()
    const v2 = await versionOf()
    const published = await call(
      d.actors.instructor.token,
      'POST',
      `/v1/courses/${d.course.id}/documents/${documentId}/publish`,
      { version_id: v2.id },
    )
    expect(published.body.status, JSON.stringify(published.body.error)).toBe('executed')

    await signIn(page, d.actors.yuki)
    await page.goto(coursePath('materials'))
    await page.locator('.material-row').filter({ hasText: TITLE }).click()
    await expect(page.locator('.page-header')).toContainText(TITLE)
    const files = page.locator('.version-file')
    await expect(files).toHaveCount(2)
    await expect(files.nth(0)).toHaveAttribute('data-file', PROGRAM.name)
    await expect(files.nth(1)).toHaveAttribute('data-file', SLIDES_V2.name)
    await expect(page.getByRole('button', { name: 'New version' })).toHaveCount(0)
    await photograph(page, 'multifile-student')
    await downloads(page, SLIDES_V2)
  })

  test('the text version of the second file is read, and corrected, on its own', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    const issued = await call(root().token, 'POST', '/v1/services/document_text/credentials', {
      label: `e2e multifile ${tag}`,
      expires_in_days: 1,
    })
    expect(issued.body.status, JSON.stringify(issued.body.error)).toBe('executed')
    credentialId = issued.body.result.credential_id
    serviceToken = issued.body.result.token

    // The service claims the second file of version 2, and writes its text back.
    const v2 = await versionOf()
    const second = v2.files.find((f) => f.position === 2)!
    let claim: { lease_id: string; file_id: string } | undefined
    for (let i = 0; i < 30 && !claim; i++) {
      const out = await asService('/v1/services/document_text/queue', { max: 10, lease_s: 60 })
      expect(out.status, JSON.stringify(out.body.error)).toBe(200)
      const claimed = (out.body.result.claimed ?? []) as { version_id: string; file_id: string; lease_id: string }[]
      claim = claimed.find((c) => c.version_id === v2.id && c.file_id === second.id)
      if (!claimed.length) break
    }
    expect(claim, 'the second file was not in the queue').toBeTruthy()
    const text = '## 第 1 頁\n\n# Recursion, the slides\n\nA function that calls itself.\n'
    const done = await asService(
      `/v1/services/document_text/versions/${v2.id}/complete`,
      { lease_id: claim!.lease_id, file_id: second.id, status: 'done', body: text, pages: 1, model: 'E2E Flash-Lite' },
      `complete:${second.id}:${claim!.lease_id}`,
    )
    expect(done.status, JSON.stringify(done.body.error)).toBe(200)

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    // Each file says where its text version stands, and opens it.
    await expect(page.locator(`.version-file[data-file="${SLIDES_V2.name}"] .version-file__status`)).toHaveText('Done')
    await page.getByRole('tab', { name: 'Text version' }).click()
    const picker = page.getByRole('group', { name: 'Whose text version to show' })
    await expect(picker.getByRole('button')).toHaveCount(2)
    await expect(picker.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    await picker.getByRole('button', { name: SLIDES_V2.name }).click()
    await expect(page).toHaveURL(new RegExp(`file=${second.id}`))
    await expect(picker.getByRole('button', { name: SLIDES_V2.name })).toHaveAttribute('aria-pressed', 'true')
    const pane = page.locator(`.text-pane[data-file="${SLIDES_V2.name}"]`)
    await expect(pane.locator('.text-pane__status')).toHaveText('Done')
    await expect(pane.getByRole('heading', { name: 'Recursion, the slides' })).toBeVisible()
    await expect(pane.locator('h2#text-f2-page-1')).toHaveText('第 1 頁')
    await photograph(page, 'multifile-text-version')

    await pane.getByRole('button', { name: 'Edit' }).click()
    const editor = pane.locator('.text-pane__editor textarea')
    await expect(editor).toHaveValue(text)
    await editor.fill(text.replace('Recursion, the slides', 'Recursion, the slides (corrected)'))
    await pane.getByRole('button', { name: 'Save the text version' }).click()
    await expectToasted(page, 'Text version saved')
    await expect(pane.getByRole('heading', { name: 'Recursion, the slides (corrected)' })).toBeVisible()
    await expect(pane.locator('.text-pane__source')).toContainText(`Edited by ${d.actors.instructor.display_name}`)

    // Staff's now, that file's alone: the first file's text version is untouched.
    const base = `/v1/courses/${d.course.id}/documents/${documentId}/text?version_id=${v2.id}`
    const mine = await call(d.actors.instructor.token, 'GET', `${base}&file_id=${second.id}`)
    expect(mine.body.result).toMatchObject({ file_id: second.id, position: 2, text: { status: 'done', source: 'staff' } })
    const first = await call(d.actors.instructor.token, 'GET', `${base}&file_id=${v2.files[0]!.id}`)
    expect(first.body.result.text.source ?? null).not.toBe('staff')
    // Read afresh from the address alone.
    await page.reload()
    await expect(
      page.locator(`.text-pane[data-file="${SLIDES_V2.name}"]`).getByRole('heading', {
        name: 'Recursion, the slides (corrected)',
      }),
    ).toBeVisible()
  })

  test('a submitted document and a feedback document of several files are shown whole', async ({ page }) => {
    const d = demo()
    const C = `/v1/courses/${d.course.id}`
    const I = d.actors.instructor.token
    const M = d.actors.mei.token
    // An assignment of this run's own, published; Mei hands in one document of two files.
    const hw = await done(I, `${C}/assignments`, { title: `Lab 5 (e2e ${tag})`, points_possible: 5 })
    await done(I, `${C}/assignments/${hw.id}/publish`, {})
    const sub = await done(M, `${C}/submissions`, { assignment_id: hw.id })
    const report = pdf(`lab5-report-${tag}.pdf`, 'lab report')
    const data: FileSpec = { name: `lab5-data-${tag}.csv`, mimeType: 'text/csv', buffer: Buffer.from('n,t\n1,0.5\n') }
    await done(M, `${C}/documents`, {
      kind: 'submission',
      submission_id: sub.submission_id,
      title: 'Lab report',
      files: [{ upload_token: await uploadAs(M, 'submission', report) }, { upload_token: await uploadAs(M, 'submission', data) }],
    })
    await done(M, `${C}/submissions/${sub.submission_id}/submit`, {})
    // The instructor grades it, with one feedback document of two files.
    const grade = await done(I, `${C}/grades`, { submission_id: sub.submission_id, score: 4 })
    const marked = pdf(`lab5-marked-${tag}.pdf`, 'marked')
    const notes: FileSpec = { name: `lab5-notes-${tag}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Good.\n') }
    await done(I, `${C}/documents`, {
      kind: 'feedback',
      grade_id: grade.grade_id,
      title: 'Marked report',
      files: [{ upload_token: await uploadAs(I, 'feedback', marked) }, { upload_token: await uploadAs(I, 'feedback', notes) }],
    })

    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`submissions/${sub.submission_id}`))
    const handedIn = page.locator('.submission-view__files .doc-files')
    await expect(handedIn.locator('.doc-files__title')).toContainText('Lab report')
    await expect(handedIn.locator('.doc-files__count')).toHaveText('2 files')
    await expect(handedIn.locator('.version-file')).toHaveCount(2)
    await expect(handedIn.locator('.version-file').nth(0)).toHaveAttribute('data-file', report.name)
    await expect(handedIn.locator('.version-file').nth(1)).toHaveAttribute('data-file', data.name)
    await handedIn.scrollIntoViewIfNeeded()
    await photograph(page, 'multifile-submission')
    await downloads(page, data)

    await page.goto(coursePath(`grades/${grade.grade_id}`))
    const feedback = page.locator('.grade-view__files .doc-files')
    await expect(feedback.locator('.doc-files__title')).toContainText('Marked report')
    await expect(feedback.locator('.version-file')).toHaveCount(2)
    await expect(feedback.locator('.version-file').nth(1)).toHaveAttribute('data-file', notes.name)
    await downloads(page, marked)
  })

  test('what a version holds is said before anything is sent, and Core’s refusal of too many files in words', async ({
    page,
  }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    // Core as one whose versions hold two files, 60 B in all.
    let says = { max_files: 2, max_version_bytes: 60 }
    await page.route(/\/v1\/courses\/[^/]+\/upload-url\?/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      Object.assign(body.result, says)
      await route.fulfill({ response: res, json: body })
    })
    const puts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'PUT' && new URL(r.url()).pathname.startsWith('/v1/blobs/')) puts.push(r.url())
    })
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    await expect(dialog.locator('.file-drop__zone')).toContainText('Up to 2 files')
    await expect(dialog.locator('.file-drop__zone')).toContainText('60 B in all')
    const small = (name: string, size: number): FileSpec => ({ name, mimeType: 'text/plain', buffer: Buffer.alloc(size, 97) })
    await dropFiles(dialog.locator('.file-drop__zone'), [small('a.txt', 30), small('b.txt', 40), small('c.txt', 10), small('d.txt', 5)])
    const row = (name: string) => dialog.locator(`.file-drop__item[data-file="${name}"]`)
    await expect(row('a.txt')).toContainText('Uploaded')
    await expect(row('c.txt')).toContainText('Uploaded')
    await expect(row('b.txt')).toContainText(
      'Not uploaded: with it, the files would come to more than a version holds in all (60 B).',
    )
    await expect(row('d.txt')).toContainText('Not uploaded: a version holds at most 2 files.')
    expect(puts).toHaveLength(2)
    await photograph(page, 'multifile-limits')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Core's own limit: the page is told a version holds more than Core's 20
    // (read afresh: what an upload URL said is kept for the page's life).
    says = { max_files: 30, max_version_bytes: 200 << 20 }
    await page.reload()
    await page.getByRole('button', { name: 'New material' }).click()
    const many = Array.from({ length: 21 }, (_, i) => small(`part-${String(i + 1).padStart(2, '0')}-${tag}.txt`, 4))
    await dropFiles(dialog.locator('.file-drop__zone'), many)
    await expect(dialog.locator('.file-drop__item').filter({ hasText: 'Uploaded' })).toHaveCount(21, { timeout: 30_000 })
    await dialog.getByRole('textbox', { name: 'Title' }).fill(`Too many parts (e2e ${tag})`)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(said(page, 'A version holds at most 20 files: take some off the list, and save again.')).toBeVisible()
    await expect(dialog.locator('.create-dialog__why')).toHaveText('A version holds at most 20 files: take 1 off the list.')
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: `Remove “${many[20]!.name}”` }).click()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expectToasted(page, 'Material created')
    await expect(dialog).toBeHidden()
  })

  test('on a phone, files are chosen with the big button, moved, and read as a list', async ({ page }) => {
    await keepToasts(page)
    await page.setViewportSize({ width: 390, height: 844 })
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    const dialog = page.getByRole('dialog', { name: 'New material' })
    await expect(dialog.getByRole('button', { name: 'Choose files' })).toBeVisible()
    const phoneTitle = `On the phone (e2e ${tag})`
    await dialog.locator('input[type=file]').setInputFiles([
      { name: `phone-a-${tag}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 a') },
      { name: `phone-b-${tag}.txt`, mimeType: 'text/plain', buffer: Buffer.from('b') },
    ])
    await expect(dialog.locator('.file-drop__item').filter({ hasText: 'Uploaded' })).toHaveCount(2)
    await dialog.getByRole('button', { name: `Move “phone-b-${tag}.txt” up` }).click()
    await dialog.getByRole('textbox', { name: 'Title' }).fill(phoneTitle)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'multifile-phone-dialog')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expectToasted(page, 'Material created')

    await page.locator('.material-row').filter({ hasText: phoneTitle }).click()
    const files = page.locator('.version-file')
    await expect(files).toHaveCount(2)
    await expect(files.nth(0)).toHaveAttribute('data-file', `phone-b-${tag}.txt`)
    const box = await files.nth(0).boundingBox()
    expect(box!.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'multifile-phone-document')
  })
})
