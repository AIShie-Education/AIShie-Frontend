/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  courseTab,
  coursePath,
  demo,
  floatingChatButton,
  photograph,
  rail,
  showSideView,
  signIn,
  signInAsRoot,
  type CoreReply,
} from './support'

// The chat is a panel beside every page, docked on the right as an editor's
// side panel is, 380 px wide and never resized, opened from its button on the
// rail along the window's right edge (never from the header); in a window
// narrower than 1200 px it floats over the page against the rail instead; and
// on a phone it is a sheet over the whole screen, opened from a button
// floating at the bottom right. Told through a course
// agent made for this run, which its runtime says answers in the site, and
// Yuki, a student, who asks it. The panel stays open, on what it shows, while
// she moves between pages, and after a reload; an answer that comes
// while it is closed is counted on its button. What she has read is Core's
// (conversation.mark_read), so the count follows her from browser to browser.

const STAMP = Date.now().toString(36)
const TUTOR = `Panel tutor ${STAMP}`
const TITLE = `Loops (${STAMP})`
const QUESTION = `How do I stop a while loop? (${STAMP})`
const ANSWER = `Use **break**, or make its condition false (${STAMP}).`
const LATER = `And a for loop? (${STAMP})`
const LATER_ANSWER = `The same: break leaves it (${STAMP}).`
const ELSEWHERE = `And a do-while loop? (${STAMP})`
const ELSEWHERE_ANSWER = `It runs once before the test (${STAMP}).`

const w = { tutorToken: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
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
  done(
    await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${conv!.id}/answer`, {
      in_reply_to_message_id: conv!.latest_opener_message_id,
      body,
    }),
    'conversation.answer',
  )
}

/** Yuki's conversation of this run, as Core lists it for her (me.conversations). */
async function yukisConversation() {
  const r = await call(demo().actors.yuki.token, 'GET', `/v1/me/conversations?course_id=${demo().course.id}`)
  const c = (r.body.result?.conversations ?? []).find((x: { title?: string }) => x.title === TITLE)
  expect(c, `Yuki's conversation "${TITLE}": ${JSON.stringify(r.body)}`).toBeTruthy()
  return c as { conversation_id: string; unread: boolean }
}

function panelOf(page: Page) {
  return page.locator('#chat-panel')
}

/** The window's width and height, less any scroll bar. */
function inner(page: Page) {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }))
}

/**
 * The rail runs along the window's right edge, from under the 56 px header
 * to the bottom, a toolbar about 48 px wide; the header has no chat button.
 */
async function expectRail(page: Page, what: string) {
  const r = rail(page)
  await expect(r, what).toBeVisible()
  await expect(r).toHaveAttribute('aria-orientation', 'vertical')
  const box = (await r.boundingBox())!
  const win = await inner(page)
  expect(Math.round(box.x + box.width), `${what}: the rail's right edge`).toBe(win.width)
  expect(Math.round(box.y), `${what}: the rail's top`).toBe(56)
  expect(Math.round(box.y + box.height), `${what}: the rail's bottom`).toBe(win.height)
  expect(box.width, `${what}: the rail's width`).toBeGreaterThanOrEqual(44)
  expect(box.width, `${what}: the rail's width`).toBeLessThanOrEqual(48)
  await expect(page.locator('.app-header [aria-controls="chat-panel"]'), what).toHaveCount(0)
  await expect(page.locator('.app-header').getByRole('button', { name: /chat/i }), what).toHaveCount(0)
}

/** Open, the panel is docked between the page and the rail, and nothing scrolls sideways. */
async function expectDocked(page: Page, width?: number) {
  const box = (await panelOf(page).boundingBox())!
  const bar = (await rail(page).boundingBox())!
  expect(Math.round(box.x + box.width)).toBe(Math.round(bar.x))
  if (width !== undefined) expect(Math.round(box.width)).toBe(width)
  const main = (await page.locator('.app-main').boundingBox())!
  expect(main.x + main.width).toBeLessThanOrEqual(box.x + 1)
  const win = await inner(page)
  expect(win.scrollWidth).toBeLessThanOrEqual(win.width)
}

test.describe.serial('the chat panel', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    // The instructor's course agent, seated to answer the course, and what runs it, which answers in the site.
    const tutor = done(await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR }), 'agent.create').actor_id
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    w.tutorToken = done(
      await call(I, 'POST', `/v1/me/agents/${tutor}/tokens`, { label: `panel runtime ${STAMP}` }),
      'agent.issue_token',
    ).token
    done(await call(w.tutorToken, 'POST', '/v1/me/site-chat', { on: true }), 'me.site_chat')
  })

  test('is opened from the rail on every signed-in page, and never from the header', async ({ page, browser }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    const pages = [
      ['/', 'home'],
      [coursePath(), 'the course overview'],
      [coursePath('materials'), 'materials'],
      [coursePath('assignments'), 'assignments'],
      [coursePath(`assignments/${d.course.assignments.hw1}`), 'an assignment'],
      [coursePath('submissions'), 'submissions'],
      [coursePath('grades'), 'grades'],
      [coursePath('members'), 'members'],
      [coursePath('approvals'), 'approvals'],
      [coursePath('activity'), 'activity'],
      [coursePath('agents'), 'the course’s agents'],
      ['/account', 'the account'],
      ['/account/agents', 'my agents'],
    ] as const
    for (const [path, what] of pages) {
      await page.goto(path)
      await expect(page.locator('.app-main').first()).toBeVisible()
      await expectRail(page, what)
      const button = chatButton(page)
      await expect(button, what).toHaveAttribute('aria-expanded', 'false')
      await button.click()
      await expect(panelOf(page), what).toBeVisible()
      await expect(button, what).toHaveAttribute('aria-expanded', 'true')
      await expectDocked(page)
      // The rail stays where it was, with the panel open.
      await expectRail(page, `${what}, with the panel open`)
      if (path === '/') {
        await page.mouse.move(0, 400)
        await photograph(page, 'chat-rail-open')
        await page.locator('html').evaluate((h) => h.classList.add('dark'))
        await photograph(page, 'chat-rail-open-dark')
        await page.locator('html').evaluate((h) => h.classList.remove('dark'))
      }
      await button.click()
      await expect(panelOf(page), what).toHaveCount(0)
      await expect(button, what).toHaveAttribute('aria-expanded', 'false')
      if (path === '/') {
        await page.mouse.move(0, 400)
        await photograph(page, 'chat-rail-closed')
      }
    }

    // From the keyboard: its button is reached with Tab, and says its shortcut.
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    const button = chatButton(page)
    await button.focus()
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+J Meta+J')
    await page.keyboard.press('Enter')
    await expect(panelOf(page)).toBeVisible()
    await panelOf(page).getByRole('button', { name: 'Close the chat' }).click()
    await expect(panelOf(page)).toHaveCount(0)
    await expect(button).toBeFocused()
    await button.hover()
    await expect(
      page.locator('.el-popper:visible').filter({ hasText: /^Chat with agents \((Ctrl\+J|⌘J)\)$/ }),
    ).toBeVisible()

    // The administration pages have it too, for root.
    const admin = await browser.newPage()
    await signInAsRoot(admin)
    for (const [path, what] of [
      ['/admin/courses', 'the courses’ administration'],
      ['/admin/actors', 'people'],
      ['/admin/departments', 'departments'],
    ] as const) {
      await admin.goto(path)
      await expect(admin.locator('.page-header').first()).toBeVisible()
      await expectRail(admin, what)
    }
    await admin.close()
  })

  test('opens beside the page, and stays open, on the same conversation, from page to page', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await expect(panelOf(page)).toHaveCount(0)
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'false')
    await chatButton(page).click()
    const panel = panelOf(page)
    await expect(panel).toBeVisible()
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'true')

    // Docked on the right, beside the rail, 380 px wide: the page is beside it, not under it.
    await expectDocked(page, 380)

    // On a course page it asks in that course, and offers its agents.
    await expect(panel.locator('.chat-panel__course')).toContainText('CS101')
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Course agent')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-agents')
    await row.click()
    await panel.getByPlaceholder('Title (optional)').fill(TITLE)
    const composer = panel.locator('textarea')
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(panel.locator('.chat-pane__typing')).toContainText(`Waiting for ${TUTOR}`)
    await expect(panel.locator('.chat-pane__name')).toContainText(`CS101 · ${TUTOR}`)

    await tutorAnswers(ANSWER)
    await expect(panel.locator('.chat-msg').filter({ hasText: 'make its condition false' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(panel.locator('.chat-msg strong').filter({ hasText: 'break' })).toBeVisible()
    await photograph(page, 'chat-panel-conversation')

    // Moving around the course, and out of it: the panel stays, on the conversation.
    await courseTab(page, 'Materials').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('materials')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await courseTab(page, 'Assignments').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('assignments')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await (await showSideView(page, 'Courses')).getByRole('link', { name: 'My courses' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(panel).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Its history: the conversation, named by course and agent, with its title and where it stands.
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toContainText(`CS101 · ${TUTOR}`)
    await expect(item).toContainText('Answered')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-history')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Nothing resizes it: no edge to drag, and nothing to take the keys that once did. Open, and as wide, after a reload.
    await expect(panel.getByRole('separator')).toHaveCount(0)
    await expect(page.locator('.chat-panel__handle')).toHaveCount(0)
    await page.reload()
    await expect(panelOf(page)).toBeVisible()
    await expectDocked(page, 380)

    // Ctrl+J closes it, and opens it again.
    await page.locator('.app-main').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toBeVisible()
  })

  test('floats over the page, against the rail and with a shadow, in a window narrower than 1200 px', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    for (const width of [1100, 960]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(coursePath())
      await expect(page.locator('.course-head')).toBeVisible()
      const before = (await page.locator('.app-main').boundingBox())!
      await chatButton(page).click()
      const panel = panelOf(page)
      await expect(panel).toBeVisible()
      await expect(panel).toHaveClass(/is-floating/)
      const box = (await panel.boundingBox())!
      const bar = (await rail(page).boundingBox())!
      // Against the rail, from under the header to the bottom, 380 px wide.
      expect(Math.round(box.x + box.width), `${width}: the panel's right edge`).toBe(Math.round(bar.x))
      expect(Math.round(box.width)).toBe(380)
      expect(Math.round(box.y)).toBe(56)
      expect(Math.round(box.y + box.height)).toBe(800)
      // Over the page, which keeps its width and goes on under the panel.
      const after = (await page.locator('.app-main').boundingBox())!
      expect(Math.round(after.width)).toBe(Math.round(before.width))
      expect(after.x + after.width).toBeGreaterThan(box.x + 1)
      const look = await panel.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { position: cs.position, shadow: cs.boxShadow }
      })
      expect(look.position).toBe('fixed')
      expect(look.shadow).not.toBe('none')
      await expect(panel.getByRole('separator')).toHaveCount(0)
      const win = await inner(page)
      expect(win.scrollWidth).toBeLessThanOrEqual(win.width)
      await expectRail(page, `${width} px, with the panel open`)
      if (width === 1100) {
        await page.mouse.move(0, 400)
        await photograph(page, 'chat-panel-floating')
      }
      await chatButton(page).click()
      await expect(panelOf(page)).toHaveCount(0)
    }
    // At 1200 px it is docked again, and the page gives it its width.
    await page.setViewportSize({ width: 1200, height: 800 })
    await chatButton(page).click()
    await expect(panelOf(page)).not.toHaveClass(/is-floating/)
    await expectDocked(page, 380)
    await chatButton(page).click()
  })

  test('counts an answer that came while it was closed on its button, until it is read', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await chatButton(page).click()
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
    const composer = panel.locator('textarea')
    await composer.fill(LATER)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: LATER })).toBeVisible()
    await panel.getByRole('button', { name: 'Close the chat' }).click()
    await expect(panelOf(page)).toHaveCount(0)

    await tutorAnswers(LATER_ANSWER)
    // It is looked for from any page, and after a reload too.
    await page.reload()
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents: 1 unread', { timeout: 40_000 })
    await expect(rail(page).locator('.el-badge__content')).toHaveText('1')

    await chatButton(page).click()
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toHaveClass(/is-unread/)
    await expect(item).toContainText('New answer')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: 'break leaves it' })).toBeVisible()
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents')
    await expect(rail(page).locator('.el-badge__content')).toBeHidden()
    // Read in Core, not only in this browser: after a reload it is still read.
    await expect.poll(async () => (await yukisConversation()).unread).toBe(false)
    await page.reload()
    await expect(chatButton(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents')
  })

  test('counts an answer as unread in every browser she is signed in to, until she reads it in any of them', async ({
    browser,
  }) => {
    const d = demo()
    const here = await browser.newContext()
    const there = await browser.newContext()
    try {
      const a = await here.newPage()
      const b = await there.newPage()
      await signIn(a, d.actors.yuki)
      await signIn(b, d.actors.yuki)

      // She asks once more (as from a third device), and the course agent answers.
      const { conversation_id } = await yukisConversation()
      done(
        await call(d.actors.yuki.token, 'POST', `/v1/courses/${d.course.id}/conversations/${conversation_id}/ask`, {
          body: ELSEWHERE,
        }),
        'conversation.ask',
      )
      await tutorAnswers(ELSEWHERE_ANSWER)

      // Both browsers count it.
      for (const page of [a, b]) {
        await page.goto(coursePath())
        await expect(chatButton(page)).toHaveAccessibleName('Chat with agents: 1 unread', { timeout: 40_000 })
      }

      // She reads it in one.
      await chatButton(a).click()
      const panel = panelOf(a)
      await panel.getByRole('button', { name: 'History', exact: true }).click()
      const item = panel.locator('.hist-row').filter({ hasText: TITLE })
      await expect(item).toHaveClass(/is-unread/)
      await item.click()
      await expect(panel.locator('.chat-msg').filter({ hasText: 'runs once before the test' })).toBeVisible()
      await expect(chatButton(a)).toHaveAccessibleName('Chat with agents')
      await expect.poll(async () => (await yukisConversation()).unread).toBe(false)

      // The other, left as it was, stops counting it when it next asks (every 30 seconds)…
      await expect(chatButton(b)).toHaveAccessibleName('Chat with agents', { timeout: 45_000 })
      await expect(rail(b).locator('.el-badge__content')).toBeHidden()
      // …and its history, reloaded, marks it read.
      await b.reload()
      await chatButton(b).click()
      await panelOf(b).getByRole('button', { name: 'History', exact: true }).click()
      const row = panelOf(b).locator('.hist-row').filter({ hasText: TITLE })
      await expect(row).toBeVisible()
      await expect(row).not.toHaveClass(/is-unread/)
    } finally {
      await here.close()
      await there.close()
    }
  })

  test('shows the instructor what students asked the course agent, on the course’s agents page', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('agents'))
    const row = page.locator('.agent-row').filter({ hasText: TUTOR })
    await row.getByRole('button', { name: 'Conversation log' }).click()
    const log = page.locator('.agent-log')
    await expect(log.getByText(`Conversation log: ${TUTOR}`)).toBeVisible()
    const item = log.locator('.log-row').filter({ hasText: TITLE })
    await expect(item).toContainText('Yuki Tanaka')
    await item.click()
    await expect(log.locator('.chat-pane__name')).toHaveText(`Yuki Tanaka → ${TUTOR}`)
    await expect(log.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(log.getByText('You are reading this as course staff.')).toBeVisible()
    // Read-only, and a message may be withdrawn by whoever decides actions for the student.
    await expect(log.locator('textarea')).toHaveCount(0)
    await expect(log.getByRole('button', { name: 'Withdraw' }).first()).toBeVisible()
    await log.getByRole('button', { name: 'All its conversations' }).click()
    await expect(item).toBeVisible()
  })

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('is a sheet over the whole screen, opened from a floating button, which fits it and closes with its button', async ({
      page,
    }) => {
      const d = demo()
      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      // No rail, nor a chat button in the header: one floating at the bottom right.
      await expect(page.locator('.course-head')).toBeVisible()
      await expect(rail(page)).toHaveCount(0)
      await expect(page.locator('.app-header [aria-controls="chat-panel"]')).toHaveCount(0)
      const fab = floatingChatButton(page)
      await expect(fab).toBeVisible()
      const at = (await fab.boundingBox())!
      expect(Math.round(at.x + at.width)).toBe(390 - 16)
      expect(Math.round(at.y + at.height)).toBe(844 - 16)
      await photograph(page, 'chat-fab-phone')
      await fab.click()
      const panel = panelOf(page)
      await expect(panel).toBeVisible()
      // It gives way to the sheet.
      await expect(page.locator('.app-chat-fab')).toHaveCount(0)
      await expect(panel).toHaveAttribute('role', 'dialog')
      const box = (await panel.boundingBox())!
      expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, 390, 844])
      await expect(panel.getByRole('separator')).toHaveCount(0)

      await panel.getByRole('button', { name: 'History', exact: true }).click()
      await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
      await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
      // On a touch screen Enter is a new line, and the button sends.
      await expect(panel.locator('.chat-composer__hint')).toHaveText('Tap the button to send')
      await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
      const wide = await page.evaluate(() => {
        const el = document.querySelector('#chat-panel')!
        return { scroll: el.scrollWidth, client: el.clientWidth, page: document.documentElement.scrollWidth }
      })
      expect(wide.scroll).toBeLessThanOrEqual(wide.client)
      expect(wide.page).toBeLessThanOrEqual(390)
      await photograph(page, 'chat-panel-phone')

      await panel.getByRole('button', { name: 'Close the chat' }).click()
      await expect(panelOf(page)).toHaveCount(0)
      await expect(page.locator('.course-head')).toBeVisible()
      await expect(floatingChatButton(page)).toBeFocused()
    })

    test('its floating button stays under the side menu and its dimmed layer', async ({ page }) => {
      const d = demo()
      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      const fab = floatingChatButton(page)
      await expect(fab).toBeVisible()
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      const drawer = page.locator('.app-nav-drawer')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('link', { name: 'My courses' })).toBeVisible()
      // What is at the button's centre is the dimmed layer, not the button; and the button is lower.
      const under = await fab.evaluate((b) => {
        const r = b.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        const overlay = document.querySelector('.app-nav-drawer')!.closest('.el-overlay') as HTMLElement
        return {
          covered: !!top && !b.contains(top) && !!overlay?.contains(top),
          fab: Number(getComputedStyle(b.closest('.app-chat-fab')!).zIndex),
          overlay: Number(getComputedStyle(overlay).zIndex),
        }
      })
      expect(under.covered, 'the dimmed layer covers the floating button').toBe(true)
      expect(under.fab).toBeLessThan(under.overlay)
      await page.waitForTimeout(400)
      await photograph(page, 'chat-fab-under-menu')
      // The menu closes as a link in it is followed; the button is there again.
      await drawer.getByRole('link', { name: 'My courses' }).click()
      await expect(drawer).toBeHidden()
      await fab.click()
      await expect(panelOf(page)).toBeVisible()
    })

    test('its floating button never covers the last thing on a page', async ({ page }) => {
      const d = demo()
      await signIn(page, d.actors.instructor)
      for (const path of [
        '/',
        coursePath(),
        coursePath('materials'),
        coursePath('assignments'),
        coursePath('members'),
        coursePath('grades'),
        coursePath('activity'),
        '/account',
      ]) {
        await page.goto(path)
        await expect(page.locator('.page-header').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
        const fab = floatingChatButton(page)
        await expect(fab).toBeVisible()
        // Scrolled to the end, the lowest thing on the page ends above the button.
        const gap = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight)
          const main = document.querySelector('.app-main')!
          let lowest = 0
          for (const el of main.querySelectorAll('*')) {
            const r = el.getBoundingClientRect()
            if (r.width && r.height && getComputedStyle(el).position !== 'fixed') lowest = Math.max(lowest, r.bottom)
          }
          const button = document.querySelector('.app-chat-fab')!.getBoundingClientRect()
          return button.top - lowest
        })
        expect(gap, `${path}: room between the page's last item and the floating button`).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
