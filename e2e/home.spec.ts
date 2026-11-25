import { expect, test } from '@playwright/test'
import { call, demo, registerPerson, signIn } from './support'

// A student's home: public course facts without a member-list permission, and
// a useful current-week summary above the course grid.
test('Home names both instructors and summarizes the week without member_read', async ({ page }) => {
  const d = demo()
  const instructor = d.actors.instructor
  const title = `This week ${Date.now().toString(36)}`
  const made = await call(instructor.token, 'POST', `/v1/courses/${d.course.id}/assignments`, {
    title,
    points_possible: 10,
    due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  const assignment = made.body.result.id as string
  const published = await call(
    instructor.token,
    'POST',
    `/v1/courses/${d.course.id}/assignments/${assignment}/publish`,
    {},
  )
  expect(published.body.status, JSON.stringify(published.body)).toBe('executed')

  const second = await registerPerson(`Ada Home ${Date.now().toString(36)}`, {
    email: `ada-home-${Date.now().toString(36)}@identity.test`,
  })
  const seated = await call(instructor.token, 'POST', `/v1/courses/${d.course.id}/members`, {
    actor_id: second.actor_id,
    preset: 'instructor',
  })
  expect(seated.body.status, JSON.stringify(seated.body)).toBe('executed')

  const memberReads: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === `/v1/courses/${d.course.id}/members`) memberReads.push(r.url())
  })
  await signIn(page, d.actors.yuki)
  await page.goto('/')
  const week = page.locator('.home-week')
  await expect(week).toBeVisible()
  await expect(week).toContainText('This week')
  await expect(week).toContainText(title)
  await expect(week).toContainText('CS101')
  await expect(week.locator('.home-week__partial')).toHaveCount(0)
  const card = page.locator('.course-card').filter({ hasText: 'CS101' }).first()
  await expect(card).toContainText(instructor.display_name)
  await expect(card).toContainText(second.display_name)
  expect(memberReads).toEqual([])
})
