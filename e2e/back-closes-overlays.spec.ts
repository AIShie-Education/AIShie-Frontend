/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  chatWindow,
  coursePath,
  demo,
  hostOnRuntime,
  openChat,
  signIn,
  type CoreReply,
  type FileSpec,
} from './support'

// On a phone, back (the gesture, or Android's button) closes what is laid
// over the page instead of leaving it: the file viewer, the chat's sheet, the
// menu, the top one first where one is open over another. Closed by its own
// button, an overlay goes back over the entry it added, so that back from
// there leaves the page, as it would have before it opened; a link followed
// from the menu takes the menu's place in history; and a page reloaded with
// an overlay open leaves none behind. On a wider screen the chat is a window
// that stays open from page to page, and back moves between them.

const tag = Date.now().toString(36)

/** The page's own entry is the one shown: no overlay's is left above it. */
async function atPagesOwnEntry(page: Page) {
  await expect
    .poll(() => page.evaluate(() => !(history.state as { aishieOverlay?: unknown } | null)?.aishieOverlay))
    .toBe(true)
}

/** Two pages, the second one shown: back from it, with nothing open, leads to the first. */
async function twoPages(page: Page, first: string, second: string) {
  await page.goto(first)
  await expect(page.locator('.app-header')).toBeVisible()
  await page.goto(second)
  await expect(page.locator('.app-header')).toBeVisible()
}

function syllabusPath() {
  return coursePath(`documents/${demo().course.documents.syllabus}`)
}

async function openSyllabus(page: Page) {
  await page.locator('.version-file[data-file="syllabus.txt"] .version-file__open').click()
  const viewer = page.getByRole('dialog', { name: 'syllabus.txt' })
  await expect(viewer).toBeVisible()
  return viewer
}

function menuButton(page: Page) {
  return page.getByRole('button', { name: 'Menu', exact: true })
}

test.describe('on a phone, back', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('closes the file viewer, and the viewer closed by its button leaves back to the page before', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await twoPages(page, coursePath(), syllabusPath())
    const url = page.url()

    const viewer = await openSyllabus(page)
    await page.goBack()
    await expect(viewer).toBeHidden()
    expect(page.url()).toBe(url)
    await expect(page.locator('.version-file[data-file="syllabus.txt"]')).toBeVisible()

    await openSyllabus(page)
    await viewer.getByRole('button', { name: 'Close the preview' }).click()
    await expect(viewer).toBeHidden()
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
  })

  test('closes the chat’s sheet, keeping what it showed, and the sheet closed by its button leaves back to the page before', async ({
    page,
  }) => {
    await signIn(page, demo().actors.yuki)
    await twoPages(page, '/', coursePath())
    const url = page.url()

    await chatButton(page).click()
    await expect(chatWindow(page)).toBeVisible()
    await page.goBack()
    await expect(chatWindow(page)).toHaveCount(0)
    await expect(chatButton(page)).toBeVisible()
    expect(page.url()).toBe(url)

    const panel = await openChat(page)
    await panel.getByRole('button', { name: 'Close the chat' }).click()
    await expect(chatWindow(page)).toHaveCount(0)
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test('closes the menu; a link followed from it takes its place in history; closed with Escape, back leaves the page', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await twoPages(page, '/', coursePath())
    const url = page.url()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    // Scrolled down the course's page, which stays where it was under the menu.
    await expect(page.locator('.course-head')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 120))
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled).toBeGreaterThan(0)

    await menuButton(page).click()
    await expect(menu).toBeVisible()
    await page.goBack()
    await expect(menu).toBeHidden()
    expect(page.url()).toBe(url)
    await atPagesOwnEntry(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)

    // A link in it: the page it leads to comes after the course's, with no entry of the menu's between them.
    await menuButton(page).click()
    await menu.getByRole('tab', { name: 'Agents' }).click()
    await menu.getByRole('link', { name: 'My agents' }).click()
    await expect(page).toHaveURL(/\/account\/agents$/)
    await expect(menu).toBeHidden()
    await page.goBack()
    await expect(page).toHaveURL(url)
    await expect(page.locator('.course-head')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/account\/agents$/)
    await page.goBack()
    await expect(page).toHaveURL(url)

    await menuButton(page).click()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test('with the viewer open over the chat, closes the viewer, then the chat, then leaves the page', async ({
    page,
  }) => {
    const d = demo()
    const I = d.actors.instructor.token
    const Y = d.actors.yuki.token
    const C = `/v1/courses/${d.course.id}`
    // A course agent of this run's, which Yuki asks with her notes attached.
    const name = `Back tutor ${tag}`
    const agent = (await done(I, '/v1/me/agents', { display_name: name, hosting: 'runtime' })).actor_id as string
    try {
      await done(I, `${C}/delegates`, { actor_id: agent, preset: 'course_tutor', answers_course: true })
      await hostOnRuntime(agent)
      const respondents = await call(Y, 'GET', `${C}/conversations/respondents`)
      const tutor = (respondents.body.result.respondents as { member_id: string; display_name: string }[]).find(
        (r) => r.display_name === name,
      )!
      const notes: FileSpec = {
        name: `back-notes-${tag}.md`,
        mimeType: 'text/markdown',
        buffer: Buffer.from(`# Notes\n\nA **stack** unwinds from the top (${tag}).\n`),
      }
      const url = await call(
        Y,
        'GET',
        `${C}/conversations/upload-url?content_type=${encodeURIComponent(notes.mimeType)}`,
      )
      expect(url.body.status, JSON.stringify(url.body.error)).toBe('executed')
      const title = `Stacks (${tag})`
      await done(Y, `${C}/conversations`, {
        respondent_member_id: tutor.member_id,
        title,
        body: `${title}\nAre my notes right?`,
        attachments: [{ upload_token: await put(url.body, notes), filename: notes.name }],
      })

      await signIn(page, d.actors.yuki)
      await twoPages(page, '/', coursePath())
      const course = page.url()
      const panel = await openChat(page)
      const history = panel.getByRole('button', { name: 'History', exact: true })
      const row = panel.locator('.hist-row').filter({ hasText: title })
      await expect(async () => {
        if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
        await expect(row).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 30_000 })
      await row.click()
      const card = panel.locator('.msg-file').filter({ hasText: notes.name })
      await card.getByRole('button', { name: new RegExp(`^Preview “${notes.name}”`) }).click()
      const viewer = page.getByRole('dialog', { name: notes.name })
      await expect(viewer).toBeVisible()

      await page.goBack()
      await expect(viewer).toBeHidden()
      await expect(card).toBeVisible()
      expect(page.url()).toBe(course)

      await page.goBack()
      await expect(chatWindow(page)).toHaveCount(0)
      expect(page.url()).toBe(course)

      await page.goBack()
      await expect(page).toHaveURL(/\/$/)
    } finally {
      // A person may have five agents at once: this run's is suspended, for the specs after it.
      await call(I, 'POST', `/v1/me/agents/${agent}/suspend`, {})
    }
  })

  test('a page reloaded with the viewer open leaves no entry of it: back leaves the page', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await twoPages(page, coursePath(), syllabusPath())
    const viewer = await openSyllabus(page)
    await page.reload()
    await expect(page.locator('.version-file[data-file="syllabus.txt"]')).toBeVisible()
    await expect(viewer).toBeHidden()
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
  })
})

test.describe('on a wider screen, back', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('closes the file viewer too, but moves between pages under the chat’s window, which stays open', async ({
    page,
  }) => {
    await signIn(page, demo().actors.yuki)
    await twoPages(page, '/', syllabusPath())
    const url = page.url()
    const viewer = await openSyllabus(page)
    await page.goBack()
    await expect(viewer).toBeHidden()
    expect(page.url()).toBe(url)

    await openChat(page)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(chatWindow(page)).toBeVisible()
    await chatWindow(page).locator('.chat-panel__minimize').click()
    await expect(chatWindow(page)).toHaveCount(0)
  })
})

/** A write through Core that must be carried out; its result. */
async function done(token: string, path: string, body: unknown) {
  const out = await call(token, 'POST', path, body)
  expect(out.body.status, JSON.stringify(out.body.error)).toBe('executed')
  return out.body.result
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
