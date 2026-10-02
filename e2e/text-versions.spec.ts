import { expect, test, type Page } from '@playwright/test'
import { call, coursePath, demo, photograph, root, signIn, toast } from './support'

// A document version's text version (文字版), with the real Core: root issues
// the transcription service a credential through Core's REST, and the test,
// as the service, claims the version from Core's queue and writes its text
// back, as the runtime's transcriber would. The instructor reads it rendered,
// corrects it (staff's from then on), a student reads the published version's
// text, and the instructor sends it to be transcribed again, discarding the
// correction. The runtime's info is answered in the browser, saying its
// transcriber is on, so that the queue's states and "Transcribe again" show.
//
// The service's token is kept in this file's memory alone: never printed,
// logged or put in a message.

const STAMP = Date.now().toString(36)
const TITLE = `Circuits slides (e2e ${STAMP})`
/** The version's one file, as it is named. */
const FILE = `circuits-${STAMP}.pdf`
const TRANSCRIBED = [
  '## 第 1 頁',
  '',
  '# Ohm’s law',
  '',
  'The current through a conductor: $I = \\frac{V}{R}$',
  '',
  '| Quantity | Unit |',
  '| --- | --- |',
  '| Voltage | volt |',
  '',
  '## 第 2 頁',
  '',
  '```python',
  'def current(v, r):',
  '    return v / r',
  '```',
  '',
  '[圖：一個電阻接在電池兩端的電路圖]',
  '',
].join('\n')

let version = { documentId: '', versionId: '', fileId: '' }
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

/** Uploads a file as the instructor and makes it published material; its document, version and file. */
async function publishedMaterialWithFile() {
  const d = demo()
  const I = d.actors.instructor.token
  const C = d.course.id
  const type = 'application/pdf'
  const u = await call(
    I,
    'GET',
    `/v1/courses/${C}/upload-url?kind=material&content_type=${encodeURIComponent(type)}&filename=${encodeURIComponent(FILE)}`,
  )
  expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
  const url = new URL(u.body.result.upload_url)
  const put = await fetch(`${d.core}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': type, ...u.body.result.headers },
    body: `%PDF-1.4\n% e2e ${STAMP}\n`,
  })
  expect(put.ok).toBe(true)
  const made = await call(I, 'POST', `/v1/courses/${C}/documents`, {
    kind: 'material',
    title: TITLE,
    files: [{ upload_token: u.body.result.upload_token, filename: FILE }],
  })
  expect(made.body.status, JSON.stringify(made.body.error)).toBe('executed')
  const published = await call(I, 'POST', `/v1/courses/${C}/documents/${made.body.result.document_id}/publish`, {})
  expect(published.body.status, JSON.stringify(published.body.error)).toBe('executed')
  return {
    documentId: made.body.result.document_id as string,
    versionId: made.body.result.version_id as string,
    fileId: made.body.result.file_ids[0] as string,
  }
}

/**
 * Claims the version from Core's queue as the service: other versions the
 * run has queued may come first, and are left to lapse (a minute's lease).
 */
async function claim(versionId: string): Promise<{ lease: string; fileId: string }> {
  for (let i = 0; i < 30; i++) {
    const out = await asService('/v1/services/document_text/queue', { max: 10, lease_s: 60 })
    expect(out.status, JSON.stringify(out.body.error)).toBe(200)
    const mine = (out.body.result.claimed ?? []).find((c: { version_id: string }) => c.version_id === versionId)
    if (mine) return { lease: mine.lease_id as string, fileId: mine.file_id as string }
    if (!(out.body.result.claimed ?? []).length) break
  }
  throw new Error(`the version ${versionId} was not in the queue`)
}

/** The runtime's public info, answered in the browser: its transcriber is on. */
async function transcriberOn(page: Page) {
  await page.route('**/runtime/api/v1/info', (route) =>
    route.fulfill({
      status: 200,
      json: {
        api: 'aishie-runtime',
        api_version: 1,
        version: 'e2e',
        commit: STAMP,
        audience: 'https://e2e.test/runtime',
        issuer: 'https://e2e.test',
        features: { host_by_id: true, own_key: true, school_key: true, transcription: true },
      },
    }),
  )
}

async function openText(page: Page) {
  await page.goto(coursePath(`documents/${version.documentId}`))
  await expect(page.locator('.page-header')).toContainText(TITLE)
  await page.getByRole('tab', { name: 'Text version' }).click()
  await expect(page).toHaveURL(/tab=text/)
  return page.locator('.text-pane')
}

test.describe.serial('text versions', () => {
  test.beforeAll(async () => {
    version = await publishedMaterialWithFile()
    const issued = await call(root().token, 'POST', '/v1/services/document_text/credentials', {
      label: `e2e ${STAMP}`,
      expires_in_days: 1,
    })
    expect(issued.body.status, JSON.stringify(issued.body.error)).toBe('executed')
    credentialId = issued.body.result.credential_id
    serviceToken = issued.body.result.token
  })

  test.afterAll(async () => {
    serviceToken = ''
    if (credentialId)
      await call(root().token, 'POST', `/v1/services/document_text/credentials/${credentialId}/revoke`, {})
  })

  test('a version with a file waits in the queue, and the transcription written back is shown rendered', async ({
    page,
  }) => {
    const d = demo()
    await transcriberOn(page)
    await signIn(page, d.actors.instructor)
    let pane = await openText(page)
    await expect(pane.locator('.text-pane__status')).toHaveText('Queued')
    await expect(pane).toContainText('this file is waiting to be transcribed into text by AI')

    // The service claims it and writes the text back.
    const { lease, fileId } = await claim(version.versionId)
    const done = await asService(
      `/v1/services/document_text/versions/${version.versionId}/complete`,
      { lease_id: lease, file_id: fileId, status: 'done', body: TRANSCRIBED, pages: 2, model: 'E2E Flash-Lite' },
      `complete:${fileId}:${lease}`,
    )
    expect(done.status, JSON.stringify(done.body.error)).toBe(200)

    await pane.getByRole('button', { name: 'Read it again' }).click()
    await expect(pane.locator('.text-pane__status')).toHaveText('Done')
    await expect(pane.locator('.text-pane__source')).toContainText('AI transcription (E2E Flash-Lite)')
    await expect(pane.locator('.text-pane__pages')).toHaveText('2 pages')
    const body = pane.locator('.text-pane__body')
    await expect(body.locator('h2#text-page-1')).toHaveText('第 1 頁')
    await expect(body.locator('h2#text-page-2')).toBeVisible()
    await expect(body.getByRole('heading', { name: 'Ohm’s law' })).toBeVisible()
    await expect(body.locator('.katex').first()).toBeVisible()
    await expect(body.locator('table')).toContainText('Voltage')
    await expect(body.locator('.md-code__lang')).toHaveText('python')
    await expect(body).toContainText('[圖：一個電阻接在電池兩端的電路圖]')
    await photograph(page, 'text-version')
    await page.setViewportSize({ width: 390, height: 844 })
    await photograph(page, 'text-version-phone')
    await page.setViewportSize({ width: 1280, height: 720 })

    // Read afresh from the address alone.
    await page.reload()
    pane = page.locator('.text-pane')
    await expect(pane.locator('h2#text-page-2')).toBeVisible()
  })

  test('the instructor corrects it, and it is theirs from then on', async ({ page }) => {
    const d = demo()
    await transcriberOn(page)
    await signIn(page, d.actors.instructor)
    const pane = await openText(page)
    await pane.getByRole('button', { name: 'Edit' }).click()
    const editor = pane.locator('.text-pane__editor textarea')
    await expect(editor).toHaveValue(TRANSCRIBED)
    await photograph(page, 'text-version-editor')
    await editor.fill(TRANSCRIBED.replace('# Ohm’s law', '# Ohm’s law (corrected)'))
    await pane.getByRole('button', { name: 'Save the text version' }).click()
    await expect(toast(page, 'Text version saved')).toBeVisible()
    await expect(pane.locator('.text-pane__editor')).toHaveCount(0)
    await expect(pane.getByRole('heading', { name: 'Ohm’s law (corrected)' })).toBeVisible()
    await expect(pane.locator('.text-pane__source')).toContainText(`Edited by ${d.actors.instructor.display_name}`)

    // A transcription finishing now is refused: staff wrote it.
    const text = await call(
      d.actors.instructor.token,
      'GET',
      `/v1/courses/${d.course.id}/documents/${version.documentId}/text?version_id=${version.versionId}&file_id=${version.fileId}`,
    )
    expect(text.body.result.text).toMatchObject({ status: 'done', source: 'staff' })
  })

  test('a student reads the published version’s text, and is offered nothing to write', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    const pane = await openText(page)
    await expect(pane.getByRole('heading', { name: 'Ohm’s law (corrected)' })).toBeVisible()
    await expect(pane.locator('.katex').first()).toBeVisible()
    await expect(pane.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(pane.getByRole('button', { name: 'Transcribe again' })).toHaveCount(0)
  })

  test('transcribing it again discards the correction only once the instructor says so twice', async ({ page }) => {
    const d = demo()
    await transcriberOn(page)
    await signIn(page, d.actors.instructor)
    const pane = await openText(page)
    await pane.getByRole('button', { name: 'Transcribe again' }).click()
    const first = page.getByRole('dialog', { name: `Transcribe “${FILE}” again?` })
    await first.getByRole('button', { name: 'Transcribe again' }).click()
    const second = page.getByRole('dialog', { name: 'Discard the changes?' })
    await expect(second).toContainText(`written or corrected by ${d.actors.instructor.display_name}`)
    await second.getByRole('button', { name: 'Discard the changes' }).click()
    await expect(toast(page, 'Queued to be transcribed')).toBeVisible()
    await expect(pane.locator('.text-pane__status')).toHaveText('Queued')
    await expect(pane.locator('.text-pane__body')).toHaveCount(0)

    const text = await call(
      d.actors.instructor.token,
      'GET',
      `/v1/courses/${d.course.id}/documents/${version.documentId}/text?version_id=${version.versionId}&file_id=${version.fileId}`,
    )
    expect(text.body.result).toMatchObject({ parts: 0, text: { status: 'pending' } })
  })

  test('without a transcriber on, a text waiting for one is none, and staff may write one by hand', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    const pane = await openText(page)
    await expect(pane.locator('.text-pane__status')).toHaveCount(0)
    await expect(pane).toContainText('Transcription is not turned on for this site')
    await expect(pane.getByRole('button', { name: 'Transcribe again' })).toHaveCount(0)
    await expect(pane.getByRole('button', { name: 'Write the text version' })).toBeVisible()
  })
})
