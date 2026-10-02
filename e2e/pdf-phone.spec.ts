/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, coursePath, demo, photograph, signIn, type FileSpec } from './support'

// The PDF viewer on a phone, and on a desktop as before, with the real Core:
// material of a slide deck (eight wide pages), a long handout (twelve A4
// pages) and a note of one page. On a phone, upright or on its side, the
// viewer fills the screen; the first page fills the width; the pages and the
// zoom are one bar at the bottom, within a thumb's reach, which the last page
// scrolls clear of; a PDF of one page has no page control; and two fingers
// pinch the pages larger, not the whole screen. On a desktop the bar is above
// the pages, with the zoom in per cent, as it was.

const tag = Date.now().toString(36)
const TITLE = `Week 7 — Sorting (e2e ${tag})`

/** A PDF of pages `w` × `h` points, each with a band of colour and its title, and `lines` lines of text under it. */
function pdfOf(w: number, h: number, pages: string[], lines: number): Buffer {
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  pages.forEach((title, i) => {
    const body: string[] = [
      `0.13 0.25 0.48 rg 48 ${h - 120} ${w - 96} 72 re f`,
      `BT /F1 30 Tf 1 1 1 rg 68 ${h - 96} Td (${title}) Tj ET`,
    ]
    for (let l = 0; l < lines; l++)
      body.push(
        `BT /F1 14 Tf 0 0 0 rg 56 ${h - 160 - l * 20} Td (Page ${i + 1}, line ${l + 1}: sorting puts things in order.) Tj ET`,
      )
    const content = body.join('\n')
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
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

const DECK: FileSpec = {
  name: `sorting-slides-${tag}.pdf`,
  mimeType: 'application/pdf',
  buffer: pdfOf(
    960,
    540,
    ['Sorting', 'Bubble sort', 'Insertion sort', 'Merge sort', 'Quick sort', 'Heaps', 'Stability', 'Summary'],
    6,
  ),
}
const HANDOUT: FileSpec = {
  name: `sorting-handout-${tag}.pdf`,
  mimeType: 'application/pdf',
  buffer: pdfOf(
    595,
    842,
    Array.from({ length: 12 }, (_, i) => `Handout, part ${i + 1}`),
    30,
  ),
}
const NOTE: FileSpec = {
  name: `sorting-note-${tag}.pdf`,
  mimeType: 'application/pdf',
  buffer: pdfOf(595, 842, ['Before the lecture'], 4),
}

let documentId = ''

test.beforeAll(async () => {
  const d = demo()
  const I = d.actors.instructor.token
  const files = []
  for (const f of [DECK, HANDOUT, NOTE]) {
    const q = `kind=material&content_type=${encodeURIComponent(f.mimeType)}&filename=${encodeURIComponent(f.name)}`
    const u = await call(I, 'GET', `/v1/courses/${d.course.id}/upload-url?${q}`)
    expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
    const url = new URL(u.body.result.upload_url)
    const res = await fetch(`${d.core}${url.pathname}${url.search}`, {
      method: 'PUT',
      headers: { 'Content-Type': f.mimeType, ...u.body.result.headers },
      body: new Uint8Array(f.buffer),
    })
    expect(res.ok).toBe(true)
    files.push({ upload_token: u.body.result.upload_token, filename: f.name })
  }
  const made = await call(I, 'POST', `/v1/courses/${d.course.id}/documents`, { kind: 'material', title: TITLE, files })
  expect(made.body.status, JSON.stringify(made.body.error)).toBe('executed')
  documentId = made.body.result.document_id
})

/** Opens a file of the material in the viewer, from its row; the viewer. */
async function open(page: Page, file: FileSpec): Promise<Locator> {
  await page.locator(`.version-file[data-file="${file.name}"] .version-file__open`).click()
  const dialog = page.getByRole('dialog', { name: file.name })
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

/** Waits for the viewer to have come in, filling the window, and its first page to be drawn; that page. */
async function firstPageDrawn(page: Page, dialog: Locator, fills: boolean): Promise<Locator> {
  if (fills) {
    const { width, height } = page.viewportSize()!
    await expect
      .poll(async () => {
        const box = (await dialog.locator('.el-dialog').boundingBox())!
        return [box.x, box.y, box.width, box.height].map(Math.round)
      })
      .toEqual([0, 0, width, height])
  }
  const first = dialog.locator('.pdf-page[data-page="1"]')
  await expect.poll(() => inked(first.locator('canvas')), { timeout: 20_000 }).toBeGreaterThan(500)
  return first
}

/** The page fills the pages area's width, but for its gutters of `gutter` px a side (and what the zoom's rounding down leaves). */
async function expectFillsWidth(dialog: Locator, pdfPage: Locator, gutter: number) {
  const area = await dialog.locator('.pdf-view__pages').evaluate((el) => el.clientWidth)
  await expect
    .poll(async () => Math.round((await pdfPage.boundingBox())!.width))
    .toBeGreaterThanOrEqual(area - 2 * gutter - 3)
  expect((await pdfPage.boundingBox())!.width).toBeLessThanOrEqual(area)
}

/** The one page control there is, and the zoom: each button wholly on the screen, in its lower part on a phone. */
async function expectOneBar(page: Page, dialog: Locator, where: 'top' | 'bottom', pages = true) {
  const { width, height } = page.viewportSize()!
  await expect(dialog.getByRole('toolbar', { name: 'Pages and zoom' })).toHaveCount(1)
  await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveCount(pages ? 1 : 0)
  const names = ['Zoom out', 'Zoom in', 'Fit width']
  if (pages) names.unshift('Previous page', 'Next page')
  for (const name of names) {
    const b = dialog.getByRole('button', { name, exact: true })
    await expect(b, name).toHaveCount(1)
    await expect(b, name).toBeVisible()
    const r = (await b.boundingBox())!
    expect(r.x, name).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width, name).toBeLessThanOrEqual(width)
    if (where === 'bottom') {
      // Within a thumb's reach: the lowest fifth of the screen, and big enough to touch.
      expect(r.y, name).toBeGreaterThan(height * 0.8)
      expect(r.y + r.height, name).toBeLessThanOrEqual(height)
      expect(Math.min(r.width, r.height), name).toBeGreaterThanOrEqual(36)
    } else expect(r.y + r.height, name).toBeLessThan(height * 0.3)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
}

async function inDark(page: Page, name: string) {
  await page.locator('html').evaluate((h) => h.classList.add('dark'))
  await photograph(page, name)
  await page.locator('html').evaluate((h) => h.classList.remove('dark'))
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('a slide deck fills the width, with one bar of pages and zoom at the bottom; a PDF of one page has no page control', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await open(page, DECK)
    const first = await firstPageDrawn(page, dialog, true)
    await photograph(page, 'phone-deck-light')
    await inDark(page, 'phone-deck-dark')
    await expectFillsWidth(dialog, first, 8)
    await expectOneBar(page, dialog, 'bottom')
    await expect(dialog.locator('.pdf-view__of')).toHaveText('of 8')
    // Fitted to the width, it says so, not as a per cent of the page's printed size.
    await expect(dialog.getByRole('button', { name: 'Fit width', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.locator('.pdf-view__percent')).toBeHidden()

    // The next slide, from the bar.
    await dialog.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('2')
    // The last one, by its number: scrolled to the end, it clears the bar.
    await dialog.getByRole('textbox', { name: 'Page number' }).fill('8')
    await dialog.getByRole('textbox', { name: 'Page number' }).press('Enter')
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('8')
    await dialog.locator('.pdf-view__pages').evaluate((el) => (el.scrollTop = el.scrollHeight))
    const last = (await dialog.locator('.pdf-page[data-page="8"]').boundingBox())!
    const bar = (await dialog.getByRole('toolbar', { name: 'Pages and zoom' }).boundingBox())!
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y)

    // The note, of one page: nothing to page through.
    await dialog.getByRole('button', { name: 'Next file' }).click()
    await page.getByRole('dialog', { name: HANDOUT.name }).getByRole('button', { name: 'Next file' }).click()
    const note = page.getByRole('dialog', { name: NOTE.name })
    const noteFirst = await firstPageDrawn(page, note, true)
    await expectFillsWidth(note, noteFirst, 8)
    await expectOneBar(page, note, 'bottom', false)
    await photograph(page, 'phone-note-light')
  })

  test('a long handout fills the width; zoomed in from the bar and back to the width', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await open(page, HANDOUT)
    const first = await firstPageDrawn(page, dialog, true)
    await photograph(page, 'phone-handout-light')
    await inDark(page, 'phone-handout-dark')
    await expectFillsWidth(dialog, first, 8)
    await expectOneBar(page, dialog, 'bottom')
    await expect(dialog.locator('.pdf-view__of')).toHaveText('of 12')

    const fit = dialog.getByRole('button', { name: 'Fit width', exact: true })
    const area = await dialog.locator('.pdf-view__pages').evaluate((el) => el.clientWidth)
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(fit).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(area)
    await photograph(page, 'phone-handout-zoomed')
    await fit.click()
    await expect(fit).toHaveAttribute('aria-pressed', 'true')
    await expectFillsWidth(dialog, first, 8)

    await dialog.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Page number' })).toHaveValue('2')
    await expect(dialog.locator('.pdf-page[data-page="2"] .textLayer')).toContainText('Page 2, line 1')
  })

  test('two fingers pinch the pages larger, not the screen, and pinched back near the width they fit it again', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await open(page, HANDOUT)
    const first = await firstPageDrawn(page, dialog, true)
    const fit = dialog.getByRole('button', { name: 'Fit width', exact: true })
    const area = await dialog.locator('.pdf-view__pages').evaluate((el) => el.clientWidth)
    const before = (await first.boundingBox())!.width

    const cdp = await page.context().newCDPSession(page)
    const pinch = async (from: number, to: number) => {
      const y = 420
      const at = (d: number) => [
        { x: 195 - d / 2, y, id: 1 },
        { x: 195 + d / 2, y, id: 2 },
      ]
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) })
      for (let i = 1; i <= 10; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: at(from + ((to - from) * i) / 10),
        })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }

    // Spread twice as wide: the pages twice as large, the screen as it was.
    await pinch(80, 160)
    await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(before * 1.6)
    expect((await first.boundingBox())!.width).toBeGreaterThan(area)
    await expect(fit).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)
    await expect(dialog.getByRole('toolbar', { name: 'Pages and zoom' })).toBeInViewport({ ratio: 1 })
    await photograph(page, 'phone-handout-pinched')

    // Pinched back to about the width: fitted to it again.
    await pinch(160, 82)
    await expect(fit).toHaveAttribute('aria-pressed', 'true')
    await expectFillsWidth(dialog, first, 8)
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)
  })
})

test.describe('on a phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('the viewer fills the screen, the page its width, and the bar is at the bottom', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`documents/${documentId}`))
    const dialog = await open(page, DECK)
    const first = await firstPageDrawn(page, dialog, true)
    await photograph(page, 'landscape-deck-light')
    await inDark(page, 'landscape-deck-dark')
    await expectFillsWidth(dialog, first, 8)
    await expectOneBar(page, dialog, 'bottom')
  })
})

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const [what, file] of [
    ['slide deck', DECK],
    ['long handout', HANDOUT],
  ] as const)
    test(`a ${what} fills the width, with the pages and the zoom above it as before`, async ({ page }) => {
      await signIn(page, demo().actors.instructor)
      await page.goto(coursePath(`documents/${documentId}`))
      const dialog = await open(page, file)
      const first = await firstPageDrawn(page, dialog, false)
      const shot = what === 'slide deck' ? 'deck' : 'handout'
      await photograph(page, `desktop-${shot}-light`)
      await inDark(page, `desktop-${shot}-dark`)
      await expectFillsWidth(dialog, first, 16)
      await expectOneBar(page, dialog, 'top')
      await expect(dialog.locator('.pdf-view__percent')).toBeVisible()
      await expect(dialog.locator('.pdf-view__percent')).toHaveText(/^\d+ %/)
      if (file !== HANDOUT) return

      // A touchpad's pinch, a wheel with Ctrl held, zooms the pages, not the page they are in.
      const width = (await first.boundingBox())!.width
      const area = (await dialog.locator('.pdf-view__pages').boundingBox())!
      await page.mouse.move(area.x + area.width / 2, area.y + 200)
      await page.keyboard.down('Control')
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -20)
      await page.keyboard.up('Control')
      await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(width * 1.5)
      await expect(dialog.getByRole('button', { name: 'Fit width', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)
    })
})
