/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chatButton,
  courseTab,
  coursePath,
  demo,
  floatingChatButton,
  inTraditionalChinese,
  photograph,
  rail,
  showSideView,
  signIn,
  signInAsRoot,
  type CoreReply,
} from './support'

// The chat is a panel beside every page, docked on the right as an editor's
// side panel is, 380 px wide until its left edge is dragged, opened from its
// button on the rail along the window's right edge (never from the header);
// in a window narrower than 1200 px it floats over the page against the rail
// instead; and on a phone it is a sheet over the whole screen, opened from a
// button floating at the bottom right. Told through a course
// agent made for this run, which its runtime says answers in the site, and
// Yuki, a student, who asks it. The panel stays open, on what it shows, while
// she moves between pages, and as wide as she left it; an answer that comes
// while it is closed is counted on its button. What she has read is Core's
// (conversation.mark_read), so the count follows her from browser to browser.

const STAMP = Date.now().toString(36)
const TUTOR = `Panel tutor ${STAMP}`
/** The first line of Yuki's first message, which is the conversation's title. */
const TITLE = `Loops (${STAMP})`
const QUESTION = `How do I stop a while loop? (${STAMP})`
const ANSWER = `Use **break**, or make its condition false (${STAMP}).`
const LATER = `And a for loop? (${STAMP})`
const LATER_ANSWER = `The same: break leaves it (${STAMP}).`
const ELSEWHERE = `And a do-while loop? (${STAMP})`
const ELSEWHERE_ANSWER = `It runs once before the test (${STAMP}).`
/** The title of the conversation whose answers are timed. */
const LIVE = `Recursion (${STAMP})`

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

async function box_(l: ReturnType<Page['locator']>) {
  return (await l.boundingBox())!
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

/** Drags the panel's edge this far to the left (a negative distance, to the right), as a mouse does. */
async function dragEdge(page: Page, by: number) {
  const edge = (await panelOf(page).getByRole('separator', { name: 'Resize the chat panel' }).boundingBox())!
  const [x, y] = [edge.x + edge.width / 2, edge.y + edge.height / 2]
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - by, y, { steps: 12 })
  // While it moves: nothing on the page is selected, and the cursor is the edge's.
  const during = await page.evaluate(() => ({
    resizing: document.body.classList.contains('is-resizing-chat'),
    select: getComputedStyle(document.body).userSelect,
  }))
  await page.mouse.up()
  expect(during).toEqual({ resizing: true, select: 'none' })
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
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
    // No title to give: the first line of the first message is the conversation's.
    await expect(panel.locator('.chat-pane__foot input')).toHaveCount(0)
    const composer = panel.locator('textarea')
    await composer.fill(`${TITLE}\n${QUESTION}`)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    // The agent at work (something runs it): the working line, counting the seconds.
    await expect(panel.locator('.chat-pane__typing .chat-status')).toContainText('Thinking…')
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
    await expect(item.locator('.hist-row__title')).toHaveText(TITLE)
    await expect(item).toContainText('Answered')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-history')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Wider by its edge, from the keyboard, and dragged; the page gives it the width; as wide, and open, after a reload.
    const edge = panel.getByRole('separator', { name: 'Resize the chat panel' })
    await edge.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(edge).toHaveAttribute('aria-valuenow', '412')
    await expectDocked(page, 412)
    const pageBefore = (await page.locator('.app-main').boundingBox())!.width
    await dragEdge(page, 60)
    await expect(edge).toHaveAttribute('aria-valuenow', '472')
    await expectDocked(page, 472)
    expect(Math.round((await page.locator('.app-main').boundingBox())!.width)).toBe(Math.round(pageBefore - 60))
    await page.reload()
    await expect(panelOf(page)).toBeVisible()
    await expectDocked(page, 472)
    // A double click on its edge: 380 again.
    await panelOf(page).getByRole('separator').dblclick()
    await expectDocked(page, 380)

    // Ctrl+J closes it, and opens it again.
    await page.locator('.app-main').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toBeVisible()
  })

  test('shows an answer within a second of its agent writing it, from a read that waited for it, not a poll', async ({
    page,
  }) => {
    const d = demo()
    const c = d.course.id
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await chatButton(page).click()
    const panel = panelOf(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const composer = panel.locator('textarea')
    const measured: { fromPost: number; fromSend: number; waitedBefore: number }[] = []
    let id = ''
    for (let i = 1; i <= 3; i++) {
      const question = `What is recursion, take ${i}? (${STAMP})`
      await composer.fill(i === 1 ? `${LIVE}\n${question}` : question)
      await composer.press('Enter')
      await expect(panel.locator('.chat-msg').filter({ hasText: question })).toBeVisible()
      await expect(panel.locator('.chat-pane__typing')).toBeVisible()
      if (!id) {
        const r = await call(d.actors.yuki.token, 'GET', `/v1/me/conversations?course_id=${c}`)
        id = (r.body.result?.conversations ?? []).find((x: { title?: string }) => x.title === LIVE)?.conversation_id
        expect(id, `Yuki's conversation "${LIVE}": ${JSON.stringify(r.body)}`).toBeTruthy()
      }
      // The course agent's inbox has the question.
      let waiting: string | null = null
      await expect
        .poll(async () => {
          const inbox = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/inbox`)
          const conv = (inbox.body.result?.conversations ?? []).find((x: { id: string }) => x.id === id)
          waiting = conv?.latest_opener_message_id ?? null
          return waiting
        })
        .not.toBeNull()
      // Long enough for the pane's read to be waiting, and for a pane polling every 3 s to be between polls.
      await page.waitForTimeout(1500)
      const answer = `Recursion is a function calling itself, take ${i} (${STAMP}).`
      // When the answer is on the screen, by the page's clock (this machine's, as the test's is).
      await page.evaluate((text) => {
        const w = window as unknown as { shownAt?: number }
        delete w.shownAt
        const seen = () =>
          [...document.querySelectorAll('#chat-panel .chat-msg')].some((m) => m.textContent?.includes(text))
        const watch = new MutationObserver(() => {
          if (!seen()) return
          w.shownAt = Date.now()
          watch.disconnect()
        })
        watch.observe(document.body, { childList: true, subtree: true, characterData: true })
      }, answer)
      const carried = page.waitForResponse(
        async (r) =>
          r.url().includes(`/conversations/${id}/messages?`) && (await r.text().catch(() => '')).includes(answer),
      )
      const sent = Date.now()
      done(
        await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${id}/answer`, {
          in_reply_to_message_id: waiting,
          body: answer,
        }),
        'conversation.answer',
      )
      const posted = Date.now()
      await expect(panel.locator('.chat-msg').filter({ hasText: answer })).toBeVisible()
      await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)
      const shownAt = await page.evaluate(() => (window as unknown as { shownAt?: number }).shownAt)
      expect(shownAt, 'the answer was seen coming on the screen').toBeTruthy()
      // It came with a read that asked to wait (wait_s, and the state the pane held), made well before it was written.
      const res = await carried
      const url = new URL(res.url())
      expect(url.searchParams.get('wait_s')).toBe('25')
      expect(url.searchParams.get('seen_state')).toBe('awaiting_answer')
      const waitedBefore = sent - res.request().timing().startTime
      expect(waitedBefore, 'the read that brought it was made before the answer was written').toBeGreaterThan(1000)
      measured.push({ fromPost: shownAt! - posted, fromSend: shownAt! - sent, waitedBefore: Math.round(waitedBefore) })
    }
    const summary = measured.map((m) => `${m.fromPost} ms (${m.fromSend} ms from sending it)`).join(', ')
    console.log(`an answer, from written to shown: ${summary}`)
    test.info().annotations.push({ type: 'answer shown after', description: summary })
    for (const m of measured) expect(m.fromPost, `shown after ${summary}`).toBeLessThan(1000)
    // Read on the screen, so counted nowhere.
    await expect
      .poll(async () => {
        const r = await call(d.actors.yuki.token, 'GET', `/v1/me/conversations?course_id=${c}`)
        return (r.body.result?.conversations ?? []).find((x: { conversation_id: string }) => x.conversation_id === id)
          ?.unread
      })
      .toBe(false)
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
      // Its edge drags it here too, over the page, never wider than 70 % of the window.
      await dragEdge(page, 60)
      expect(Math.round((await box_(panel)).width)).toBe(440)
      await dragEdge(page, 2000)
      expect(Math.round((await box_(panel)).width)).toBe(Math.floor(width * 0.7))
      expect(Math.round((await page.locator('.app-main').boundingBox())!.width)).toBe(Math.round(before.width))
      await panel.getByRole('separator').dblclick()
      expect(Math.round((await box_(panel)).width)).toBe(380)
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

  test('lays a conversation out as an editor’s agent chat does, in English and in Chinese', async ({ page }) => {
    const d = demo()
    // The words each language has for what is checked.
    const words = {
      en: {
        lastSeen: /^Last seen \d+ minutes ago$/,
        waiting: 'Thinking…',
        options: 'Conversation options',
        readers: 'Who can read this',
        close: 'Close conversation',
        closed: 'This conversation is closed. They said: “Done, thanks”',
        tag: 'Closed',
      },
      'zh-Hant': {
        lastSeen: /^最後上線：\d+ 分鐘前$/,
        waiting: '思考中…',
        options: '對話選項',
        readers: '誰可以閱讀',
        close: '結束對話',
        closed: '這段對話已結束。 對方表示：「Done, thanks」',
        tag: '已結束',
      },
    } as const
    await signIn(page, d.actors.yuki)
    // The course agent as it would be listed 37 minutes after whatever ran it stopped: the only
    // way to see an agent that is not running, in a run where it answers.
    await page.route('**/conversations/respondents', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      for (const r of body.result?.respondents ?? []) {
        if (r.display_name === TUTOR) r.last_seen_at = new Date(Date.now() - 37 * 60_000).toISOString()
      }
      await route.fulfill({ response: res, json: body })
    })
    for (const lang of ['en', 'zh-Hant'] as const) {
      const w = words[lang]
      if (lang === 'zh-Hant') await inTraditionalChinese(page)
      await page.goto(coursePath())
      await expect(page.locator('.course-head')).toBeVisible()
      await page.locator('#chat-panel-toggle').click()
      const panel = panelOf(page)
      await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()

      // A new conversation: one row on top, the agent and when it was last seen; no box saying
      // so, no title to give; the composer one box, its send button inside it.
      const head = panel.locator('.chat-pane__head')
      await expect(head.locator('.chat-pane__name')).toHaveText(`CS101 · ${TUTOR}`)
      await expect(head.locator('.chat-pane__presence')).toHaveText(w.lastSeen)
      await expect(panel.locator('.chat-pane__notice')).toHaveCount(0)
      await expect(panel.locator('.el-alert')).toHaveCount(0)
      await expect(panel.locator('.chat-pane__foot input')).toHaveCount(0)
      const box = panel.locator('.chat-composer')
      await expect(box.locator('textarea')).toBeVisible()
      await expect(box.locator('.chat-composer__bar .chat-composer__send')).toBeVisible()
      // Nothing of the app's own before the text: the box starts with it.
      expect(await box.evaluate((el) => el.firstElementChild?.firstElementChild?.tagName)).toBe('TEXTAREA')
      const boxAt = (await box.boundingBox())!
      const sendAt = (await box.locator('.chat-composer__send').boundingBox())!
      expect(sendAt.x + sendAt.width).toBeLessThanOrEqual(boxAt.x + boxAt.width)
      expect(sendAt.y + sendAt.height).toBeLessThanOrEqual(boxAt.y + boxAt.height)
      expect(sendAt.x).toBeGreaterThan(boxAt.x + boxAt.width / 2)
      await page.mouse.move(0, 400)
      await photograph(page, `chat-new-offline-${lang}`)

      // Asked: waiting for it is one quiet line in the messages, the agent at work (its conversation
      // says it was seen just now), counting the seconds; nothing above the composer.
      const first = `${lang} ${STAMP}: what is a for loop?`
      await box.locator('textarea').fill(`${first}\nWith an example, please.`)
      await box.locator('textarea').press('Enter')
      await expect(panel.locator('.chat-msg').filter({ hasText: first })).toBeVisible()
      await expect(panel.locator('.chat-pane__typing .chat-status__label')).toHaveText(w.waiting)
      await expect(panel.locator('.chat-pane__typing .chat-status__time')).toHaveText(/^\d+s$/)
      await expect(panel.locator('.chat-pane__notice')).toHaveCount(0)
      await expect(head.locator('.el-tag')).toHaveCount(0)
      await page.mouse.move(0, 400)
      await photograph(page, `chat-waiting-${lang}`)

      // The ⋯ menu: who can read it, and closing it.
      await head.getByRole('button', { name: w.options }).click()
      const menu = page.locator('.chat-pane__menu:visible')
      await expect(menu.getByRole('menuitem', { name: w.readers })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: w.close })).toBeVisible()
      await photograph(page, `chat-menu-${lang}`)
      await menu.getByRole('menuitem', { name: w.close }).click()
      const ask = page.locator('.el-message-box')
      await ask.locator('textarea').fill('Done, thanks')
      await ask.getByRole('button', { name: w.close }).click()

      // Closed: one line, why, and the state beside the name.
      await expect(panel.locator('.chat-pane__closed-text')).toHaveText(w.closed)
      await expect(head.locator('.el-tag')).toHaveText(w.tag)
      await expect(box).toHaveCount(0)
      await page.mouse.move(0, 400)
      await photograph(page, `chat-closed-${lang}`)

      // Its title in the history is its first line.
      await panel.locator('.chat-panel__bar .chat-panel__icon').first().click()
      await expect(panel.locator('.hist-row__title').filter({ hasText: first })).toHaveText(first)
      await page.locator('#chat-panel-toggle').click()
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
      // On a touch screen Enter is a new line, and the button, inside the box, sends; no hint under it.
      await expect(panel.locator('.chat-composer__hint')).toHaveCount(0)
      await expect(panel.locator('.chat-composer').getByRole('button', { name: 'Send' })).toBeVisible()
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
