import { expect, test } from '@playwright/test'
import { call, demo, signInWithToken, type DemoActor } from './support'

// An administrator who has just created a course holds no seat in it, and a
// platform role opens no course. The app has to show them the course anyway,
// say why its pages refuse them, and lead them to seating an instructor.
test.describe('an administrator and a course they have no seat in', () => {
  const rootToken = process.env.E2E_ROOT_TOKEN!
  const root: DemoActor = { actor_id: '', display_name: 'root', kind: 'agent', token: rootToken }
  const title = `Seatless course ${Date.now().toString(36)}`
  let courseId = ''

  test.beforeAll(async () => {
    const d = demo()
    const made = await call(rootToken, 'POST', '/v1/courses', {
      dept_id: d.course.dept_id,
      term_id: d.course.term_id,
      code: 'SEAT101',
      section: Date.now().toString(36),
      title,
    })
    expect(made.status).toBe(200)
    courseId = made.body.result.course_id
  })

  test('home lists it apart, and its own pages say how to get in', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto('/')
    const section = page.locator('section.home-unseated')
    await expect(section.getByRole('heading', { name: 'Courses you administer without a seat' })).toBeVisible()
    // The newest first: the course just made leads the list.
    await expect(section.locator('.course-card').first()).toContainText(title)

    await page.goto(`/courses/${courseId}`)
    await expect(page.getByText('You have no seat in this course')).toBeVisible()
    await page.getByRole('button', { name: 'Go to the course’s administration page' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/courses/${courseId}$`))
  })

  test('seating oneself as instructor opens the course', async ({ page }) => {
    await signInWithToken(page, root)
    await page.goto(`/admin/courses/${courseId}`)
    await page.getByRole('button', { name: 'Me', exact: true }).click()
    await page.getByRole('button', { name: 'Seat as instructor' }).click()
    await page.getByRole('button', { name: 'Open course' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}$`))
    await expect(page.locator('.course-head__title')).toHaveText(title)

    // …and home now has it among the courses one is seated in, not apart.
    await page.goto('/')
    await expect(page.locator('section.home-unseated')).not.toContainText(title)
    await expect(page.locator('.course-card', { hasText: title })).toContainText('Instructor')
  })
})
