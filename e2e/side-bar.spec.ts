/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  activityBar,
  call,
  coursePath,
  demo,
  registerPerson,
  root,
  showSideView,
  sideBar,
  signIn,
  signInAsRoot,
} from './support'

// The left of every signed-in page, laid out as an editor's: an activity bar
// along the window's edge, with a button for each view the caller is offered
// (their courses, their agents, administration), and beside it the side bar
// with the view chosen. A button shows its view, or collapses the side bar
// when its view is the one shown; the view follows the page, without opening
// a side bar that was collapsed; and this browser remembers the view, the
// width and whether it is open. On a phone the header's menu shows the views
// as tabs instead.

const STAMP = Date.now().toString(36)

/** The activity bar's buttons, by name, in order. */
async function views(page: Page) {
  return activityBar(page)
    .getByRole('button')
    .evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox()
  expect(b, selector).not.toBeNull()
  return b!
}

test.describe('the activity bar and the side bar', () => {
  test('are along the left edge of every signed-in page, the side bar beside the bar and the page beside both', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    const height = page.viewportSize()!.height
    for (const [path, what] of [
      ['/', 'home'],
      [coursePath(), 'the course overview'],
      [coursePath('materials'), 'materials'],
      [coursePath('members'), 'members'],
      [coursePath('grades'), 'grades'],
      ['/account', 'the account'],
      ['/account/agents', 'my agents'],
    ] as const) {
      await page.goto(path)
      await expect(page.locator('.app-main').first(), what).toBeVisible()
      const bar = activityBar(page)
      await expect(bar, what).toBeVisible()
      await expect(bar, what).toHaveAttribute('aria-orientation', 'vertical')
      expect(await views(page), what).toEqual(['Courses', 'Agents'])
      // From the window's top to its bottom, 48 px wide, at its left edge, the mark on top leading home.
      const edge = await box(page, '.activity-bar')
      expect(edge.x, what).toBe(0)
      expect(edge.y, what).toBe(0)
      expect(Math.round(edge.width), what).toBe(48)
      expect(Math.round(edge.height), what).toBe(height)
      await expect(page.locator('.activity-bar__home'), what).toHaveAttribute('href', '/')
      // The side bar beside it, and then the page.
      const side = await box(page, '#side-bar')
      expect(Math.round(side.x), what).toBe(48)
      expect(Math.round(side.width), what).toBe(260)
      expect(Math.round(side.height), what).toBe(height)
      const main = await box(page, '.app-main-wrap')
      expect(main.x, what).toBeGreaterThanOrEqual(side.x + side.width - 1)
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(scroll, `${what} scrolls sideways`).toBeLessThanOrEqual(1)
    }
  })

  test('Courses opens the caller’s courses, and choosing one goes to it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto('/account')
    // Collapsed first: the Courses button opens the side bar on the courses.
    const courses = activityBar(page).getByRole('button', { name: 'Courses', exact: true })
    await expect(courses).toHaveAttribute('aria-expanded', 'true')
    await courses.click()
    await expect(sideBar(page)).toHaveCount(0)
    await expect(courses).toHaveAttribute('aria-expanded', 'false')
    await courses.click()
    const bar = sideBar(page)
    await expect(bar.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible()

    const course = bar.locator(`a.side-course[href="${coursePath()}"]`)
    await expect(course).toContainText('CS101 · A')
    await expect(course).toContainText('Introduction to Programming')
    await expect(course).toContainText('Instructor')
    await expect(course).not.toHaveAttribute('aria-current', 'page')
    await course.click()
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
    await expect(page.locator('.course-head__title')).toHaveText('Introduction to Programming')
    await expect(course).toHaveAttribute('aria-current', 'page')
    await expect(course).toHaveClass(/is-active/)
    // Still the course's, on its other pages.
    await page.goto(coursePath('materials'))
    await expect(course).toHaveClass(/is-active/)

    // Filtered by what is typed.
    await bar.getByPlaceholder('Filter courses').fill(`no such course ${STAMP}`)
    await expect(course).toHaveCount(0)
    await expect(bar).toContainText('No course matches.')
    await bar.getByPlaceholder('Filter courses').fill('introduction to prog')
    await expect(course).toBeVisible()

    // And the whole list is a link away.
    await bar.getByRole('link', { name: 'My courses' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('Administration is on the activity bar for administrators alone', async ({ page, browser }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await expect(activityBar(page)).toBeVisible()
    expect(await views(page)).toEqual(['Courses', 'Agents'])
    await page.goto('/admin/courses')
    await expect(page).toHaveURL(/\/$/)
    expect(await views(page)).toEqual(['Courses', 'Agents'])

    const admin = await browser.newPage()
    await signInAsRoot(admin)
    await expect(activityBar(admin)).toBeVisible()
    expect(await views(admin)).toEqual(['Courses', 'Agents', 'Administration'])
    const bar = await showSideView(admin, 'Administration')
    await expect(bar.getByRole('link')).toHaveText([
      'Courses',
      'People & agents',
      'Terms',
      'Departments',
      'Permission presets',
    ])
    await bar.getByRole('link', { name: 'People & agents' }).click()
    await expect(admin).toHaveURL(/\/admin\/actors$/)
    await expect(bar.getByRole('link', { name: 'People & agents' })).toHaveAttribute('aria-current', 'page')
    // A course root makes has no seat for root: the courses view lists it apart, newest first, and it
    // opens on its administration page.
    const title = `Side bar course ${STAMP}`
    const made = await call(root().token, 'POST', '/v1/courses', {
      dept_id: d.course.dept_id,
      term_id: d.course.term_id,
      code: 'SIDE1',
      section: STAMP,
      title,
    })
    expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
    const courseId = made.body.result.course_id as string
    await admin.reload()
    const courses = await showSideView(admin, 'Courses')
    await expect(courses.getByRole('heading', { name: 'Administered, without a seat' })).toBeVisible()
    const unseated = courses.locator('a.side-course.is-unseated')
    await expect(unseated.first()).toHaveAttribute('href', `/admin/courses/${courseId}`)
    await expect(unseated.first()).toContainText(`SIDE1 · ${STAMP}`)
    await expect(unseated.first()).toContainText(title)
    await expect(unseated.first()).toContainText('Draft')
    await unseated.first().click()
    await expect(admin).toHaveURL(new RegExp(`/admin/courses/${courseId}$`))
    // An administration page: the side bar follows it to Administration, Courses standing out.
    await expect(bar.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible()
    await expect(bar.getByRole('link', { name: 'Courses' })).toHaveAttribute('aria-current', 'page')
    await admin.close()
  })

  test('follows the page to its view without opening itself, keeps its view and state, and has a fixed width', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    const bar = sideBar(page)
    const heading = (name: string) => bar.getByRole('heading', { name, exact: true })
    await page.goto('/account/agents')
    await expect(heading('Agents')).toBeVisible()
    await page.goto(coursePath())
    await expect(heading('Courses')).toBeVisible()

    // Collapsed, it stays collapsed from page to page, and over a reload.
    await activityBar(page).getByRole('button', { name: 'Courses', exact: true }).click()
    await expect(bar).toHaveCount(0)
    await page.goto('/account/agents')
    await expect(page.locator('.page-header').first()).toBeVisible()
    await expect(bar).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.page-header').first()).toBeVisible()
    await expect(bar).toHaveCount(0)
    const agents = activityBar(page).getByRole('button', { name: 'Agents', exact: true })
    await expect(agents).toHaveAttribute('aria-expanded', 'false')
    // Opened, it is on the page's view.
    await activityBar(page).getByRole('button', { name: 'Courses', exact: true }).click()
    await expect(heading('Courses')).toBeVisible()
    await agents.click()
    await expect(heading('Agents')).toBeVisible()
    await expect(bar.getByRole('link', { name: 'My agents' })).toHaveAttribute('aria-current', 'page')

    // A fixed 260 px, with no edge to resize it by: dragging its edge moves nothing.
    const width = async () => Math.round((await bar.boundingBox())!.width)
    expect(await width()).toBe(260)
    await expect(bar.getByRole('separator')).toHaveCount(0)
    await expect(page.locator('.side-bar__handle')).toHaveCount(0)
    const edge = (await bar.boundingBox())!
    await page.mouse.move(edge.x + edge.width - 1, edge.y + 300)
    await page.mouse.down()
    await page.mouse.move(edge.x + edge.width + 120, edge.y + 300, { steps: 4 })
    await page.mouse.up()
    expect(await width()).toBe(260)
    const main = await box(page, '.app-main-wrap')
    expect(Math.round(main.x)).toBe(48 + 260)

    // Its view and whether it is open are this browser's, for the next page load.
    await page.goto('/')
    await expect(page.locator('.page-header').first()).toBeVisible()
    await expect(heading('Agents')).toBeVisible()
    expect(await width()).toBe(260)
  })

  test('Agents lists the caller’s agents and registers a new one', async ({ page }) => {
    const email = `side-bar+${STAMP}@e2e.test`
    const person = await registerPerson(`Side bar ${STAMP}`, { email })
    const AGENT = `Side bar helper ${STAMP}`
    await signIn(page, person)
    const bar = await showSideView(page, 'Agents')
    await expect(bar).toContainText('You have no agents yet.')
    await bar.getByRole('button', { name: 'New agent' }).click()
    const create = page.getByRole('dialog', { name: 'New agent' })
    await create.getByLabel('Name').fill(AGENT)
    await create.getByRole('button', { name: 'Create agent' }).click()
    await expect(page).toHaveURL(/\/account\/agents\/[0-9a-f-]{36}$/)
    const agentId = page.url().split('/').pop()!
    const item = bar.locator(`a.side-agent[href="/account/agents/${agentId}"]`)
    await expect(item).toContainText(AGENT)
    await expect(item).toContainText('Never connected')
    await expect(item).toHaveAttribute('aria-current', 'page')
    await bar.getByRole('link', { name: 'My agents' }).click()
    await expect(page).toHaveURL(/\/account\/agents$/)
    await expect(page.locator('.agents-item').filter({ hasText: AGENT })).toHaveCount(1)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the menu shows the views as tabs along its top, and closes as a link in it is followed', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    await expect(activityBar(page)).toHaveCount(0)
    await expect(sideBar(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu).toBeVisible()
    const tabs = menu.getByRole('tablist', { name: 'Side bar views' })
    await expect(tabs.getByRole('tab')).toHaveText(['Courses', 'Agents'])
    await expect(tabs.getByRole('tab', { name: 'Courses' })).toHaveAttribute('aria-selected', 'true')
    // At the menu's top, the view below them.
    const top = (await tabs.boundingBox())!
    const menuBox = (await menu.boundingBox())!
    expect(Math.round(top.y)).toBe(Math.round(menuBox.y))
    const panel = menu.getByRole('tabpanel')
    await expect(panel.locator(`a.side-course[href="${coursePath()}"]`)).toHaveAttribute('aria-current', 'page')
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390)

    await tabs.getByRole('tab', { name: 'Agents' }).click()
    await expect(tabs.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true')
    await expect(panel.getByRole('link', { name: 'My agents' })).toBeVisible()
    await panel.getByRole('link', { name: 'My agents' }).click()
    await expect(page).toHaveURL(/\/account\/agents$/)
    await expect(menu).toBeHidden()

    // Opened again, on the view the page belongs to; a link to the page shown closes it too.
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(tabs.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true')
    await panel.getByRole('link', { name: 'My agents' }).click()
    await expect(menu).toBeHidden()
    await expect(page).toHaveURL(/\/account\/agents$/)
  })
})
