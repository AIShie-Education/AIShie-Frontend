/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  activityBar,
  call,
  chatWindow,
  coursePath,
  demo,
  openChat,
  photograph,
  registerPerson,
  root,
  showSideView,
  signIn,
  signInAsRoot,
  type CoreReply,
} from './support'

// A page's two columns follow the page's own width, not the window's: the
// side bar open on the left takes 260 px from it, and the chat, a window
// floating over the page, takes nothing. Each page stacks its columns where
// its main one would be left less than about 420 px, and keeps them side by
// side where there is room; side by side, the two columns of cards end on
// one line. Opening, resizing or moving the chat's window changes nothing of
// the page under it. What a page lays out in its template (a table or a card
// per row, which columns a table shows, el-descriptions' columns) follows its
// own width, or its card's, as its columns do; so do a course's tabs.

/** The side bar open on a view (or collapsed), and the chat's window open (unless not asked for), in a window this size. */
async function layout(
  page: Page,
  width: number,
  height: number,
  opts: { side: boolean; view?: 'Courses' | 'Administration'; chat?: boolean },
) {
  await page.setViewportSize({ width, height })
  if (opts.side) await showSideView(page, opts.view ?? 'Courses')
  else {
    // The view shown, pressed again, collapses the side bar.
    const shown = activityBar(page).locator('button[aria-expanded="true"]')
    if (await shown.count()) await shown.click()
    await expect(page.locator('#side-bar')).toHaveCount(0)
  }
  if (opts.chat === false) return
  const panel = await openChat(page)
  await expect(panel).toHaveClass(/is-window/)
}

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** Whether nothing of the page scrolls sideways. */
async function noSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}

/** A table's column headings, in order. */
async function headings(table: Locator) {
  return (await table.locator('thead th').allInnerTexts()).map((h) => h.trim())
}

/** How many cells the first row of an el-descriptions holds: 2 for one column of facts, 4 for two. */
async function cellsInFirstRow(desc: Locator) {
  return desc.locator('tbody tr').first().locator('th, td').count()
}

async function box(l: Locator) {
  const b = await l.boundingBox()
  expect(b, 'laid out').toBeTruthy()
  return b!
}

/** How wide the page is: its width is the window's, less the activity bar and the side bar, whatever the chat does. */
async function pageWidth(page: Page) {
  return Math.round((await box(page.locator('.app-main'))).width)
}

/** Where a column's last card ends. */
async function lastCardBottom(column: Locator) {
  const b = await box(column.locator(':scope > .app-card').last())
  return b.y + b.height
}

/** Whether the second column sits under the first, not beside it. */
async function stacked(main: Locator, side: Locator) {
  const [m, s] = [await box(main), await box(side)]
  return Math.abs(m.x - s.x) < 2 || s.y >= m.y + m.height - 1 || m.y >= s.y + s.height - 1
}

test.describe('pages beside the side bar, under the chat’s window', () => {
  test('the course overview takes its width from the window and the side bar alone, the chat over it, and a dialog over both', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.overview .about')).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 800 })
    await showSideView(page, 'Courses')
    // 1280 px, less the activity bar and the side bar: the chat opens over it and takes nothing from it.
    const closed = await pageWidth(page)
    expect(closed).toBe(1280 - 48 - 260)
    await layout(page, 1280, 800, { side: true })
    expect(await pageWidth(page)).toBe(closed)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-overview-1280')

    const main = page.locator('.overview__main')
    const side = page.locator('.overview__side')
    // About 920 px of page: two columns, the main one readable.
    expect(await stacked(main, side)).toBe(false)
    expect((await box(main)).width).toBeGreaterThanOrEqual(420)
    expect((await box(page.locator('.overview .about'))).width).toBeGreaterThanOrEqual(380)
    // Nothing scrolls sideways.
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(scroll).toBeLessThanOrEqual(0)

    // A dialog opened from the page (from the keyboard: the chat's window may lie over the button) covers the whole
    // window, above the header and the chat's window.
    await page.locator('.overview .about').getByRole('button', { name: 'Edit' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    const at = await box(dialog)
    expect(Math.abs(at.x + at.width / 2 - 640)).toBeLessThanOrEqual(2)
    const chat = await box(chatWindow(page))
    const cover = await page.evaluate(
      ([cx, cy]) => {
        const top = document.elementFromPoint(4, 4)
        const overlay = top?.closest('.el-overlay') as HTMLElement | null
        const r = overlay?.getBoundingClientRect()
        const overChat = document.elementFromPoint(cx!, cy!)
        return {
          onTop: !!overlay,
          rect: r ? [r.x, r.y, r.width, r.height] : null,
          chatCovered: !!overChat && !overChat.closest('#chat-panel') && !!overChat.closest('.el-overlay'),
        }
      },
      [chat.x + 20, chat.y + chat.height - 20],
    )
    expect(cover.onTop, 'the dialog’s dimmed layer is above the header').toBe(true)
    expect(cover.rect).toEqual([0, 0, 1280, 800])
    expect(cover.chatCovered, 'the dialog’s dimmed layer is above the chat’s window').toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(chatWindow(page)).toBeVisible()

    // Less room, 1100 px with the side bar: one column, the card as readable.
    await layout(page, 1100, 800, { side: true })
    expect(await pageWidth(page)).toBe(1100 - 48 - 260)
    expect(await stacked(main, side)).toBe(true)
    expect((await box(page.locator('.overview .about'))).width).toBeGreaterThanOrEqual(380)

    // With more room, the two columns side by side, the main one as wide as ever.
    await layout(page, 1920, 1080, { side: true })
    expect(await stacked(main, side)).toBe(false)
    expect((await box(main)).width).toBeGreaterThanOrEqual(420)
    await photograph(page, 'layout-overview-1920')
  })

  test('an assignment keeps its facts beside its main column where there is room, and under it where there is not', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
    const main = page.locator('.assignment-view__main')
    const side = page.locator('.assignment-view__side')
    await expect(main).toBeVisible()
    await layout(page, 1280, 800, { side: true })
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-assignment-1280')
    expect(await stacked(main, side)).toBe(false)
    expect((await box(main)).width).toBeGreaterThanOrEqual(420)

    await layout(page, 1000, 800, { side: true })
    expect(await stacked(main, side)).toBe(true)
  })

  test('an agent’s page ends its two columns of cards on one line, and stacks them where it is narrow', async ({
    page,
  }) => {
    const d = demo()
    const I = d.actors.instructor.token
    const mine = await call(I, 'GET', '/v1/me/agents')
    let agent = (mine.body.result?.agents ?? [])[0]?.actor_id as string | undefined
    agent ??= (
      await call(I, 'POST', '/v1/me/agents', {
        display_name: `Layout agent ${Date.now().toString(36)}`,
        hosting: 'runtime',
      })
    ).body.result.actor_id
    await signIn(page, d.actors.instructor)
    await page.goto(`/account/agents/${agent}`)
    const left = page.locator('.agent-view__grid > .hosting-panel')
    const right = page.locator('.agent-view__side')
    await expect(right.locator('.site-chat')).toBeVisible()
    await expect(left.locator(':scope > .app-card')).toBeVisible()

    // 1280 px, the side bar collapsed, the chat's window over the page: two columns.
    await layout(page, 1280, 800, { side: false })
    await page.mouse.move(0, 400)
    // Where the two columns end, and the courses below them.
    await page
      .locator('.agent-view__section')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await photograph(page, 'layout-agent-1280')
    expect(await stacked(left, right)).toBe(false)
    expect(Math.abs((await lastCardBottom(left)) - (await lastCardBottom(right)))).toBeLessThanOrEqual(1)
    // The cards keep what they hold at their top.
    const [card, title] = [
      await box(left.locator(':scope > .app-card').last()),
      await box(left.locator(':scope > .app-card').last().locator('.app-card__title, h2, h3').first()),
    ]
    expect(title.y - card.y).toBeLessThan(40)
    // The courses below begin under both.
    const below = await box(page.locator('.agent-view__section').first())
    expect(below.y).toBeGreaterThanOrEqual((await lastCardBottom(left)) + 15)

    // 1000 px with the side bar open, under 720 px of page: one column, nothing stretched.
    await layout(page, 1000, 800, { side: true })
    expect(await stacked(left, right)).toBe(true)
    const site = await box(right.locator('.site-chat'))
    const content = await right.locator('.site-chat').evaluate((el) => {
      const kids = [...el.children].map((c) => c.getBoundingClientRect().bottom)
      return Math.max(...kids) + parseFloat(getComputedStyle(el).paddingBottom) + 1
    })
    expect(site.y + site.height).toBeLessThanOrEqual(content + 1)
  })

  test('the course overview ends its two columns of cards on one line where it has room for both', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.overview .about')).toBeVisible()
    const main = page.locator('.overview__main')
    const side = page.locator('.overview__side')
    // 1600 px with the side bar: about 1240 px of page, two columns.
    await layout(page, 1600, 900, { side: true })
    expect(await stacked(main, side)).toBe(false)
    expect(Math.abs((await lastCardBottom(main)) - (await lastCardBottom(side)))).toBeLessThanOrEqual(1)
    await photograph(page, 'layout-overview-1600')
    // At 1100 px: one column.
    await layout(page, 1100, 800, { side: true })
    expect(await stacked(main, side)).toBe(true)
  })

  test('the overview keeps its width and its columns as the chat’s window is resized and moved over it', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.overview .about')).toBeVisible()
    const main = page.locator('.overview__main')
    const side = page.locator('.overview__side')
    await layout(page, 1280, 800, { side: true })
    const width = await pageWidth(page)
    const panel = chatWindow(page)
    const edge = panel.getByRole('separator', { name: 'Width of the chat window' })
    await expect(edge).toHaveAttribute('aria-valuenow', '400')

    // Wider by 300 px, dragged by its left edge: over more of the page, which is as it was.
    const at = await box(edge)
    await page.mouse.move(at.x + at.width / 2, at.y + 100)
    await page.mouse.down()
    await page.mouse.move(at.x + at.width / 2 - 300, at.y + 100, { steps: 10 })
    await page.mouse.up()
    await expect(edge).toHaveAttribute('aria-valuenow', '700')
    expect(await pageWidth(page)).toBe(width)
    expect(await stacked(main, side)).toBe(false)
    await page.mouse.move(0, 400)
    await photograph(page, 'resize-overview-700')

    // Moved by its title bar to the left: the page, again, as it was, and still to use beside it.
    const title = await box(panel.locator('.chat-panel__titlebar .chat-panel__title'))
    await page.mouse.move(title.x + 40, title.y + title.height / 2)
    await page.mouse.down()
    await page.mouse.move(title.x - 160, title.y + title.height / 2, { steps: 10 })
    await page.mouse.up()
    expect(await pageWidth(page)).toBe(width)
    expect(await stacked(main, side)).toBe(false)
    const moved = await box(panel)
    expect(Math.round(1280 - moved.x - moved.width)).toBe(216)
    // Back in its corner, 400 px wide, with a double click on its title bar.
    await panel.locator('.chat-panel__titlebar .chat-panel__title').dblclick()
    await expect(edge).toHaveAttribute('aria-valuenow', '400')
  })
})

test.describe('an administrator’s pages beside the side bar, under the chat’s window', () => {
  // What a page switches by its own width is never switched in a ResizeObserver's callback
  // (useContainerWidth): an el-table in it would lay itself out again in that same frame, and the browser
  // report a loop of observers. None, on any page, however the window and the side bar change.
  let loops: string[] = []
  test.beforeEach(async ({ page }) => {
    loops = []
    await page.exposeFunction('reportResizeObserverLoop', (where: string, message: string) =>
      loops.push(`${where}: ${message}`),
    )
    await page.addInitScript(() => {
      window.addEventListener('error', (e) => {
        if (String(e.message).includes('ResizeObserver loop')) {
          const report = (window as unknown as { reportResizeObserverLoop: (w: string, m: string) => void })
            .reportResizeObserverLoop
          void report(location.pathname, e.message)
        }
      })
    })
  })
  test.afterEach(() => {
    expect(loops).toEqual([])
  })

  test('a department administrator’s pages and a course’s tabs are laid out for the page’s width, not the window’s', async ({
    page,
  }) => {
    // Someone who administers a department of their own and teaches its one course: the administration's
    // pages and the course's, with the chat offered.
    const d = demo()
    const stamp = Date.now().toString(36)
    const R = root().token
    const dept = done(await call(R, 'POST', '/v1/departments', { name: `Layout ${stamp}` }), 'department.create')
    const who = await registerPerson(`Layout admin ${stamp}`, { email: `layout+${stamp}@e2e.test` })
    done(await call(R, 'POST', `/v1/departments/${dept.id}/admins`, { actor_id: who.actor_id }), 'department.add_admin')
    const course = done(
      await call(R, 'POST', '/v1/courses', {
        dept_id: dept.id,
        term_id: d.course.term_id,
        code: 'LAY101',
        section: stamp,
        title: `Layout course ${stamp}`,
        description: 'A course to lay pages out in.',
      }),
      'course.create',
    )
    const courseId = course.course_id as string
    done(await call(R, 'POST', `/v1/courses/${courseId}/activate`, {}), 'course.activate')
    done(
      await call(R, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: who.actor_id }),
      'course.seat_instructor',
    )
    await signIn(page, who)

    // The course's administration page. In a window of 1280 px with the side bar open, 924 px of page: its
    // details and the instructor's seat one above the other, the details with room for two columns of facts.
    await page.goto(`/admin/courses/${courseId}`)
    const details = page.locator('.course-admin__desc')
    const seat = page.locator('.course-admin__grid > .app-card').last()
    await expect(details).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration' })
    expect(await pageWidth(page)).toBe(1280 - 48 - 260)
    expect(await stacked(details, seat)).toBe(true)
    await expect.poll(() => cellsInFirstRow(details)).toBe(4)
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-course-admin-1280')
    // The same window with the side bar collapsed: room for both side by side.
    await layout(page, 1280, 800, { side: false })
    expect(await stacked(details, seat)).toBe(false)
    await expect.poll(() => cellsInFirstRow(details)).toBe(4)

    // The courses: their table's five columns where its card has 800 px, in 924 px of page…
    await page.goto('/admin/courses')
    const courses = page.locator('.courses__table')
    await expect(courses.getByText(`Layout course ${stamp}`)).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration' })
    await expect.poll(() => headings(courses)).toEqual(['Course', 'Status', 'Term', 'Department', 'Created'])
    await expect(courses.locator('.courses__meta')).toHaveCount(0)
    // …and in 1100 px of window, 744 of page, the term and the department under the course, which a window
    // of 1100 px alone would not have done.
    await layout(page, 1100, 800, { side: true, view: 'Administration' })
    await expect.poll(() => headings(courses)).toEqual(['Course', 'Status'])
    await expect(courses.locator('.courses__meta')).toContainText(`Layout ${stamp}`)
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-courses-1100')

    // The departments: every column of theirs where the card has 746 px, closed up where it has less.
    await page.goto('/admin/departments')
    const tree = page.locator('.dept-tree')
    await expect(tree.getByText(`Layout ${stamp}`)).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration' })
    await expect.poll(() => headings(tree)).toContain('ID')
    await layout(page, 1100, 800, { side: true, view: 'Administration' })
    await expect.poll(() => headings(tree)).not.toContain('ID')
    await expect.poll(() => headings(tree)).toContain('Courses')
    expect(await noSideways(page)).toBe(true)
    // The side bar collapsed and opened again in the same window: every column, then closed up again.
    await layout(page, 1100, 800, { side: false })
    await expect.poll(() => headings(tree)).toContain('ID')
    await layout(page, 1100, 800, { side: true, view: 'Administration' })
    await expect.poll(() => headings(tree)).not.toContain('ID')

    // The course's tabs: wrapped onto two rows where the page has 720 px or more, as in a window of 1100 px
    // with the side bar open; scrolled sideways, in one row, where it has less, as in one of 1000.
    await page.goto(`/courses/${courseId}`)
    const tabs = page.locator('.course-tabs')
    await expect(tabs).toBeVisible()
    const strip = () =>
      tabs.evaluate((nav) => {
        const tops = [...nav.querySelectorAll('.course-tabs__item')].map((t) =>
          Math.round(t.getBoundingClientRect().top),
        )
        return { rows: new Set(tops).size, scrolls: nav.scrollWidth > nav.clientWidth }
      })
    await layout(page, 1100, 800, { side: true })
    expect(await pageWidth(page)).toBe(1100 - 48 - 260)
    expect(await strip()).toEqual({ rows: 2, scrolls: false })
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-course-tabs-1100')
    await layout(page, 1000, 800, { side: true })
    await expect.poll(strip).toEqual({ rows: 1, scrolls: true })
    // Collapsed, the side bar leaves the same window room to wrap them again.
    await layout(page, 1000, 800, { side: false })
    await expect.poll(strip).toEqual({ rows: 2, scrolls: false })
  })

  test('the people and an actor’s page are laid out for the page’s width, and for their cards’, not the window’s', async ({
    page,
  }) => {
    const d = demo()
    await signInAsRoot(page)

    // Everyone registered: a card each in a window of 1000 px with the side bar open (644 px of page), and the
    // table in the same window with it collapsed.
    await page.goto('/admin/actors')
    await expect(page.locator('.actors__table, .actors__cards').first()).toBeVisible()
    await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
    await expect(page.locator('.actors__cards')).toBeVisible()
    await expect(page.locator('.actors__table')).toHaveCount(0)
    expect(await noSideways(page)).toBe(true)
    await photograph(page, 'layout-actors-1000')
    await layout(page, 1000, 800, { side: false, chat: false })
    await expect(page.locator('.actors__table')).toBeVisible()
    await expect(page.locator('.actors__cards')).toHaveCount(0)

    // A person's page: the invitation and single sign-on side by side in 924 px of page, each 420 px or more…
    await page.goto(`/admin/actors/${d.actors.yuki.actor_id}`)
    const invite = page.locator('.actor__grid > .app-card').first()
    const sso = page.locator('.actor__grid > .app-card').nth(1)
    await expect(sso).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration', chat: false })
    expect(await stacked(invite, sso)).toBe(false)
    expect((await box(invite)).width).toBeGreaterThanOrEqual(420)
    // …and one above the other in 744 px, where its registration's facts take one column too.
    await layout(page, 1100, 800, { side: true, view: 'Administration', chat: false })
    expect(await stacked(invite, sso)).toBe(true)
    await expect.poll(() => cellsInFirstRow(page.locator('.actor__desc'))).toBe(2)
    expect(await noSideways(page)).toBe(true)

    // An agent's tokens: a card each where their card has less than the 1000 px a table of them wants, as in
    // 1280 px of window with the side bar open, and the table in 1920.
    await page.goto(`/admin/actors/${d.actors.grader.actor_id}`)
    const creds = page.locator('.creds')
    await expect(creds.locator('.creds-token, .creds__table').first()).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration', chat: false })
    await expect(creds.locator('.creds-token').first()).toBeVisible()
    await expect(creds.locator('.creds__table')).toHaveCount(0)
    await expect.poll(() => cellsInFirstRow(page.locator('.actor__desc'))).toBe(4)
    await photograph(page, 'layout-actor-agent-1280')
    await layout(page, 1920, 1080, { side: true, view: 'Administration', chat: false })
    await expect(creds.locator('.creds__table')).toBeVisible()
    await expect(creds.locator('.creds-token')).toHaveCount(0)
  })
})
