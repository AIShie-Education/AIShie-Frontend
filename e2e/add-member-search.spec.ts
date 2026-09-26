import { expect, test } from '@playwright/test'
import { call, coursePath, demo, root, signIn, signInWithToken, toast } from './support'

// A platform administrator seated in a course finds whom to add by name or
// email, since the directory (actor.list) answers them; the search fills in
// the actor ID. Anyone else adding members has the ID field only.
const stamp = Date.now().toString(36)
const SAM = { name: `Sam Searchable ${stamp}`, email: `sam+${stamp}@e2e.test` }
const SUSPENDED = { name: `Sid Searchable ${stamp}`, email: `sid+${stamp}@e2e.test` }
const AGENT = `searchable-agent-${stamp}`
let courseId = ''
let samId = ''

async function register(body: Record<string, unknown>): Promise<string> {
  const out = await call(root().token, 'POST', '/v1/actors', body)
  expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  return out.body.result.actor_id
}

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  // A course of root's own, with root seated in it as instructor.
  const made = await call(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'FIND101',
    section: stamp,
    title: `Finding people ${stamp}`,
  })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  courseId = made.body.result.course_id
  const me = await call(token, 'GET', '/v1/me')
  const seated = await call(token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: me.body.result.id })
  expect(seated.body.status, JSON.stringify(seated.body)).toBe('executed')

  // Registered first and suspended, so that Core lists them before Sam.
  const sid = await register({ kind: 'human', display_name: SUSPENDED.name, email: SUSPENDED.email })
  const suspended = await call(token, 'POST', `/v1/actors/${sid}/suspend`, {})
  expect(suspended.body.status, JSON.stringify(suspended.body)).toBe('executed')
  samId = await register({ kind: 'human', display_name: SAM.name, email: SAM.email })
  await register({ kind: 'agent', display_name: AGENT })
})

test('an administrator finds whom to add by name, and the search fills in their ID', async ({ page }) => {
  // Opening the dialog asks Core whether it has the directory: slowly here.
  await page.route(
    (url) => url.pathname === '/v1/actors' && url.searchParams.get('limit') === '1',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return route.continue()
    },
  )
  await signInWithToken(page, root())
  await page.goto(`/courses/${courseId}/members`)
  await page.getByRole('button', { name: 'Add member' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a member' })
  const idField = dialog.getByPlaceholder('e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423')
  await expect(idField).toBeVisible()
  // Until it has said, there is no search to type into (and so none to take away).
  expect(await dialog.getByText('Find by name or email').count()).toBe(0)
  await expect(dialog.getByText('Find by name or email')).toBeVisible()
  await expect(dialog).toContainText('Filled in when you pick someone above')

  // A piece of the name finds the two people and the agent, the suspended last.
  const searched = page.waitForRequest((req) => {
    const u = new URL(req.url())
    return u.pathname === '/v1/actors' && u.searchParams.get('search') === `searchable ${stamp}`
  })
  await dialog.locator('.add-member__find').click()
  await page.keyboard.type(`searchable ${stamp}`)
  await searched
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toContainText(SAM.name)
  await expect(options.nth(0)).toContainText(SAM.email)
  await expect(options.nth(1)).toContainText(SUSPENDED.name)
  await expect(options.nth(1)).toContainText('Suspended')

  // The agent, by its name: it has no email, and says what it is.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(AGENT)
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText(AGENT)
  await expect(options.first()).toContainText('Agent')

  // A piece of the email finds Sam, and picking him fills in his actor ID.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(`SAM+${stamp}`)
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText(SAM.email)
  await options.first().click()
  await expect(idField).toHaveValue(samId)
  await expect(dialog.locator('.add-member__actor')).toContainText(SAM.name)
  await expect(dialog.locator('.add-member__actor')).toContainText('Person')

  // Typing another ID over it leaves the search empty again.
  await idField.fill('01a0d79f-13c6-70da-a7cc-f009b1efe423')
  await expect(dialog.locator('.add-member__find')).not.toContainText(SAM.name)
  await expect(dialog.locator('.add-member__actor')).toContainText('No actor has this ID.')
  await idField.fill(samId)
  await expect(dialog.locator('.add-member__actor')).toContainText(SAM.name)

  await dialog.getByRole('button', { name: 'Add member' }).click()
  await expect(toast(page, 'Member added')).toBeVisible()
  await expect(page).toHaveURL(/\/members\/[0-9a-f-]{36}$/)
  await expect(page.locator('.page-header')).toContainText(SAM.name)
})

test('someone who is not an administrator adds members by actor ID only', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath('members'))
  const listed: string[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/v1/actors') listed.push(req.url())
  })
  await page.getByRole('button', { name: 'Add member' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a member' })
  await expect(dialog.getByPlaceholder('e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423')).toBeVisible()
  await expect(dialog.getByText('Find by name or email')).toHaveCount(0)
  await expect(dialog).toContainText('a platform administrator, who can tell you their actor ID')
  // Core would refuse them the directory: it is not asked.
  expect(listed).toEqual([])
})

test('on a Core without the directory, an administrator finds people by their ID', async ({ page }) => {
  // What a Core from before actor.list answers: the route takes POST only.
  const listed: string[] = []
  let slow = 0
  await page.route(
    (url) => url.pathname === '/v1/actors',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      listed.push(route.request().url())
      if (slow) await new Promise((resolve) => setTimeout(resolve, slow))
      return route.fulfill({
        status: 405,
        headers: { Allow: 'POST' },
        json: {
          error: { code: 'method_not_allowed', message: 'GET is not something /v1/actors takes; it takes POST' },
        },
      })
    },
  )
  await signInWithToken(page, root())

  // People & agents: no list, a way to open someone by ID, and Register as before.
  await page.goto('/admin/actors')
  await expect(page.getByText('This Core cannot list people and agents yet')).toBeVisible()
  await expect(page.locator('.page-header').getByRole('button', { name: 'Register' })).toBeVisible()
  const idBox = page.getByPlaceholder('Actor ID')
  await idBox.fill('not an id')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('This is not an actor ID.')).toBeVisible()
  await idBox.fill(samId.toUpperCase())
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/actors/${samId}$`))
  await expect(page.locator('.page-header')).toContainText(SAM.name)
  expect(listed).toHaveLength(1)

  // Seating an instructor: the search takes a pasted ID, and says why. From
  // here on Core is slow to answer, as a distant one is: text typed before it
  // has said waits for its answer, and is not sent after it.
  listed.length = 0
  slow = 1500
  await page.goto(`/admin/courses/${courseId}`)
  // Root is seated already: the card lists the instructors, and opens the form on asking.
  await page.getByRole('button', { name: 'Seat another instructor' }).click()
  const noSearch = page.getByText('This Core cannot search by name or email yet (it needs updating)')
  const seat = page.locator('#seat-actor')
  await seat.click()
  await page.keyboard.type('sam')
  expect(await noSearch.count()).toBe(0)
  const dropdown = page.locator('.el-select-dropdown:visible')
  await expect(dropdown).toContainText('Loading…')
  await expect(noSearch).toBeVisible()
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(dropdown).toContainText('Paste the whole actor ID.')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(samId)
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText(SAM.name)
  await options.first().click()
  await expect(page.locator('.seat__found')).toContainText(SAM.name)
  // The Core was asked once whether it has the directory, and not again.
  expect(listed).toHaveLength(1)

  // Adding a member: the ID field, with the same word on why. Before Core has
  // said, there is the ID field only, and nothing is taken from under the
  // person typing in it.
  listed.length = 0
  await page.goto(`/courses/${courseId}/members`)
  await page.getByRole('button', { name: 'Add member' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a member' })
  const idField = dialog.getByPlaceholder('e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423')
  await expect(idField).toBeVisible()
  const noSearchHere = dialog.getByText('This Core cannot search by name or email yet (it needs updating)')
  expect(await noSearchHere.count()).toBe(0)
  expect(await dialog.getByText('Find by name or email').count()).toBe(0)
  await idField.fill(samId)
  await expect(noSearchHere).toBeVisible()
  await expect(dialog.getByText('Find by name or email')).toHaveCount(0)
  await expect(idField).toBeFocused()
  await expect(idField).toHaveValue(samId)
  await expect(dialog.locator('.add-member__actor')).toContainText(SAM.name)
  expect(listed).toHaveLength(1)
})
