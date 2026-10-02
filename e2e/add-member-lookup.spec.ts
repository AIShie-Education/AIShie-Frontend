import { expect, test, type Page } from '@playwright/test'
import { call, demo, expectNothingElseToasted, expectToasted, keepToasts, root, signIn } from './support'

// An instructor who is not a platform administrator may not search the
// directory (actor.list), so they find whom to seat by that person's whole
// email address (member.lookup_actor), which fills in the actor ID. An ID
// pasted in is looked up the same way: the form says whom it names, starts an
// agent from the grader preset, and offers no second seat to someone who
// already has one here.
const stamp = Date.now().toString(36)
const ID_PLACEHOLDER = 'e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423'
let courseId = ''

async function register(body: Record<string, unknown>): Promise<string> {
  const out = await call(root().token, 'POST', '/v1/actors', body)
  expect(out.body.status, JSON.stringify(out.body)).toBe('executed')
  return out.body.result.actor_id
}

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  // A course of its own, so that seating people here changes nothing the
  // other tests count, with the demo's instructor as its instructor.
  const made = await call(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'LOOK101',
    section: stamp,
    title: `Looking people up ${stamp}`,
  })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  courseId = made.body.result.course_id
  const active = await call(token, 'POST', `/v1/courses/${courseId}/activate`, {})
  expect(active.body.status, JSON.stringify(active.body)).toBe('executed')
  const seated = await call(token, 'POST', `/v1/courses/${courseId}/instructors`, {
    actor_id: d.actors.instructor.actor_id,
  })
  expect(seated.body.status, JSON.stringify(seated.body)).toBe('executed')
})

/** Signs the demo's instructor in and opens Add member in this test's course; notes any directory request. */
async function openAddMember(page: Page) {
  const listed: string[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/v1/actors') listed.push(req.url())
  })
  await signIn(page, demo().actors.instructor)
  await page.goto(`/courses/${courseId}/members`)
  await page.getByRole('button', { name: 'Add member' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a member' })
  const email = dialog.getByLabel('Find by student/staff number or email')
  const idField = dialog.getByPlaceholder(ID_PLACEHOLDER)
  await expect(idField).toBeVisible()
  // Once Core has said it has the lookup, the email field is there; the
  // directory's search by name is not.
  await expect(email).toBeVisible()
  await expect(dialog.getByText('Find by name or email')).toHaveCount(0)
  return {
    dialog,
    email,
    idField,
    find: dialog.getByRole('button', { name: 'Find', exact: true }),
    who: dialog.locator('.add-member__actor'),
    preset: dialog.locator('.add-member__preset-select'),
    submit: dialog.getByRole('button', { name: 'Add member' }),
    listed,
  }
}

test('an instructor finds a registered person by their whole email, in any case, and seats them', async ({
  page,
}, testInfo) => {
  await keepToasts(page)
  const tag = `${stamp}-${testInfo.retry}`
  const pat = { name: `Pat Lookup ${tag}`, email: `pat+${tag}@e2e.test` }
  const patId = await register({ kind: 'human', display_name: pat.name, email: pat.email })

  const { dialog, email, idField, find, who, preset, submit, listed } = await openAddMember(page)
  await expect(dialog).toContainText('a platform administrator, who can tell you their actor ID')

  // A part of an address finds nobody, and the form says so without asking.
  await email.fill(`pat+${tag}`)
  await find.click()
  await expect(dialog).toContainText('Give their whole student or staff number, or their whole email address')
  await expect(idField).toHaveValue('')

  // An address nobody is registered with: said in the form, not in a toast.
  await email.fill(`nobody+${tag}@e2e.test`)
  await email.press('Enter')
  await expect(dialog).toContainText('Nobody is registered with that number or email. Ask a platform administrator')
  await expectNothingElseToasted(page)
  await expect(idField).toHaveValue('')

  // The whole address, in another case, finds Pat and fills in his actor ID.
  await email.fill(`Pat+${tag.toUpperCase()}@E2E.Test`)
  await email.press('Enter')
  await expect(idField).toHaveValue(patId)
  await expect(who).toContainText(pat.name)
  await expect(who).toContainText('Person')
  await expect(dialog).not.toContainText('Nobody is registered')
  await expect(preset).toContainText('Student')

  await expect(submit).toBeEnabled()
  await submit.click()
  await expectToasted(page, 'Member added')
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/members/[0-9a-f-]{36}$`))
  await expect(page.locator('.page-header')).toContainText(pat.name)
  // The directory, which Core would refuse them, was never asked.
  expect(listed).toEqual([])
})

test('someone who already has a seat is not offered a second, and their seat is a link away', async ({
  page,
}, testInfo) => {
  const d = demo()
  const tag = `${stamp}-${testInfo.retry}`
  const quinn = { name: `Quinn Seated ${tag}`, email: `quinn+${tag}@e2e.test` }
  const quinnId = await register({ kind: 'human', display_name: quinn.name, email: quinn.email })
  const added = await call(d.actors.instructor.token, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: quinnId,
    preset: 'student',
  })
  expect(added.body.status, JSON.stringify(added.body)).toBe('executed')
  const quinnMember: string = added.body.result.member_id

  const { dialog, email, idField, find, who, submit } = await openAddMember(page)

  // The instructor's own ID, pasted: they are seated here already.
  await idField.fill(d.actors.instructor.actor_id)
  await expect(who).toContainText(d.actors.instructor.display_name)
  await expect(who).toContainText('They already have a seat in this course')
  await expect(submit).toBeDisabled()
  await idField.fill('')
  await expect(who).toHaveCount(0)

  // Found by email, the same.
  await email.fill(quinn.email)
  await find.click()
  await expect(idField).toHaveValue(quinnId)
  await expect(who).toContainText(quinn.name)
  await expect(who).toContainText('They already have a seat in this course')
  await expect(submit).toBeDisabled()

  // Another address typed: the ID the old one found goes with it.
  await email.fill(`nobody+${tag}@e2e.test`)
  await expect(idField).toHaveValue('')
  await expect(who).toHaveCount(0)
  await email.fill(quinn.email)
  await find.click()
  await expect(idField).toHaveValue(quinnId)

  await who.getByRole('link', { name: 'Open their seat' }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/members/${quinnMember}$`))
  await expect(dialog).toBeHidden()
  await expect(page.locator('.page-header')).toContainText(quinn.name)
})

test('an agent, which has no email, is seated by its pasted ID and starts from the grader preset', async ({
  page,
}, testInfo) => {
  await keepToasts(page)
  const agent = `lookup-agent-${stamp}-${testInfo.retry}`
  const agentId = await register({ kind: 'agent', display_name: agent, hosting: 'mcp' })

  const { idField, who, preset, submit, listed } = await openAddMember(page)
  await expect(preset).toContainText('Student')

  await idField.fill(agentId.toUpperCase())
  await expect(who).toContainText(agent)
  await expect(who).toContainText('Agent')
  await expect(who).not.toContainText('already have a seat')
  await expect(preset).toContainText('Grader (agent)')

  await expect(submit).toBeEnabled()
  await submit.click()
  await expectToasted(page, 'Member added')
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/members/[0-9a-f-]{36}$`))
  await expect(page.locator('.page-header')).toContainText(agent)
  expect(listed).toEqual([])
})
