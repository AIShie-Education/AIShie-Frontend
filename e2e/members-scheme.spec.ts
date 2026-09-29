import { expect, test } from '@playwright/test'
import { call, courseTab, coursePath, demo, pickOption, signIn, toast } from './support'

const NAME = `Nora Newcomer ${Date.now().toString(36)}`
let actorId = ''

// A person is registered on the platform by an administrator first; seating
// them in a course is then the instructor's to do, in the app.
test.beforeAll(async () => {
  const d = demo()
  // Root's signed-in session (scripts/ci-core.sh), which Core takes as a bearer token.
  const root = process.env.E2E_ROOT_TOKEN
  if (!root) throw new Error('E2E_ROOT_TOKEN is required')
  const out = await call(root, 'POST', '/v1/actors', {
    display_name: NAME,
    kind: 'human',
    email: `nora+${d.tag}${Date.now().toString(36)}@demo.test`,
  })
  expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  actorId = out.body.result.actor_id
})

test.describe.serial('members and the grading scheme', () => {
  test('the instructor seats a new TA, changes a permission, pauses and resumes the seat', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Members').click()
    await expect(page.locator('.el-table__row').filter({ hasText: 'Yuki Tanaka' })).toBeVisible()

    await page.getByRole('button', { name: 'Add member' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a member' })
    await dialog.getByPlaceholder('e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423').fill(actorId)
    // Starts from the Student preset; take the TA's instead.
    const presetSelect = dialog.locator('.add-member__preset-select')
    await expect(presetSelect).toContainText('Student')
    await pickOption(page, presetSelect, 'Teaching assistant')
    await expect(dialog).toContainText('Reads everything and enters grades')
    await expect(dialog.locator('.add-member__role')).toContainText('Teaching assistant')
    await dialog.getByRole('button', { name: 'Add member' }).click()
    await expect(toast(page, 'Member added')).toBeVisible()

    // The new seat's page.
    await expect(page).toHaveURL(/\/members\/[0-9a-f-]{36}$/)
    const header = page.locator('.page-header')
    await expect(header).toContainText(NAME)
    await expect(header).toContainText('Teaching assistant')
    await expect(header).toContainText('Active')
    await expect(page.getByText('All as the preset “Teaching assistant” gave them.')).toBeVisible()

    // Change one permission: the TA may post grades, subject to approval.
    await page.getByRole('button', { name: 'Edit permissions' }).click()
    const postRow = page.locator('.perm-editor__row').filter({ hasText: 'grade_post' })
    await expect(postRow.locator('.level-select')).toContainText('Denied')
    await pickOption(page, postRow.locator('.level-select'), 'Needs approval')
    await expect(page.getByText('1 changed')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(toast(page, 'Permissions updated')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit permissions' })).toBeVisible()
    await expect(postRow).toContainText('Needs approval')
    await expect(
      page.getByText('1 permission differs from the preset “Teaching assistant” it was copied from.'),
    ).toBeVisible()

    // Pause…
    await header.getByRole('button', { name: 'Pause' }).click()
    const pauseBox = page.getByRole('dialog', { name: 'Pause this seat?' })
    await pauseBox.getByRole('button', { name: 'Pause' }).click()
    await expect(toast(page, `${NAME} is paused`)).toBeVisible()
    await expect(header).toContainText('Paused')
    await expect(page.getByText('This seat is paused', { exact: false })).toBeVisible()

    // …and resume.
    await header.getByRole('button', { name: 'Resume' }).click()
    const resumeBox = page.getByRole('dialog', { name: 'Resume this seat?' })
    await resumeBox.getByRole('button', { name: 'Resume' }).click()
    await expect(toast(page, `${NAME} is resumed`)).toBeVisible()
    await expect(header).toContainText('Active')
    await expect(header.getByRole('button', { name: 'Pause' })).toBeVisible()
    // Resuming gives the seat back as it was, the changed permission included.
    await expect(postRow).toContainText('Needs approval')

    // The member list has them.
    await courseTab(page, 'Members').click()
    const row = page.locator('.el-table__row').filter({ hasText: NAME })
    await expect(row).toContainText('Teaching assistant')
    await expect(row).toContainText('Active')
  })

  test('while editing a seat’s permissions, the rows changed are marked', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`members/${d.actors.observer.member_id}`))
    await page.getByRole('button', { name: 'Edit permissions' }).click()
    const row = page.locator('.perm-editor__row').filter({ hasText: 'member_read' })
    await expect(row).not.toHaveClass(/is-changed/)
    await pickOption(page, row.locator('.level-select'), 'Denied')
    await expect(page.getByText('1 changed')).toBeVisible()
    await expect(row).toHaveClass(/is-changed/)
    await expect(row.locator('.el-tag').filter({ hasText: 'changed' })).toBeVisible()
    await expect(page.locator('.perm-editor__row.is-changed')).toHaveCount(1)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('the instructor adds a directly graded component under the course total', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await courseTab(page, 'Grading scheme').click()
    const tree = page.getByRole('table', { name: 'Components' })
    const rootRow = tree.locator('.st-row.is-root')
    await expect(rootRow).toBeVisible()
    await expect(tree.locator('.st-row').filter({ hasText: 'Assignments' }).first()).toBeVisible()
    await expect(tree.locator('.st-row').filter({ hasText: 'Midterm' })).toBeVisible()

    await rootRow.locator('.st-actions button').click()
    await page.locator('.el-dropdown-menu:visible').getByText('Add sub-component').click()
    const dialog = page.getByRole('dialog', { name: 'Add a component' })
    await dialog.getByPlaceholder('e.g. Quizzes, Final exam').fill('Participation')
    await dialog.getByText('Graded directly', { exact: true }).click()
    await dialog.locator('.el-form-item').filter({ hasText: 'Points possible' }).locator('input').fill('10')
    const weight = dialog.locator('.el-form-item').filter({ hasText: 'Weight' }).locator('input')
    await weight.fill('20')
    // 20 against the siblings' 60 and 40.
    await expect(dialog).toContainText('That is 16.7% of')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(toast(page, 'Component added')).toBeVisible()
    await expect(dialog).toBeHidden()

    const row = tree.locator('.st-row').filter({ hasText: 'Participation' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Graded directly')
    await expect(row.locator('[data-label="Weight"]')).toHaveText('20')
    await expect(row.locator('[data-label="Points"]')).toHaveText('10')
    await expect(row.locator('[data-label="Share"]')).toContainText('16.7%')
    // Its siblings' shares shrink to make room.
    await expect(tree.locator('.st-row').filter({ hasText: 'Midterm' }).locator('[data-label="Share"]')).toContainText(
      '33.3%',
    )
  })
})
