import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  demo,
  expectToasted,
  inTraditionalChinese,
  keepToasts,
  photograph,
  registerPerson,
  root,
  signIn,
  type DemoActor,
} from './support'

// Peer evaluation within a group (組員互評), in a course of the test's own:
// a group set with Alpha (Ada, Ben and Cleo) and Beta (Dev and Eve), a group
// project whose form splits 100 points, opens at a time and counts at 20 %,
// and a lab report with none yet. Sato sets the lab report's up, rating on
// criteria, and reads on both assignments what each reader will see; Ada
// splits her points, the page refusing a sheet that does not add up; Ben
// splits evenly on a phone, in Traditional Chinese; Dev, of Beta, sees
// nobody of Alpha and none of their evaluations, and is refused the results.
// Dev, whose handing in waits for approval for a while, rates Eve on the
// lab report, and Sato reads whom each rating went to before approving it.
// Once Alpha has handed in and been graded 80, Sato reads each member's
// factor in words beside the score it gives, the flags and who wrote
// nothing, and downloads the results; Beta is graded 80 too, and the form
// closes; Tam, a teaching assistant who reaches Alpha's students only, is
// told counting writes every group's grades, and Core refuses him for
// Beta's; Tia, a teaching assistant whose posting waits for approval,
// proposes counting it in grades, which leaves Sato's own adjustment of
// Cleo's grade as it is; Sato reads each member's factor on the approvals
// queue and approves it; Ada, on a phone, reads her own average and nothing
// anyone wrote of her; and, on a poster whose form has self-evaluation on,
// Ada alone evaluates, herself above the others, and Sato reads that her
// factor is her own evaluation alone, and no score once the form is for
// reference only.
//
// With E2E_SHOTS set to a directory, the pages are photographed there.

const STAMP = Date.now().toString(36)
const PROJECT = `Group project ${STAMP}`
const LAB = `Lab report ${STAMP}`
let courseId = ''
let project = ''
let lab = ''
let groups: { alpha: string; beta: string } = { alpha: '', beta: '' }
let setId = ''
type Person = DemoActor & { member_id: string }
const people: Record<'ada' | 'ben' | 'cleo' | 'dev' | 'eve' | 'tia' | 'tam', Person> = {} as never
const name = (k: keyof typeof people) => people[k].display_name
/** Alpha's work on the group project, once handed in. */
let alphaWork = ''
/** The members' grades from Alpha's group grade, by person. */
const grades: Partial<Record<keyof typeof people, string>> = {}

function instructor(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

const hour = 3600 * 1000

test.beforeAll(async () => {
  const d = demo()
  const made = await ok(root().token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'PEER101',
    section: STAMP,
    title: `Working together ${STAMP}`,
  })
  courseId = made.course_id
  await ok(root().token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(root().token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: instructor().actor_id })
  const I = instructor().token

  for (const [key, display] of [
    ['ada', 'Ada Lovelace'],
    ['ben', 'Ben Okafor'],
    ['cleo', 'Cleo Chan'],
    ['dev', 'Dev Patel'],
    ['eve', 'Eve Santos'],
  ] as const) {
    const who = await registerPerson(`${display} ${STAMP}`, { email: `${key}+${STAMP}@peer.test` })
    const seat = await ok(I, 'POST', `/v1/courses/${courseId}/members`, { actor_id: who.actor_id, preset: 'student' })
    people[key] = { ...who, member_id: seat.member_id as string }
  }
  // A teaching assistant who enters grades, and whose posting them waits for approval.
  const tia = await registerPerson(`Tia Ho ${STAMP}`, { email: `tia+${STAMP}@peer.test` })
  const tiaSeat = await ok(I, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: tia.actor_id,
    preset: 'ta',
    perms: { grade_post: 'confirm_required' },
  })
  people.tia = { ...tia, member_id: tiaSeat.member_id as string }
  // A teaching assistant who enters and posts grades for Alpha's students alone.
  const tam = await registerPerson(`Tam Lee ${STAMP}`, { email: `tam+${STAMP}@peer.test` })
  const tamSeat = await ok(I, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: tam.actor_id,
    preset: 'ta',
    perms: { grade_submit: 'autonomous', grade_post: 'autonomous' },
    student_scope: 'listed',
    listed_students: [people.ada.member_id, people.ben.member_id, people.cleo.member_id],
  })
  people.tam = { ...tam, member_id: tamSeat.member_id as string }

  const set = await ok(I, 'POST', `/v1/courses/${courseId}/group-sets`, { name: `Project groups ${STAMP}` })
  setId = set.id
  const made2 = await ok(I, 'POST', `/v1/courses/${courseId}/group-sets/${set.id}/groups`, {
    groups: [{ name: 'Alpha' }, { name: 'Beta' }],
  })
  groups = { alpha: made2.group_ids[0], beta: made2.group_ids[1] }
  await ok(I, 'POST', `/v1/courses/${courseId}/group-sets/${set.id}/members`, {
    placements: [
      { student_member_id: people.ada.member_id, group_id: groups.alpha },
      { student_member_id: people.ben.member_id, group_id: groups.alpha },
      { student_member_id: people.cleo.member_id, group_id: groups.alpha },
      { student_member_id: people.dev.member_id, group_id: groups.beta },
      { student_member_id: people.eve.member_id, group_id: groups.beta },
    ],
  })
  for (const [title, key] of [
    [PROJECT, 'project'],
    [LAB, 'lab'],
  ] as const) {
    const a = await ok(I, 'POST', `/v1/courses/${courseId}/assignments`, {
      title,
      points_possible: 100,
      group_set_id: set.id,
      due_at: new Date(Date.now() + 7 * 24 * hour).toISOString(),
    })
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${a.id}/publish`, {})
    if (key === 'project') project = a.id
    else lab = a.id
  }
  await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${project}/peer-form`, {
    kind: 'share',
    opens: 'at',
    opens_at: new Date(Date.now() - hour).toISOString(),
    closes_at: new Date(Date.now() + 2 * hour).toISOString(),
    weight: 20,
    share_with_students: 'own_average',
    version: 0,
  })
})

/** The page lays out within the window's width: nothing scrolls sideways. */
async function expectNoSidewaysScroll(page: Page, what: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll, `${what}: the page scrolls sideways`).toBeLessThanOrEqual(client)
}

const settings = (page: Page) => page.locator('[data-test="peer-settings"]')
const task = (page: Page) => page.locator('[data-test="peer-task"]')
const shareInput = (page: Page, who: keyof typeof people) =>
  page.locator(`input[data-test="peer-share-${people[who].member_id}"]`)

test.describe.serial('peer evaluation', () => {
  test('a teacher sets up peer evaluation on a group assignment, rating on criteria, and reads who will see what', async ({
    page,
  }) => {
    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments/${lab}`)
    await expect(settings(page)).toContainText('No peer evaluation yet.')
    await settings(page).getByRole('button', { name: 'Set up' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set up peer evaluation' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Those who grade read every evaluation, with who wrote it and their comments.')
    await expect(dialog).not.toContainText('Once it closes, each student sees the average')
    await dialog.getByText('Rate on criteria', { exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Criterion 1: what is rated' })).toHaveValue(
      'Contribution to the work',
    )
    await dialog.getByRole('spinbutton', { name: 'Counts in grades' }).fill('25')
    await dialog.getByRole('spinbutton', { name: 'Counts in grades' }).blur()
    await expect(dialog).toContainText('At 25%, in a group scored 80 of 100')
    await dialog.getByText('Show each student their own average once it closes').click()
    await expect(dialog).toContainText('Once it closes, each student sees the average their peers gave them')
    await expect(dialog).toContainText('Where it counts in grades, each student sees how it moved their own score')
    await photograph(page, 'peer-form-dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Peer evaluation saved')
    await expect(dialog).toBeHidden()
    await expect(settings(page)).toContainText('Rate on criteria')
    await expect(settings(page)).toContainText('Contribution to the work')
    await expect(settings(page)).toContainText('1 to 5')
    await expect(settings(page)).toContainText('25% of each member’s grade')
    await expect(settings(page)).toContainText('Their own evaluation, and their own average once it closes')
    await expect(settings(page)).toContainText('For each group, once it hands its work in')
    const got = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/assignments/${lab}/peer-form`)
    expect(got.form).toMatchObject({
      kind: 'rating',
      weight: 25,
      share_with_students: 'own_average',
      opens: 'on_hand_in',
    })
    expect(got.form.criteria).toHaveLength(3)
    await photograph(page, 'peer-settings-card')
  })

  test('the teacher reads it in Traditional Chinese on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, instructor())
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await expect(settings(page)).toContainText('組員互評')
    await expect(settings(page)).toContainText('分配100分')
    await expect(settings(page)).toContainText('佔每位組員成績的20%')
    await expect(settings(page)).toContainText('自己的互評，以及截止後自己的平均')
    await expectNoSidewaysScroll(page, 'the assignment on a phone')
    await settings(page).getByRole('button', { name: '編輯' }).click()
    const dialog = page.getByRole('dialog', { name: '組員互評' })
    await expect(dialog).toContainText('誰可以看到甚麼')
    await expect(dialog).toContainText('每位學生只能看到自己的互評')
    await photograph(page, 'peer-form-dialog-phone-zh')
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toBeHidden()
    await expectNoSidewaysScroll(page, 'the assignment on a phone, the dialog closed')
  })

  test('a student splits 100 points among the others in their group, and the points must add up', async ({ page }) => {
    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.ada)
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await expect(task(page)).toContainText('Open')
    await expect(task(page)).toContainText('Split 100 points among the other members of Alpha')
    await expect(task(page)).toContainText('Only your teachers read your evaluation, with your name.')
    await expect(task(page).locator('.peer-task__entry label')).toHaveText([name('ben'), name('cleo')])
    // Nobody of another group is on the page.
    for (const other of ['dev', 'eve'] as const) await expect(page.locator('body')).not.toContainText(name(other))
    await shareInput(page, 'ben').fill('60')
    await shareInput(page, 'cleo').fill('30')
    await expect(page.locator('[data-test="peer-total"]')).toContainText('Total: 90 of 100')
    await expect(page.locator('[data-test="peer-total"]')).toContainText('10 left to give')
    await page.locator('[data-test="peer-submit"]').click()
    await expect(task(page)).toContainText('The points add up to 90: they must add up to exactly 100.')
    await shareInput(page, 'cleo').fill('40')
    await expect(page.locator('[data-test="peer-total"]')).toContainText('Adds up to 100')
    // Asked for from the keyboard, the comment field takes the focus from the button it replaces.
    await task(page)
      .getByRole('button', { name: `Add a comment about ${name('ben')}` })
      .focus()
    await page.keyboard.press('Enter')
    const comment = task(page).getByRole('textbox', { name: `Comment about ${name('ben')}, for your teachers` })
    await expect(comment).toBeFocused()
    await expect(comment).toHaveAttribute('placeholder', `Only your teachers read this, never ${name('ben')}.`)
    await page.keyboard.type('Ben did the most')
    await expect(comment).toHaveValue('Ben did the most')
    await photograph(page, 'peer-task-share')
    await page.locator('[data-test="peer-submit"]').click()
    await expectToasted(page, 'Your evaluation was submitted. You can change it until it closes.')
    await expect(task(page)).toContainText('You submitted your evaluation')
    await expect(page.locator('[data-test="peer-submit"]')).toHaveText('Submit changes')
    await expect(page.locator('[data-test="peer-submit"]')).toBeDisabled()
    await page.reload()
    await expect(shareInput(page, 'ben')).toHaveValue('60')
    await expect(shareInput(page, 'cleo')).toHaveValue('40')
  })

  test('a student on a phone, in Traditional Chinese, splits evenly and sends theirs', async ({ page }) => {
    await keepToasts(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, people.ben)
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await expect(task(page)).toContainText('組員互評')
    await expect(task(page)).toContainText('開放中')
    await expect(task(page)).toContainText('只有你的老師會看到你的互評和你的名字。')
    await task(page).getByRole('button', { name: '平均分配' }).click()
    await expect(shareInput(page, 'ada')).toHaveValue('50')
    await expect(shareInput(page, 'cleo')).toHaveValue('50')
    await expect(page.locator('[data-test="peer-total"]')).toContainText('剛好100分')
    await expectNoSidewaysScroll(page, 'a student’s evaluation on a phone')
    await task(page).scrollIntoViewIfNeeded()
    await photograph(page, 'peer-task-phone-zh')
    await page.locator('[data-test="peer-submit"]').click()
    await expectToasted(page, '已交出你的互評。截止前仍可修改。')
    // What Ada wrote of him is not his to read.
    await expect(page.locator('body')).not.toContainText('Ben did the most')
  })

  test('a student never sees another group’s members, evaluations or results', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.dev)
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await expect(task(page).locator('.peer-task__entry label')).toHaveText([name('eve')])
    for (const other of ['ada', 'ben', 'cleo'] as const)
      await expect(page.locator('body')).not.toContainText(name(other))
    await expect(page.locator('body')).not.toContainText('Ben did the most')
    // The lab report's opens once Beta hands its work in: nothing to fill in yet.
    await page.goto(`/courses/${courseId}/assignments/${lab}`)
    await expect(task(page)).toContainText('Not open yet')
    await expect(task(page)).toContainText('Opens once your group hands its work in')
    await expect(page.locator('[data-test="peer-submit"]')).toHaveCount(0)
    // The results are for those who grade.
    await page.goto(`/courses/${courseId}/assignments/${project}/peer`)
    await expect(page.getByText('You do not have permission to see this.')).toBeVisible()
    for (const other of ['ada', 'ben', 'cleo'] as const)
      await expect(page.locator('body')).not.toContainText(name(other))
    const refused = await call(people.dev.token, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-results`)
    expect(refused.status).toBe(403)
    const mine = await ok(people.dev.token, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-form`)
    expect(mine.task.circle.map((c: { member_id: string }) => c.member_id).sort()).toEqual(
      [people.dev.member_id, people.eve.member_id].sort(),
    )
    expect(mine.form.in_use).toBeUndefined()
  })

  test('a form that opens on hand-in opens for a group once it has handed in, and a student rates on every criterion', async ({
    page,
  }) => {
    // Beta hands its lab report in; Alpha has not.
    const sub = await ok(people.dev.token, 'POST', `/v1/courses/${courseId}/submissions`, {
      assignment_id: lab,
      body: 'Our lab report',
    })
    await ok(people.dev.token, 'POST', `/v1/courses/${courseId}/submissions/${sub.submission_id}/submit`, {})

    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.eve)
    await page.goto(`/courses/${courseId}/assignments/${lab}`)
    await expect(task(page)).toContainText('Open')
    await expect(task(page)).toContainText(
      'Rate each of the other members of Beta on each criterion, from 1 (lowest) to 5 (highest).',
    )
    await expect(task(page).locator('.peer-task__rated h3')).toHaveText([name('dev')])
    await page.locator('[data-test="peer-submit"]').click()
    await expect(task(page)).toContainText(`Rate ${name('dev')} on Contribution to the work.`)
    for (const [criterion, n] of [
      ['Contribution to the work', '4'],
      ['Communication and teamwork', '5'],
      ['Reliability: did their part on time', '3'],
    ] as const) {
      await task(page)
        .getByRole('radiogroup', { name: `${criterion}, for ${name('dev')}` })
        .getByText(n, { exact: true })
        .click()
    }
    await photograph(page, 'peer-task-rating')
    await page.locator('[data-test="peer-submit"]').click()
    await expectToasted(page, 'Your evaluation was submitted. You can change it until it closes.')
    const mine = await ok(people.eve.token, 'GET', `/v1/courses/${courseId}/assignments/${lab}/peer-form`)
    expect(mine.task.sheet.entries).toEqual([
      {
        student_member_id: people.dev.member_id,
        ratings: { contribution: 4, teamwork: 5, reliability: 3 },
      },
    ])

    // Alpha has not handed its lab report in: it is not open for them yet.
    await page.context().clearCookies()
    await signIn(page, people.cleo)
    await page.goto(`/courses/${courseId}/assignments/${lab}`)
    await expect(task(page)).toContainText('Not open yet')
    await expect(task(page)).toContainText('Opens once your group hands its work in')
  })

  test('a student whose handing in waits for approval sends their evaluation, and the approver reads whom each rating went to', async ({
    page,
  }) => {
    const I = instructor().token
    await ok(I, 'POST', `/v1/courses/${courseId}/members/${people.dev.member_id}/perms`, {
      perms: { submission_write: 'confirm_required' },
    })
    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.dev)
    await page.goto(`/courses/${courseId}/assignments/${lab}`)
    await expect(task(page).locator('.peer-task__rated h3')).toHaveText([name('eve')])
    for (const [criterion, n] of [
      ['Contribution to the work', '2'],
      ['Communication and teamwork', '3'],
      ['Reliability: did their part on time', '4'],
    ] as const) {
      await task(page)
        .getByRole('radiogroup', { name: `${criterion}, for ${name('eve')}` })
        .getByText(n, { exact: true })
        .click()
    }
    await task(page)
      .getByRole('button', { name: `Add a comment about ${name('eve')}` })
      .click()
    const comment = task(page).getByRole('textbox', { name: `Comment about ${name('eve')}, for your teachers` })
    await expect(comment).toBeFocused()
    await comment.fill('Eve wrote the method')
    await page.locator('[data-test="peer-submit"]').click()
    await expect(task(page)).toContainText('Your evaluation waits for approval before it counts as sent.')

    // Sato reads it on the approvals queue, by name and by criterion, and on its page.
    await page.context().clearCookies()
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/approvals`)
    const card = page.locator('.action-card').filter({ hasText: 'Submit a peer evaluation' })
    await expect(card).toBeVisible()
    const sheet = card.locator('[data-test="peer-proposal-sheet"]')
    await expect(sheet).toContainText(name('eve'))
    await expect(sheet).toContainText(
      'Contribution to the work 2 · Communication and teamwork 3 · Reliability: did their part on time 4',
    )
    await expect(sheet).toContainText('“Eve wrote the method”')
    await photograph(page, 'peer-sheet-proposal')
    await card.getByRole('link', { name: 'Details' }).click()
    const section = page.locator('.app-card').filter({ hasText: 'The evaluation it submits' })
    await expect(section.locator('[data-test="peer-proposal-sheet"]')).toContainText(name('eve'))
    await expect(section).toContainText('no other student reads it')
    await section.scrollIntoViewIfNeeded()
    // Nobody is named by an id, nor a rating by Core's field, where it is read.
    await expect(page.getByText(people.eve.member_id).filter({ visible: true })).toHaveCount(0)
    await expect(page.getByText('student_member_id').filter({ visible: true })).toHaveCount(0)
    await photograph(page, 'peer-sheet-proposal-page')

    await page.goto(`/courses/${courseId}/approvals`)
    await card.getByRole('button', { name: 'Approve', exact: true }).click()
    await card.getByRole('button', { name: 'Approve now' }).click()
    await expectToasted(page, 'Approved and carried out')
    const mine = await ok(people.dev.token, 'GET', `/v1/courses/${courseId}/assignments/${lab}/peer-form`)
    expect(mine.task.sheet.entries).toEqual([
      {
        student_member_id: people.eve.member_id,
        ratings: { contribution: 2, teamwork: 3, reliability: 4 },
        comment: 'Eve wrote the method',
      },
    ])
    await ok(I, 'POST', `/v1/courses/${courseId}/members/${people.dev.member_id}/perms`, {
      perms: { submission_write: 'autonomous' },
    })
  })

  test('the teacher reads each group’s results, each factor in plain words, the flags and who wrote nothing, and downloads them', async ({
    page,
  }) => {
    // Cleo and Eve write theirs; Alpha hands its work in, and Sato grades it 80.
    await ok(people.cleo.token, 'POST', `/v1/courses/${courseId}/assignments/${project}/peer-reviews`, {
      entries: [
        { student_member_id: people.ada.member_id, share: 70, comment: 'Ada led the work' },
        { student_member_id: people.ben.member_id, share: 30 },
      ],
    })
    await ok(people.eve.token, 'POST', `/v1/courses/${courseId}/assignments/${project}/peer-reviews`, {
      entries: [{ student_member_id: people.dev.member_id, share: 100 }],
    })
    const sub = await ok(people.ada.token, 'POST', `/v1/courses/${courseId}/submissions`, {
      assignment_id: project,
      body: 'Our report',
    })
    await ok(people.ada.token, 'POST', `/v1/courses/${courseId}/submissions/${sub.submission_id}/submit`, {})
    alphaWork = sub.submission_id
    const graded = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades`, {
      submission_id: sub.submission_id,
      score: 80,
      no_rubric: true,
    })
    for (const g of graded.member_grades as { student_member_id: string; grade_id: string }[]) {
      const key = (Object.keys(people) as (keyof typeof people)[]).find(
        (k) => people[k].member_id === g.student_member_id,
      )
      if (key) grades[key] = g.grade_id
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await settings(page).getByRole('link', { name: 'Results' }).click()
    await expect(page).toHaveURL(new RegExp(`/assignments/${project}/peer$`))
    const alpha = page.locator(`[data-test="peer-group-${groups.alpha}"]`)
    const beta = page.locator(`[data-test="peer-group-${groups.beta}"]`)
    await expect(alpha).toContainText('Group score 80 of 100')
    const ada = alpha.locator(`[data-test="peer-member-${people.ada.member_id}"]`)
    await expect(ada).toContainText('120% of an even share, from 2 peers')
    await expect(ada).toContainText('83.2')
    await expect(ada).toContainText('3.2 above the group’s')
    await expect(ada).toContainText(`50 points from ${name('ben')}`)
    await expect(ada).toContainText(`70 points from ${name('cleo')}`)
    const ben = alpha.locator(`[data-test="peer-member-${people.ben.member_id}"]`)
    await expect(ben).toContainText('90% of an even share, from 2 peers')
    await expect(ben).toContainText('Rated everyone the same')
    await expect(ben).toContainText('1.6 below the group’s')
    await expect(beta).toContainText(`No evaluation yet from ${name('dev')}`)
    await expect(beta).toContainText('peer evaluation cannot move their scores')
    await expect(beta.locator(`[data-test="peer-member-${people.dev.member_id}"]`)).toContainText('No evaluation')
    await expect(page.locator('.fair-share')).toContainText('1 is an even share, 1.2 is 20% more than even')
    await expect(page.locator('.fair-share')).toContainText(
      'With the group at 80, a factor of 1.2 gives 83.2, and 0.8 gives 76.8.',
    )
    // Every evaluation, with who wrote it and their comments.
    await alpha.getByText('Evaluations written (3)').click()
    await expect(alpha.locator('.peer-sheets')).toContainText('“Ben did the most”')
    await expect(alpha.locator('.peer-sheets')).toContainText('“Ada led the work”')
    await photograph(page, 'peer-results')

    await page.getByRole('radio', { name: /Evaluations missing/ }).click()
    await expect(alpha).toHaveCount(0)
    await expect(beta).toBeVisible()
    await page.getByRole('radio', { name: /^All/ }).click()
    await expect(alpha).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    const csv = readFileSync(await download.path(), 'utf8')
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Group,Member,Wrote an evaluation,Written at,Peers who rated them,Average share received,Factor,Score at 20%,Group score,Grade now,Flags',
    )
    expect(lines.find((l) => l.includes(name('ada')))).toMatch(
      new RegExp(`^Alpha,${name('ada')},Yes,[^,]+,2,60,1.2,83.2,80,80 \\(draft\\),$`),
    )

    // A group's work shows its peer evaluation, for those who grade.
    await alpha.getByRole('link', { name: 'Open the work' }).click()
    const panel = page.locator('[data-test="peer-submission-panel"]')
    await expect(panel).toContainText('120% of an even share, from 2 peers')
    await expect(panel).not.toContainText(name('dev'))
    await panel.scrollIntoViewIfNeeded()
    await photograph(page, 'peer-submission-panel')
  })

  test('the results on a phone, in Traditional Chinese, keep within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, instructor())
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/assignments/${project}/peer`)
    const alpha = page.locator(`[data-test="peer-group-${groups.alpha}"]`)
    await expect(alpha).toContainText('小組分數80／100')
    await expect(alpha.locator(`[data-test="peer-member-${people.ada.member_id}"]`)).toContainText(
      '平均份額的120%，來自2位組員',
    )
    await expect(page.locator('.fair-share')).toContainText('1即平均份額，1.2即比平均多20%')
    await expectNoSidewaysScroll(page, 'the results on a phone')
    await photograph(page, 'peer-results-phone-zh')
  })

  test('a teaching assistant who reaches one group is told counting writes every group’s grades, and why Core refuses him', async ({
    page,
  }) => {
    // Beta hands its project in and is graded 80 while the form is open, so
    // that counting it, once it closes, writes Dev's grade again (with what
    // Eve gave him); then the form closes.
    const I = instructor().token
    const sub = await ok(people.eve.token, 'POST', `/v1/courses/${courseId}/submissions`, {
      assignment_id: project,
      body: 'Our report too',
    })
    await ok(people.eve.token, 'POST', `/v1/courses/${courseId}/submissions/${sub.submission_id}/submit`, {})
    await ok(I, 'POST', `/v1/courses/${courseId}/grades`, { submission_id: sub.submission_id, score: 80, no_rubric: true })
    const now = await ok(I, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-form`)
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${project}/peer-form`, {
      kind: 'share',
      opens: 'at',
      opens_at: new Date(Date.now() - 3 * hour).toISOString(),
      closes_at: new Date(Date.now() - 60 * 1000).toISOString(),
      weight: 20,
      share_with_students: 'own_average',
      version: now.form.version,
    })

    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.tam)
    await page.goto(`/courses/${courseId}/assignments/${project}/peer`)
    await expect(page.locator(`[data-test="peer-group-${groups.alpha}"]`)).toBeVisible()
    await expect(page.locator(`[data-test="peer-group-${groups.beta}"]`)).toHaveCount(0)
    await page.locator('[data-test="peer-count"]').click()
    const dialog = page.getByRole('dialog', { name: 'Count peer evaluation in grades' })
    await expect(dialog.locator('[data-test="peer-apply-scoped"]')).toContainText(
      'This lists only the groups whose members are all within your reach.',
    )
    await photograph(page, 'peer-apply-scoped')
    await dialog.locator('[data-test="peer-apply-confirm"]').click()
    // Refused, and recorded as such.
    await expect(page.locator('.el-notification')).toContainText(
      'Counting it would change grades of students beyond your reach, in groups not listed here, so nothing was written. Someone who reaches every student can count it.',
    )
    await photograph(page, 'peer-apply-refused')
    // Nothing was written: Alpha's grades are as they were.
    const after = await ok(I, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-results`)
    const alpha = after.groups.find((g: { group_id: string }) => g.group_id === groups.alpha)
    for (const m of alpha.members as { grade: { score: number; adjustment_kind?: string } }[])
      expect(m.grade.adjustment_kind).toBeUndefined()
  })

  test('counting it in grades leaves a teacher’s own adjustment, and a proposal of it shows each member’s factor', async ({
    page,
  }) => {
    // Sato adjusts Cleo's grade himself, and the form closes.
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades/${grades.cleo}/adjust`, {
      kind: 'delta',
      points: -5,
      reason: 'Missed two meetings',
    })
    const now = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-form`)
    await ok(instructor().token, 'POST', `/v1/courses/${courseId}/assignments/${project}/peer-form`, {
      kind: 'share',
      opens: 'at',
      opens_at: new Date(Date.now() - 3 * hour).toISOString(),
      closes_at: new Date(Date.now() - 60 * 1000).toISOString(),
      weight: 20,
      share_with_students: 'own_average',
      version: now.form.version,
    })

    // Tia, whose posting waits for approval, proposes counting it.
    await keepToasts(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.tia)
    await page.goto(`/courses/${courseId}/assignments/${project}/peer`)
    await page.locator('[data-test="peer-count"]').click()
    const dialog = page.getByRole('dialog', { name: 'Count peer evaluation in grades' })
    await expect(dialog).toContainText('at 20%')
    await expect(dialog.locator(`[data-test="peer-apply-${people.ada.member_id}"]`)).toContainText('83.2')
    await expect(dialog.locator(`[data-test="peer-apply-${people.cleo.member_id}"]`)).toContainText(
      'Your adjustment, kept',
    )
    await expect(dialog).toContainText('2 grades will change.')
    await expect(dialog).toContainText('The factors as they are now are recorded with it')
    await photograph(page, 'peer-apply-dialog')
    await dialog.locator('[data-test="peer-apply-confirm"]').click()
    await expect(page.locator('.peer-results__note')).toContainText(
      'Counting peer evaluation in grades waits for approval.',
    )

    // Sato reads each member's factor on the approvals queue, and approves it.
    await page.context().clearCookies()
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/approvals`)
    const card = page.locator('.action-card').filter({ hasText: 'Count peer evaluation in grades' })
    await expect(card).toBeVisible()
    const factors = card.locator('[data-test="peer-proposal-factors"]')
    await expect(factors).toContainText(name('ada'))
    await expect(factors).toContainText('120% of an even share')
    await expect(factors).toContainText('90% of an even share')
    await expect(factors).not.toContainText(name('cleo'))
    await photograph(page, 'peer-apply-proposal')
    await card.getByRole('button', { name: 'Approve', exact: true }).click()
    await card.getByRole('button', { name: 'Approve now' }).click()
    await expectToasted(page, 'Approved and carried out')

    const after = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/assignments/${project}/peer-results`)
    const alpha = after.groups.find((g: { group_id: string }) => g.group_id === groups.alpha)
    const scoreOf = (k: keyof typeof people) =>
      alpha.members.find((m: { member_id: string }) => m.member_id === people[k].member_id).grade
    expect(scoreOf('ada')).toMatchObject({ score: 83.2, adjustment_kind: 'peer' })
    expect(scoreOf('ben')).toMatchObject({ score: 78.4, adjustment_kind: 'peer' })
    expect(scoreOf('cleo')).toMatchObject({ score: 75, adjustment_kind: 'delta' })

    await page.goto(`/courses/${courseId}/assignments/${project}/peer`)
    const ada = page.locator(`[data-test="peer-member-${people.ada.member_id}"]`)
    await expect(ada).toContainText('Moved by peer evaluation')
    await expect(page.locator(`[data-test="peer-member-${people.cleo.member_id}"]`)).toContainText(
      'Your adjustment: peer evaluation leaves it as it is',
    )
  })

  test('once it closes, a student on a phone reads their own average, and nothing anyone wrote of them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, people.ada)
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/assignments/${project}`)
    await expect(task(page)).toContainText('已截止')
    await expect(page.locator('[data-test="peer-own-average"]')).toContainText(
      '組員平均給你平均份額的120%（100%即平均份額）。',
    )
    await expect(shareInput(page, 'ben')).toBeDisabled()
    await expect(page.locator('[data-test="peer-submit"]')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Ada led the work')
    await expect(page.locator('body')).not.toContainText(name('dev'))
    await expectNoSidewaysScroll(page, 'a student’s closed evaluation on a phone')
    await task(page).scrollIntoViewIfNeeded()
    await photograph(page, 'peer-task-closed-phone-zh')
  })

  test('a student of another group opening a group’s work sees none of it, its grades or its peer evaluation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, people.eve)
    await page.goto(`/courses/${courseId}/submissions/${alphaWork}`)
    await expect(page.getByText(/You do not have permission to see this\.|Not found/).first()).toBeVisible()
    await expect(page.locator('[data-test="peer-submission-panel"]')).toHaveCount(0)
    for (const other of ['ada', 'ben', 'cleo'] as const)
      await expect(page.locator('body')).not.toContainText(name(other))
    await expect(page.locator('body')).not.toContainText('83.2')
    await expect(page.locator('body')).not.toContainText('Ada led the work')
    const refused = await call(
      people.eve.token,
      'GET',
      `/v1/courses/${courseId}/assignments/${project}/peer-results?group_id=${groups.alpha}`,
    )
    expect(refused.status).toBe(403)
  })

  test('with self-evaluation on, a factor says it counts what the member gave themselves; on a form for reference only, no score is shown', async ({
    page,
  }) => {
    // A poster for the same groups, its form splitting 100 points with
    // self-evaluation on, at 20 %; Ada alone evaluates, giving herself 60 and
    // the others 20 each; Alpha hands it in and is graded 80.
    const I = instructor().token
    const poster = await ok(I, 'POST', `/v1/courses/${courseId}/assignments`, {
      title: `Poster ${STAMP}`,
      points_possible: 100,
      group_set_id: setId,
      due_at: new Date(Date.now() + 7 * 24 * hour).toISOString(),
    })
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${poster.id}/publish`, {})
    const form = {
      kind: 'share',
      self_evaluation: true,
      opens: 'at',
      opens_at: new Date(Date.now() - hour).toISOString(),
      closes_at: new Date(Date.now() + 2 * hour).toISOString(),
      weight: 20,
      share_with_students: 'none',
    }
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${poster.id}/peer-form`, { ...form, version: 0 })
    await ok(people.ada.token, 'POST', `/v1/courses/${courseId}/assignments/${poster.id}/peer-reviews`, {
      entries: [
        { student_member_id: people.ada.member_id, share: 60 },
        { student_member_id: people.ben.member_id, share: 20 },
        { student_member_id: people.cleo.member_id, share: 20 },
      ],
    })
    const sub = await ok(people.ada.token, 'POST', `/v1/courses/${courseId}/submissions`, {
      assignment_id: poster.id,
      body: 'Our poster',
    })
    await ok(people.ada.token, 'POST', `/v1/courses/${courseId}/submissions/${sub.submission_id}/submit`, {})
    await ok(I, 'POST', `/v1/courses/${courseId}/grades`, { submission_id: sub.submission_id, score: 80, no_rubric: true })

    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/assignments/${poster.id}/peer`)
    const alpha = page.locator(`[data-test="peer-group-${groups.alpha}"]`)
    const ada = alpha.locator(`[data-test="peer-member-${people.ada.member_id}"]`)
    // Core's factor for her is her own share alone, 0.6 against an even third.
    await expect(ada).toContainText('180% of an even share, from their own evaluation alone')
    await expect(ada).toContainText('No peer has rated them')
    await expect(ada).not.toContainText('Nobody has rated them')
    await expect(ada).toContainText('Score at 20%')
    await expect(ada).toContainText('92.8')
    await expect(ada).toContainText('12.8 above the group’s')
    await expect(alpha.locator(`[data-test="peer-member-${people.ben.member_id}"]`)).toContainText(
      '60% of an even share, from 1 peer',
    )
    await ada.scrollIntoViewIfNeeded()
    await photograph(page, 'peer-results-self')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    const lines = readFileSync(await download.path(), 'utf8').slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Group,Member,Wrote an evaluation,Written at,Peers who rated them,Average share received,Gave themselves (against an even share),Factor (their own evaluation included),Factor from peers alone,Score at 20%,Group score,Grade now,Flags',
    )
    expect(lines.find((l) => l.includes(name('ada')))).toMatch(
      new RegExp(`^Alpha,${name('ada')},Yes,[^,]+,0,,1.8,1.8,,92.8,80,80 \\(draft\\),High$`),
    )

    // For reference only: every score would be the group's, and none is shown.
    const now = await ok(I, 'GET', `/v1/courses/${courseId}/assignments/${poster.id}/peer-form`)
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${poster.id}/peer-form`, {
      ...form,
      weight: 0,
      version: now.form.version,
    })
    await page.reload()
    await expect(ada).toContainText('180% of an even share, from their own evaluation alone')
    await expect(ada).not.toContainText('Score')
    await expect(ada).not.toContainText('92.8')
  })
})
