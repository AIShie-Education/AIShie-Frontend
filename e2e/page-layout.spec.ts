/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { activityBar, call, chatWindow, coursePath, demo, openChat, photograph, showSideView, signIn } from './support'

// A page's two columns follow the page's own width, not the window's: the
// side bar open on the left takes 260 px from it, and the chat, a window
// floating over the page, takes nothing. Each page stacks its columns where
// its main one would be left less than about 420 px, and keeps them side by
// side where there is room; side by side, the two columns of cards end on
// one line. Opening, resizing or moving the chat's window changes nothing of
// the page under it.

/** The side bar open (or collapsed), and the chat's window open, in a window this size. */
async function layout(page: Page, width: number, height: number, opts: { side: boolean }) {
  await page.setViewportSize({ width, height })
  if (opts.side) await showSideView(page, 'Courses')
  else {
    // The view shown, pressed again, collapses the side bar.
    const shown = activityBar(page).locator('button[aria-expanded="true"]')
    if (await shown.count()) await shown.click()
    await expect(page.locator('#side-bar')).toHaveCount(0)
  }
  const panel = await openChat(page)
  await expect(panel).toHaveClass(/is-window/)
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
    agent ??= (await call(I, 'POST', '/v1/me/agents', { display_name: `Layout agent ${Date.now().toString(36)}` })).body
      .result.actor_id
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
