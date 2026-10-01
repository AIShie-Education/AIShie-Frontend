/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { crc32, deflateSync } from 'node:zlib'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  inTraditionalChinese,
  photograph,
  signIn,
  type CoreReply,
  type FileSpec,
} from './support'

// The file viewer (預覽) and "Download as PDF" (下載為 PDF), with the real
// Core: material of six files (a PDF of two pages, a picture, a Markdown
// note, a text file, and two Word files, one with a text version written by
// staff and one with none) opens file by file in the viewer from the
// document's page: the PDF drawn by pdf.js, page 1 then page 2, its text
// selectable; the picture from an object URL; the Markdown rendered and the
// text as it is; a Word file as its text version, or, with none, a note and
// its download. "Download as PDF" lays out the Markdown file, and the
// version's text note, for the print window (window.print is stubbed, in
// every frame, and what it was asked to print is read back). A file a chat
// message carries opens in the viewer too. On a phone the viewer is the
// whole screen. Nothing the viewer does is refused by the page's policy.

const tag = Date.now().toString(36)
const TITLE = `Week 6 — Trees (e2e ${tag})`
const NOTE = `## Before the lecture\n\nRead **the slides** first, then try the exercises (${tag}).`

/** A PDF of `pages` pages, each a band of colour with its title in it, and a line of text under it. */
function pdfOf(pages: string[]): Buffer {
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  pages.forEach((title, i) => {
    const content = [
      '0.13 0.25 0.48 rg 72 640 468 72 re f',
      `BT /F1 30 Tf 1 1 1 rg 92 664 Td (${title}) Tj ET`,
      `BT /F1 16 Tf 0 0 0 rg 72 590 Td (Page ${i + 1}: a tree is a node with children.) Tj ET`,
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

/** A PNG of w × h pixels, a gradient from the brand's indigo. */
function pngOf(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const rows: number[] = []
  for (let y = 0; y < h; y++) {
    rows.push(0)
    for (let x = 0; x < w; x++) rows.push(34 + Math.round((x / w) * 120), 64 + Math.round((y / h) * 100), 122)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SLIDES: FileSpec = {
  name: `trees-slides-${tag}.pdf`,
  mimeType: 'application/pdf',
  buffer: pdfOf(['Trees', 'Traversals']),
}
const PICTURE: FileSpec = { name: `tree-${tag}.png`, mimeType: 'image/png', buffer: pngOf(96, 60) }
const NOTES: FileSpec = {
  name: `trees-notes-${tag}.md`,
  mimeType: 'text/markdown',
  buffer: Buffer.from(
    `# Binary trees\n\nEach node has **at most two** children.\n\n| Order | Visits |\n| --- | --- |\n| pre | root first |\n\n二元樹：每個節點最多有兩個子節點。\n`,
  ),
}
const EXERCISES: FileSpec = {
  name: `trees-exercises-${tag}.txt`,
  mimeType: 'text/plain',
  buffer: Buffer.from('1. Draw the tree for 4, 2, 6, 1, 3.\n2. Write a pre-order walk.\n   <b>by hand</b>\n'),
}
const HANDOUT: FileSpec = {
  name: `trees-handout-${tag}.docx`,
  mimeType: DOCX,
  buffer: Buffer.from('PK\u0003\u0004 handout'),
}
const READING: FileSpec = {
  name: `trees-reading-${tag}.docx`,
  mimeType: DOCX,
  buffer: Buffer.from('PK\u0003\u0004 reading'),
}
const READING_TEXT = `## 第 1 頁\n\n# Reading on trees\n\nA tree has a root, and each node below it one parent (${tag}).\n`

let documentId = ''

/** Uploads a file as `token` for a document of `kind`, named at its upload URL; its upload token. */
async function uploadAs(token: string, kind: string, file: FileSpec): Promise<string> {
  const d = demo()
  const q = `kind=${kind}&content_type=${encodeURIComponent(file.mimeType)}&filename=${encodeURIComponent(file.name)}`
  const u = await call(token, 'GET', `/v1/courses/${d.course.id}/upload-url?${q}`)
  expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
  return put(u.body, file)
}

/** PUTs a file's bytes to the upload URL Core gave; its upload token. */
async function put(reply: CoreReply, file: FileSpec): Promise<string> {
  const url = new URL(reply.result.upload_url)
  const res = await fetch(`${demo().core}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.mimeType, ...reply.result.headers },
    body: new Uint8Array(file.buffer),
  })
  expect(res.ok).toBe(true)
  return reply.result.upload_token as string
}

/** A write through Core that must be carried out; its result. */
async function done(token: string, path: string, body: unknown) {
  const out = await call(token, 'POST', path, body)
  expect(out.body.status, JSON.stringify(out.body.error)).toBe('executed')
  return out.body.result
}

/**
 * Watches the page for what its policy refuses (a securitypolicyviolation
 * event, in any frame, or Chrome's console line), and stubs window.print in
 * every frame, keeping what each print was of (in the top window).
 */
async function watchPage(page: Page) {
  const refused: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|create|connect|frame)/i.test(m.text())) refused.push(m.text())
  })
  await page.addInitScript(() => {
    const top = window.top as unknown as { __refused?: string[]; __printed?: unknown[] }
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(top.__refused ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)
    })
    window.print = () => {
      ;(top.__printed ??= []).push({
        title: document.title,
        lang: document.documentElement.lang,
        text: document.body.innerText,
        head: document.querySelector('.print-head')?.textContent ?? '',
        styles: document.querySelectorAll('link[rel="stylesheet"], style').length,
      })
    }
  })
  return {
    async expectNoneRefused() {
      const inPage = await page.evaluate(() => (window as unknown as { __refused?: string[] }).__refused ?? [])
      expect([...refused, ...inPage], 'what the page’s policy refused').toEqual([])
    },
    printed: () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __printed?: { title: string; lang: string; text: string; head: string; styles: number }[]
            }
          ).__printed ?? [],
      ),
  }
}

/** The viewer, open on a file. */
function viewer(page: Page, name: string): Locator {
  return page.getByRole('dialog', { name })
}

/** Opens a file of the document's version in the viewer, from its row. */
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

test.describe.serial('the file viewer', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    const files = []
    for (const f of [SLIDES, PICTURE, NOTES, EXERCISES, HANDOUT, READING])
      files.push({ upload_token: await uploadAs(I, 'material', f), filename: f.name })
    const made = await done(I, `/v1/courses/${d.course.id}/documents`, {
      kind: 'material',
      title: TITLE,
      body_md: NOTE,
      files,
    })
    documentId = made.document_id
    // The reading's text version, written by staff (no transcriber runs here); the handout has none.
    await done(I, `/v1/courses/${d.course.id}/documents/${documentId}/versions/${made.version_id}/text`, {
      file_id: made.file_ids[5],
      body: READING_TEXT,
    })
  })

  test('a PDF is drawn in the page: page 1, then page 2, its text selectable, zoomed to the width', async ({
    page,
  }) => {
    const watch = await watchPage(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    await expect(page.locator('.version-file')).toHaveCount(6)
    const dialog = await openFile(page, SLIDES)
    await expect(dialog.locator('.file-viewer__meta')).toContainText('PDF · 1.1 KB')
    await expect(dialog.locator('.file-viewer__meta')).toContainText(TITLE)
    await expect(dialog.locator('.file-viewer__position')).toHaveText('1 of 6')

    const page1 = dialog.locator('.pdf-page[data-page="1"]')
    await expect(page1.locator('canvas')).toBeVisible()
    await expect.poll(() => inked(page1.locator('canvas'))).toBeGreaterThan(1000)
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('1')
    await expect(dialog.locator('.pdf-view__of')).toHaveText('of 2')
    // Its words lie over it, to be selected.
    await expect(page1.locator('.textLayer')).toContainText('Page 1: a tree is a node with children.')
    // Fitted to the width: the page as wide as the window's pages area, less its gutters.
    const fit = dialog.getByRole('button', { name: 'Fit width' })
    await expect(fit).toHaveAttribute('aria-pressed', 'true')
    const [pageBox, areaBox] = [await page1.boundingBox(), await dialog.locator('.pdf-view__pages').boundingBox()]
    expect(pageBox!.width).toBeGreaterThan(areaBox!.width - 60)
    await photograph(page, 'preview-pdf')

    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('2')
    const page2 = dialog.locator('.pdf-page[data-page="2"]')
    await expect(page2.locator('canvas')).toBeVisible()
    await expect.poll(() => inked(page2.locator('canvas'))).toBeGreaterThan(1000)
    await expect(page2.locator('.textLayer')).toContainText('Page 2: a tree is a node with children.')
    // Back to page 1 by its number.
    await dialog.getByRole('textbox', { name: 'Page number' }).fill('1')
    await dialog.getByRole('textbox', { name: 'Page number' }).press('Enter')
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('1')

    // Zoomed by hand, it is no longer fitted; drawn again at the new size.
    const before = (await page1.boundingBox())!.width
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect(fit).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await page1.boundingBox())!.width).toBeGreaterThan(before + 20)
    await expect.poll(() => page1.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(before)
    await fit.click()
    await expect(fit).toHaveAttribute('aria-pressed', 'true')

    // Escape closes it, and the file's row has the focus again.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator(`.version-file[data-file="${SLIDES.name}"] .version-file__open`)).toBeFocused()
    await watch.expectNoneRefused()
  })

  test('an image, Markdown and text, file after file by the arrow keys; downloaded from the viewer', async ({
    page,
  }) => {
    const watch = await watchPage(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    let dialog = await openFile(page, PICTURE)
    const img = dialog.locator('img.image-view__img')
    await expect(img).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(96)
    await expect(img).toHaveAttribute('alt', PICTURE.name)
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect(dialog.getByRole('button', { name: 'Fit', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await photograph(page, 'preview-image')
    const pictureUrl = await img.getAttribute('src')

    // The next file, by the right arrow key: the picture's object URL is let go.
    await page.keyboard.press('ArrowRight')
    dialog = viewer(page, NOTES.name)
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.text-view__paper h1')).toHaveText('Binary trees')
    await expect(dialog.locator('.text-view__paper strong')).toHaveText('at most two')
    await expect(dialog.locator('.text-view__paper table td').first()).toHaveText('pre')
    await expect(dialog.locator('.text-view__paper')).toContainText('二元樹：每個節點最多有兩個子節點。')
    expect(
      await page.evaluate(
        (u) =>
          fetch(u!).then(
            () => 'loaded',
            () => 'revoked',
          ),
        pictureUrl,
      ),
      'the picture’s object URL, once another file is shown',
    ).toBe('revoked')
    await photograph(page, 'preview-markdown')

    await dialog.getByRole('button', { name: 'Next file' }).click()
    dialog = viewer(page, EXERCISES.name)
    await expect(dialog.locator('pre.text-view__pre')).toHaveText(EXERCISES.buffer.toString())
    await expect(dialog.locator('pre.text-view__pre b')).toHaveCount(0)

    // Its download, under its name.
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: `Download “${EXERCISES.name}”` }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(EXERCISES.name)
    expect((await readFile((await saved.path())!)).equals(EXERCISES.buffer)).toBe(true)
    await page.keyboard.press('ArrowLeft')
    await expect(viewer(page, NOTES.name)).toBeVisible()
    await watch.expectNoneRefused()
  })

  test('a Word file is shown as its text version where it has one, and with none, a note and its download', async ({
    page,
  }) => {
    const watch = await watchPage(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    let dialog = await openFile(page, HANDOUT)
    await expect(dialog.locator('.file-viewer__note-title')).toHaveText('No preview available yet')
    await expect(dialog.locator('.file-viewer__note-text')).toHaveText(
      'A preview of Word, PowerPoint and Excel files is not available yet. Download it to open it.',
    )
    await photograph(page, 'preview-docx-none')
    const download = page.waitForEvent('download')
    await dialog.locator('.file-viewer__note-download').click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(HANDOUT.name)
    expect((await readFile((await saved.path())!)).equals(HANDOUT.buffer)).toBe(true)

    await page.keyboard.press('ArrowRight')
    dialog = viewer(page, READING.name)
    await expect(dialog.locator('.file-viewer__text-note')).toContainText('This is the file’s text version (文字版)')
    await expect(dialog.locator('.file-viewer__paper h1')).toHaveText('Reading on trees')
    await expect(dialog.locator('.file-viewer__position')).toHaveText('6 of 6')
    await expect(dialog.getByRole('button', { name: 'Next file' })).toBeDisabled()
    await photograph(page, 'preview-docx-text-version')
    await watch.expectNoneRefused()
  })

  test('“Download as PDF” lays out a Markdown file, a text version and the version’s text note for the print window', async ({
    page,
  }) => {
    const watch = await watchPage(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))

    // The version's text note, from the document's page.
    const noteButton = page.locator('.doc-content__meta').getByRole('button', { name: 'Download as PDF' })
    await expect(noteButton).toHaveAccessibleDescription('In the print window, choose “Save as PDF”')
    await noteButton.click()
    await expect.poll(async () => (await watch.printed()).length).toBe(1)
    let [print] = await watch.printed()
    expect(print!.title).toBe(TITLE)
    expect(print!.lang).toBe('en')
    expect(print!.head).toContain('CS101 · Introduction to Programming')
    expect(print!.head).toContain('Version 1 ·')
    expect(print!.text).toContain('Before the lecture')
    expect(print!.text).toContain(`Read the slides first, then try the exercises (${tag}).`)
    // Set in the app's own style sheets, copied in.
    expect(print!.styles).toBeGreaterThan(1)
    await expect(page.locator('.el-message')).toContainText('choose “Save as PDF” there')

    // A Markdown file, from the viewer.
    const dialog = await openFile(page, NOTES)
    await dialog.getByRole('button', { name: 'Download as PDF' }).click()
    await expect.poll(async () => (await watch.printed()).length).toBe(2)
    print = (await watch.printed())[1]
    expect(print!.title).toBe(NOTES.name)
    expect(print!.head).toContain(TITLE)
    expect(print!.head).toContain('CS101 · Introduction to Programming')
    expect(print!.text).toContain('Binary trees')
    expect(print!.text).toContain('二元樹：每個節點最多有兩個子節點。')
    await page.keyboard.press('Escape')

    // The reading's text version, from its tab.
    await page.getByRole('tab', { name: 'Text version' }).click()
    await page
      .getByRole('group', { name: 'Whose text version to show' })
      .getByRole('button', { name: READING.name })
      .click()
    const pane = page.locator(`.text-pane[data-file="${READING.name}"]`)
    await expect(pane.getByRole('heading', { name: 'Reading on trees' })).toBeVisible()
    await pane.getByRole('button', { name: 'Download as PDF' }).click()
    await expect.poll(async () => (await watch.printed()).length).toBe(3)
    print = (await watch.printed())[2]
    expect(print!.title).toBe(`${READING.name} — text version`)
    expect(print!.text).toContain('Reading on trees')
    expect(print!.text).toContain('A text version (文字版) is the file’s words')

    // The layout itself, as it is printed, for the record.
    const frame = page.frameLocator('iframe.app-print-frame')
    await expect(frame.locator('h1.print-title')).toHaveText(`${READING.name} — text version`)
    await watch.expectNoneRefused()
  })

  test('in Traditional Chinese, the button says 下載為 PDF, and the layout is in Chinese', async ({ page }) => {
    const watch = await watchPage(page)
    await signIn(page, demo().actors.instructor)
    await inTraditionalChinese(page)
    await page.goto(coursePath(`documents/${documentId}`))
    const button = page.locator('.doc-content__meta').getByRole('button', { name: '下載為 PDF' })
    await expect(button).toHaveAccessibleDescription('在列印視窗選擇「另存為 PDF」')
    await button.click()
    await expect.poll(async () => (await watch.printed()).length).toBe(1)
    const [print] = await watch.printed()
    expect(print!.lang).toBe('zh-Hant')
    expect(print!.head).toContain('第 1 版')
    // The layout, as the print window would show it, for the record.
    const frame = page.frameLocator('iframe.app-print-frame')
    await expect(frame.locator('h1.print-title')).toHaveText(TITLE)
    await photograph(page, 'preview-print-button-zh-hant')
    await watch.expectNoneRefused()
  })

  test('a file a chat message carries opens in the viewer', async ({ page }) => {
    const watch = await watchPage(page)
    const d = demo()
    const I = d.actors.instructor.token
    const Y = d.actors.yuki.token
    const C = `/v1/courses/${d.course.id}`
    // A course agent of this run's, which takes conversations in the site.
    const name = `Viewer tutor ${tag}`
    const agent = (await done(I, '/v1/me/agents', { display_name: name })).actor_id as string
    try {
      await done(I, `${C}/delegates`, { actor_id: agent, preset: 'course_tutor', answers_course: true })
      const token = (await done(I, `/v1/me/agents/${agent}/tokens`, { label: `viewer ${tag}` })).token as string
      await done(token, '/v1/me/site-chat', { on: true })
      const respondents = await call(Y, 'GET', `${C}/conversations/respondents`)
      const tutor = (respondents.body.result.respondents as { member_id: string; display_name: string }[]).find(
        (r) => r.display_name === name,
      )!
      // Yuki asks it with her notes attached.
      const notes: FileSpec = {
        name: `my-tree-notes-${tag}.md`,
        mimeType: 'text/markdown',
        buffer: Buffer.from(`# My notes\n\nA **leaf** has no children (${tag}).\n`),
      }
      const url = await call(
        Y,
        'GET',
        `${C}/conversations/upload-url?content_type=${encodeURIComponent(notes.mimeType)}`,
      )
      expect(url.body.status, JSON.stringify(url.body.error)).toBe('executed')
      const title = `Leaves (${tag})`
      await done(Y, `${C}/conversations`, {
        respondent_member_id: tutor.member_id,
        title,
        body: `${title}\nAre my notes right?`,
        attachments: [{ upload_token: await put(url.body, notes), filename: notes.name }],
      })

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
      const card = panel.locator('.msg-file').filter({ hasText: notes.name })
      await expect(card.getByRole('button', { name: `Download “${notes.name}”` })).toBeVisible()
      await card.getByRole('button', { name: new RegExp(`^Preview “${notes.name}”`) }).click()
      const dialog = viewer(page, notes.name)
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.text-view__paper h1')).toHaveText('My notes')
      await expect(dialog.locator('.text-view__paper strong')).toHaveText('leaf')
      await photograph(page, 'preview-chat-attachment')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      // The chat is as it was under it.
      await expect(card).toBeVisible()
    } finally {
      // A person may have five agents at once: this run's is suspended, for the specs after it.
      await call(I, 'POST', `/v1/me/agents/${agent}/suspend`, {})
    }
    await watch.expectNoneRefused()
  })

  test('on a phone, the viewer is the whole screen, and steps through the files', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const watch = await watchPage(page)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await openFile(page, NOTES)
    // Once it has come in (it slides in from above).
    await expect
      .poll(async () => {
        const box = (await dialog.locator('.el-dialog').boundingBox())!
        return [box.x, box.y, box.width, box.height].map(Math.round)
      })
      .toEqual([0, 0, 390, 844])
    await expect(dialog.locator('.text-view__paper h1')).toHaveText('Binary trees')
    for (const name of [
      'Close the preview',
      'Previous file',
      'Next file',
      `Download “${NOTES.name}”`,
      'Download as PDF',
    ]) {
      const b = dialog.getByRole('button', { name, exact: true })
      await expect(b, name).toBeVisible()
      const r = (await b.boundingBox())!
      expect(r.x, name).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width, name).toBeLessThanOrEqual(390)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await photograph(page, 'preview-phone-markdown')

    // The PDF, fitted to the phone's width.
    await dialog.getByRole('button', { name: 'Previous file' }).click()
    await viewer(page, PICTURE.name).getByRole('button', { name: 'Previous file' }).click()
    const pdf = viewer(page, SLIDES.name)
    const page1 = pdf.locator('.pdf-page[data-page="1"]')
    await expect.poll(() => inked(page1.locator('canvas'))).toBeGreaterThan(500)
    const p = (await page1.boundingBox())!
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x + p.width).toBeLessThanOrEqual(390)
    await photograph(page, 'preview-phone-pdf')
    await pdf.getByRole('button', { name: 'Close the preview' }).click()
    await expect(pdf).toBeHidden()
    await watch.expectNoneRefused()
  })
})
