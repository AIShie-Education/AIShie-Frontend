/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { buildDeptWorld, type DeptWorld, type Person } from './dept-world'
import { toast } from './support'

// A department's administrator, from signing in to losing the appointment:
// they see and manage the courses and departments beneath their appointment
// and nothing else, find, invite and seat people by email, are told to seat
// themselves to work inside a course, and are told why Core refuses them.
// The world is this run's own (dept-world.ts): Ada administers Engineering.
const core = process.env.E2E_CORE_URL || 'http://localhost:8080'
const rootToken = () => process.env.E2E_ROOT_TOKEN!
let w: DeptWorld

async function signInAs(page: Page, who: Person, locale: 'en' | 'zh-Hant' = 'en') {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('aishiteru.locale', l)
    } catch {}
  }, locale)
  await page.goto('/login')
  await page.fill('input[name=email]', who.email)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).not.toHaveURL(/\/login/)
}

/** Calls a Core tool as root, by its route, for what a test arranges behind the page's back. */
async function asRoot(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(core + path, {
    method,
    headers: {
      Authorization: `Bearer ${rootToken()}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const out = await res.json()
  expect(out.status, `${method} ${path}: ${JSON.stringify(out.error ?? out)}`).toBe('executed')
  return out.result
}

const adminNav = (page: Page) => page.locator('.app-nav__section').filter({ hasText: 'Administration' })
const courseRows = (page: Page) => page.locator('.courses__table .el-table__body tr')
const deptRows = (page: Page) => page.locator('.dept-tree .el-table__body tr')

/** Picks an option of the Element Plus select `trigger`, by an option's exact text. */
async function pick(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: option }).first().click()
}

/** Opens a department's menu on the departments page and chooses an item. */
async function deptMenu(page: Page, dept: string, item: string) {
  await page.getByRole('button', { name: `What you can do with ${dept}` }).click()
  await page.locator('.el-dropdown-menu:visible').getByText(item).click()
}

/** What sticks out sideways past the page or the app's main area (a table's own scroller holds its rows). */
async function sideways(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    for (const s of [document.documentElement, document.querySelector('.app-main')].filter(Boolean) as Element[]) {
      const over = s.scrollWidth - s.clientWidth
      if (over > 1) out.push(`${s.tagName.toLowerCase()} scrolls ${over}px sideways`)
    }
    return out
  })
}

test.describe.serial('a department administrator', () => {
  test.beforeAll(async () => {
    w = await buildDeptWorld(core, rootToken(), process.env.E2E_PASSWORD!)
  })

  test('sees the courses and departments she administers, and nothing platform-only', async ({ page }) => {
    await signInAs(page, w.people.ada)
    const nav = adminNav(page)
    await expect(nav.getByRole('link', { name: 'Courses' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Departments' })).toBeVisible()
    for (const name of ['People & agents', 'Terms', 'Permission presets']) {
      await expect(nav.getByRole('link', { name })).toHaveCount(0)
    }

    await nav.getByRole('link', { name: 'Courses' }).click()
    await expect(page.locator('.page-header')).toContainText('Courses in the departments you administer, and beneath them')
    // Engineering's three courses, and never History's.
    await expect(courseRows(page)).toHaveCount(3)
    for (const c of [w.courses.ai, w.courses.computing, w.courses.design]) await expect(courseRows(page).filter({ hasText: c.code })).toHaveCount(1)
    await expect(courseRows(page).filter({ hasText: w.courses.history.code })).toHaveCount(0)

    // One department, then it with everything beneath it.
    await pick(page, page.locator('.courses__filter').nth(1), /^\s*Computing\s*$/)
    await expect(courseRows(page)).toHaveCount(1)
    await expect(courseRows(page).first()).toContainText(w.courses.computing.code)
    await page.getByText('Include sub-departments').click()
    await expect(page).toHaveURL(/[?&]within=1/)
    await expect(courseRows(page)).toHaveCount(2)
    await expect(courseRows(page).filter({ hasText: w.courses.ai.code })).toHaveCount(1)

    // The directory is a platform administrator's: its address leads home.
    await page.goto('/admin/actors')
    await expect(page).toHaveURL(/\/$/)
  })

  test('creates a course in AI and seats an instructor she finds by email', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto('/admin/courses')
    await page.locator('.page-header').getByRole('button', { name: 'New course' }).click()
    const dialog = page.getByRole('dialog', { name: 'New course' })
    await pick(page, dialog.locator('.el-select').nth(0), `(${w.tag})`)
    // Only what she administers is offered.
    await dialog.locator('.el-select').nth(1).click()
    const offered = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    await expect(offered).toHaveText([/Engineering/, /Computing/, /AI/, /Design/])
    await offered.filter({ hasText: /^\s*AI\s*$/ }).click()
    await dialog.getByPlaceholder('CS101').fill('ML600')
    await dialog.getByPlaceholder('Introduction to Programming').fill('Deep Learning')
    await dialog.getByRole('button', { name: 'Create course' }).click()
    await expect(page).toHaveURL(/\/admin\/courses\/[0-9a-f-]{36}$/)
    await expect(page.locator('.page-header')).toContainText('Deep Learning')
    await expect(page.locator('.course-admin__path')).toHaveText(`University ${w.tag} › Engineering › Computing › AI`)

    await page.locator('input[name=lookup-email]').fill(w.people.chan.email.toUpperCase())
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.locator('.lookup__found')).toContainText(w.people.chan.display_name)
    await page.getByRole('button', { name: 'Seat as instructor' }).click()
    await expect(toast(page, `${w.people.chan.display_name} is seated as instructor`)).toBeVisible()
  })

  test('invites someone new, sees the link the once, and seats them', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto(`/admin/courses/${w.courses.ai.id}`)
    const email = `pat+${w.tag}@dept.test`
    await page.locator('input[name=lookup-email]').fill(email)
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByText('Nobody is registered with that email. You can invite them.')).toBeVisible()
    await page.getByRole('button', { name: 'Invite someone new' }).click()

    const dialog = page.getByRole('dialog', { name: 'Invite a new person' })
    await expect(dialog.locator('input[name=invite-email]')).toHaveValue(email)
    await dialog.locator('input[name=invite-name]').fill('Pat Lee')
    await dialog.getByRole('button', { name: 'Register and invite' }).click()

    const link = page.locator('#reveal-invite-link')
    await expect(link).toHaveValue(/\/welcome#token=aisinv_/)
    const token = (await link.inputValue()).split('#token=')[1]!
    await page.getByRole('dialog', { name: 'Copy the invitation link now' }).getByRole('button', { name: 'Done' }).click()
    // Not copied: closing asks first.
    const sure = page.getByRole('button', { name: 'Close anyway' })
    if (await sure.isVisible().catch(() => false)) await sure.click()
    await expect(link).toHaveCount(0)
    expect(await page.content()).not.toContain(token)

    await page.getByRole('button', { name: 'Seat Pat Lee as instructor' }).click()
    await expect(toast(page, 'Pat Lee is seated as instructor')).toBeVisible()

    // Found again, she has not signed in, and Ada may invite her again.
    await page.getByRole('button', { name: 'Seat another instructor' }).click()
    await page.locator('input[name=lookup-email]').fill(email)
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.locator('.lookup__found')).toContainText('Has not signed in yet.')
    await expect(page.getByRole('button', { name: 'Invite again' })).toBeVisible()
  })

  test('opens a course she is not seated in, is told to seat herself, and does', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto(`/courses/${w.courses.computing.id}`)
    await expect(page.getByText('You have no seat in this course')).toBeVisible()
    await expect(page.getByText('Administering its department does not open a course')).toBeVisible()
    await page.getByRole('button', { name: 'Go to the course’s administration page' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/courses/${w.courses.computing.id}$`))
    await expect(page.getByText('You are not seated in this course, so its own pages will refuse you')).toBeVisible()

    await page.getByRole('button', { name: 'Me', exact: true }).click()
    await page.getByRole('button', { name: 'Seat as instructor' }).click()
    await expect(toast(page, 'Ada Lovelace is seated as instructor')).toBeVisible()
    await page.getByRole('button', { name: 'Open course' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${w.courses.computing.id}$`))
    await expect(page.locator('.course-head__title')).toHaveText(w.courses.computing.title)
    // Her way back to its administration page.
    await expect(page.locator('.course-head__admin')).toHaveAttribute('href', `/admin/courses/${w.courses.computing.id}`)
  })

  test('restructures: moves a course, makes and renames a department, and appoints Bob', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto(`/admin/courses/${w.courses.ai.id}`)
    await page.getByRole('button', { name: 'Move to another department' }).click()
    const move = page.getByRole('dialog', { name: `Move ${w.courses.ai.code}` })
    await move.locator('#move-course-to').click()
    await page.locator('.el-tree-node__content:visible').filter({ hasText: /^\s*Design\s*$/ }).click()
    await move.getByRole('button', { name: 'Move' }).click()
    await expect(toast(page, 'Moved to Design')).toBeVisible()
    await expect(page.locator('.course-admin__path')).toHaveText(`University ${w.tag} › Engineering › Design`)

    await page.goto('/admin/departments')
    await expect(deptRows(page).filter({ hasText: 'Engineering' })).toContainText('You administer this')
    await deptMenu(page, 'Computing', 'New department here')
    let form = page.getByRole('dialog', { name: 'New department under Computing' })
    await form.locator('input[name=department-name]').fill('Robotics')
    await form.getByRole('button', { name: 'Create' }).click()
    await expect(toast(page, 'Department created')).toBeVisible()
    await expect(page.locator('.dept-name__text', { hasText: /^Robotics$/ })).toBeVisible()

    await deptMenu(page, 'Robotics', 'Rename')
    form = page.getByRole('dialog', { name: 'Rename Robotics' })
    await form.locator('input[name=department-name]').fill('Robotics & Control')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Department renamed')).toBeVisible()
    await expect(page.locator('.dept-name__text', { hasText: 'Robotics & Control' })).toBeVisible()

    // A sibling's name, in another case, is refused before Core is asked.
    await deptMenu(page, 'Computing', 'New department here')
    form = page.getByRole('dialog', { name: 'New department under Computing' })
    await form.locator('input[name=department-name]').fill('ai')
    await form.getByRole('button', { name: 'Create' }).click()
    await expect(form.getByText('Another department there already has that name.')).toBeVisible()
    await form.getByRole('button', { name: 'Cancel' }).click()

    // Her own department is staffed from above; Computing, beneath it, by her.
    await page.getByRole('button', { name: 'Administrators of Engineering' }).click()
    let drawer = page.getByRole('dialog', { name: 'Administrators of Engineering' })
    await expect(drawer.getByText('Administrators of this department are appointed by whoever administers the department above it.')).toBeVisible()
    await drawer.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Administrators of Computing' }).click()
    drawer = page.getByRole('dialog', { name: 'Administrators of Computing' })
    await expect(drawer.locator('.admins-drawer__group').filter({ hasText: 'Through Engineering' })).toContainText('Ada Lovelace')
    await drawer.locator('input[name=lookup-email]').fill(w.people.bob.email)
    await drawer.getByRole('button', { name: 'Find' }).click()
    await drawer.getByRole('button', { name: `Appoint ${w.people.bob.display_name}` }).click()
    await expect(toast(page, `${w.people.bob.display_name} is appointed`)).toBeVisible()
    await expect(drawer.locator('.admins-drawer__group').filter({ hasText: 'Appointed here' })).toContainText(w.people.bob.display_name)
  })

  test('is told in plain words when Core refuses her: a course moved out of her reach meanwhile', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto(`/admin/courses/${w.courses.design.id}`)
    await expect(page.locator('.page-header')).toContainText(w.courses.design.title)
    // Root moves Design, with its courses, to Humanities.
    await asRoot('POST', `/v1/departments/${w.depts.design.id}/move`, { parent_id: w.depts.humanities.id })
    await page.getByRole('button', { name: 'Archive' }).click()
    await page.locator('.el-message-box').getByRole('button', { name: 'Archive' }).click()
    await expect(page.locator('.el-notification')).toContainText('That is outside the departments you administer.')
  })

  test('Bob sees only what is beneath his appointment', async ({ page }) => {
    await signInAs(page, w.people.bob)
    await expect(adminNav(page).getByRole('link', { name: 'Departments' })).toBeVisible()
    await page.goto('/admin/departments')
    await expect(page.locator('.dept-name__text')).toHaveText(['Computing', 'AI', 'Robotics & Control'])
    await expect(deptRows(page).first()).toContainText(`in University ${w.tag} › Engineering`)
    await expect(page.getByRole('button', { name: 'New top-level department' })).toHaveCount(0)
    // A course that is not his is not there for him.
    await page.goto(`/admin/courses/${w.courses.design.id}`)
    await expect(page.getByText('There is no course with this ID.')).toBeVisible()
  })

  test('in Traditional Chinese, and on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAs(page, w.people.ada, 'zh-Hant')
    await page.goto('/admin/departments')
    await expect(page.locator('.page-header__title')).toHaveText('部門')
    await expect(deptRows(page).filter({ hasText: 'Engineering' })).toContainText('由你管理')
    await expect.poll(() => sideways(page), { message: 'the tree fits a phone' }).toEqual([])
    await page.getByRole('button', { name: '「Computing」的管理員' }).click()
    await expect(page.getByRole('dialog', { name: '「Computing」的管理員' })).toContainText('在此任命')
    await expect.poll(() => sideways(page), { message: 'the drawer fits a phone' }).toEqual([])
  })

  test('once her appointment ends, the administration pages are gone', async ({ page }) => {
    await signInAs(page, w.people.ada)
    await page.goto('/admin/departments')
    await expect(adminNav(page)).toBeVisible()
    await asRoot('POST', `/v1/departments/${w.depts.engineering.id}/admins/${w.people.ada.actor_id}/remove`, {})
    await page.reload()
    await expect(page).toHaveURL(/\/$/)
    await expect(adminNav(page)).toHaveCount(0)
  })
})
