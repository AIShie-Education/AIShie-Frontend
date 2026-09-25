import { expect, test } from '@playwright/test'
import { demo, signIn, signInWithToken } from './support'

test('a wrong password is refused and says so', async ({ page }) => {
  const d = demo()
  await page.goto('/login')
  await page.fill('input[name=email]', d.actors.yuki.email!)
  await page.fill('input[name=password]', 'definitely-not-it')
  await page.click('button[type=submit]')
  await expect(page.getByText('Email or password is not correct.')).toBeVisible()
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

test('an agent is seen through its token, with its own seat', async ({ page }) => {
  const d = demo()
  await signInWithToken(page, d.actors.grader)
  await expect(page.getByText('Signed in with a token')).toBeVisible()
  await page.goto(`/courses/${d.course.id}`)
  await expect(page.getByText('Assistant').first()).toBeVisible()
})

test('a deep link survives signing in', async ({ page }) => {
  const d = demo()
  await page.goto(`/courses/${d.course.id}/assignments`)
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.fill('input[name=email]', d.actors.ken.email!)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(new RegExp(`/courses/${d.course.id}/assignments`))
})
