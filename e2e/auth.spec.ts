import { expect, test } from '@playwright/test'
import { accountButton, demo, expectSignedInAs, signIn, signOut } from './support'

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
  await signOut(page)
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
  // What an earlier version kept in the tab after a token was pasted in: here, an agent's. Those
  // versions came before the name AIshie, and kept it under theirs; the app moves it at start.
  await page.goto('/login')
  await page.evaluate((token) => sessionStorage.setItem('aishiteru.bearer', token), d.actors.grader.token)
  await page.goto(`/courses/${d.course.id}`)
  await expect(page).toHaveURL(/\/login\?next=/)
  expect(
    await page.evaluate(() => [sessionStorage.getItem('aishiteru.bearer'), sessionStorage.getItem('aishie.bearer')]),
  ).toEqual([null, null])
  await expect(accountButton(page)).toHaveCount(0)
  expect(sent).toEqual([])

  // A person signs in there as anywhere else.
  await page.fill('input[name=login]', d.actors.ken.email!)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(new RegExp(`/courses/${d.course.id}$`))
  await expectSignedInAs(page, 'Ken Wong')
  expect(sent).toEqual([])
})

test('what a version from before the name AIshie remembered in this browser is kept: its language and its theme', async ({
  page,
}) => {
  // As those versions kept them, under their names, there before the page's first script: the
  // first load since. Once only, so that nothing is put back when the page loads again.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.seeded')) return
    sessionStorage.setItem('e2e.seeded', '1')
    localStorage.clear()
    localStorage.setItem('aishiteru.locale', 'zh-Hant')
    localStorage.setItem('aishiteru.theme', 'dark')
  })
  await page.goto('/login')
  // Dark before the app has loaded (index.html reads the earlier name too), and after.
  await expect(page.locator('html')).toHaveAttribute('data-boot-theme', 'dark')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.locator('button[type=submit]')).toHaveText('登入')
  // Under the names now, and nothing left under theirs.
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
    'aishie.locale': 'zh-Hant',
    'aishie.theme': 'dark',
  })
  // Loaded again, both are read under the names now.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-boot-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
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
