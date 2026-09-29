/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { activityBar, call, chatButton, coursePath, demo, photograph, showSideView, signIn } from './support'

// A page's two columns follow the page's own width, not the window's: with
// the side bar open on the left and the chat panel docked on the right, a
// window 1280 px wide leaves the page about 500 px, and a column squeezed to
// a sliver there reads worse than one column. Each page stacks its columns
// where its main one would be left less than about 420 px, and keeps them
// side by side where there is room; side by side, the two columns of cards
// end on one line.

/** The side bar on the left and the chat panel on the right, both open, in a window this size. */
async function bothPanels(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await showSideView(page, 'Courses')
  const chat = chatButton(page)
  if ((await chat.getAttribute('aria-expanded')) !== 'true') await chat.click()
  const panel = page.locator('#chat-panel')
  await expect(panel).toBeVisible()
  await expect(panel).not.toHaveClass(/is-floating/)
}

async function box(l: Locator) {
  const b = await l.boundingBox()
  expect(b, 'laid out').toBeTruthy()
  return b!
}

/** The chat panel docked, and the side bar collapsed to its activity bar, in a window this size. */
async function chatOnly(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  // The view shown, pressed again, collapses the side bar.
  const shown = activityBar(page).locator('button[aria-expanded="true"]')
  if (await shown.count()) await shown.click()
  await expect(page.locator('#side-bar')).toHaveCount(0)
  const chat = chatButton(page)
  if ((await chat.getAttribute('aria-expanded')) !== 'true') await chat.click()
  await expect(page.locator('#chat-panel')).not.toHaveClass(/is-floating/)
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

test.describe('pages beside both side bars', () => {
  test('the course overview keeps "About this course" readable at 1280 px, and its two columns where there is room', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.overview .about')).toBeVisible()
    await bothPanels(page, 1280, 800)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-overview-1280')

    const main = page.locator('.overview__main')
    const side = page.locator('.overview__side')
    const about = await box(page.locator('.overview .about'))
    const inOne = await stacked(main, side)
    expect(
      about.width >= 380 || inOne,
      `About this course is ${Math.round(about.width)} px wide, beside the seat`,
    ).toBe(true)
    expect(inOne, 'about 500 px of page: one column').toBe(true)
    expect(about.width).toBeGreaterThanOrEqual(380)
    // Nothing scrolls sideways.
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(scroll).toBeLessThanOrEqual(0)

    // A dialog opened from inside it still covers the whole window, above the header.
    await page.locator('.overview .about').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    const at = await box(dialog)
    expect(Math.abs(at.x + at.width / 2 - 640)).toBeLessThanOrEqual(2)
    const cover = await page.evaluate(() => {
      const top = document.elementFromPoint(4, 4)
      const overlay = top?.closest('.el-overlay') as HTMLElement | null
      const r = overlay?.getBoundingClientRect()
      return { onTop: !!overlay, rect: r ? [r.x, r.y, r.width, r.height] : null }
    })
    expect(cover.onTop, 'the dialog’s dimmed layer is above the header').toBe(true)
    expect(cover.rect).toEqual([0, 0, 1280, 800])
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // With room, the two columns are side by side, and the main one keeps its width.
    await bothPanels(page, 1920, 1080)
    expect(await stacked(main, side)).toBe(false)
    expect((await box(main)).width).toBeGreaterThanOrEqual(420)
    await photograph(page, 'layout-overview-1920')
  })

  test('an assignment keeps its main column readable at 1280 px, and its facts beside it where there is room', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
    const main = page.locator('.assignment-view__main')
    const side = page.locator('.assignment-view__side')
    await expect(main).toBeVisible()
    await bothPanels(page, 1280, 800)
    await page.mouse.move(0, 400)
    await photograph(page, 'layout-assignment-1280')
    const inOne = await stacked(main, side)
    expect((await box(main)).width >= 420 || inOne).toBe(true)
    expect(inOne, 'about 500 px of page: one column').toBe(true)

    await bothPanels(page, 1920, 1080)
    expect(await stacked(main, side)).toBe(false)
    expect((await box(main)).width).toBeGreaterThanOrEqual(420)
  })

  test('an agent’s page ends its two columns of cards on one line beside the chat panel, and stacks them where it is narrow', async ({
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

    // 1280 px, the chat panel docked beside a collapsed side bar: about 760 px of page, two columns.
    await chatOnly(page, 1280, 800)
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

    // With the side bar open as well, about 500 px: one column, nothing stretched.
    await bothPanels(page, 1280, 800)
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
    // 1600 px with both side bars: about 820 px of page, two columns.
    await bothPanels(page, 1600, 900)
    expect(await stacked(main, side)).toBe(false)
    expect(Math.abs((await lastCardBottom(main)) - (await lastCardBottom(side)))).toBeLessThanOrEqual(1)
    await photograph(page, 'layout-overview-1600')
    // At 1280 px: one column.
    await bothPanels(page, 1280, 800)
    expect(await stacked(main, side)).toBe(true)
  })
})
