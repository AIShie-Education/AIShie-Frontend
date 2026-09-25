import { expect, test, type Page } from '@playwright/test'
import { call, demo, signInWithToken, type DemoActor } from './support'

// The people-and-agents directory, on Core's actor.list: an administrator
// finds again whom they registered — by part of a name, by an email address,
// by kind — and seats someone as a course's first instructor by name, not
// by a pasted id.
test.describe('the people-and-agents directory', () => {
  const rootToken = process.env.E2E_ROOT_TOKEN!
  const root: DemoActor = { actor_id: '', display_name: 'root', kind: 'agent', token: rootToken }
  // Names unique to this run, so a search finds only what the run made.
  const tag = Date.now().toString(36)
  const huang = { display_name: `HUANG Xiao ${tag}`, email: `db+${tag}@example.test` }
  const liu = { display_name: `LIU Chenyang ${tag}`, email: `chenyang+${tag}@example.test` }
  const bot = { display_name: `helper-bot-${tag}` }
  const ids: Record<'huang' | 'liu' | 'bot', string> = { huang: '', liu: '', bot: '' }
  let courseId = ''

  test.beforeAll(async () => {
    const register = async (body: Record<string, unknown>) => {
      const out = await call(rootToken, 'POST', '/v1/actors', body)
      expect(out.status).toBe(200)
      return out.body.result.actor_id as string
    }
    ids.huang = await register({ kind: 'human', ...huang })
    ids.liu = await register({ kind: 'human', ...liu })
    ids.bot = await register({ kind: 'agent', ...bot })
    const d = demo()
    const made = await call(rootToken, 'POST', '/v1/courses', {
      dept_id: d.course.dept_id,
      term_id: d.course.term_id,
      code: 'DIR101',
      section: tag,
      title: `Directory course ${tag}`,
    })
    expect(made.status).toBe(200)
    courseId = made.body.result.course_id
  })

  const table = (page: Page) => page.locator('.actors__table')

  test('finds people by part of a name, in any case, and by email', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto('/admin/actors')
    const search = page.getByLabel('Search people and agents')

    await search.fill(`xiao ${tag}`.toUpperCase())
    await expect(page).toHaveURL(new RegExp(`[?&]q=XIAO`))
    await expect(table(page)).toContainText(huang.display_name)
    await expect(table(page)).not.toContainText(liu.display_name)

    await search.fill(`chenyang+${tag}`)
    await expect(table(page)).toContainText(liu.display_name)
    await expect(table(page)).not.toContainText(huang.display_name)

    // A row opens that actor's page.
    await page.getByRole('link', { name: liu.display_name }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/actors/${ids.liu}$`))
    await expect(page.getByText(liu.email).first()).toBeVisible()
  })

  test('the filters are kept in the address: agents only', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto(`/admin/actors?q=${tag}&kind=agent`)
    await expect(table(page)).toContainText(bot.display_name)
    await expect(table(page)).not.toContainText(huang.display_name)
    // …and the same search over people finds the two people, not the agent.
    await page.goto(`/admin/actors?q=${tag}&kind=human`)
    await expect(table(page)).toContainText(huang.display_name)
    await expect(table(page)).toContainText(liu.display_name)
    await expect(table(page)).not.toContainText(bot.display_name)
  })

  test('an actor id in the search box opens that one, whatever the filters', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto(`/admin/actors?kind=agent`)
    await page.getByLabel('Search people and agents').fill(ids.huang)
    await expect(page.getByText('An actor ID: showing that actor, whatever the filters.')).toBeVisible()
    await expect(table(page)).toContainText(huang.display_name)
  })

  test('someone registered here is shown at once, at the top', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto('/admin/actors')
    await page.getByRole('button', { name: 'Register' }).click()
    const dialog = page.getByRole('dialog')
    const newcomer = `Newcomer ${tag}`
    await dialog.getByLabel('Display name').fill(newcomer)
    await dialog.getByRole('button', { name: 'Register' }).click()
    await expect(table(page).locator('tbody tr').first()).toContainText(newcomer)
    await expect(table(page).locator('tbody tr').first()).toContainText('Just registered')
  })

  test('a course’s first instructor is found by name, not by a pasted id', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto(`/admin/courses/${courseId}`)
    const who = page.locator('#seat-actor-id')
    await who.fill(`huang xiao ${tag}`)
    const option = page.locator('.actor-id-input__popper .actor-id-input__option', { hasText: huang.display_name })
    await option.click()
    await page.getByRole('button', { name: 'Seat as instructor' }).click()
    // The card says who was seated, with the seat's member id (the toast says it too).
    const done = page.locator('.el-alert', { hasText: `${huang.display_name} is seated as instructor` })
    await expect(done).toBeVisible()
    await expect(done).toContainText('Member ID')
  })
})
