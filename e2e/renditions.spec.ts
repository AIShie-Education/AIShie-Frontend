/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  expectToasted,
  hostOnRuntime,
  inTraditionalChinese,
  keepToasts,
  photograph,
  root,
  signIn,
  type CoreReply,
  type FileSpec,
} from './support'

// Office files previewed as PDF (統一轉 PDF), with the real Core: every
// Office or OpenDocument file is converted to PDF once, by the site's runtime,
// and the viewer shows that PDF. The runs have no runtime (no LibreOffice
// here), so the test plays its part through Core's REST API for it, with a
// credential of the agent_runtime service's that root issues for each part
// it plays (and revokes after, which gives back whatever else it claimed):
// it claims a file's rendition, PUTs a small PDF to the URL Core gives for
// it, and says it is done; or says it failed, or was skipped, and why.
//
// Material of three Office files: a handout, which the viewer says is being
// converted, then shows by itself once the runtime is done, drawn by pdf.js,
// with "Download PDF" beside the file's own download; a protected one, which
// the runtime skips, and which the viewer says why of, to a student with no
// way to send it back, and to the instructor with "Try again", which queues
// it again until the runtime converts it; and slides that wait throughout. A
// file a chat message carries is converted, and sent back by its author, the
// same way. On a phone, in Traditional Chinese, the PDF fits the screen.
// Nothing the viewer does is refused by the page's policy.

const tag = Date.now().toString(36)
const TITLE = `Week 7 — Graphs (e2e ${tag})`
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const HANDOUT: FileSpec = {
  name: `graphs-handout-${tag}.docx`,
  mimeType: DOCX,
  buffer: Buffer.from('PK\u0003\u0004 handout'),
}
const LOCKED: FileSpec = {
  name: `graphs-locked-${tag}.docx`,
  mimeType: DOCX,
  buffer: Buffer.from('PK\u0003\u0004 locked'),
}
const SLIDES: FileSpec = {
  name: `graphs-slides-${tag}.pptx`,
  mimeType: PPTX,
  buffer: Buffer.from('PK\u0003\u0004 slides'),
}
const pdfName = (f: FileSpec) => f.name.replace(/\.[a-z]+$/, '.pdf')

/** A PDF of `pages` pages, each a band of colour with its title in it, and a line of text under it. */
function pdfOf(pages: string[]): Buffer {
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  pages.forEach((title, i) => {
    const content = [
      '0.48 0.13 0.25 rg 72 640 468 72 re f',
      `BT /F1 30 Tf 1 1 1 rg 92 664 Td (${title}) Tj ET`,
      `BT /F1 16 Tf 0 0 0 rg 72 590 Td (Page ${i + 1}: a graph is vertices and edges.) Tj ET`,
    ].join('\n')
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    )
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const at: number[] = []
  objs.forEach((o, i) => {
    at.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const HANDOUT_PDF = pdfOf(['Graphs', 'Paths'])
const LOCKED_PDF = pdfOf(['Unlocked'])

let documentId = ''
const fileIds: Record<string, string> = {}

/** A write through Core that must be carried out; its result. */
async function done(token: string, path: string, body: unknown) {
  const out = await call(token, 'POST', path, body)
  expect(out.body.status, `${path}: ${JSON.stringify(out.body.error)}`).toBe('executed')
  return out.body.result
}

/** PUTs bytes to an upload URL Core gave, with the headers it gave; no Authorization (the URL is the credential). */
async function put(reply: CoreReply, type: string, bytes: Buffer): Promise<string> {
  const url = new URL(reply.result.upload_url)
  const res = await fetch(`${demo().core}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': type, ...reply.result.headers },
    body: new Uint8Array(bytes),
  })
  expect(res.status, `PUT ${url.pathname}`).toBe(200)
  return reply.result.upload_token as string
}

/** Uploads a file of material as the instructor, named at its upload URL; its upload token. */
async function uploadMaterial(file: FileSpec): Promise<string> {
  const d = demo()
  const q = `kind=material&content_type=${encodeURIComponent(file.mimeType)}&filename=${encodeURIComponent(file.name)}`
  const u = await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}/upload-url?${q}`)
  expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
  return put(u.body, file.mimeType, file.buffer)
}

// --- The runtime, played --------------------------------------------------------------------------

interface Claim {
  rendition_id: string
  lease_id: string
  attempt: number
  source: string
  file_id?: string | null
  attachment_id?: string | null
  filename: string
  content_type: string
  byte_size: number
  download_url: string
  max_bytes: number
}

/**
 * The site's runtime, as far as renditions go, played with a credential of
 * the agent_runtime service's of its own, issued by root. What it claims that
 * is not the file it is after it holds until it stops: its credential is
 * revoked then, which gives back to the queue whatever it still held,
 * uncounted, for whoever converts it later.
 */
async function playRuntime() {
  const issued = await done(root().token, '/v1/services/agent_runtime/credentials', {
    label: `e2e renditions ${tag}`,
  })
  const token = issued.token as string
  const credentialId = issued.credential_id as string
  const svc = (method: 'GET' | 'POST', path: string, body?: unknown) =>
    call(token, method, `/v1/services/agent_runtime${path}`, body)
  const held: Claim[] = []
  return {
    /** Claims renditions until it holds the one `which` picks, oldest first as Core hands them out. */
    async claim(which: (c: Claim) => boolean): Promise<Claim> {
      for (let round = 0; round < 20; round++) {
        const mine = held.find(which)
        if (mine) return mine
        const r = await svc('POST', '/renditions/claim', { max: 10, lease_s: 600, wait_s: 1 })
        expect(r.body.status, `agent_runtime.rendition_claim: ${JSON.stringify(r.body.error)}`).toBe('executed')
        held.push(...((r.body.result.claimed ?? []) as Claim[]))
      }
      throw new Error('the rendition was never handed out')
    },
    /** Reads the file to convert, as the runtime does, from the URL the claim came with. */
    async source(c: Claim): Promise<Buffer> {
      const url = new URL(c.download_url)
      const res = await fetch(`${demo().core}${url.pathname}${url.search}`)
      expect(res.status).toBe(200)
      return Buffer.from(await res.arrayBuffer())
    },
    /** Puts the PDF where Core says, and says it is done, with its page count. */
    async convert(c: Claim, pdf: Buffer, pageCount: number) {
      const u = await svc('GET', `/renditions/${c.rendition_id}/upload-url?lease_id=${c.lease_id}`)
      expect(u.body.status, `agent_runtime.rendition_upload_url: ${JSON.stringify(u.body.error)}`).toBe('executed')
      expect(u.body.result.headers['Content-Type']).toBe('application/pdf')
      const uploadToken = await put(u.body, 'application/pdf', pdf)
      const out = await svc('POST', `/renditions/${c.rendition_id}/complete`, {
        lease_id: c.lease_id,
        status: 'done',
        upload_token: uploadToken,
        page_count: pageCount,
      })
      expect(out.body.status, `agent_runtime.rendition_complete: ${JSON.stringify(out.body.error)}`).toBe('executed')
      expect(out.body.result.state).toBe('done')
      held.splice(held.indexOf(c), 1)
    },
    /** Says it could not convert it, and why. */
    async fail(c: Claim, status: 'failed' | 'skipped', reason: string) {
      const out = await svc('POST', `/renditions/${c.rendition_id}/complete`, { lease_id: c.lease_id, status, reason })
      expect(out.body.status, `agent_runtime.rendition_complete: ${JSON.stringify(out.body.error)}`).toBe('executed')
      held.splice(held.indexOf(c), 1)
    },
    /** Stops: its credential revoked, what it still held goes back to the queue. */
    async stop() {
      await call(root().token, 'POST', `/v1/services/agent_runtime/credentials/${credentialId}/revoke`, {})
    },
  }
}

/** Where a file's rendition stands, as the instructor reads it (document.file). */
async function renditionOf(fileId: string) {
  const d = demo()
  const r = await call(
    d.actors.instructor.token,
    'GET',
    `/v1/courses/${d.course.id}/documents/${documentId}/files/${fileId}`,
  )
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.result.rendition as { state: string; reason?: string; page_count?: number }
}

// --- The page -----------------------------------------------------------------------------------

/** Watches the page for what its policy refuses: a securitypolicyviolation event, in any frame, or Chrome's console line. */
async function watchPolicy(page: Page) {
  const refused: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|create|connect|frame)/i.test(m.text())) refused.push(m.text())
  })
  await page.addInitScript(() => {
    const top = window.top as unknown as { __refused?: string[] }
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(top.__refused ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  return async function expectNoneRefused() {
    const inPage = await page.evaluate(() => (window as unknown as { __refused?: string[] }).__refused ?? [])
    expect([...refused, ...inPage], 'what the page’s policy refused').toEqual([])
  }
}

/** The viewer, open on a file. */
function viewer(page: Page, name: string): Locator {
  return page.getByRole('dialog', { name })
}

/** Opens a file of the material in the viewer, from its row. */
async function openFile(page: Page, file: FileSpec) {
  await page.locator(`.version-file[data-file="${file.name}"] .version-file__open`).click()
  const dialog = viewer(page, file.name)
  await expect(dialog).toBeVisible()
  return dialog
}

/** How many of a canvas's pixels are drawn in something other than white. */
function inked(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext('2d')!
    const { data } = g.getImageData(0, 0, c.width, c.height)
    let n = 0
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 230 || data[i + 1]! < 230 || data[i + 2]! < 230) n++
    return n
  })
}

/** The PDF's first page, drawn by pdf.js, with its words over it. */
async function expectPdfDrawn(dialog: Locator, words: string) {
  const page1 = dialog.locator('.pdf-page[data-page="1"]')
  await expect(page1.locator('canvas')).toBeVisible({ timeout: 40_000 })
  await expect.poll(() => inked(page1.locator('canvas'))).toBeGreaterThan(1000)
  await expect(page1.locator('.textLayer')).toContainText(words)
  return page1
}

test.describe.serial('Office files previewed as the PDF the server makes', () => {
  test.beforeAll(async () => {
    const d = demo()
    const files = []
    for (const f of [HANDOUT, LOCKED, SLIDES]) files.push({ upload_token: await uploadMaterial(f), filename: f.name })
    const made = await done(d.actors.instructor.token, `/v1/courses/${d.course.id}/documents`, {
      kind: 'material',
      title: TITLE,
      body_md: `Read the handout before the lecture (${tag}).`,
      files,
    })
    documentId = made.document_id
    ;[HANDOUT, LOCKED, SLIDES].forEach((f, i) => (fileIds[f.name] = made.file_ids[i]))
    await done(d.actors.instructor.token, `/v1/courses/${d.course.id}/documents/${documentId}/publish`, {
      version_id: made.version_id,
    })
    // Queued as they were recorded, each of them.
    for (const f of [HANDOUT, LOCKED, SLIDES]) expect((await renditionOf(fileIds[f.name]!)).state).toBe('queued')
  })

  test('while the server converts it, the viewer says so, and shows the PDF by itself once it is done; “Download PDF” saves it', async ({
    page,
  }) => {
    const expectNoneRefused = await watchPolicy(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    await expect(page.locator('.version-file')).toHaveCount(3)
    // Nothing is converted yet: no file says its PDF is made.
    await expect(page.locator('.version-file__pdf')).toHaveCount(0)
    const dialog = await openFile(page, HANDOUT)
    const note = dialog.locator('.file-viewer__note')
    await expect(note.locator('.file-viewer__note-title')).toHaveText('Converting to PDF…')
    await expect(note.getByRole('status')).toContainText('It appears by itself once it is ready')
    await expect(note.locator('.file-viewer__note-icon .is-loading')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Download PDF', exact: false })).toHaveCount(0)
    await photograph(page, 'rendition-converting')

    // The runtime converts it meanwhile, from the file it reads, into a PDF of two pages.
    const runtime = await playRuntime()
    try {
      const claim = await runtime.claim((c) => c.file_id === fileIds[HANDOUT.name])
      expect(claim).toMatchObject({ source: 'document_file', filename: HANDOUT.name, attempt: 1 })
      expect((await runtime.source(claim)).equals(HANDOUT.buffer)).toBe(true)
      await runtime.convert(claim, HANDOUT_PDF, 2)
    } finally {
      await runtime.stop()
    }

    // The viewer, asking again as it waits, shows it, drawn by pdf.js.
    const page1 = await expectPdfDrawn(dialog, 'Page 1: a graph is vertices and edges.')
    await expect(dialog.locator('.pdf-view__of')).toHaveText('of 2')
    await expect(dialog.locator('.file-viewer__meta')).toContainText(
      `Document · ${HANDOUT.buffer.length} B · PDF of 2 pages`,
    )
    // Fitted to the width, as any PDF.
    const [pageBox, areaBox] = [await page1.boundingBox(), await dialog.locator('.pdf-view__pages').boundingBox()]
    expect(pageBox!.width).toBeGreaterThan(areaBox!.width - 60)
    await photograph(page, 'rendition-done')

    // "Download PDF", beside the file's own download: the PDF, under the file's name with .pdf.
    const pdfButton = dialog.getByRole('button', { name: `Download PDF “${pdfName(HANDOUT)}”` })
    await expect(pdfButton).toHaveText('Download PDF')
    let download = page.waitForEvent('download')
    await pdfButton.click()
    let saved = await download
    expect(saved.suggestedFilename()).toBe(pdfName(HANDOUT))
    expect((await readFile((await saved.path())!)).equals(HANDOUT_PDF)).toBe(true)
    // And the file itself, as it was uploaded.
    download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: `Download “${HANDOUT.name}”` }).click()
    saved = await download
    expect(saved.suggestedFilename()).toBe(HANDOUT.name)
    expect((await readFile((await saved.path())!)).equals(HANDOUT.buffer)).toBe(true)

    // The list, read again, says its PDF is made.
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.locator(`.version-file[data-file="${HANDOUT.name}"] .version-file__pdf`)).toHaveText('PDF')
    await expect(page.locator(`.version-file[data-file="${SLIDES.name}"] .version-file__pdf`)).toHaveCount(0)
    expect(await renditionOf(fileIds[HANDOUT.name]!)).toMatchObject({ state: 'done', page_count: 2 })
    await expectNoneRefused()
  })

  test('one the runtime could not convert says why; a student may only download it, the instructor sends it back', async ({
    page,
    browser,
  }) => {
    await keepToasts(page)
    const runtime = await playRuntime()
    try {
      const claim = await runtime.claim((c) => c.file_id === fileIds[LOCKED.name])
      await runtime.fail(claim, 'skipped', 'password_protected')
    } finally {
      await runtime.stop()
    }
    expect(await renditionOf(fileIds[LOCKED.name]!)).toMatchObject({ state: 'skipped', reason: 'password_protected' })

    // A student reads why, and downloads the file; it is not hers to send back.
    const student = await browser.newPage()
    const studentRefused = await watchPolicy(student)
    await signIn(student, demo().actors.yuki)
    await student.goto(coursePath(`documents/${documentId}`))
    let dialog = await openFile(student, LOCKED)
    await expect(dialog.locator('.file-viewer__note-title')).toHaveText('It could not be converted to PDF')
    await expect(dialog.locator('.file-viewer__note-text')).toHaveText(
      'The file is protected by a password. Download the file to open it.',
    )
    await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    const download = student.waitForEvent('download')
    await dialog.locator('.file-viewer__note-download').click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(LOCKED.name)
    await studentRefused()
    await student.close()

    // The instructor sends it back: it waits again, and the viewer says so.
    const expectNoneRefused = await watchPolicy(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    dialog = await openFile(page, LOCKED)
    await expect(dialog.locator('.file-viewer__note-text')).toHaveText(
      'The file is protected by a password. Download the file to open it.',
    )
    await photograph(page, 'rendition-skipped')
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expectToasted(page, 'It will be converted to PDF again.')
    await expect(dialog.locator('.file-viewer__note-title')).toHaveText('Converting to PDF…')
    expect((await renditionOf(fileIds[LOCKED.name]!)).state).toBe('queued')

    // Converted this time; the viewer shows it as soon as it asks again.
    const again = await playRuntime()
    try {
      const claim = await again.claim((c) => c.file_id === fileIds[LOCKED.name])
      // Its attempts start again.
      expect(claim.attempt).toBe(1)
      await again.convert(claim, LOCKED_PDF, 1)
    } finally {
      await again.stop()
    }
    await expectPdfDrawn(dialog, 'Page 1: a graph is vertices and edges.')
    await expect(dialog.locator('.file-viewer__note')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: `Download PDF “${pdfName(LOCKED)}”` })).toBeVisible()

    // Done is for good: Core refuses to send it back again.
    const refused = await call(
      demo().actors.instructor.token,
      'POST',
      `/v1/courses/${demo().course.id}/documents/${documentId}/files/${fileIds[LOCKED.name]}/rendition/retry`,
      {},
    )
    expect(refused.status).toBe(422)
    expect(refused.body.error?.details?.reason).toBe('rendition_done')
    await expectNoneRefused()
  })

  test('a file a chat message carries is shown as its PDF too, and its author sends a failed one back', async ({
    page,
  }) => {
    const expectNoneRefused = await watchPolicy(page)
    const d = demo()
    const I = d.actors.instructor.token
    const Y = d.actors.yuki.token
    const C = `/v1/courses/${d.course.id}`
    // A course agent of this run's, hosted on AIshie (the test plays the runtime), which Yuki asks.
    const name = `Graphs tutor ${tag}`
    const agent = (await done(I, '/v1/me/agents', { display_name: name, hosting: 'runtime' })).actor_id as string
    try {
      await done(I, `${C}/delegates`, { actor_id: agent, preset: 'course_tutor', answers_course: true })
      await hostOnRuntime(agent)
      const respondents = await call(Y, 'GET', `${C}/conversations/respondents`)
      const tutor = (respondents.body.result.respondents as { member_id: string; display_name: string }[]).find(
        (r) => r.display_name === name,
      )!
      // Yuki asks it, with her slides attached.
      const slides: FileSpec = {
        name: `my-graph-slides-${tag}.pptx`,
        mimeType: PPTX,
        buffer: Buffer.from('PK\u0003\u0004 my slides'),
      }
      const url = await call(Y, 'GET', `${C}/conversations/upload-url?content_type=${encodeURIComponent(PPTX)}`)
      expect(url.body.status, JSON.stringify(url.body.error)).toBe('executed')
      const title = `My slides (${tag})`
      const opened = await done(Y, `${C}/conversations`, {
        respondent_member_id: tutor.member_id,
        title,
        body: `${title}\nAre these right?`,
        attachments: [{ upload_token: await put(url.body, PPTX, slides.buffer), filename: slides.name }],
      })
      const messages = await call(Y, 'GET', `${C}/conversations/${opened.conversation_id}/messages`)
      const attachment = messages.body.result.messages[0].attachments[0] as { id: string; rendition: { state: string } }
      expect(attachment.rendition.state).toBe('queued')

      // The runtime cannot convert it this time.
      let runtime = await playRuntime()
      try {
        const claim = await runtime.claim((c) => c.attachment_id === attachment.id)
        expect(claim.source).toBe('attachment')
        await runtime.fail(claim, 'failed', 'conversion_failed')
      } finally {
        await runtime.stop()
      }

      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      const panel = page.locator('#chat-panel')
      if (!(await panel.isVisible())) await page.locator('#chat-panel-toggle').click()
      await expect(panel).toBeVisible()
      const history = panel.getByRole('button', { name: 'History', exact: true })
      const row = panel.locator('.hist-row').filter({ hasText: title })
      await expect(async () => {
        if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
        await expect(row).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 30_000 })
      await row.click()
      const card = panel.locator('.msg-file').filter({ hasText: slides.name })
      await expect(card.locator('.msg-file__pdf')).toHaveCount(0)
      await card.getByRole('button', { name: new RegExp(`^Preview “${slides.name}”`) }).click()
      const dialog = viewer(page, slides.name)
      await expect(dialog.locator('.file-viewer__note-text')).toHaveText(
        'The conversion failed. Download the file to open it.',
      )
      // Hers to send back: she sent it.
      await dialog.getByRole('button', { name: 'Try again' }).click()
      await expect(dialog.locator('.file-viewer__note-title')).toHaveText('Converting to PDF…')

      runtime = await playRuntime()
      try {
        const claim = await runtime.claim((c) => c.attachment_id === attachment.id)
        await runtime.convert(claim, pdfOf(['My slides']), 1)
      } finally {
        await runtime.stop()
      }
      await expectPdfDrawn(dialog, 'Page 1: a graph is vertices and edges.')
      await expect(dialog.locator('.file-viewer__meta')).toContainText('PDF of one page')
      const download = page.waitForEvent('download')
      await dialog.getByRole('button', { name: `Download PDF “${pdfName(slides)}”` }).click()
      expect((await download).suggestedFilename()).toBe(pdfName(slides))
      await photograph(page, 'rendition-chat')
    } finally {
      // A person may have five agents at once: this run's is suspended, for the specs after it.
      await call(I, 'POST', `/v1/me/agents/${agent}/suspend`, {})
    }
    await expectNoneRefused()
  })

  test('on a phone, in Traditional Chinese, the PDF fits the screen, and one still converting says so', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const expectNoneRefused = await watchPolicy(page)
    await signIn(page, demo().actors.instructor)
    await inTraditionalChinese(page)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await openFile(page, HANDOUT)
    await expect
      .poll(async () => {
        const box = (await dialog.locator('.el-dialog').boundingBox())!
        return [box.x, box.y, box.width, box.height].map(Math.round)
      })
      .toEqual([0, 0, 390, 844])
    const page1 = await expectPdfDrawn(dialog, 'Page 1: a graph is vertices and edges.')
    const p = (await page1.boundingBox())!
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x + p.width).toBeLessThanOrEqual(390)
    await expect(dialog.locator('.file-viewer__meta')).toContainText('PDF，共2頁')
    for (const name of ['關閉預覽', '下一個檔案', `下載「${HANDOUT.name}」`, `下載 PDF「${pdfName(HANDOUT)}」`]) {
      const b = dialog.getByRole('button', { name, exact: true })
      await expect(b, name).toBeVisible()
      const r = (await b.boundingBox())!
      expect(r.x, name).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width, name).toBeLessThanOrEqual(390)
    }
    await expect(dialog.getByRole('button', { name: `下載 PDF「${pdfName(HANDOUT)}」` })).toHaveText('下載 PDF')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'rendition-phone-pdf')

    // The slides wait still: nothing has converted them.
    await dialog.getByRole('button', { name: '下一個檔案' }).click()
    const slides = viewer(page, LOCKED.name)
    await slides.getByRole('button', { name: '下一個檔案' }).click()
    const waiting = viewer(page, SLIDES.name)
    await expect(waiting.locator('.file-viewer__note-title')).toHaveText('正在轉換為 PDF…')
    await expect(waiting.locator('.file-viewer__note-text')).toContainText('完成後會自動在這裏顯示')
    await expect(waiting.getByRole('button', { name: `下載「${SLIDES.name}」` }).last()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'rendition-phone-converting')
    await expectNoneRefused()
  })
})
