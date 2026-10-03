import { expect, test, type Page } from '@playwright/test'
import { call, coursePath, openCourseTab, demo, expectToasted, keepToasts, signIn } from './support'

// A publication made by mistake can be taken back while nobody has started
// on the assignment; once a student has a draft, it stays published.
const STAMP = Date.now().toString(36)
const TITLE = `Quiz ${STAMP} — published too early`
let assignmentId = ''

function header(page: Page) {
  return page.locator('.page-header')
}
function publishButton(page: Page) {
  return header(page).getByRole('button', { name: 'Publish', exact: true })
}
function unpublishButton(page: Page) {
  return header(page).getByRole('button', { name: 'Unpublish', exact: true })
}

async function publish(page: Page) {
  await publishButton(page).click()
  const box = page.getByRole('dialog', { name: 'Publish assignment' })
  // Publishing is no longer said to be for good.
  await expect(box).toContainText(
    'It can be unpublished again only until a student starts on it (a draft counts) or its due date passes.',
  )
  await box.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToasted(page, 'Assignment published.')
  await expect(header(page)).not.toContainText('Not published')
  await expect(publishButton(page)).toHaveCount(0)
}

/** The run's course, as a student: the Assignments tab once it has loaded. */
async function studentAssignments(page: Page) {
  await page.goto(coursePath())
  await openCourseTab(page, 'Assignments')
  await expect(page.locator('.el-table__row').filter({ hasText: 'HW1 — Temperature converter' })).toBeVisible()
  return page.locator('.el-table__row').filter({ hasText: TITLE })
}

test.describe.serial('unpublishing an assignment nobody has started', () => {
  test('the instructor creates and publishes an assignment, then unpublishes it', async ({ page }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await openCourseTab(page, 'Assignments')
    await page.getByRole('button', { name: 'New assignment' }).click()
    const dialog = page.getByRole('dialog', { name: 'New assignment' })
    await dialog.getByLabel('Title', { exact: true }).fill(TITLE)
    await dialog.getByLabel('Points possible').fill('5')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expectToasted(page, 'Assignment created. It is not published yet.')
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/)
    assignmentId = new URL(page.url()).pathname.split('/').pop()!
    await expect(header(page)).toContainText('Not published')
    // Not published, there is nothing to take back.
    await expect(unpublishButton(page)).toHaveCount(0)

    await publish(page)

    // Nobody has started: it can be taken back.
    await expect(page.getByText('No work has been started yet.')).toBeVisible()
    await expect(unpublishButton(page)).toBeEnabled()
    await unpublishButton(page).click()
    const box = page.getByRole('dialog', { name: 'Unpublish assignment' })
    await expect(box).toContainText(`Unpublish “${TITLE}”?`)
    await expect(box).toContainText('Students will no longer see it or be able to hand in work for it.')
    await box.getByRole('button', { name: 'Unpublish', exact: true }).click()
    await expectToasted(page, 'Assignment unpublished. Students no longer see it.')

    await expect(header(page)).toContainText('Not published')
    await expect(publishButton(page)).toBeVisible()
    await expect(unpublishButton(page)).toHaveCount(0)
    await expect(page.getByText('Students cannot see this assignment until it is published.')).toBeVisible()

    // The assignment list says so too.
    await openCourseTab(page, 'Assignments')
    await expect(page.locator('.el-table__row').filter({ hasText: TITLE })).toContainText('Not published')

    // The feed keeps both: it was published, and then it was not.
    await page.goto(coursePath('activity'))
    await expect(page.locator('.event-item').filter({ hasText: 'Assignment unpublished' }).first()).toContainText(TITLE)
  })

  test('a student no longer sees it', async ({ page }) => {
    const d = demo()
    const got = await call(d.actors.ken.token, 'GET', `/v1/courses/${d.course.id}/assignments/${assignmentId}`)
    expect(got.body.error?.code, JSON.stringify(got.body)).toBe('not_found')

    await signIn(page, d.actors.ken)
    await expect(await studentAssignments(page)).toHaveCount(0)
  })

  test('published again, a student starts a draft', async ({ page, browser }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(header(page)).toContainText(TITLE)
    await publish(page)
    await expect(unpublishButton(page)).toBeEnabled()

    // Ken, in a browser of his own, sees it now and starts on it.
    const context = await browser.newContext()
    const kp = await context.newPage()
    await keepToasts(kp)
    await signIn(kp, d.actors.ken)
    const row = await studentAssignments(kp)
    await expect(row).toContainText('Not started')
    await row.getByRole('link', { name: TITLE }).click()
    const work = kp.locator('.my-work')
    await expect(work).toContainText('You have not started this assignment yet.')
    await work.getByRole('button', { name: 'Start a draft' }).click()
    await expectToasted(kp, 'Draft started.')
    await context.close()
  })

  test('once a student has started, it can no longer be unpublished', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`assignments/${assignmentId}`))
    await expect(header(page)).toContainText(TITLE)
    await expect(header(page)).not.toContainText('Not published')

    // The draft is seen here, so the action is offered no more, and says why.
    await expect(page.locator('.work-summary__states li').filter({ hasText: 'Draft' })).toContainText('1')
    const button = unpublishButton(page)
    await expect(button).toBeDisabled()
    await button.locator('xpath=..').hover()
    await expect(
      page
        .locator('.el-popper')
        .filter({ hasText: 'Students have already started on it, so it can no longer be unpublished.' }),
    ).toBeVisible()

    // And Core would refuse it anyway.
    const out = await call(
      d.actors.instructor.token,
      'POST',
      `/v1/courses/${d.course.id}/assignments/${assignmentId}/unpublish`,
      {},
    )
    expect(out.body.error?.code, JSON.stringify(out.body)).toBe('failed_precondition')

    // Ken still sees it.
    const got = await call(d.actors.ken.token, 'GET', `/v1/courses/${d.course.id}/assignments/${assignmentId}`)
    expect(got.body.result?.published_at, JSON.stringify(got.body)).toBeTruthy()
  })
})
