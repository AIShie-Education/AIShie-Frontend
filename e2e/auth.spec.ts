import { expect, test } from '@playwright/test'
import { demo, signIn } from './support'

test('a wrong password is refused and says so', async ({ page }) => {
  const d = demo()
  await page.goto('/login')
  await page.fill('input[name=login]', d.actors.yuki.email!)
  await page.fill('input[name=password]', 'definitely-not-it')
  await page.click('button[type=submit]')
  await expect(page.getByText('The student/staff number or email, or the password, is not correct.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('a person signs in, sees their course, and signs out', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.yuki)
  await expect(page.getByText('Introduction to Programming').first()).toBeVisible()
  await page.locator('.app-user').click()
  await page.getByText('Sign out').click()
  await expect(page).toHaveURL(/\/login/)
  // The session is gone on the server too: a page that needs it goes back to sign-in.
  await page.goto(`/courses/${d.course.id}`)
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('the sign-in page offers no API token: people sign in with a password', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[name=login]')).toBeVisible()
  await expect(page.getByText(/API token|Use a token/i)).toHaveCount(0)
  await expect(page.getByPlaceholder('ais_…')).toHaveCount(0)
  await expect(page.locator('.login__card input')).toHaveCount(2)
})

test('a tab an earlier version signed in with a pasted token is signed out, and the token is never sent', async ({
  page,
}) => {
  const d = demo()
  const sent: string[] = []
  page.on('request', (req) => {
    const auth = req.headers().authorization
    if (auth) sent.push(`${req.method()} ${new URL(req.url()).pathname}`)
  })
  // What an earlier version kept in the tab after a token was pasted in: here, an agent's.
  await page.goto('/login')
  await page.evaluate((token) => sessionStorage.setItem('aishiteru.bearer', token), d.actors.grader.token)
  await page.goto(`/courses/${d.course.id}`)
  await expect(page).toHaveURL(/\/login\?next=/)
  expect(await page.evaluate(() => sessionStorage.getItem('aishiteru.bearer'))).toBeNull()
  await expect(page.locator('.app-user')).toHaveCount(0)
  expect(sent).toEqual([])

  // A person signs in there as anywhere else.
  await page.fill('input[name=login]', d.actors.ken.email!)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(new RegExp(`/courses/${d.course.id}$`))
  await expect(page.locator('.app-user')).toContainText('Ken Wong')
  expect(sent).toEqual([])
})

test('a deep link survives signing in', async ({ page }) => {
  const d = demo()
  await page.goto(`/courses/${d.course.id}/assignments`)
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.fill('input[name=login]', d.actors.ken.email!)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(new RegExp(`/courses/${d.course.id}/assignments`))
})
