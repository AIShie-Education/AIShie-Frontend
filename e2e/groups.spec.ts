/// <reference lib="dom" />
import { devices, expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  call,
  demo,
  expectToasted,
  inTraditionalChinese,
  keepToasts,
  openCourseTab,
  photograph,
  registerPerson,
  root,
  signIn,
  signOut,
  wordsBelowAA,
  type DemoActor,
} from './support'

// A course's groups (分組): its group sets, each holding groups, formed by
// hand, by a random split and by students signing themselves up, in a course
// of the test's own with six students. Sato, its teacher, makes a set with
// sign-up open, adds two groups of three and places Ada from the keyboard
// alone (her box, then "Move to…", by keys). A group assignment uses the set,
// and Ada starts a draft for her group; Sato splits everyone at random, the
// preview worked out in the page showing what the server then deals, and the
// group with Ada's draft left alone; moving Ada out of it says first what
// becomes of the draft. The history says who was placed where and by whom,
// back closes it, and the set downloads as CSV.
//
// A student, in Traditional Chinese, sees her own group and its members by
// name and nothing of another group: not its members, not its work. She
// switches to a group with room, and is told in words when the one she asks
// for has filled up meanwhile. On a phone, the page fits and leaving asks
// first; Sato moves a student from a row's menu there. Once Sato closes
// sign-up, a student is told the teacher places them now.
//
// With E2E_SHOTS set to a directory, the set's page, the split and the
// student's sign-up are photographed there.

const STAMP = Date.now().toString(36)
const SET = `Project groups ${STAMP}`
const REPORT = `Group report ${STAMP}`
let courseId = ''
let setId = ''
let reportId = ''
type Student = DemoActor & { member_id: string; name: string }
const students: Record<'ada' | 'ben' | 'cy' | 'dee' | 'eve' | 'fay', Student> = {} as never
/** Two teaching assistants: Tess reads the member list and forms no groups; Tam's forming them waits for approval. */
const tas: Record<'tess' | 'tam', DemoActor> = {} as never

function teacher(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

/** The set as its teacher reads it: each group's name and members by name, and who is in none. */
async function setAsTeacher() {
  const s = await ok(teacher().token, 'GET', `/v1/courses/${courseId}/group-sets/${setId}`)
  const groups = (
    s.groups as {
      id: string
      name: string
      archived_at?: string
      members?: { member_id: string; display_name: string }[]
    }[]
  )
    .filter((g) => !g.archived_at)
    .map((g) => ({ id: g.id, name: g.name, members: (g.members ?? []).map((m) => m.display_name).sort() }))
  return { groups, unassigned: ((s.unassigned ?? []) as { display_name: string }[]).map((m) => m.display_name).sort() }
}

test.beforeAll(async () => {
  const d = demo()
  const made = await ok(root().token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'GRP101',
    section: STAMP,
    title: `Group work ${STAMP}`,
  })
  courseId = made.course_id
  await ok(root().token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(root().token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: teacher().actor_id })
  const names = { ada: 'Ada Lee', ben: 'Ben Ho', cy: 'Cy Wu', dee: 'Dee Ng', eve: 'Eve Lam', fay: 'Fay Ito' } as const
  for (const [key, name] of Object.entries(names) as [keyof typeof names, string][]) {
    const who = await registerPerson(name, { email: `${key}+${STAMP}@groups.test` })
    const seat = await ok(teacher().token, 'POST', `/v1/courses/${courseId}/members`, {
      actor_id: who.actor_id,
      preset: 'student',
    })
    students[key] = { ...who, member_id: seat.member_id as string, name }
  }
  for (const [key, name, perms] of [
    ['tess', 'Tess Ma', undefined],
    ['tam', 'Tam Yu', { assignment_write: 'confirm_required' }],
  ] as const) {
    const who = await registerPerson(name, { email: `${key}+${STAMP}@groups.test` })
    await ok(teacher().token, 'POST', `/v1/courses/${courseId}/members`, {
      actor_id: who.actor_id,
      preset: 'ta',
      perms,
    })
    tas[key] = who
  }
})

/** Each piece of Chinese shown smaller than 13 px (as e2e/type-scale.spec.ts reads a course's pages). */
function smallChinese(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>()
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? ''
      const el = n.parentElement
      if (!el || !/\p{Script=Han}/u.test(text)) continue
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
      const box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 13) out.add(`${el.className || el.tagName}: «${text.trim().slice(0, 20)}» ${size}px`)
    }
    return [...out]
  })
}

/** The page once it has settled, past a fade. */
async function settled(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
}

const header = (page: Page) => page.locator('.page-header')
const card = (page: Page, name: string) =>
  page.locator('.group-card').filter({ has: page.locator('.group-card__name', { hasText: new RegExp(`^${name}$`) }) })
const membersOf = async (l: Locator) =>
  (await l.locator('.student-item__name').allTextContents()).map((s) => s.trim()).sort()
const none = (page: Page) => page.locator('.set-view__none')

test.describe.serial('a course’s groups', () => {
  test('Sato makes a set with sign-up open, adds two groups of three, and places Ada from the keyboard alone', async ({
    page,
  }) => {
    await keepToasts(page)
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}`)
    // In English the course's tabs do not all fit beside the side bar: Groups is under More.
    await openCourseTab(page, 'Groups')
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/groups$`))
    await expect(page.getByText('No group sets yet.')).toBeVisible()

    await header(page).getByRole('button', { name: 'New group set' }).click()
    const form = page.getByRole('dialog', { name: 'New group set' })
    await form.getByLabel('Name').fill(SET)
    await form.getByText('Let students sign themselves up to its groups').click()
    await form.getByRole('button', { name: 'Create' }).click()
    await expectToasted(page, `Made the group set “${SET}”.`)
    await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/)
    setId = page.url().split('/').pop()!
    await expect(header(page).locator('h1')).toHaveText(SET)
    await expect(page.locator('.set-view__signup')).toContainText('Sign-up open')
    await expect(page.locator('.set-view__signup')).toContainText('with no deadline')
    await expect(none(page)).toContainText('In no group: 6')

    await header(page).getByRole('button', { name: 'Add groups' }).click()
    const add = page.getByRole('dialog', { name: 'Add groups' })
    const numbers = add.locator('.el-input-number input')
    await numbers.nth(0).fill('2')
    await numbers.nth(0).press('Tab')
    await numbers.nth(1).fill('3')
    await numbers.nth(1).press('Tab')
    await expect(add).toContainText('They will be called: Group 1 and Group 2')
    await add.getByRole('button', { name: 'Add 2 groups' }).click()
    await expectToasted(page, 'Added Group 1 and Group 2.')
    await expect(card(page, 'Group 1')).toContainText('0 of 3')
    await expect(card(page, 'Group 2')).toContainText('Nobody is in this group yet.')

    // Ada, by keys: her box (Space), then "Move to…" (Enter opens it on its first group, the arrows go through it), Enter.
    const adaBox = none(page).locator(`[data-member="${students.ada.member_id}"] input[type=checkbox]`)
    await adaBox.focus()
    await page.keyboard.press('Space')
    await expect(page.locator('.set-view__chosen')).toHaveText('1 student chosen')
    const moveTo = page.locator('.set-view__toolbar').getByRole('button', { name: 'Move to…' })
    await moveTo.focus()
    await page.keyboard.press('Enter')
    const items = page.locator('.move-menu__list:visible .move-menu__item')
    await expect(items).toHaveText([/Group 1\s*0 of 3/, /Group 2\s*0 of 3/])
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Enter')
    await expectToasted(page, 'Moved Ada Lee to Group 1.')
    await expect(card(page, 'Group 1')).toContainText('1 of 3')
    expect(await membersOf(card(page, 'Group 1'))).toEqual(['Ada Lee'])
    await expect(none(page)).toContainText('In no group: 5')
    await expect(page.locator('.set-view__chosen')).toHaveText('Choose students to move them.')
    await photograph(page, 'groups-set')
  })

  test('the split Sato previews is the one dealt, and the group with Ada’s draft is left alone', async ({ page }) => {
    // A group assignment using the set, and a draft of Ada's group for it.
    const a = await ok(teacher().token, 'POST', `/v1/courses/${courseId}/assignments`, {
      title: REPORT,
      points_possible: 10,
      group_set_id: setId,
    })
    reportId = a.id
    await ok(teacher().token, 'POST', `/v1/courses/${courseId}/assignments/${reportId}/publish`, {})
    await ok(students.ada.token, 'POST', `/v1/courses/${courseId}/submissions`, {
      assignment_id: reportId,
      body: 'Our plan',
    })

    await keepToasts(page)
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await expect(card(page, 'Group 1').locator('.group-card__work')).toContainText(REPORT)
    await expect(card(page, 'Group 1').locator('.group-card__work')).toContainText('Draft')

    await header(page).getByRole('button', { name: 'Split at random' }).click()
    const dialog = page.getByRole('dialog', { name: 'Split at random' })
    const size = dialog.locator('.el-input-number input').first()
    await size.fill('3')
    await size.press('Tab')
    await dialog.getByText('Everyone: empty the groups and deal them all again').click()
    const seed = await dialog.locator('.split-dialog__seed-input input').inputValue()
    expect(seed).toMatch(/^[A-Z2-7]{12}$/)
    await expect(dialog.locator('.split-dialog__kept')).toContainText(
      'Left alone, as it has work for an assignment of this set: Group 1.',
    )
    // Five to deal (all but Ada, whose group is kept): Group 2 takes three at most, and a Group 3 is made.
    await expect(dialog).toContainText('Places 5 students into 2 groups.')
    await expect(dialog).toContainText('Makes Group 3.')
    const preview: Record<string, string[]> = {}
    for (const g of await dialog.locator('.split-dialog__group').all()) {
      const name = (await g.locator('.split-dialog__group-name').textContent())!.trim()
      preview[name] = (await g.locator('.split-dialog__names li').allTextContents()).map((s) =>
        s.replace('(stays)', '').trim(),
      )
    }
    expect(Object.keys(preview).sort()).toEqual(['Group 1', 'Group 2', 'Group 3'])
    expect(preview['Group 1']).toEqual(['Ada Lee'])
    expect(preview['Group 2'].length + preview['Group 3'].length).toBe(5)
    await photograph(page, 'groups-split')
    await dialog.getByRole('button', { name: 'Split', exact: true }).click()

    const result = page.locator('.set-view__split-result')
    await expect(result).toContainText(`Split at random, with the seed ${seed}`)
    await expect(result).toContainText('Placed 5 students.')
    await expect(result).toContainText('Made Group 3.')
    await expect(result).toContainText('Left Group 1 alone: it has work for an assignment of this set.')
    // What the server dealt is what the page showed, student for student.
    const dealt = await setAsTeacher()
    for (const g of dealt.groups) expect(g.members, g.name).toEqual([...preview[g.name]].sort())
    expect(dealt.unassigned).toEqual([])
    for (const g of dealt.groups)
      await expect.poll(() => membersOf(card(page, g.name)), { message: g.name }).toEqual(g.members)
  })

  test('moving Ada out of the group with her draft says first what becomes of it', async ({ page }) => {
    await keepToasts(page)
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await card(page, 'Group 1').getByRole('button', { name: 'Move Ada Lee to…' }).click()
    await page.locator('.move-menu__list:visible .move-menu__item', { hasText: 'Group 3' }).click()
    const dialog = page.getByRole('dialog', { name: 'This touches group work' })
    await expect(dialog.locator('.affects-work__row')).toHaveCount(1)
    await expect(dialog.locator('.affects-work__row')).toContainText('Group 1')
    await expect(dialog.locator('.affects-work__row')).toContainText(REPORT)
    await expect(dialog.locator('.affects-work__row')).toContainText('Draft')
    await expect(dialog).toContainText('A draft follows the group')
    await dialog.getByRole('button', { name: 'Move them anyway' }).click()
    await expectToasted(page, 'Moved Ada Lee to Group 3.')
    await expect(card(page, 'Group 3').locator('.student-item__name', { hasText: 'Ada Lee' })).toBeVisible()
    await expect(card(page, 'Group 1')).toContainText('Nobody is in this group yet.')
  })

  test('the history says who was placed where, by whom and how; back closes it; the set downloads as CSV', async ({
    page,
  }) => {
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await page.getByRole('button', { name: 'History' }).click()
    const drawer = page.getByRole('dialog', { name: 'Who was in which group' })
    await drawer.getByPlaceholder('Find a student').fill('Ada')
    const stays = drawer.locator('.history-drawer__stay')
    await expect(stays).toHaveCount(2)
    await expect(stays.nth(0)).toContainText('Group 3')
    await expect(stays.nth(0)).toContainText('Joined by being placed')
    await expect(stays.nth(0)).toContainText('Still in it')
    await expect(stays.nth(1)).toContainText('Group 1')
    await expect(stays.nth(1)).toContainText('Left by being moved')
    await page.goBack()
    await expect(drawer).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/groups/${setId}$`))

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download CSV' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(
      new RegExp(`^GRP101-${STAMP}-Project_groups_${STAMP}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    )
    const csv = readFileSync(await file.path(), 'utf8')
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Group set,Group,Student,Login ID,Joined')
    expect(lines.filter((l) => l.startsWith(`${SET},`))).toHaveLength(6)
    expect(lines.some((l) => l.startsWith(`${SET},Group 3,Ada Lee,,`))).toBe(true)
  })

  test('a student sees her own group and its members by name, and nothing of another group’s', async ({ page }) => {
    const dealt = await setAsTeacher()
    // Someone with company: in a group with another, and not Ada, whose group has the draft.
    const mine = dealt.groups.find((g) => g.members.length >= 2 && !g.members.includes('Ada Lee'))!
    const me = Object.values(students).find((s) => s.name === mine.members[0])!
    const others = dealt.groups.filter((g) => g.id !== mine.id).flatMap((g) => g.members)
    expect(others.length).toBeGreaterThan(0)

    await signIn(page, me)
    await inTraditionalChinese(page)
    // What the server sends her names her own group's members alone.
    const read = page.waitForResponse((r) => r.url().includes(`/group-sets/${setId}`) && r.request().method() === 'GET')
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    const body = await (await read).json()
    for (const g of body.result.groups) {
      if (g.id !== mine.id) expect(g.members ?? [], g.name).toEqual([])
      expect(g.work ?? [], g.name).toEqual([])
    }
    const mates = page.locator('.student-set__mates li')
    await expect(page.locator('.student-set__mine')).toContainText('你的小組')
    await expect(page.locator('.student-set__group')).toHaveText(mine.name)
    await expect(mates).toHaveCount(mine.members.length)
    await expect(page.locator('.student-set__mates')).toContainText(`${me.name}（你）`)
    const text = await page.locator('.app-main').innerText()
    for (const name of others) expect(text, name).not.toContain(name)
    // No work of any group, no one placed by anyone, nothing of a staff page.
    expect(text).not.toContain(REPORT)
    expect(text).not.toContain('草稿')
    await expect(page.locator('.group-card, .set-view__none, .set-view__toolbar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '記錄' })).toHaveCount(0)

    // The Groups tab names her group and its others, and the feed tells her of her own placing alone.
    await page.goto(`/courses/${courseId}/groups`)
    await expect(page.locator('.groups__row').filter({ hasText: SET })).toContainText(`你的小組：${mine.name}`)
    await page.goto(`/courses/${courseId}/activity`)
    await expect(page.locator('.event-item__title', { hasText: '加入小組' }).first()).toBeVisible()
    const feed = await page.locator('.app-main').innerText()
    for (const name of others) expect(feed, name).not.toContain(name)
  })

  test('a student switches to a group with room, and is told in words when the one she asks for filled up meanwhile', async ({
    page,
  }) => {
    const dealt = await setAsTeacher()
    const mine = dealt.groups.find((g) => g.members.length >= 2 && !g.members.includes('Ada Lee'))!
    const me = Object.values(students).find((s) => s.name === mine.members[0])!
    // Group 1 is empty since Ada left it; the other group of the deal is where she is asked to go.
    const room = dealt.groups.find((g) => g.name === 'Group 1')!
    const other = dealt.groups.find((g) => g.id !== mine.id && g.id !== room.id)!

    await keepToasts(page)
    await signIn(page, me)
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    const signup = page.locator('.student-set__signup')
    await expect(signup).toContainText('開放報名中')
    const row = (name: string) =>
      signup
        .locator('.student-set__row')
        .filter({ has: page.locator('.student-set__name', { hasText: new RegExp(`^${name}$`) }) })
    await expect(row(mine.name)).toContainText('你的小組')
    await expect(row(mine.name).getByRole('button')).toHaveText('退出')

    // Meanwhile Sato closes the other group to sign-up, its capacity set to its size; the page still offers it.
    await expect(row(other.name).getByRole('button')).toBeEnabled()
    await ok(teacher().token, 'POST', `/v1/courses/${courseId}/groups/${other.id}`, { capacity: other.members.length })
    await row(other.name).getByRole('button').click()
    await expect(page.locator('.student-set__refusal')).toContainText('該小組已額滿。')
    // Read again: it says so, and is not offered.
    await expect(row(other.name)).toContainText('額滿')
    await expect(row(other.name).getByRole('button')).toBeDisabled()

    await row(room.name)
      .getByRole('button', { name: `轉到${room.name}` })
      .click()
    await expectToasted(page, `你已轉到${room.name}。`)
    await expect(page.locator('.student-set__group')).toHaveText(room.name)
    await expect(page.locator('.student-set__refusal')).toHaveCount(0)
    await photograph(page, 'groups-signup-zh-hant')
  })

  test('on a phone, a student’s sign-up fits the screen and leaving her group asks first', async ({ page }) => {
    const me = students.ada
    await page.setViewportSize({ width: 390, height: 844 })
    await keepToasts(page)
    await signIn(page, me)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await expect(page.locator('.student-set__group')).toHaveText('Group 3')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1)
    const leave = page
      .locator('.student-set__row')
      .filter({ hasText: 'Your group' })
      .getByRole('button', { name: 'Leave Group 3' })
    await leave.click()
    const box = page.getByRole('dialog', { name: 'Leave your group?' })
    await expect(box).toContainText('You leave Group 3.')
    await box.getByRole('button', { name: 'Leave' }).click()
    await expectToasted(page, 'You left Group 3.')
    await expect(page.locator('.student-set__mine')).toContainText('You are in no group yet: choose one below.')
  })

  test('on a phone, Sato’s set page fits and a student is placed from a row’s menu', async ({ browser }) => {
    // A phone as a phone is: its width, and a finger (a coarse pointer), which drags nothing.
    const phone = await browser.newContext({ ...devices['Pixel 7'], baseURL: test.info().project.use.baseURL })
    const page = await phone.newPage()
    await keepToasts(page)
    await signIn(page, teacher())
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await expect(none(page)).toContainText('未分組：1人')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1)
    await none(page).getByRole('button', { name: '把Ada Lee移到…' }).click()
    await page.locator('.move-menu__list:visible .move-menu__item', { hasText: 'Group 2' }).click()
    await expectToasted(page, '已把Ada Lee移到Group 2。')
    await expect(none(page)).toContainText('所有學生均已分組。')
    // The drag hint is not offered where a finger does the moving.
    await expect(page.locator('.set-view__drag-hint')).toBeHidden()
    await phone.close()
  })

  test('Sato closes sign-up from the set’s page', async ({ page }) => {
    await keepToasts(page)
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await page.getByRole('button', { name: 'Sign-up settings…' }).click()
    const form = page.getByRole('dialog', { name: 'Edit group set' })
    await form.getByText('Let students sign themselves up to its groups').click()
    await form.getByRole('button', { name: 'Save' }).click()
    await expectToasted(page, 'Saved.')
    await expect(page.locator('.set-view__signup')).toContainText('Sign-up closed')
    await expect(page.locator('.set-view__signup')).toContainText('Students do not sign themselves up: you place them.')
  })

  test('once sign-up is closed, a student is told the teacher places students now', async ({ page }) => {
    await signIn(page, students.ben)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await expect(page.locator('.student-set__mine')).toBeVisible()
    await expect(page.locator('.student-set__signup')).toHaveCount(0)
    await page.goto(`/courses/${courseId}/groups`)
    const row = page.locator('.groups__row').filter({ hasText: SET })
    await expect(row).toContainText('Sign-up closed')
    await expect(row).toContainText('Your teacher places students in groups.')
  })

  test('a teaching assistant who reads the member list sees the groups and who is in them, and forms none', async ({
    page,
  }) => {
    await signIn(page, tas.tess)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    const dealt = await setAsTeacher()
    for (const g of dealt.groups)
      await expect.poll(() => membersOf(card(page, g.name)), { message: g.name }).toEqual(g.members)
    await expect(page.locator('.student-item__check, .group-card__all, .group-card__more')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(Move to…|Split at random|Add groups|Edit)$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible()
  })

  test('a placement that waits for approval says so, and the approvals say who goes where', async ({ page }) => {
    const dealt = await setAsTeacher()
    const from = dealt.groups.find((g) => g.members.includes('Fay Ito'))!
    const to = dealt.groups.find((g) => g.id !== from.id && g.name !== 'Group 1')!
    await keepToasts(page)
    await signIn(page, tas.tam)
    await page.goto(`/courses/${courseId}/groups/${setId}`)
    await expect(header(page).locator('.app-level-tag')).toBeVisible()
    await card(page, from.name).getByRole('button', { name: 'Move Fay Ito to…' }).click()
    await page.locator('.move-menu__list:visible .move-menu__item', { hasText: to.name }).click()
    const note = page.locator('.set-view__note').filter({ hasText: 'Your change waits for approval' })
    await expect(note).toBeVisible()
    // Nothing moved yet.
    expect(await membersOf(card(page, from.name))).toContain('Fay Ito')
    await note.getByRole('link', { name: 'View the request' }).click()
    await expect(page).toHaveURL(/\/actions\/[0-9a-f-]{36}$/)
    const actionId = page.url().split('/').pop()!

    await signOut(page)
    await signIn(page, teacher())
    await page.goto(`/courses/${courseId}/approvals`)
    const queued = page.locator('.action-card').filter({ hasText: 'Place students in groups' })
    await expect(queued).toHaveCount(1)
    await expect(queued.locator('.group-proposal')).toHaveText(`${SET}1 student placed`)
    await page.goto(`/courses/${courseId}/actions/${actionId}`)
    const what = page
      .locator('.app-card')
      .filter({ has: page.getByRole('heading', { name: 'What it does to the groups' }) })
    await expect(what.locator('.group-proposal__list li')).toHaveText([`Fay Ito to ${to.name}`])
    await expect(what.getByRole('link', { name: SET })).toHaveAttribute('href', `/courses/${courseId}/groups/${setId}`)

    await ok(teacher().token, 'POST', `/v1/courses/${courseId}/actions/${actionId}/decide`, { decision: 'approve' })
    const after = await setAsTeacher()
    expect(after.groups.find((g) => g.id === to.id)!.members).toContain('Fay Ito')
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`the set’s page, a teacher’s and a student’s, reads at AA in the ${theme} theme, with no Chinese under 13 px`, async ({
      page,
    }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('aishie.theme', t)
        } catch {}
      }, theme)
      await signIn(page, teacher())
      await inTraditionalChinese(page)
      await page.goto(`/courses/${courseId}/groups/${setId}`)
      await expect(page.locator('.group-card').first()).toBeVisible()
      await settled(page)
      expect(await wordsBelowAA(page, '.app-main'), 'the teacher’s page').toEqual([])
      expect(await smallChinese(page), 'the teacher’s page').toEqual([])
      await header(page).getByRole('button', { name: '隨機分組' }).click()
      const dialog = page.getByRole('dialog', { name: '隨機分組' })
      await expect(dialog.locator('.split-dialog__group').first()).toBeVisible()
      await settled(page)
      expect(await wordsBelowAA(page, '.split-dialog'), 'the split').toEqual([])
      expect(await smallChinese(page), 'the split').toEqual([])
      await dialog.getByRole('button', { name: '取消' }).click()

      await signOut(page)
      await signIn(page, students.ada)
      await inTraditionalChinese(page)
      await page.goto(`/courses/${courseId}/groups/${setId}`)
      await expect(page.locator('.student-set__mine')).toBeVisible()
      await settled(page)
      expect(await wordsBelowAA(page, '.app-main'), 'the student’s page').toEqual([])
      expect(await smallChinese(page), 'the student’s page').toEqual([])
      await page.goto(`/courses/${courseId}/groups`)
      await expect(page.locator('.groups__row').first()).toBeVisible()
      await settled(page)
      expect(await wordsBelowAA(page, '.app-main'), 'the student’s list').toEqual([])
    })
  }
})
