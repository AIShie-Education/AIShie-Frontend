/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  dropFiles,
  hostARAgent,
  releaseARAgent,
  arList,
  arMessages,
  arAttachment,
  modelRules,
  photograph,
  signIn,
  type CoreReply,
  type ARMessage,
  type FileSpec,
} from './support'

test.skip(!process.env.E2E_RUNTIME_URL, 'AR chat requires scripts/ci-runtime.sh start')

// Files in the chat, with the real Core: Yuki, a student, asks a course
// agent made for this run with a NOTES attached (the paperclip), which uploads
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
const WITHDRAW_QUESTION = `Withdraw this pending notes question (${STAMP})`
const WITHDRAW_NOTES: FileSpec = {
  name: `withdraw-notes-${STAMP}.md`,
  mimeType: 'text/markdown',
  buffer: Buffer.from(`# Withdraw these notes ${STAMP}\n`),
}
const NOTES: FileSpec = {
  name: `recursion-notes-${STAMP}.md`,
  mimeType: 'text/markdown',
  buffer: Buffer.from(`# Recursion notes ${STAMP}\n\nfact(0) = 1\nfact(n) = n * fact(n - 1)\n`),
}

const w = { tutorId: '', hostedId: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** Reads this run's AR conversation, never a Core conversation with the same title. */
async function tutorReads(): Promise<ARMessage[]> {
  const d = demo()
  const conv = (await arList(d.actors.yuki, d.course.id)).find((c) => c.title === TITLE)
  expect(conv, `AR conversation ${TITLE}`).toBeTruthy()
  w.conversationId = conv!.id
  return (await arMessages(d.actors.yuki, d.course.id, conv!.id)).messages
}

/** The deterministic provider has already answered; this only waits for AR's stored message. */
async function tutorAnswers(body: string) {
  await expect.poll(async () => (await tutorReads()).some((m) => m.role === 'assistant' && m.body === body)).toBe(true)
}

/** The conversation is answered in AR; there is no Core unread flag to consult. */
async function yukiHasReadIt() {
  const d = demo()
  await expect
    .poll(async () => (await arList(d.actors.yuki, d.course.id)).find((c) => c.title === TITLE)?.state)
    .toBe('answered')
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
  const page = panel.page()
  const watched = watchAR429(
    page,
    (res) => res.request().method() === 'GET' && new URL(res.url()).pathname.endsWith('/conversations'),
  )
  try {
    const history = panel.getByRole('button', { name: 'History', exact: true })
    const row = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(async () => {
      if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
      const retry = panel.getByRole('button', { name: 'Retry', exact: true })
      if (await retry.isVisible()) await retryAR429(retry, watched)
      await expect(row).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 30_000 })
    await row.click()
    await expect(panel.locator('.chat-msg').first()).toBeVisible()
    return panel
  } finally {
    watched.stop()
  }
}

/** Opens the chat on this run's conversation. */
async function openConversation(page: Page) {
  return showConversation(await openChat(page))
}

/** The most recent AR 429 and its advertised retry time on this page. */
function watchAR429(page: Page, request?: (res: import('@playwright/test').Response) => boolean) {
  const state = { seen: false, retryAt: 0 }
  const listener = (res: import('@playwright/test').Response) => {
    if (res.status() !== 429 || (request && !request(res))) return
    const seconds = Number(res.headers()['retry-after'])
    if (!Number.isFinite(seconds) || seconds < 0) return
    state.seen = true
    state.retryAt = Date.now() + Math.ceil(seconds) * 1000
  }
  page.on('response', listener)
  return { state, stop: () => page.off('response', listener) }
}

/** Uses AR's Retry-After and the existing retry control, never a blind wait. */
async function retryAR429(button: Locator, watched: ReturnType<typeof watchAR429>) {
  expect(watched.state.seen, 'the failed AR request was rate-limited').toBe(true)
  await expect(button).toBeVisible()
  await button.page().waitForTimeout(Math.max(0, watched.state.retryAt - Date.now()))
  await button.click()
  // A later failure must carry a fresh 429, not reuse this one's observation.
  watched.state.seen = false
}

/** Chooses files with the paperclip, through the browser's own dialog. */
async function attachWithPaperclip(page: Page, panel: Locator, files: FileSpec[]) {
  const watched = watchAR429(
    page,
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/attachments'),
  )
  try {
    const chooser = page.waitForEvent('filechooser')
    await panel.getByRole('button', { name: 'Attach files' }).click()
    await (await chooser).setFiles(files)
    for (const file of files) {
      const chip = panel.locator('.chat-chip').filter({ hasText: file.name })
      for (let attempt = 0; ; attempt++) {
        await expect(chip).toHaveClass(/is-(?:done|failed)/)
        if (!(await chip.evaluate((el) => el.classList.contains('is-failed')))) break
        // Other AR traffic can consume a newly issued token too. A bounded
        // retry follows each fresh Retry-After rather than assuming one wait is enough.
        expect(attempt, `upload ${file.name} was still refused after advertised retries`).toBeLessThan(4)
        await retryAR429(chip.getByRole('button', { name: `Upload “${file.name}” again` }), watched)
      }
      await expect(chip).toHaveClass(/is-done/)
    }
  } finally {
    watched.stop()
  }
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

/** Raw attachment posts to AR. */
function attachmentPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/runtime\/api\/v1\/courses\/[^/]+\/attachments$/.test(new URL(r.url()).pathname)) {
      posts.push(r.url())
    }
  })
  return posts
}

test.describe.serial('files in the chat', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    // The instructor's course agent, hosted on AIshie and seated to answer the course; the test plays the runtime.
    const tutor = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    w.tutorId = tutor
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    // Hosted as the site's runtime hosts it: issued its one token, which answers as the agent.
    w.hostedId = (await hostARAgent(d.actors.instructor, tutor)).id
    modelRules([
      { match: QUESTION, answer: ANSWER },
      { match: PICTURE_QUESTION, answer: PICTURE_ANSWER },
    ])
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    await releaseARAgent(demo().actors.instructor, w.hostedId)
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test('a student asks with notes attached; the real AR Runner answers; she downloads the original bytes', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    const panel = await openChat(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const box = panel.locator('textarea')
    await expect(box).toBeVisible()

    // Chosen with the paperclip: it uploads at once, as a chip with its name and size.
    await attachWithPaperclip(page, panel, [NOTES])
    const chip = panel.locator('.chat-chip').filter({ hasText: NOTES.name })
    await expect(chip).toBeVisible()
    await expect(chip).toContainText(`${NOTES.buffer.length} B`)
    await expect(chip).toHaveClass(/is-done/)
    await expect(chip.getByRole('button', { name: `Remove “${NOTES.name}”` })).toBeVisible()
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
    const file = mine.locator('.msg-file').filter({ hasText: NOTES.name })
    await expect(file).toContainText(`Text · ${NOTES.buffer.length} B`)
    await expect(file.locator('.msg-file__icon.is-text')).toBeVisible()
    await expect(panel.locator('.chat-chip')).toHaveCount(0)

    // The agent's runtime, as the respondent: the question lists the file, and Core serves it.
    await tutorAnswers(ANSWER)
    const question = (await tutorReads()).find((m) => m.body?.includes(QUESTION))
    expect(question?.attachments?.map((a) => [a.filename, a.media_type, a.size])).toEqual([
      [NOTES.name, 'text/markdown', NOTES.buffer.length],
    ])
    const attachmentId = question!.attachments![0]!.id
    const bytes = await arAttachment(d.actors.yuki, d.course.id, attachmentId)
    expect(bytes.status).toBe(200)
    expect(Buffer.from(await bytes.arrayBuffer()).equals(NOTES.buffer)).toBe(true)

    await expect(panel.locator('.chat-msg').filter({ hasText: 'the recursive step needs' })).toBeVisible({
      timeout: 20_000,
    })
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-bubble')

    // She downloads it: saved under its name, as it was sent.
    const download = page.waitForEvent('download')
    await file.getByRole('button', { name: `Download “${NOTES.name}”` }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(NOTES.name)
    expect((await readFile((await saved.path())!)).equals(NOTES.buffer)).toBe(true)
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

  test('withdrawing a pending AR question hides its file and aborts generation', async ({ page }) => {
    const d = demo()
    modelRules([
      { match: QUESTION, answer: ANSWER },
      { match: PICTURE_QUESTION, answer: PICTURE_ANSWER },
      { match: WITHDRAW_QUESTION, answer: 'must not be published', delayMs: 60_000 },
    ])
    await signIn(page, d.actors.yuki)
    const panel = await openConversation(page)
    await attachWithPaperclip(page, panel, [WITHDRAW_NOTES])
    await expect(panel.locator('.chat-chip.is-done')).toHaveCount(1, { timeout: 30_000 })
    const box = panel.locator('textarea')
    await box.fill(WITHDRAW_QUESTION)
    await box.press('Enter')
    await expect.poll(async () => (await tutorReads()).some((m) => m.role === 'user' && m.body === WITHDRAW_QUESTION)).toBe(true)
    const pending = (await tutorReads()).filter((m) => m.role === 'user').at(-1)!
    expect(pending.body).toBe(WITHDRAW_QUESTION)
    const attachmentId = pending.attachments![0]!.id
    const mine = panel.locator('.chat-msg').filter({ hasText: WITHDRAW_QUESTION })
    await expect(mine.locator('.msg-file')).toHaveCount(1)

    const withdrawn = panel.locator('.chat-msg.is-retracted')
    const withdrawing = watchAR429(
      page,
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/withdraw'),
    )
    try {
      for (let attempt = 0; ; attempt++) {
        // Withdrawal replaces the pending row immediately; dispatch avoids a
        // Playwright actionability wait on that deliberately detached button.
        await panel.getByRole('button', { name: 'Stop', exact: true }).dispatchEvent('click')
        await expect.poll(async () => (await withdrawn.count()) > 0 || withdrawing.state.seen).toBe(true)
        if (await withdrawn.count()) break
        expect(attempt, 'withdraw was still refused after advertised retries').toBeLessThan(4)
        await retryAR429(panel.getByRole('button', { name: 'Stop', exact: true }), withdrawing)
      }
      await expect(withdrawn).toBeVisible()
    } finally {
      withdrawing.stop()
    }
    await expect(withdrawn.locator('.msg-file')).toHaveCount(0)
    await expect(panel.locator('.msg-file').filter({ hasText: WITHDRAW_NOTES.name })).toHaveCount(0)
    await expect(box).toHaveValue(WITHDRAW_QUESTION)

    const after = (await tutorReads()).find((m) => m.id === pending.id)!
    expect(after.status).toBe('retracted')
    // Canonical AR messages keep safe attachment metadata, but retract the body;
    // the UI hides the file and the byte route below must still refuse it.
    expect(after.body).toBe('')
    expect((await tutorReads()).some((m) => m.body === 'must not be published')).toBe(false)
    // AR's canonical GET still lets its owner download their own bytes; a
    // different actor must get the same not_found, withdrawn or not.
    const own = await arAttachment(d.actors.yuki, d.course.id, attachmentId)
    expect(own.status).toBe(200)
    const refused = await arAttachment(d.actors.ken, d.course.id, attachmentId)
    expect(refused.status).toBe(404)

    await page.reload()
    await expect(panel).toBeVisible()
    await showConversation(panel)
    await expect(panel.locator('.chat-msg.is-retracted')).toHaveCount(1)
    await expect(panel.locator('.msg-file').filter({ hasText: WITHDRAW_NOTES.name })).toHaveCount(0)
    await expect(panel.locator('.msg-file').filter({ hasText: 'image.png' })).toHaveCount(1)
  })

  test('a file over the limit is refused before it is sent, and nothing is sent while a file uploads', async ({
    page,
  }) => {
    await signIn(page, demo().actors.yuki)
    // AR's fixed text ceiling is 32 KiB; no server response is needed to refuse more.
    // One small upload is held on its way until the test lets it go.
    let release: (() => void) | null = null
    await page.route(/\/runtime\/api\/v1\/courses\/[^/]+\/attachments\?/, async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['content-type'] === 'text/csv') {
        await new Promise<void>((r) => (release = r))
      }
      return route.continue()
    })
    const posts = attachmentPosts(page)
    const panel = await openConversation(page)
    const box = panel.locator('textarea')
    const send = panel.getByRole('button', { name: 'Send' })

    // Dropped on the chat panel: attached to what she is writing, and refused at once, before anything is sent.
    await dropFiles(panel.locator('.chat-pane__messages'), [
      { name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(32 * 1024 + 1)) },
    ])
    const huge = panel.locator('.chat-chip').filter({ hasText: 'huge.txt' })
    await expect(huge).toHaveClass(/is-failed/)
    await expect(panel.locator('.chat-chips__error')).toHaveText(
      '“huge.txt” was not uploaded: Too large to upload: it is 32 KB, and a file can be at most 32 KB.',
    )
    await expect(huge.getByRole('button', { name: 'Upload “huge.txt” again' })).toHaveCount(0)
    await box.fill(`Here is a big file (${STAMP})`)
    await expect(send).toBeDisabled()
    await expect(panel.locator('.chat-composer__file-line')).toHaveText(
      'A file is too large to send: remove it to send the rest.',
    )
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-attach-too-large')
    expect(posts).toEqual([])
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
    expect(posts).toHaveLength(1)
  })

  test('on a phone, the paperclip is there and the chips stay within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, demo().actors.yuki)
    await page.goto(coursePath())
    await page
      .locator('.app-header .app-chat-entry')
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
