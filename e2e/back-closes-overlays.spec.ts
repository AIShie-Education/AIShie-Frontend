/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  chatWindow,
  coursePath,
  demo,
  hostOnRuntime,
  openChat,
  openCourseTab,
  signIn,
  signInAsRoot,
  type CoreReply,
  type FileSpec,
} from './support'

// On a phone, back (the gesture, or Android's button) closes what is laid
// over the page instead of leaving it: the file viewer, the chat's sheet, the
// menu, an administrator's drawer, the top one first where one is open over
// another (a message box, or who can read a conversation, asked over the chat
// or an agent's conversation log first of all; in the log, the conversation
// open over its list, and a menu left open in it goes with it). Closed by its
// own button, an overlay goes back over the entry it added, so that back from
// there leaves the page, as it would have before it opened; a link followed
// from the menu takes the menu's place in history; a search the page writes
// to its address while the menu is open stays there once the menu closes; an
// overlay opened while the page a link leads to is still loading is closed by
// back all the same, and the page shown stays, while one closed otherwise
// lets that page land, and one still open when it lands comes after it in
// history; and a page reloaded with an overlay open leaves none behind. On a
// wider screen the chat is a window that stays open from page to page, and
// back moves between them.

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

/** Who can read the conversation shown in `pane`, and where it goes, asked from its ⋯ menu. */
async function openReaders(page: Page, pane: Locator) {
  await pane.getByRole('button', { name: 'Conversation options' }).click()
  await page.locator('.chat-pane__menu:visible').getByRole('menuitem', { name: 'Who can read this' }).click()
  // With an agent, the notice also says where the conversation goes (chat.privacy.title).
  const readers = page.getByRole('dialog', { name: /^(Who can read this conversation|Who reads this, and where it goes)$/ })
  await expect(readers).toBeVisible()
  return readers
}

function menuButton(page: Page) {
  return page.getByRole('button', { name: 'Menu', exact: true })
}

/**
 * Holds back the code of a view (`MembersView`), as a slow connection does on
 * a first visit: a link to its page is on its way until `release` lets the
 * code through, and resolves once it has come.
 */
async function holdCode(page: Page, view: string) {
  const isIt = (url: URL) => new RegExp(`/${view}[.-]`).test(url.pathname)
  let asked!: () => void
  const requested = new Promise<void>((resolve) => (asked = resolve))
  let open!: () => void
  const released = new Promise<void>((resolve) => (open = resolve))
  await page.route(isIt, async (route) => {
    asked()
    await released
    await route.continue()
  })
  const release = async () => {
    const arrived = page.waitForResponse((res) => isIt(new URL(res.url())))
    open()
    await arrived
  }
  return { requested, release }
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

  test('closes the menu opened while the page a link leads to is still loading, and the page shown stays; closed with Escape, that page lands', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await twoPages(page, '/', coursePath())
    const url = page.url()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    const members = await holdCode(page, 'MembersView')

    // Members tapped, nothing seems to happen, and the menu is opened meanwhile.
    await openCourseTab(page, 'Members')
    await members.requested
    await menuButton(page).click()
    await expect(menu).toBeVisible()
    await page.goBack()
    await expect(menu).toBeHidden()
    expect(page.url()).toBe(url)
    await atPagesOwnEntry(page)
    await expect(page.locator('.course-head')).toBeVisible()
    // Back dropped the page on its way: its code come, it does not land.
    await members.release()
    await page.waitForTimeout(500)
    expect(page.url()).toBe(url)

    // Closed with Escape instead, the menu lets the page land, after the course's.
    const activity = await holdCode(page, 'ActivityView')
    await openCourseTab(page, 'Activity')
    await activity.requested
    await menuButton(page).click()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await activity.release()
    await expect(page).toHaveURL(new RegExp(`${coursePath('activity')}$`))
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(url)
    // Back from the course leaves it, as it would have before the menu opened.
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test('leaves the menu open as the page writes a search to its address, which stays there once the menu closes with Escape or back', async ({
    page,
  }) => {
    await signInAsRoot(page)
    await twoPages(page, '/', '/admin/actors')
    const menu = page.getByRole('dialog', { name: 'Menu' })
    const expanded = page.locator('.app-header__menu')
    const search = page.locator('.actors__search input')
    await expect(search).toBeVisible()

    // Typed, and the menu opened at once: 300 ms after typing stops the search reaches the address, under the menu.
    await search.fill('root')
    await menuButton(page).dispatchEvent('click')
    await expect(menu).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/actors\?q=root$/)
    await expect(expanded).toHaveAttribute('aria-expanded', 'true')
    await expect(search).toHaveValue('root')
    // Closed with Escape, it goes back over its entry, and the page keeps its address.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await atPagesOwnEntry(page)
    await expect(page).toHaveURL(/\/admin\/actors\?q=root$/)
    await expect(search).toHaveValue('root')
    await expect(page.locator('.actors__search')).toBeVisible()

    // Closed with back: the same.
    await search.fill('ro')
    await menuButton(page).dispatchEvent('click')
    await expect(menu).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/actors\?q=ro$/)
    await expect(expanded).toHaveAttribute('aria-expanded', 'true')
    await page.goBack()
    await expect(menu).toBeHidden()
    await atPagesOwnEntry(page)
    await expect(page).toHaveURL(/\/admin\/actors\?q=ro$/)
    await expect(search).toHaveValue('ro')

    // Back from the page leaves it, as it would have before the menu opened.
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test('with About open over the menu, closes About, then the menu, then leaves the page', async ({ page }) => {
    await signIn(page, demo().actors.yuki)
    await twoPages(page, '/', coursePath())
    const url = page.url()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    const about = page.locator('.about-dialog')

    await menuButton(page).click()
    await expect(menu).toBeVisible()
    await menu.locator('#account-button-drawer').click()
    await menu.locator('#account-menu-drawer').getByRole('menuitem', { name: 'About AIshie' }).click()
    await expect(about).toBeVisible()
    await page.goBack()
    await expect(about).toBeHidden()
    await expect(menu).toBeVisible()
    expect(page.url()).toBe(url)
    await page.goBack()
    await expect(menu).toBeHidden()
    expect(page.url()).toBe(url)
    await atPagesOwnEntry(page)

    // Closed by its own button, it goes back over its entry: back closes the menu under it.
    await menuButton(page).click()
    await menu.locator('#account-button-drawer').click()
    await menu.locator('#account-menu-drawer').getByRole('menuitem', { name: 'About AIshie' }).click()
    await expect(about).toBeVisible()
    await about.getByRole('button', { name: 'Close this dialog' }).click()
    await expect(about).toBeHidden()
    await expect(menu).toBeVisible()
    await page.goBack()
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

      // A message box asked over the chat is on top of it: back dismisses the box alone.
      const mine = panel.locator('.chat-msg').filter({ hasText: 'Are my notes right?' })
      await mine.hover()
      await mine.getByRole('button', { name: 'Withdraw' }).click()
      const box = page.getByRole('dialog', { name: 'Withdraw this message?' })
      await expect(box).toBeVisible()
      await page.goBack()
      await expect(box).toBeHidden()
      await expect(card).toBeVisible()
      expect(page.url()).toBe(course)

      // So is who can read the conversation, asked from its ⋯ menu: back closes that alone too.
      const readers = await openReaders(page, panel)
      await page.goBack()
      await expect(readers).toBeHidden()
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

  test('with who can read a conversation open over an agent’s conversation log, closes that, then the conversation, then the log, then leaves the page', async ({
    page,
  }) => {
    const d = demo()
    const I = d.actors.instructor.token
    const Y = d.actors.yuki.token
    const C = `/v1/courses/${d.course.id}`
    const name = `Log tutor ${tag}`
    const agent = (await done(I, '/v1/me/agents', { display_name: name, hosting: 'runtime' })).actor_id as string
    try {
      await done(I, `${C}/delegates`, { actor_id: agent, preset: 'course_tutor', answers_course: true })
      await hostOnRuntime(agent)
      const respondents = await call(Y, 'GET', `${C}/conversations/respondents`)
      const tutor = (respondents.body.result.respondents as { member_id: string; display_name: string }[]).find(
        (r) => r.display_name === name,
      )!
      const title = `Queues (${tag})`
      await done(Y, `${C}/conversations`, {
        respondent_member_id: tutor.member_id,
        title,
        body: `${title}\nWhich end comes out first?`,
      })

      await signIn(page, d.actors.instructor)
      await twoPages(page, '/', coursePath('agents'))
      const agents = page.url()
      const log = page.locator('.agent-log')
      const openLog = () =>
        page.locator('.agent-row').filter({ hasText: name }).getByRole('button', { name: 'Conversation log' }).click()
      const row = log.locator('.log-row').filter({ hasText: title })
      const message = log.locator('.chat-msg').filter({ hasText: 'Which end comes out first?' })
      await openLog()
      await expect(log.getByText(`Conversation log: ${name}`)).toBeVisible()
      await row.click()
      await expect(message).toBeVisible()

      const readers = await openReaders(page, log)
      await page.goBack()
      await expect(readers).toBeHidden()
      await expect(message).toBeVisible()
      expect(page.url()).toBe(agents)

      // Back from the conversation: the log's list, as the log's own Back button leads to, the log still open.
      await page.goBack()
      await expect(row).toBeVisible()
      await expect(message).toHaveCount(0)
      await expect(log.getByText(`Conversation log: ${name}`)).toBeVisible()
      expect(page.url()).toBe(agents)

      // Back again closes the log.
      await page.goBack()
      await expect(log).toBeHidden()
      await atPagesOwnEntry(page)
      expect(page.url()).toBe(agents)
      // Closed with the log, it does not come back over the page.
      await expect(readers).toBeHidden()

      // Opened on the conversation and closed by its own button: neither leaves an entry.
      await openLog()
      await row.click()
      await expect(message).toBeVisible()
      await log.locator('.el-drawer__close-btn').click()
      await expect(log).toBeHidden()
      await atPagesOwnEntry(page)

      // Opened again, on the conversation still, with its ⋯ menu open: back takes the menu with the conversation, to the list.
      await openLog()
      await expect(message).toBeVisible()
      await log.getByRole('button', { name: 'Conversation options' }).click()
      const menu = page.locator('.chat-pane__menu:visible')
      await expect(menu.getByRole('menuitem', { name: 'Who can read this' })).toBeVisible()
      await page.goBack()
      await expect(row).toBeVisible()
      await expect(menu).toHaveCount(0)
      expect(page.url()).toBe(agents)
      await page.goBack()
      await expect(log).toBeHidden()
      await atPagesOwnEntry(page)
      expect(page.url()).toBe(agents)

      await page.goBack()
      await expect(page).toHaveURL(/\/$/)
    } finally {
      await call(I, 'POST', `/v1/me/agents/${agent}/suspend`, {})
    }
  })

  test('closes an administrator’s drawer, which fills a phone’s screen', async ({ page }) => {
    await signInAsRoot(page)
    await twoPages(page, '/', '/admin/presets')
    const url = page.url()
    await page.getByRole('button', { name: 'Details' }).first().click()
    const drawer = page.locator('.preset-drawer')
    await expect(drawer).toBeVisible()
    await page.goBack()
    await expect(drawer).toBeHidden()
    expect(page.url()).toBe(url)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
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

  test('closes the file viewer opened while the page a link leads to is still loading, and the page shown stays; left open, the viewer comes after that page as it lands', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await twoPages(page, coursePath(), syllabusPath())
    const url = page.url()
    const members = await holdCode(page, 'MembersView')

    await openCourseTab(page, 'Members')
    await members.requested
    const viewer = await openSyllabus(page)
    await page.goBack()
    await expect(viewer).toBeHidden()
    expect(page.url()).toBe(url)
    await atPagesOwnEntry(page)
    await expect(page.locator('.version-file[data-file="syllabus.txt"]')).toBeVisible()
    await members.release()
    await page.waitForTimeout(500)
    expect(page.url()).toBe(url)

    // Left open, the viewer stays over the page that lands, with its entry after that page's.
    const activity = await holdCode(page, 'ActivityView')
    await openCourseTab(page, 'Activity')
    await activity.requested
    await openSyllabus(page)
    await activity.release()
    await expect(page).toHaveURL(new RegExp(`${coursePath('activity')}$`))
    await expect(viewer).toBeVisible()
    await page.goBack()
    await expect(viewer).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`${coursePath('activity')}$`))
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(url)
    // Forward reaches the page that landed.
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`${coursePath('activity')}$`))
    await atPagesOwnEntry(page)
    await page.goBack()
    await expect(page).toHaveURL(url)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
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
