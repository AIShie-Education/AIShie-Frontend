/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, coursePath, demo, dropFiles, photograph, signIn, type CoreReply, type FileSpec } from './support'

// Files in the chat, with the real Core: Yuki, a student, asks a course
// agent made for this run with a PDF attached (the paperclip), which uploads
// as soon as it is chosen; with nothing written, sending asks for a line to
// go with it. Her message shows the file, which she downloads; the agent's
// runtime, played here through Core's API as the respondent, lists it and
// reads it, and answers. A picture pasted in the box is attached too, and
// shown as a thumbnail from an object URL (the page lets images come from
// this origin, data: and blob: only). Withdrawing her message hides its file
// from both of them. A file larger than Core takes is refused before
// anything is sent; nothing is sent while a file is still uploading; and
// files dropped on the chat panel are attached to what she is writing.

const STAMP = Date.now().toString(36)
const TUTOR = `Files tutor ${STAMP}`
/** The first line of her first message, which is the conversation's title. */
const TITLE = `Recursion notes (${STAMP})`
const QUESTION = `Can you check my notes on recursion? (${STAMP})`
const ANSWER = `Your base case is right; the recursive step needs n - 1 (${STAMP}).`
const PICTURE_QUESTION = `And is this call tree right? (${STAMP})`
const PICTURE_ANSWER = `Yes: each call waits for the one below it (${STAMP}).`
const PDF: FileSpec = {
  name: `recursion-notes-${STAMP}.pdf`,
  mimeType: 'application/pdf',
  // Not a real PDF: Core keeps what it is given, as it is.
  buffer: Buffer.from(`%PDF-1.4\n% recursion notes ${STAMP}\nfact(0) = 1\nfact(n) = n * fact(n - 1)\n`),
}

const w = { tutorToken: '', tutorId: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A message as the respondent reads it (conversation.messages), with its files. */
interface Message {
  id: string
  body?: string
  retracted?: unknown
  attachments?: { id: string; filename: string; content_type: string; byte_size: number; checksum?: string }[]
}

/** The conversation's messages, as the course agent's runtime reads them. */
async function tutorReads(): Promise<Message[]> {
  const c = demo().course.id
  const r = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/${w.conversationId}/messages?limit=50`)
  return done(r, 'conversation.messages').messages ?? []
}

/** The course agent's runtime: the latest question waiting for it, answered. */
async function tutorAnswers(body: string) {
  const c = demo().course.id
  let conv: { id: string; latest_opener_message_id?: string } | undefined
  await expect
    .poll(async () => {
      const inbox = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/inbox`)
      conv = (inbox.body.result?.conversations ?? [])[0]
      return conv?.latest_opener_message_id ?? null
    })
    .not.toBeNull()
  w.conversationId = conv!.id
  done(
    await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${conv!.id}/answer`, {
      in_reply_to_message_id: conv!.latest_opener_message_id,
      body,
    }),
    'conversation.answer',
  )
}

/** Whether Yuki has read everything in this run's conversation, as Core keeps it (the other chat specs count her unread). */
async function yukiHasReadIt() {
  await expect
    .poll(async () => {
      const r = await call(demo().actors.yuki.token, 'GET', `/v1/me/conversations?course_id=${demo().course.id}`)
      return (r.body.result?.conversations ?? []).find((x: { title?: string }) => x.title === TITLE)?.unread
    })
    .toBe(false)
}

const panelOf = (page: Page) => page.locator('#chat-panel')

async function openChat(page: Page) {
  await page.goto(coursePath())
  await expect(page.locator('.course-head')).toBeVisible()
  if (!(await panelOf(page).isVisible())) await page.locator('#chat-panel-toggle').click()
  await expect(panelOf(page)).toBeVisible()
  return panelOf(page)
}

/**
 * Shows this run's conversation in the panel, from the history: asked for
 * again while the panel, just loaded, still settles on what it shows.
 */
async function showConversation(panel: Locator) {
  const history = panel.getByRole('button', { name: 'History', exact: true })
  const row = panel.locator('.hist-row').filter({ hasText: TITLE })
  await expect(async () => {
    if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
    await expect(row).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await row.click()
  await expect(panel.locator('.chat-msg').first()).toBeVisible()
  return panel
}

/** Opens the chat on this run's conversation. */
async function openConversation(page: Page) {
  return showConversation(await openChat(page))
}

/** Chooses files with the paperclip, through the browser's own dialog. */
async function attachWithPaperclip(page: Page, panel: Locator, files: FileSpec[]) {
  const chooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', { name: 'Attach files' }).click()
  await (await chooser).setFiles(files)
}

/** Pastes a picture in the box, as a screenshot copied is: a paste of one PNG file and no text. */
async function pastePicture(box: Locator, name: string) {
  await box.evaluate(async (el, fileName) => {
    const canvas = new OffscreenCanvas(240, 150)
    const g = canvas.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 240, 150)
    grad.addColorStop(0, '#22407a')
    grad.addColorStop(1, '#7aa2e3')
    g.fillStyle = grad
    g.fillRect(0, 0, 240, 150)
    g.fillStyle = '#fff'
    g.font = 'bold 22px sans-serif'
    g.fillText('fact(3) → fact(2) → fact(1)', 12, 82)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(new File([blob], fileName, { type: 'image/png' }))
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, name)
}

/** The PUTs of files to Core's store. */
function blobPuts(page: Page): string[] {
  const puts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname.startsWith('/v1/blobs/')) puts.push(r.url())
  })
  return puts
}

test.describe.serial('files in the chat', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    // The instructor's course agent, seated to answer the course, and what runs it, which answers in the site.
    const tutor = done(await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR }), 'agent.create').actor_id
    w.tutorId = tutor
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    w.tutorToken = done(
      await call(I, 'POST', `/v1/me/agents/${tutor}/tokens`, { label: `files runtime ${STAMP}` }),
      'agent.issue_token',
    ).token
    done(await call(w.tutorToken, 'POST', '/v1/me/site-chat', { on: true }), 'me.site_chat')
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test('a student asks with a PDF attached; the agent reads it; she downloads it; withdrawn, it is gone', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    const panel = await openChat(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const box = panel.locator('textarea')
    await expect(box).toBeVisible()

    // Chosen with the paperclip: it uploads at once, as a chip with its name and size.
    await attachWithPaperclip(page, panel, [PDF])
    const chip = panel.locator('.chat-chip').filter({ hasText: PDF.name })
    await expect(chip).toBeVisible()
    await expect(chip).toContainText(`${PDF.buffer.length} B`)
    await expect(chip).toHaveClass(/is-done/)
    await expect(chip.getByRole('button', { name: `Remove “${PDF.name}”` })).toBeVisible()
    // With nothing written, the box asks what to do with it, and sending asks for a line rather than refusing.
    await expect(box).toHaveAttribute('placeholder', `What would you like ${TUTOR} to do with this file?`)
    await box.focus()
    await box.press('Enter')
    await expect(panel.locator('.chat-composer__file-line')).toHaveText(
      `Add a line to go with the file, so ${TUTOR} knows what you want: a question, or what to look at.`,
    )
    await expect(panel.locator('.chat-msg')).toHaveCount(0)
    await expect(box).toBeFocused()
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-chip')

    await box.fill(`${TITLE}\n${QUESTION}`)
    await expect(panel.locator('.chat-composer__file-line')).toHaveCount(0)
    await box.press('Enter')
    const mine = panel.locator('.chat-msg').filter({ hasText: QUESTION })
    await expect(mine).toBeVisible()
    // Her message shows its file: an icon by type, its name, what it is and its size; the box is empty again.
    const file = mine.locator('.msg-file').filter({ hasText: PDF.name })
    await expect(file).toContainText(`PDF · ${PDF.buffer.length} B`)
    await expect(file.locator('.msg-file__icon.is-pdf')).toBeVisible()
    await expect(panel.locator('.chat-chip')).toHaveCount(0)

    // The agent's runtime, as the respondent: the question lists the file, and Core serves it.
    await tutorAnswers(ANSWER)
    const question = (await tutorReads()).find((m) => m.body?.includes(QUESTION))
    expect(question?.attachments?.map((a) => [a.filename, a.content_type, a.byte_size])).toEqual([
      [PDF.name, 'application/pdf', PDF.buffer.length],
    ])
    const attachmentId = question!.attachments![0]!.id
    const got = done(
      await call(w.tutorToken, 'GET', `/v1/courses/${d.course.id}/conversation-attachments/${attachmentId}`),
      'conversation.attachment',
    )
    expect(got.filename).toBe(PDF.name)
    // The URL is the credential: no Authorization header.
    const bytes = await fetch(got.download_url)
    expect(bytes.status).toBe(200)
    expect(Buffer.from(await bytes.arrayBuffer()).equals(PDF.buffer)).toBe(true)

    await expect(panel.locator('.chat-msg').filter({ hasText: 'the recursive step needs' })).toBeVisible({
      timeout: 20_000,
    })
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-bubble')

    // She downloads it: saved under its name, as it was sent.
    const download = page.waitForEvent('download')
    await file.getByRole('button', { name: new RegExp(`^Download “${PDF.name.replace(/[.]/g, '\\.')}”`) }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(PDF.name)
    expect((await readFile((await saved.path())!)).equals(PDF.buffer)).toBe(true)
    await yukiHasReadIt()
  })

  test('a picture pasted in the box is attached, and shown as a thumbnail', async ({ page }) => {
    await signIn(page, demo().actors.yuki)
    const panel = await openConversation(page)
    const box = panel.locator('textarea')
    await pastePicture(box, 'image.png')
    const chip = panel.locator('.chat-chip').filter({ hasText: 'image.png' })
    await expect(chip).toHaveClass(/is-done/)
    await box.fill(PICTURE_QUESTION)
    await box.press('Enter')
    const mine = panel.locator('.chat-msg').filter({ hasText: PICTURE_QUESTION })
    await expect(mine).toBeVisible()
    // Its thumbnail, from an object URL of the bytes fetched from a fresh download URL; it loads, so the page lets it.
    const thumb = mine.locator('img.msg-file__thumb')
    await expect(thumb).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => thumb.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(240)
    await expect(mine.locator('.msg-file')).toContainText('Image ·')

    await tutorAnswers(PICTURE_ANSWER)
    await expect(panel.locator('.chat-msg').filter({ hasText: 'each call waits' })).toBeVisible({ timeout: 20_000 })
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-thumbnail')
    await page.locator('html').evaluate((h) => h.classList.add('dark'))
    await photograph(page, 'chat-attach-thumbnail-dark')
    await page.locator('html').evaluate((h) => h.classList.remove('dark'))
    await yukiHasReadIt()
  })

  test('withdrawing a message hides its files, from her and from the agent', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    const panel = await openConversation(page)
    const before = (await tutorReads()).find((m) => m.body?.includes(QUESTION))!
    const attachmentId = before.attachments![0]!.id

    const mine = panel.locator('.chat-msg').filter({ hasText: QUESTION })
    await expect(mine.locator('.msg-file')).toHaveCount(1)
    await mine.hover()
    await mine.getByRole('button', { name: 'Withdraw' }).click()
    const confirm = page.getByRole('dialog', { name: 'Withdraw this message?' })
    await confirm.getByRole('button', { name: 'Withdraw' }).click()
    const withdrawn = panel.locator('.chat-msg.is-retracted').filter({ hasText: 'You withdrew this message.' })
    await expect(withdrawn).toBeVisible()
    await expect(withdrawn.locator('.msg-file')).toHaveCount(0)
    await expect(panel.locator('.msg-file').filter({ hasText: PDF.name })).toHaveCount(0)
    // Read again, the same.
    await page.reload()
    await expect(panel).toBeVisible()
    await showConversation(panel)
    await expect(panel.locator('.chat-msg.is-retracted')).toHaveCount(1)
    await expect(panel.locator('.msg-file').filter({ hasText: PDF.name })).toHaveCount(0)
    await expect(panel.locator('.msg-file').filter({ hasText: 'image.png' })).toHaveCount(1)

    // The agent no longer sees it listed, nor may fetch it.
    const after = (await tutorReads()).find((m) => m.id === before.id)!
    expect(after.retracted).toBeTruthy()
    expect(after.attachments).toBeUndefined()
    const refused = await call(
      w.tutorToken,
      'GET',
      `/v1/courses/${d.course.id}/conversation-attachments/${attachmentId}`,
    )
    expect(refused.status).toBe(404)
    expect(refused.body.error?.details?.reason).toBe('retracted')
  })

  test('a file over the limit is refused before it is sent, and nothing is sent while a file uploads', async ({
    page,
  }) => {
    await signIn(page, demo().actors.yuki)
    // Core as one that takes files of 64 bytes at most.
    await page.route(/\/v1\/courses\/[^/]+\/conversations\/upload-url\?/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.result.max_bytes = 64
      await route.fulfill({ response: res, json: body })
    })
    // One upload is held on its way until the test lets it go.
    let release: (() => void) | null = null
    await page.route('**/v1/blobs/**', async (route) => {
      if (route.request().method() === 'PUT' && route.request().headers()['content-type'] === 'text/csv') {
        await new Promise<void>((r) => (release = r))
      }
      return route.continue()
    })
    const puts = blobPuts(page)
    const panel = await openConversation(page)
    const box = panel.locator('textarea')
    const send = panel.getByRole('button', { name: 'Send' })

    // Dropped on the chat panel: attached to what she is writing, and refused at once, before anything is sent.
    await dropFiles(panel.locator('.chat-pane__messages'), [
      { name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(200)) },
    ])
    const huge = panel.locator('.chat-chip').filter({ hasText: 'huge.txt' })
    await expect(huge).toHaveClass(/is-failed/)
    await expect(panel.locator('.chat-chips__error')).toHaveText(
      '“huge.txt” was not uploaded: Too large to upload: it is 200 B, and a file can be at most 64 B.',
    )
    await expect(huge.getByRole('button', { name: 'Upload “huge.txt” again' })).toHaveCount(0)
    await box.fill(`Here is a big file (${STAMP})`)
    await expect(send).toBeDisabled()
    await expect(panel.locator('.chat-composer__file-line')).toHaveText(
      'A file is too large to send: remove it to send the rest.',
    )
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-too-large')
    expect(puts).toEqual([])
    await huge.getByRole('button', { name: 'Remove “huge.txt”' }).click()
    await expect(panel.locator('.chat-chip')).toHaveCount(0)
    await expect(send).toBeEnabled()

    // A small one, held on its way: Send waits for it.
    await dropFiles(panel.locator('.chat-pane__messages'), [
      { name: 'small.csv', mimeType: 'text/csv', buffer: Buffer.from('n,fact\n3,6\n') },
    ])
    const small = panel.locator('.chat-chip').filter({ hasText: 'small.csv' })
    await expect(small).toHaveClass(/is-uploading/)
    await expect(send).toBeDisabled()
    await expect(panel.locator('.chat-composer__file-line')).toHaveText('Waiting for the files to upload…')
    await expect.poll(() => release !== null).toBe(true)
    ;(release as (() => void) | null)?.()
    await expect(small).toHaveClass(/is-done/)
    await expect(send).toBeEnabled()
    expect(puts).toHaveLength(1)
  })

  test('on a phone, the paperclip is there and the chips stay within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, demo().actors.yuki)
    await page.goto(coursePath())
    await page
      .locator('.app-chat-fab')
      .getByRole('button', { name: /^Chat with agents/ })
      .click()
    const panel = panelOf(page)
    await expect(panel).toBeVisible()
    await showConversation(panel)
    await attachWithPaperclip(page, panel, [
      {
        name: `a-rather-long-name-for-a-file-of-notes-${STAMP}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from('n\n'),
      },
      { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('m\n') },
    ])
    await expect(panel.locator('.chat-chip.is-done')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    for (const chip of await panel.locator('.chat-chip').all()) {
      const b = (await chip.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
    await photograph(page, 'chat-attach-phone')
  })
})
