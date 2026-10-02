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
import { startStandInIdp } from './stand-in-idp'

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

/**
 * Fails each test of the describe it is called in on a loop of ResizeObservers the browser reports. What a page
 * switches by its own width is never switched in a ResizeObserver's callback (useContainerWidth), and a table whose
 * columns follow the switch is laid out again in the same task (useTableRelayout): otherwise an el-table lays itself
 * out again in its own observer's callback, in the frame that saw the change, and the browser reports a loop. None,
 * on any page, however the window and the side bar change, but where a test excuses a page by its path (returned),
 * saying why.
 */
function noResizeObserverLoops() {
  let loops: string[] = []
  let excused: string[] = []
  test.beforeEach(async ({ page }) => {
    loops = []
    excused = []
    await page.exposeFunction('reportResizeObserverLoop', (where: string, message: string) =>
      loops.push(`${where}: ${message}`),
    )
    await page.addInitScript(() => {
      window.addEventListener('error', (e) => {
        if (String(e.message).includes('ResizeObserver loop')) {
          const report = (window as unknown as { reportResizeObserverLoop: (w: string, m: string) => void })
            .reportResizeObserverLoop
          void report(`${location.pathname}${location.search} at ${innerWidth} px`, e.message)
        }
      })
    })
  })
  test.afterEach(() => {
    expect(loops.filter((l) => !excused.some((path) => l.startsWith(`${path} at `)))).toEqual([])
  })
  return { excuse: (path: string) => void excused.push(path) }
}

test.describe('an administrator’s pages beside the side bar, under the chat’s window', () => {
  noResizeObserverLoops()

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

    // The course's tabs: one row at every width, never wrapped. As many as fit by the strip's own width, seven
    // places at most, the rest under More: in a window of 1100 px with the side bar open, fewer than with it
    // collapsed in one of 1000, where six and More fit. Where the page is a phone's, every tab is in the strip,
    // which scrolls sideways.
    await page.goto(`/courses/${courseId}`)
    const tabs = page.locator('.course-tabs')
    await expect(tabs).toBeVisible()
    const strip = () =>
      tabs.evaluate((nav) => {
        const items = [...nav.querySelectorAll('.course-tabs__item')]
        const tops = items.map((t) => Math.round(t.getBoundingClientRect().top))
        return {
          rows: new Set(tops).size,
          scrolls: nav.scrollWidth > nav.clientWidth,
          places: items.length,
          more: !!nav.querySelector('.course-tabs__more'),
        }
      })
    await layout(page, 1100, 800, { side: true })
    expect(await pageWidth(page)).toBe(1100 - 48 - 260)
    await expect.poll(strip).toMatchObject({ rows: 1, scrolls: false, more: true })
    const beside = (await strip()).places
    expect(beside).toBeLessThanOrEqual(7)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-course-tabs-1100')
    await layout(page, 1000, 800, { side: false })
    await expect.poll(strip).toEqual({ rows: 1, scrolls: false, places: 7, more: true })
    // Narrower than the six tabs (a window of 700 px, its side bar a menu): fewer of them beside More, one row.
    await page.setViewportSize({ width: 700, height: 800 })
    await expect.poll(async () => (await strip()).places).toBeLessThan(7)
    expect((await strip()).rows).toBe(1)
    expect((await strip()).more).toBe(true)
    expect((await strip()).scrolls).toBe(false)
    // A phone's page: every tab, scrolling.
    await page.setViewportSize({ width: 600, height: 800 })
    await expect.poll(strip).toMatchObject({ rows: 1, scrolls: true, more: false })
    expect(await noSideways(page)).toBe(true)
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

/** The text of each of a table's heading cells, in order; a table that is not there has none. */
async function headingsOf(page: Page, table: string) {
  const t = page.locator(table)
  return (await t.count()) ? headings(t.first()) : []
}

/** How wide a table's heading cell is, by its text. */
async function headingWidth(table: Locator, name: string) {
  return Math.round((await box(table.locator('thead th').filter({ hasText: name }).first())).width)
}

test.describe('a course’s tables beside the side bar, under the chat’s window', () => {
  noResizeObserverLoops()

  test('a course’s members, a member’s page and My actions are laid out for the page’s width, not the window’s', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)

    // The members: every column in 1100 px of window with the side bar open (744 px of page); in 1000 (644 px of
    // page, under the 720 px a window of 767 used to leave) role and status under the name, which a window of
    // 1000 px alone would not have done.
    await page.goto(coursePath('members'))
    await expect(page.locator('.members__table')).toBeVisible()
    await layout(page, 1100, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.members__table')).toContain('Role')
    await layout(page, 1000, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.members__table')).toEqual(['Name', 'Reach'])
    await expect(page.locator('.members__stack').first()).toBeVisible()
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-members-1000')
    await layout(page, 1000, 800, { side: false })
    await expect.poll(() => headingsOf(page, '.members__table')).toContain('Role')
    // The side bar opened in 900 px of window (from 852 px of page to 544): folded at once, the table laid out
    // once on its new columns.
    await layout(page, 900, 800, { side: false })
    await expect.poll(() => headingsOf(page, '.members__table')).toContain('Role')
    await layout(page, 900, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.members__table')).toEqual(['Name', 'Reach'])

    // A member's page: the seat's facts in one column in 644 px of page, two with the side bar collapsed.
    await page.goto(coursePath(`members/${d.actors.yuki.member_id}`))
    const seat = page.locator('.member__desc')
    await expect(seat).toBeVisible()
    await layout(page, 1000, 800, { side: true })
    await expect(seat).toHaveClass(/is-narrow/)
    expect(await noSideways(page)).toBe(true)
    await layout(page, 1000, 800, { side: false })
    await expect(seat).not.toHaveClass(/is-narrow/)
    await expect.poll(() => cellsInFirstRow(seat)).toBe(4)

    // My actions: status and when under each action in 644 px of page.
    await page.goto(coursePath('my-actions'))
    await expect(page.locator('.my-actions__table')).toBeVisible()
    await layout(page, 1000, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.my-actions__table')).toEqual(['Action'])
    await expect(page.locator('.my-actions__stack').first()).toBeVisible()
    await layout(page, 1000, 800, { side: false })
    await expect.poll(() => headingsOf(page, '.my-actions__table')).toContain('Status')
  })

  test('a course’s assignments and grades are laid out for the page’s width, not the window’s', async ({ page }) => {
    await signIn(page, demo().actors.instructor)

    // What switched where a window was a phone's (640 px, 592 of page) switches where the page is as narrow: in
    // 900 px of window with the side bar open, 544 px of page, and not in 1000 (644), nor in 900 with the side bar
    // collapsed. The assignments: points and the rest under the title.
    await page.goto(coursePath('assignments'))
    await expect(page.locator('.assignments-view__table')).toBeVisible()
    await layout(page, 900, 800, { side: true })
    expect(await pageWidth(page)).toBe(900 - 48 - 260)
    await expect.poll(() => headingsOf(page, '.assignments-view__table')).toEqual(['Assignment', 'Due'])
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-assignments-900')
    await layout(page, 1000, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.assignments-view__table')).toContain('Points')
    await layout(page, 900, 800, { side: false })
    await expect.poll(() => headingsOf(page, '.assignments-view__table')).toContain('Points')
    await layout(page, 900, 800, { side: true })
    await expect.poll(() => headingsOf(page, '.assignments-view__table')).toEqual(['Assignment', 'Due'])

    // The grades: a card each in 544 px of page.
    await page.goto(coursePath('grades'))
    await expect(page.locator('.grades-view__table, .grades-list').first()).toBeVisible()
    await layout(page, 900, 800, { side: true })
    await expect(page.locator('.grades-list')).toBeVisible()
    await expect(page.locator('.grades-view__table')).toHaveCount(0)
    expect(await noSideways(page)).toBe(true)
    await layout(page, 1000, 800, { side: true })
    await expect(page.locator('.grades-view__table')).toBeVisible()
    await expect(page.locator('.grades-list')).toHaveCount(0)
  })

  test('an assignment’s roster, the submissions and a grade’s breakdown are laid out for the page’s width, not the window’s', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)

    // What switched where a window was a phone's (640 px, 592 of page) switches where the page is as narrow, in
    // 900 px of window with the side bar open (544 px of page). An assignment's roster, and the submissions: a card each in 544 px of page.
    await page.goto(coursePath(`submissions?assignment=${d.course.assignments.hw1}`))
    await expect(page.locator('.roster-table, .roster-cards').first()).toBeVisible()
    await layout(page, 900, 800, { side: true })
    await expect(page.locator('.roster-cards')).toBeVisible()
    await expect(page.locator('.roster-table')).toHaveCount(0)
    expect(await noSideways(page)).toBe(true)
    await layout(page, 900, 800, { side: false })
    await expect(page.locator('.roster-table')).toBeVisible()
    await page.goto(coursePath('submissions'))
    await expect(page.locator('.submissions-table, .submission-cards').first()).toBeVisible()
    await layout(page, 900, 800, { side: true })
    await expect(page.locator('.submission-cards')).toBeVisible()
    await layout(page, 1000, 800, { side: true })
    await expect(page.locator('.submissions-table')).toBeVisible()
    await expect(page.locator('.submission-cards')).toHaveCount(0)

    // A grade's breakdown: a block per criterion in 544 px of page, a table in 644. The midterm's draft grade,
    // given a breakdown as Core would return it.
    const gradePath = `/v1/courses/${d.course.id}/grades/${d.course.midterm_draft_grade}`
    await page.route(`**${gradePath}`, async (route) => {
      const reply = await route.fetch()
      const body = await reply.json()
      const grade = body.result ?? body
      grade.breakdown = [
        { criterion: 'Recursion', points: '38', max: '50', comment: 'Revisit the base case.' },
        { criterion: 'Data structures', points: '40', max: '50' },
      ]
      await route.fulfill({ response: reply, json: body })
    })
    await page.goto(coursePath(`grades/${d.course.midterm_draft_grade}`))
    const breakdown = page.locator('.bd-table')
    await expect(breakdown).toBeVisible()
    await layout(page, 900, 800, { side: true })
    await expect(breakdown.locator('.bd-list')).toBeVisible()
    await expect(breakdown.locator('.el-table')).toHaveCount(0)
    expect(await noSideways(page)).toBe(true)
    await layout(page, 1000, 800, { side: true })
    await expect(breakdown.locator('.el-table')).toBeVisible()
    await expect(breakdown.locator('.bd-list')).toHaveCount(0)
  })

  test('a student’s gradebook is laid out for its card’s width, not the window’s', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)

    // A student's gradebook: every column where its card has the 1060 px they take with a grader's actions, as
    // with the side bar open in 1920 px of window, or collapsed in 1280; in 1280 with it open what they say goes
    // under each line's name.
    await page.goto(coursePath(`gradebook/${d.actors.yuki.member_id}`))
    const gradebook = '.gradebook__table'
    await expect(page.locator(gradebook)).toBeVisible()
    await layout(page, 1280, 800, { side: true })
    await expect.poll(() => headingsOf(page, gradebook)).toEqual(['Component or assignment', 'Result'])
    await expect(page.locator('.gradebook__sub').filter({ hasText: 'Weight' }).first()).toBeVisible()
    // The fold keeps what the columns said: an unscored line's points possible, and a component with nothing posted.
    await expect(page.locator('.gradebook__sub').filter({ hasText: '— / 100' }).first()).toBeVisible()
    await expect(page.locator('.gradebook__sub').filter({ hasText: 'No posted grades yet' }).first()).toBeVisible()
    expect(await noSideways(page)).toBe(true)
    await page.locator('.gradebook__table').scrollIntoViewIfNeeded()
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-gradebook-1280')
    await layout(page, 1280, 800, { side: false })
    await expect.poll(() => headingsOf(page, gradebook)).toContain('At posting')
    await layout(page, 1920, 1080, { side: true })
    await expect.poll(() => headingsOf(page, gradebook)).toContain('At posting')
    await expect(page.locator('.gradebook__sub')).toHaveCount(0)
  })
})

/** The agent runtime's admin routes the tables read, played in the browser from its contract, a row or two each. */
async function playRuntimeTables(page: Page) {
  const ADMIN = '0192f3c1-aaaa-7c3a-9b1f-2a4c6e8f0a1b'
  const offer = (id: string, label: string, source: 'config' | 'site') => ({
    id,
    source,
    label,
    provider: 'openai',
    adapter: 'openai_chat',
    model: 'gpt-4.1-mini',
    endpoint: null,
    resource: null,
    region: null,
    base_url: null,
    max_output_tokens: null,
    reasoning_effort: null,
    enabled: true,
    status: 'offered',
    priced: true,
    agents: 2,
    key_hint: source === 'site' ? 'sk-…e2e0' : null,
    key_status: source === 'site' ? 'tested' : null,
    version: source === 'site' ? 1 : null,
    created_at: null,
    created_by: null,
    updated_at: null,
    updated_by: null,
  })
  const price = (id: string, source: 'file' | 'site') => ({
    id,
    source,
    provider: 'openai',
    model: 'gpt-4.1-mini',
    glob: false,
    from: '2026-09-01',
    usd_per_mtok: { input: '0.4', cache_read: '0.1', cache_write: '0.4', output: '1.6' },
    version: `2026-09-27/${id}`,
    overridden: false,
    row_version: source === 'site' ? 1 : null,
    created_at: null,
    created_by: null,
    updated_at: null,
    updated_by: null,
  })
  const calls = {
    kind: 'model_calls',
    calls: 120,
    unpriced_calls: 0,
    tokens: { input: 150000, cache_read: 20000, cache_write: 0, output: 30000 },
    cost_usd: '1.250000',
  }
  const day = (key: string) => ({
    key,
    day: key,
    tenant_id: null,
    owner_actor_id: null,
    display_name: null,
    agent_id: null,
    agent_name: null,
    key_source: null,
    provider: null,
    model: null,
    offers: null,
    cost_usd: '1.250000',
    lines: [calls],
  })
  const quotas = { per_owner_day: 100, per_asker_day: 20, per_day: null }
  const job = (id: string, status: 'done' | 'failed') => ({
    id,
    version_id: '0192f3c1-0000-7000-8000-000000000001',
    document_id: '0192f3c1-0000-7000-8000-000000000002',
    course_id: '0192f3c1-0000-7000-8000-000000000003',
    status,
    reason: status === 'failed' ? 'provider_error' : null,
    backfill: false,
    content_type: 'application/pdf',
    byte_size: 900_000,
    pages: 12,
    offer: 'standard',
    model: 'gpt-4.1-mini',
    cost_usd: '0.042000',
    input_tokens: 12000,
    output_tokens: 3000,
    started_at: '2026-10-01T08:00:00Z',
    finished_at: '2026-10-01T08:02:00Z',
  })
  const answers: Record<string, unknown> = {
    '/info': {
      api: 'aishie-runtime',
      api_version: 1,
      version: 'e2e',
      commit: 'e2e',
      audience: 'https://e2e.test/runtime',
      issuer: 'https://e2e.test',
      features: { host_by_id: true, own_key: true, school_key: true },
    },
    '/me': { actor_id: 'root', display_name: 'root', is_admin: true, hosted_agents: 0 },
    '/models': { own_key: { offered: true, providers: [] }, school_key: { offered: true, offers: [] } },
    '/admin/school-plan': {
      offers: [offer('standard', 'School AI (standard)', 'config'), offer('fast', 'School AI (fast)', 'site')],
      quotas,
      quota_defaults: quotas,
      quotas_set: false,
      quotas_updated_at: null,
      quotas_updated_by: null,
    },
    '/admin/prices': {
      version: '2026-09-27',
      file_version: '2026-09-27',
      site_version: null,
      site_changed_at: null,
      rows: [price('site-1', 'site'), price('0', 'file')],
      unpriced_offers: [],
    },
    '/admin/tenants': {
      tenants: [
        {
          tenant_id: `ten_${ADMIN}`,
          owner_actor_id: ADMIN,
          display_name: 'Ada Admin',
          source: 'site',
          per_day: { answers: 300, usd: '5.000000' },
          config_per_day: { answers: 200, usd: null },
          agents: 2,
          updated_at: null,
          updated_by: null,
        },
      ],
      next: null,
    },
    '/admin/agent-budgets': {
      per_agent_day: { answers: 500, usd: null },
      per_asker_day: { answers: 40, usd: null },
      defaults: { per_agent_day: { answers: 400, usd: null }, per_asker_day: { answers: 30, usd: null } },
      set: false,
      updated_at: null,
      updated_by: null,
    },
    '/admin/costs': {
      since: '2026-09-03',
      until: '2026-10-02',
      group: 'day',
      key_source: null,
      total: { cost_usd: '2.500000', lines: [{ ...calls, calls: 240, cost_usd: '2.500000' }] },
      rows: [day('2026-09-29'), day('2026-09-28')],
      next: null,
    },
    '/admin/settings': {
      ocr: {
        available: true,
        unavailable_reason: null,
        unavailable_detail: null,
        enabled: true,
        languages: ['eng'],
        default_languages: ['eng'],
        available_languages: ['eng'],
        updated_at: null,
        updated_by: null,
      },
      transcription: {
        available: true,
        unavailable_reason: null,
        unavailable_detail: null,
        enabled: true,
        offer: 'standard',
        offer_status: 'ok',
        max_pages: 300,
        per_day_pages: null,
        concurrency: 2,
        credential: {
          status: 'none',
          hint: null,
          credential_id: null,
          set_at: null,
          set_by: null,
          last_ok_at: null,
          last_error: null,
        },
        state: 'running',
        blocked_reason: null,
        today: { pages: 24, documents: 2, failed: 1, skipped: 0, cost_usd: '0.084000' },
        updated_at: null,
        updated_by: null,
      },
    },
    '/admin/transcription/jobs': { jobs: [job('job-1', 'done'), job('job-2', 'failed')], next: null },
    '/admin/school-plan/usage': {
      since: '2026-10-02T00:00:00Z',
      limits: { per_owner_day: 100, per_asker_day: 20, per_day: null },
      total: { answers: 150, model_calls: 380, cost_usd: '1.020000' },
      owners: [
        {
          tenant_id: `ten_${ADMIN}`,
          owner_actor_id: ADMIN,
          display_name: 'Ada Admin',
          answers: 150,
          model_calls: 380,
          cost_usd: '1.020000',
        },
      ],
    },
  }
  await page.route('**/runtime/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/runtime/api/v1', '')
    if (path in answers) return route.fulfill({ status: 200, json: answers[path] })
    return route.fulfill({
      status: 404,
      json: { error: { code: 'not_found', message: 'no route', details: { reason: 'no_route' } } },
    })
  })
  await page.route('**/v1/auth/assertion', (route) =>
    route.fulfill({
      status: 200,
      json: {
        assertion: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJyb290In0.ZTJl',
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    }),
  )
}

test.describe('the platform’s settings beside the side bar', () => {
  const loops = noResizeObserverLoops()

  test('the terms, the sign-in providers and the departments are laid out for their cards’ width, not the window’s', async ({
    page,
    baseURL,
  }) => {
    // A provider of the site's to list, against a stand-in of an identity provider.
    const R = root().token
    const listed = await call(R, 'GET', '/v1/sso/providers')
    const idp = await startStandInIdp({
      redirectUri: listed.body.result.redirect_uri,
      backTo: baseURL!,
      subject: 'layout@campus.example',
      email: 'layout@campus.example',
    })
    const id = `layout-${Date.now().toString(36)}`
    done(
      await call(R, 'POST', '/v1/sso/providers', {
        id,
        display_name: 'Campus sign-in, laid out',
        issuer: idp.issuer,
        client_id: idp.clientId,
        client_secret: idp.clientSecret,
      }),
      'sso.create',
    )
    try {
      await signInAsRoot(page)

      // The terms: every column where their card has the 780 px they take, as in 1280 px of window with the side
      // bar open; in 1100 the dates under the name, which a window of 1100 px alone would not have done.
      await page.goto('/admin/terms')
      const terms = '.app-card .el-table'
      await expect(page.locator(terms)).toBeVisible()
      await layout(page, 1280, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingsOf(page, terms)).toEqual(['Name', 'Status', 'Starts', 'Ends', 'Length', 'ID'])
      await layout(page, 1100, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingsOf(page, terms)).toEqual(['Name', 'Status'])
      await expect(page.locator('.term-meta').first()).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      await page.mouse.move(0, 400)
      await photograph(page, 'layout-terms-1100')
      await layout(page, 1100, 800, { side: false, chat: false })
      await expect.poll(() => headingsOf(page, terms)).toContain('Starts')

      // Sign-in: every column where the providers' card has 760 px, as in 1280; in 1100 a provider's status,
      // accounts and actions under its name. This page alone is excused a loop of observers. As the side bar opens
      // in 1280 px of window, the table stays whole and goes from 1134 px of card to 874. The el-table then lays its
      // columns out again in its own observer's callback, and a row comes out a pixel taller. Nothing of the page
      // switches there, and main raises the same loop.
      loops.excuse('/admin/sign-in')
      await page.goto('/admin/sign-in')
      const providers = '.sso-admin__table'
      await expect(page.locator(`[data-provider="${id}"]`)).toBeVisible()
      await layout(page, 1280, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingsOf(page, providers)).toEqual(['Provider', 'Status', 'Linked', 'On', 'Actions'])
      await layout(page, 1100, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingsOf(page, providers)).toEqual(['Provider', 'On'])
      const row = page.locator(`${providers} tbody tr`).filter({ has: page.locator(`[data-provider="${id}"]`) })
      await expect(row.locator('.sso-cell__linked')).toBeVisible()
      await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible()
      expect(await noSideways(page)).toBe(true)
      await page.mouse.move(0, 400)
      await photograph(page, 'layout-sso-1100')

      // The departments: their columns closed up further where the card is as narrow as on a phone (542 px), as
      // in 900 px of window with the side bar open, and not in 1000.
      await page.goto('/admin/departments')
      const tree = page.locator('.dept-tree')
      await expect(tree).toBeVisible()
      await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingWidth(tree, 'Administrators')).toBe(110)
      expect(await noSideways(page)).toBe(true)
      await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingWidth(tree, 'Administrators')).toBe(130)
      // The side bar opened in 900 px of window: the columns close up at once, the tree laid out once.
      await layout(page, 900, 800, { side: false, chat: false })
      await expect.poll(() => headingWidth(tree, 'Administrators')).toBe(130)
      await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
      await expect.poll(() => headingWidth(tree, 'Administrators')).toBe(110)
    } finally {
      await call(R, 'POST', `/v1/sso/providers/${id}/delete`, { force: true })
      await idp.close()
    }
  })

  test('the agent runtime’s tables are laid out for their cards’ width, not the window’s', async ({ page }) => {
    await playRuntimeTables(page)
    await signInAsRoot(page)

    // The school's AI plan: every column where the card has 810 px, as in 1280 px of window with the side bar
    // open; in 1100 an offer's status, key, agents and actions under its name.
    await page.goto('/admin/runtime')
    const offers = '.offers-card__table'
    await expect(page.locator(offers)).toBeVisible()
    await layout(page, 1280, 800, { side: true, view: 'Administration', chat: false })
    await expect
      .poll(() => headingsOf(page, offers))
      .toEqual(['Model', 'Status', 'Key', 'Agents', 'Offered', 'Actions'])
    await layout(page, 1100, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, offers)).toEqual(['Model', 'Offered'])
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-runtime-plan-1100')

    // Pricing: the prices (670 px) and the quotas per person (690) folded in 1000 px of window with the side bar
    // open (594 px of card) and not in 1100 (694); what things cost as on a phone in 900 (494), not in 1000.
    await page.goto('/admin/runtime?tab=pricing')
    const [prices, tenants, costs] = ['.prices-card__table', '.tenants-card__table', '.costs-card__table']
    await expect(page.locator(costs)).toBeVisible()
    await layout(page, 1100, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, prices)).toContain('Input')
    await expect.poll(() => headingsOf(page, tenants)).toContain('Set by')
    await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, prices)).toEqual(['Model'])
    await expect.poll(() => headingsOf(page, tenants)).toEqual(['Person or tenant'])
    await expect(page.locator('.tenant-cell__server')).toHaveText('server: 200 · No limit')
    await expect.poll(() => headingsOf(page, costs)).toEqual(['Day', 'Model calls', 'Tokens', 'Cost'])
    expect(await noSideways(page)).toBe(true)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-runtime-pricing-1000')
    // The side bar collapsed in 1000 px (952 px of page): every column again; opened, folded again.
    await layout(page, 1000, 800, { side: false, chat: false })
    await expect.poll(() => headingsOf(page, prices)).toContain('Input')
    await expect.poll(() => headingsOf(page, tenants)).toContain('Set by')
    await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, prices)).toEqual(['Model'])
    await expect.poll(() => headingsOf(page, tenants)).toEqual(['Person or tenant'])
    await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, costs)).toEqual(['Day', 'Cost'])
    expect(await noSideways(page)).toBe(true)

    // Today's use: an owner's calls and cost under their name in 900, columns of their own in 1000.
    await page.goto('/admin/runtime?tab=usage')
    const usage = '.usage-card__table'
    await expect(page.locator(usage)).toBeVisible()
    await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, usage)).toEqual(['Owner', 'Answers'])
    await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, usage)).toEqual(['Owner', 'Answers', 'Model calls', 'Cost'])

    // What it transcribed: a job's pages, cost and time under its document in 900, columns of their own in 1000.
    await page.goto('/admin/runtime?tab=documents')
    const jobs = '.transcription-jobs__table'
    await expect(page.locator(jobs)).toBeVisible()
    await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, jobs)).toEqual(['Document'])
    expect(await noSideways(page)).toBe(true)
    await layout(page, 1000, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, jobs)).toContain('Finished')
    await layout(page, 900, 800, { side: false, chat: false })
    await expect.poll(() => headingsOf(page, jobs)).toContain('Finished')
    await layout(page, 900, 800, { side: true, view: 'Administration', chat: false })
    await expect.poll(() => headingsOf(page, jobs)).toEqual(['Document'])
  })
})
