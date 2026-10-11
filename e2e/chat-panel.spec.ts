/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  activityBar,
  call,
  chatBadge,
  chatButton,
  openCourseTab,
  coursePath,
  demo,
  dropFiles,
  expectCourseAgentRow,
  expectNothingAtRightEdge,
  hostOnRuntime,
  inTraditionalChinese,
  minimizeChat,
  photograph,
  showSideView,
  sideBar,
  signIn,
  signInAsRoot,
  type CoreReply,
} from './support'

// The chat is a pane docked at the window's right edge beside every page, as
// an editor's side panel is: opened from a button at the header's right end
// (with no rail along the window's right edge while it is closed, and nothing
// floating over the page), as tall as the window, on the page's ground with a
// rule at its left and no shadow; the page column narrows by its width, 400 px
// until its left edge is dragged (from 320 to 640 px, the page beside it kept
// 420 px, the side bar giving way in a window without room for it too), and
// this browser keeps how wide it was made; minimized, it opens again on what
// it showed. On a phone it is a sheet
// over the whole screen, opened from the same button at the header's right
// end, in the header's one row. Told through a course agent made for this run,
// hosted on AIshie (the test plays the runtime), and Yuki, a student, who asks
// it. The pane stays open, on what it shows, while she moves between pages,
// and as wide as she made it; an answer that comes while it is closed is
// counted on its button. What she has read is Core's (conversation.mark_read),
// so the count follows her from browser to browser.

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

/**
 * Yuki reads, in Core (conversation.mark_read), every conversation of hers
 * it counts as unread: what an earlier attempt at these tests left unread,
 * cut short before she read an answer (and retried), is not counted with
 * this attempt's answers on the chat's button.
 */
async function readEverythingBefore() {
  const yuki = demo().actors.yuki.token
  const mine = done(await call(yuki, 'GET', '/v1/me/conversations?limit=100'), 'me.conversations')
  const unread = (
    (mine.conversations ?? []) as { conversation_id: string; course: { course_id: string }; unread: boolean }[]
  ).filter((c) => c.unread)
  for (const c of unread) {
    const read = await call(
      yuki,
      'POST',
      `/v1/courses/${c.course.course_id}/conversations/${c.conversation_id}/read`,
      {},
    )
    done(read, 'conversation.mark_read')
  }
}

/**
 * Opens the window's history from its History button, once nothing lies
 * over it: the mouse is moved off whatever the last step left it on, where
 * it may hold a tooltip up (a message's Copy, a button of the composer's)
 * over the button, and the click waits for no tooltip to be showing. Done
 * once the history is shown.
 */
async function showHistory(page: Page) {
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  const history = panelOf(page).getByRole('button', { name: 'History', exact: true })
  await history.click()
  await expect(history).toHaveAttribute('aria-pressed', 'true')
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
 * The pane, docked: at the window's right edge, as tall as the window and from its top, a region of the page
 * (not a dialog), on the page's ground with a rule at its left and no shadow; the page column ends where it
 * begins, and nothing scrolls sideways. Its width.
 */
async function expectDocked(page: Page) {
  const look = await panelOf(page).evaluate((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const column = document.querySelector('.app-main-wrap')!.getBoundingClientRect()
    const header = document.querySelector('.app-header')!.getBoundingClientRect()
    const head = el.querySelector('.chat-panel__head')!.getBoundingClientRect()
    return {
      position: cs.position,
      shadow: cs.boxShadow,
      rule: `${cs.borderLeftWidth} ${cs.borderLeftStyle}`,
      ground: cs.backgroundColor === getComputedStyle(document.querySelector('.app-main-wrap')!).backgroundColor,
      role: el.getAttribute('role'),
      modal: el.getAttribute('aria-modal'),
      top: Math.round(r.top),
      right: Math.round(window.innerWidth - r.right - (window.innerWidth - document.documentElement.clientWidth)),
      fullHeight: Math.round(r.height) === document.documentElement.clientHeight,
      columnEnds: Math.round(column.right) === Math.round(r.left),
      headAligned: Math.round(head.bottom) === Math.round(header.bottom),
      width: Math.round(r.width),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(look).toMatchObject({
    position: 'sticky',
    shadow: 'none',
    rule: '1px solid',
    ground: true,
    role: 'complementary',
    modal: null,
    top: 0,
    right: 0,
    fullHeight: true,
    columnEnds: true,
    headAligned: true,
    sideways: false,
  })
  return look.width
}

/** How wide the page column is: the header's and the page's width, the window's less the side bar and the chat. */
async function columnWidth(page: Page) {
  return Math.round((await box_(page.locator('.app-main-wrap'))).width)
}

/** Drags the pane's left edge by dx to the right, as a mouse does. While it moves, nothing on the page is selected. */
async function dragEdge(page: Page, dx: number) {
  const edge = panelOf(page).getByRole('separator', { name: 'Width of the chat' })
  const at = await box_(edge)
  const [x, y] = [at.x + at.width / 2, at.y + 200]
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 12 })
  const during = await page.evaluate(() => ({
    dragging: document.body.classList.contains('is-dragging-chat'),
    select: getComputedStyle(document.body).userSelect,
  }))
  await page.mouse.up()
  expect(during).toEqual({ dragging: true, select: 'none' })
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
}

/**
 * On one signed-in page, the chat is closed with nothing at the right edge
 * and nothing floating over the page; it opens from its button at the
 * header's right end, docked beside the page column, which narrows by its
 * width; the button stays, saying the chat is open; and minimized, focus is
 * back on it and the page column runs to the window's edge again.
 */
async function opensFromItsButton(page: Page, path: string, what: string) {
  await page.goto(path)
  await expect(page.locator('.app-main').first()).toBeVisible()
  // Closed: no rail, nothing at the right edge, the header across the whole width, and nothing floating.
  await expectNothingAtRightEdge(page, what)
  await expect(page.locator('.app-chat-fab'), what).toHaveCount(0)
  const button = chatButton(page)
  await expect(button, what).toBeVisible()
  // In the header, at its right end.
  const at = await box_(button)
  const header = await box_(page.locator('.app-header'))
  const win = await inner(page)
  expect(at.y >= header.y && at.y + at.height <= header.y + header.height, what).toBe(true)
  expect(win.width - at.x - at.width, what).toBeLessThanOrEqual(24)
  await expect(button, what).toHaveAttribute('aria-expanded', 'false')
  const closed = await columnWidth(page)
  await button.click()
  await expect(panelOf(page), what).toBeVisible()
  // Docked, 400 px wide; the page column narrower by as much; the button stays, saying so.
  const width = await expectDocked(page)
  expect(width, what).toBe(400)
  await expect.poll(() => columnWidth(page), { message: what }).toBe(closed - width)
  await expect(button, what).toHaveAttribute('aria-expanded', 'true')
  await expect(panelOf(page).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
  if (path === '/') {
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-pane-open')
    await page.locator('html').evaluate((h) => h.classList.add('dark'))
    await photograph(page, 'chat-pane-open-dark')
    await page.locator('html').evaluate((h) => h.classList.remove('dark'))
  }
  await minimizeChat(page)
  await expect(button, what).toBeVisible()
  await expect(button, what).toBeFocused()
  await expect(button, what).toHaveAttribute('aria-expanded', 'false')
  await expectNothingAtRightEdge(page, `${what}, minimized`)
  expect(await columnWidth(page), what).toBe(closed)
  if (path === '/') {
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-pane-closed')
  }
}

test.describe.serial('the chat panel', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    // The instructor's course agent, hosted on AIshie and seated to answer the course; the test plays the runtime.
    const tutor = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    // Hosted as the site's runtime hosts it: issued its one token, which answers as the agent.
    w.tutorToken = await hostOnRuntime(tutor)
    await readEverythingBefore()
  })

  // The walk over every signed-in page is a few tests, each of a few pages:
  // one test of them all held thirteen pages' time, and on a busy machine,
  // every page slower alike, ran out of its 60 s. Each is a test of its own
  // line, so that a report or a rerun by file:line names one.
  test('is opened from its button in the header on the home page and the course’s overview, materials and assignments, beside the page', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await opensFromItsButton(page, '/', 'home')
    await opensFromItsButton(page, coursePath(), 'the course overview')
    await opensFromItsButton(page, coursePath('materials'), 'materials')
    await opensFromItsButton(page, coursePath('assignments'), 'assignments')
  })

  test('is opened from its button in the header on an assignment and the course’s submissions, grades and members, beside the page', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await opensFromItsButton(page, coursePath(`assignments/${demo().course.assignments.hw1}`), 'an assignment')
    await opensFromItsButton(page, coursePath('submissions'), 'submissions')
    await opensFromItsButton(page, coursePath('grades'), 'grades')
    await opensFromItsButton(page, coursePath('members'), 'members')
  })

  test('is opened from its button in the header on the course’s approvals, activity and agents, and the account’s pages, beside the page', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await opensFromItsButton(page, coursePath('approvals'), 'approvals')
    await opensFromItsButton(page, coursePath('activity'), 'activity')
    await opensFromItsButton(page, coursePath('agents'), 'the course’s agents')
    await opensFromItsButton(page, '/account', 'the account')
    await opensFromItsButton(page, '/account/agents', 'my agents')
  })

  test('is reached from the keyboard, says its shortcut, and gives its button focus again once it closes', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    // Its button is reached with Tab, says its shortcut, and has focus again once the chat closes.
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    const button = chatButton(page)
    await button.focus()
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+J Meta+J')
    // It shows a region beside the page, not a dialog.
    await expect(button).not.toHaveAttribute('aria-haspopup')
    await page.keyboard.press('Enter')
    await expect(panelOf(page)).toBeVisible()
    await expect(panelOf(page)).toHaveAttribute('role', 'complementary')
    await expect(panelOf(page)).not.toHaveAttribute('aria-modal')
    await expect(panelOf(page)).toHaveAccessibleName('Chat')
    await panelOf(page).getByRole('button', { name: 'Close the chat' }).click()
    await expect(panelOf(page)).toHaveCount(0)
    await expect(button).toBeFocused()
    // Escape, from within it, minimizes it; from the page it is the page's.
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toBeVisible()
    await page.locator('.course-head__title').first().click()
    await page.keyboard.press('Escape')
    await expect(panelOf(page)).toBeVisible()
    await panelOf(page).getByRole('button', { name: 'History', exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(panelOf(page)).toHaveCount(0)
    await expect(button).toBeFocused()
    await button.hover()
    await expect(
      page.locator('.el-popper:visible').filter({ hasText: /^Chat with agents \((Ctrl\+J|⌘J)\)$/ }),
    ).toBeVisible()
  })

  test('leaves nothing at the right edge of the administration pages either, for root', async ({ page }) => {
    await signInAsRoot(page)
    for (const [path, what] of [
      ['/admin/courses', 'the courses’ administration'],
      ['/admin/actors', 'people'],
      ['/admin/departments', 'departments'],
    ] as const) {
      await page.goto(path)
      await expect(page.locator('.page-header').first()).toBeVisible()
      await expectNothingAtRightEdge(page, what)
    }
  })

  test('opens beside the page, and stays open, on the same conversation, from page to page', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await expect(panelOf(page)).toHaveCount(0)
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'false')
    const closed = await columnWidth(page)
    await chatButton(page).click()
    const panel = panelOf(page)
    await expect(panel).toBeVisible()

    // Docked at the right edge, 400 px wide; the page column narrower by as much.
    expect(await expectDocked(page)).toBe(400)
    expect(await columnWidth(page)).toBe(closed - 400)

    // On a course page it asks in that course, and offers its agents.
    await expect(panel.locator('.chat-panel__course')).toContainText('CS101')
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expectCourseAgentRow(panel, row)
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
    await openCourseTab(page, 'Materials')
    await expect(page).toHaveURL(new RegExp(`${coursePath('materials')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await openCourseTab(page, 'Assignments')
    await expect(page).toHaveURL(new RegExp(`${coursePath('assignments')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await (await showSideView(page, 'Courses')).getByRole('link', { name: 'My courses' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(panel).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Its history: the conversation, named by course and agent, with its title; answered, the usual, is not said.
    await showHistory(page)
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toContainText(`CS101 · ${TUTOR}`)
    await expect(item.locator('.hist-row__title')).toHaveText(TITLE)
    await expect(item).not.toContainText('Answered')
    await expect(item.locator('.app-tag')).toHaveCount(0)
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-history')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Resized by its left edge, from the keyboard and dragged; the page column narrower by its width; as wide,
    // and open, after a reload.
    const edge = panel.getByRole('separator', { name: 'Width of the chat' })
    await edge.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(edge).toHaveAttribute('aria-valuenow', '432')
    expect(await expectDocked(page)).toBe(432)
    await dragEdge(page, -60)
    await expect(edge).toHaveAttribute('aria-valuenow', '492')
    expect(await expectDocked(page)).toBe(492)
    expect(await columnWidth(page)).toBe(closed - 492)
    // Files dropped on the pane are attached to what she is writing: on its head row as on the conversation.
    // (They are only chips until sent: taken off again here.)
    const note = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(`${name}\n`) })
    await dropFiles(panel.locator('.chat-panel__head'), [note('on-the-head.txt')])
    await dropFiles(panel.locator('.chat-pane__messages'), [note('on-the-messages.txt')])
    const chips = panel.locator('.chat-chip')
    await expect(chips.locator('.chat-chip__name')).toHaveText(['on-the-head.txt', 'on-the-messages.txt'])
    await expect(panel.locator('.chat-chip.is-done')).toHaveCount(2)
    await expect(panel.getByRole('button', { name: 'Attach files', exact: true })).toBeVisible()
    for (const name of ['on-the-head.txt', 'on-the-messages.txt']) {
      await panel.getByRole('button', { name: `Remove “${name}”` }).click()
    }
    await expect(chips).toHaveCount(0)
    await page.reload()
    await expect(panelOf(page)).toBeVisible()
    expect(await expectDocked(page)).toBe(492)
    // A double click on its edge: back to 400 px.
    await panelOf(page).getByRole('separator', { name: 'Width of the chat' }).dblclick()
    await expect.poll(() => expectDocked(page)).toBe(400)

    // Ctrl+J minimizes it, and opens it again.
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

  test('is resized only from 320 to 640 px, leaves the page beside it 420 px, the side bar giving way where there is no room for it too, and docks from 900 px wide', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    await showSideView(page, 'Courses')
    await chatButton(page).click()
    expect(await expectDocked(page)).toBe(400)

    // Dragged far towards the page: 640 px, and no wider.
    await dragEdge(page, -3000)
    expect(await expectDocked(page)).toBe(640)
    // And far the other way: 320 px, the narrowest.
    await dragEdge(page, 3000)
    expect(await expectDocked(page)).toBe(320)
    // Back to 600, from the keyboard's End and then its arrows.
    const edge = panelOf(page).getByRole('separator', { name: 'Width of the chat' })
    await edge.focus()
    await page.keyboard.press('End')
    await expect(edge).toHaveAttribute('aria-valuenow', '640')
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
    await expect(edge).toHaveAttribute('aria-valuenow', '480')
    // The page beside it is still there to use: the course's tabs lead on.
    await openCourseTab(page, 'Materials')
    await expect(page).toHaveURL(new RegExp(`${coursePath('materials')}$`))
    await expect(panelOf(page)).toBeVisible()

    // 1100 px with the side bar open: 792 px for the page and the pane, the page left 420 of them.
    await page.setViewportSize({ width: 1100, height: 800 })
    await expect.poll(() => expectDocked(page)).toBe(372)
    expect(await columnWidth(page)).toBe(420)
    // 1000 px: too little for the side bar, the narrowest pane and 420 px of page (1048). The side bar gives way
    // while the chat is open, still open as this browser keeps it but its button not pressed; the pane is as wide
    // as it was made, and the page what is left, 472.
    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(sideBar(page)).toHaveCount(0)
    await expect.poll(() => expectDocked(page)).toBe(480)
    expect(await columnWidth(page)).toBe(1000 - 48 - 480)
    const courses = activityBar(page).getByRole('button', { name: 'Courses', exact: true })
    await expect(courses).toHaveAttribute('aria-expanded', 'false')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-pane-1000')
    // Its view's button: the side bar, and the chat minimized in its turn; opened again, on what it showed, the
    // side bar gives way again.
    await courses.click()
    await expect(sideBar(page)).toBeVisible()
    await expect(panelOf(page)).toHaveCount(0)
    expect(await columnWidth(page)).toBe(1000 - 48 - 260)
    await chatButton(page).click()
    await expect(sideBar(page)).toHaveCount(0)
    await expect.poll(() => expectDocked(page)).toBe(480)
    // Wide again: the side bar back beside the page, and the pane as wide as it was made.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(sideBar(page)).toBeVisible()
    await expect.poll(() => expectDocked(page)).toBe(480)
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-pane-1440')

    // Docked from 900 px wide, the side bar giving way, the page left 420 px; a sheet below.
    await page.setViewportSize({ width: 900, height: 700 })
    await expect(panelOf(page)).toHaveClass(/is-docked/)
    await expect(sideBar(page)).toHaveCount(0)
    await expect.poll(() => expectDocked(page)).toBe(432)
    expect(await columnWidth(page)).toBe(420)
    await page.setViewportSize({ width: 899, height: 700 })
    await expect(panelOf(page)).toHaveClass(/is-sheet/)
    await expect(panelOf(page)).toHaveAttribute('aria-modal', 'true')
  })

  test('opens from a link to a conversation, docked beside the course it is in', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    const { conversation_id } = await yukisConversation()
    await page.goto(coursePath(`conversations/${conversation_id}`))
    // The address the course's conversations page once had: the course's overview, and the chat open on it.
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    await expect(panelOf(page).locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expectDocked(page)
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'true')
    await minimizeChat(page)
    await expect(chatButton(page)).toBeVisible()
    // And a link to the course's conversations: the pane, on a new conversation in the course.
    await page.goto(coursePath('conversations'))
    await expect(panelOf(page).getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
    await expectDocked(page)
  })

  test('counts an answer that came while it was closed on its button, until it is read', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await chatButton(page).click()
    const panel = panelOf(page)
    await showHistory(page)
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
    await expect(chatBadge(page)).toHaveText('1')

    await chatButton(page).click()
    await showHistory(page)
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toHaveClass(/is-unread/)
    await expect(item).toContainText('New answer')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: 'break leaves it' })).toBeVisible()
    // Read: not counted on the button, back once the window is minimized.
    await minimizeChat(page)
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents')
    await expect(chatBadge(page)).toBeHidden()
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
      await showHistory(a)
      const item = panel.locator('.hist-row').filter({ hasText: TITLE })
      await expect(item).toHaveClass(/is-unread/)
      await item.click()
      await expect(panel.locator('.chat-msg').filter({ hasText: 'runs once before the test' })).toBeVisible()
      await minimizeChat(a)
      await expect(chatButton(a)).toHaveAccessibleName('Chat with agents')
      await expect.poll(async () => (await yukisConversation()).unread).toBe(false)

      // The other, left as it was, stops counting it when it next asks (every 30 seconds)…
      await expect(chatButton(b)).toHaveAccessibleName('Chat with agents', { timeout: 45_000 })
      await expect(chatBadge(b)).toBeHidden()
      // …and its history, reloaded, marks it read.
      await b.reload()
      await chatButton(b).click()
      await showHistory(b)
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
        // Nothing has run it for 37 minutes: it is paused, as its asker is told, never "last seen" as a person is.
        presence: 'Paused',
        waiting: 'Thinking…',
        options: 'Conversation options',
        readers: 'Who can read this',
        close: 'Close conversation',
        closed: 'This conversation is closed. They said: “Done, thanks”',
        tag: 'Closed',
      },
      'zh-Hant': {
        presence: '暫停',
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
    const tutorToken = w.tutorToken
    for (const lang of ['en', 'zh-Hant'] as const) {
      const w = words[lang]
      if (lang === 'zh-Hant') await inTraditionalChinese(page)
      await page.goto(coursePath())
      await expect(page.locator('.course-head')).toBeVisible()
      await page.locator('#chat-panel-toggle').click()
      const panel = panelOf(page)
      await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()

      // A new conversation: one row on top, the agent and whether it can be asked; no box saying
      // so, no title to give; the composer one box, its send button inside it.
      const head = panel.locator('.chat-pane__head')
      await expect(head.locator('.chat-pane__name')).toHaveText(`CS101 · ${TUTOR}`)
      await expect(head.locator('.chat-pane__presence')).toHaveText(w.presence)
      await expect(head.locator('.chat-pane__name-row .ai-badge')).toHaveText('AI')
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
      // Focused, the box shows it, and the field within it draws nothing of its own: no field's
      // outline across the box, between the words and the bar.
      await box.locator('textarea').focus()
      expect(
        await box.locator('textarea').evaluate((el) => {
          const cs = getComputedStyle(el)
          return `${cs.outlineStyle} ${cs.boxShadow}`
        }),
      ).toBe('none none')

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

      // The ⋯ menu: who can read it; nothing ends the conversation from here.
      await head.getByRole('button', { name: w.options }).click()
      const menu = page.locator('.chat-pane__menu:visible')
      await expect(menu.getByRole('menuitem', { name: w.readers })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: w.close })).toHaveCount(0)
      await photograph(page, `chat-menu-${lang}`)
      await page.keyboard.press('Escape')

      // Closed all the same by the agent (as a conversation from before may be, or one whose seat
      // was removed): one line, why, and the state beside the name.
      const c = d.course.id
      let id: string | undefined
      await expect
        .poll(async () => {
          const inbox = await call(tutorToken, 'GET', `/v1/courses/${c}/conversations/inbox`)
          id = (inbox.body.result?.conversations ?? []).find((x: { title?: string | null }) => x.title === first)?.id
          return id ?? null
        })
        .not.toBeNull()
      done(
        await call(tutorToken, 'POST', `/v1/courses/${c}/conversations/${id}/close`, { reason: 'Done, thanks' }),
        'conversation.close',
      )
      await expect(panel.locator('.chat-pane__closed-text')).toHaveText(w.closed)
      await expect(head.locator('.el-tag')).toHaveText(w.tag)
      await expect(box).toHaveCount(0)
      await page.mouse.move(0, 400)
      await photograph(page, `chat-closed-${lang}`)

      // Its title in the history is its first line.
      await panel.locator('.chat-panel__bar .chat-panel__icon').first().click()
      await expect(panel.locator('.hist-row__title').filter({ hasText: first })).toHaveText(first)
      await minimizeChat(page)
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

  test('leaves nothing floating over a page on a desktop, nor room kept for it: its button is in the header', async ({
    page,
  }) => {
    const d = demo()
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, d.actors.instructor)
    for (const path of [coursePath('members'), coursePath('activity'), coursePath('grades')]) {
      await page.goto(path)
      await expect(page.locator('.page-header').first()).toBeVisible()
      await expect(page.locator('.app-header').getByRole('button', { name: /^Chat with agents/ })).toBeVisible()
      await expect(page.locator('.app-chat-fab')).toHaveCount(0)
      await expect(page.locator('.app-main')).not.toHaveClass(/has-chat-fab/)
    }
  })

  test('keeps its count of unread answers within the window, however many there are', async ({ page }) => {
    const d = demo()
    await page.setViewportSize({ width: 1280, height: 800 })
    // Core's list of her conversations, with as many more unread ones with an agent as the step asks for.
    let extra = 0
    await page.route(/\/v1\/me\/conversations(\?|$)/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      const real = (body.result?.conversations ?? []) as Record<string, unknown>[]
      const fake = Array.from({ length: extra }, (_, i) => ({
        ...(real[0] ?? {}),
        conversation_id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
        respondent: { kind: 'agent' },
        unread: true,
      }))
      await route.fulfill({
        response: res,
        json: { ...body, result: { ...body.result, conversations: [...fake, ...real] } },
      })
    })
    await signIn(page, d.actors.yuki)
    for (const [n, shown] of [
      [12, '12'],
      [120, '99+'],
    ] as const) {
      extra = n
      await page.goto(coursePath())
      await expect(chatBadge(page)).toHaveText(shown, { timeout: 40_000 })
      const fit = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        width: document.documentElement.clientWidth,
        badge: document.querySelector('.app-header .el-badge__content')!.getBoundingClientRect().right,
      }))
      expect(fit.scroll, `${shown}: the page is no wider than the window`).toBeLessThanOrEqual(fit.width)
      expect(fit.badge, `${shown}: the count is within the window`).toBeLessThanOrEqual(fit.width)
    }
  })

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('is a sheet over the whole screen, opened from the button at the header’s right end, in its one row', async ({
      page,
    }) => {
      const d = demo()
      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      // No rail, and nothing floating: the chat's button at the header's right end, as the menu's is at its left.
      await expect(page.locator('.course-head')).toBeVisible()
      await expectNothingAtRightEdge(page, 'a phone')
      await expect(page.locator('.app-chat-fab')).toHaveCount(0)
      const button = chatButton(page)
      await expect(button).toBeVisible()
      await expect(page.locator('.app-header [aria-controls="chat-panel"]')).toHaveCount(1)
      const [at, header] = [(await button.boundingBox())!, (await page.locator('.app-header').boundingBox())!]
      expect(header.height).toBeLessThanOrEqual(56)
      expect(at.y).toBeGreaterThanOrEqual(header.y)
      expect(at.y + at.height).toBeLessThanOrEqual(header.y + header.height)
      expect(Math.round(at.width)).toBe(44)
      expect(390 - (at.x + at.width)).toBeLessThanOrEqual(24)
      await expect(button).toHaveAttribute('aria-haspopup', 'dialog')
      await photograph(page, 'chat-button-phone')
      await button.click()
      const panel = panelOf(page)
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('role', 'dialog')
      await expect(panel).toHaveAttribute('aria-modal', 'true')
      const box = (await panel.boundingBox())!
      expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, 390, 844])
      await expect(panel.getByRole('separator')).toHaveCount(0)
      expect(await panel.evaluate((el) => [getComputedStyle(el).borderRadius, getComputedStyle(el).boxShadow])).toEqual([
        '0px',
        'none',
      ])

      await showHistory(page)
      await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
      await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
      // Its paperclip is there, within the screen.
      const clip = panel.getByRole('button', { name: 'Attach files', exact: true })
      await expect(clip).toBeVisible()
      const clipAt = (await clip.boundingBox())!
      expect(clipAt.x).toBeGreaterThanOrEqual(0)
      expect(clipAt.y + clipAt.height).toBeLessThanOrEqual(844)
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
      await expect(chatButton(page)).toBeFocused()
    })

    test('keeps nothing over the page nor room below it: the grades’ posting toolbar’s ⋯ is what a tap at its right end finds', async ({
      page,
    }) => {
      const d = demo()
      await signIn(page, d.actors.instructor)
      await page.goto(coursePath('grades'))
      const more = page.getByRole('button', { name: 'More posting actions' })
      await expect(more).toBeVisible()
      await expect(chatButton(page)).toBeVisible()
      const at = await more.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = (x: number, y: number) => {
          const found = document.elementFromPoint(x, y)
          return !!found && el.contains(found)
        }
        const y = r.top + r.height / 2
        const shown = y >= 0 && y <= window.innerHeight
        return { centre: !shown || hit(r.left + r.width / 2, y), right: !shown || hit(r.right - 2, y) }
      })
      expect(at).toEqual({ centre: true, right: true })
      // The page's foot is its own gutter, with nothing kept below it for a button.
      const foot = await page.locator('.app-main').evaluate((el) => getComputedStyle(el).paddingBottom)
      expect(foot).toBe('16px')
      await photograph(page, 'grades-toolbar-phone')
    })

    test('its button, in the header, is under the side menu and its dimmed layer', async ({ page }) => {
      const d = demo()
      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      const button = chatButton(page)
      await expect(button).toBeVisible()
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      const drawer = page.locator('.app-nav-drawer')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('link', { name: 'My courses' })).toBeVisible()
      // What is at the button's centre is the dimmed layer, not the button.
      const covered = await button.evaluate((b) => {
        const r = b.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        const overlay = document.querySelector('.app-nav-drawer')!.closest('.el-overlay') as HTMLElement
        return !!top && !b.contains(top) && !!overlay?.contains(top)
      })
      expect(covered, 'the dimmed layer covers the header and its button').toBe(true)
      await page.waitForTimeout(400)
      await photograph(page, 'chat-button-under-menu')
      // The menu closes as a link in it is followed; the button is there again.
      await drawer.getByRole('link', { name: 'My courses' }).click()
      await expect(drawer).toBeHidden()
      await button.click()
      await expect(panelOf(page)).toBeVisible()
    })
  })
})
