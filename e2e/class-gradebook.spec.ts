import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  chooseLanguage,
  demo,
  photograph,
  pickOption,
  registerPerson,
  root,
  signIn,
  type DemoActor,
} from './support'

// The whole class's gradebook (AIShie-Frontend#80), in a course of the
// test's own: five students, two homeworks in an Assignments bucket and a
// midterm graded directly. Ada has a posted 9/10 on HW1, a posted midterm
// and HW2 handed in and not graded; Ben a draft 7 on HW1; Cleo is recorded
// missing on HW1 and has a posted 15/20 on HW2; Dev has nothing. Eve has
// work waiting behind posted grades: HW1 graded 6, then handed in again
// (and a third attempt opened as a draft); HW2 recorded missing and graded
// 0, then handed in after all. A TA listed to Ada and Ben sees those two
// alone.
//
// With E2E_SHOTS set to a directory, the page is photographed there, light
// and dark, at 1280×800 and 390×844.

const STAMP = Date.now().toString(36)
let courseId = ''
let hw1 = ''
let hw2 = ''
let midterm = ''
const people: Record<'ada' | 'ben' | 'cleo' | 'dev' | 'eve', DemoActor & { member_id: string; login_id: string }> =
  {} as never
const name = (k: keyof typeof people) => people[k].display_name

function instructor(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

/** A new attempt, left a draft. */
async function startAttempt(who: { token: string }, assignment: string): Promise<string> {
  const sub = await ok(who.token, 'POST', `/v1/courses/${courseId}/submissions`, {
    assignment_id: assignment,
    body: 'My work',
  })
  return (sub.submission_id ?? sub.id) as string
}

async function handIn(who: { token: string }, assignment: string): Promise<string> {
  const id = await startAttempt(who, assignment)
  await ok(who.token, 'POST', `/v1/courses/${courseId}/submissions/${id}/submit`, {})
  return id
}

async function grade(body: Record<string, unknown>): Promise<string> {
  const g = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/grades`, { no_rubric: true, ...body })
  return g.grade_id as string
}

test.beforeAll(async () => {
  const d = demo()
  const made = await ok(root().token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'BOOK101',
    section: STAMP,
    title: `The whole class ${STAMP}`,
  })
  courseId = made.course_id
  await ok(root().token, 'POST', `/v1/courses/${courseId}/activate`, {})
  await ok(root().token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: instructor().actor_id })

  const I = instructor().token
  const tree = await ok(I, 'GET', `/v1/courses/${courseId}/components`)
  const rootComponent = (tree.components as { id: string; parent_id?: string | null }[]).find((c) => !c.parent_id)!.id
  const bucket = (
    await ok(I, 'POST', `/v1/courses/${courseId}/components`, {
      parent_id: rootComponent,
      name: 'Assignments',
      weight: 60,
      sort_order: 1,
    })
  ).id
  midterm = (
    await ok(I, 'POST', `/v1/courses/${courseId}/components`, {
      parent_id: rootComponent,
      name: 'Midterm',
      weight: 40,
      points_possible: 100,
      sort_order: 2,
    })
  ).id
  const day = 24 * 3600 * 1000
  for (const [key, title, points, due] of [
    ['hw1', 'HW1 Loops', 10, 7],
    ['hw2', 'HW2 Lists', 20, 14],
  ] as const) {
    const a = await ok(I, 'POST', `/v1/courses/${courseId}/assignments`, {
      title,
      points_possible: points,
      component_id: bucket,
      due_at: new Date(Date.now() + due * day).toISOString(),
    })
    await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${a.id}/publish`, {})
    if (key === 'hw1') hw1 = a.id
    else hw2 = a.id
  }

  for (const [key, display, n] of [
    ['ada', 'Ada Lovelace', '01'],
    ['ben', 'Ben Okafor', '02'],
    ['cleo', 'Cleo Chan', '03'],
    ['dev', 'Dev Patel', '04'],
    ['eve', 'Eve Santos', '05'],
  ] as const) {
    const login_id = `bk${STAMP}${n}`
    const who = await registerPerson(`${display} ${STAMP}`, { email: `${key}+${STAMP}@book.test`, login_id })
    const seat = await ok(I, 'POST', `/v1/courses/${courseId}/members`, { actor_id: who.actor_id, preset: 'student' })
    people[key] = { ...who, member_id: seat.member_id as string, login_id }
  }

  // A TA listed to Ada and Ben alone.
  await ok(I, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: d.actors.observer.actor_id,
    preset: 'ta',
    student_scope: 'listed',
    listed_students: [people.ada.member_id, people.ben.member_id],
  })

  const adaHw1 = await grade({ submission_id: await handIn(people.ada, hw1), score: 9 })
  await handIn(people.ada, hw2)
  const adaMid = await grade({ component_id: midterm, student_member_id: people.ada.member_id, score: 85 })
  await grade({ submission_id: await handIn(people.ben, hw1), score: 7 })
  await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${hw1}/missing`, {
    student_member_id: people.cleo.member_id,
  })
  const cleoHw2 = await grade({ submission_id: await handIn(people.cleo, hw2), score: 15 })
  const eveHw1 = await grade({ submission_id: await handIn(people.eve, hw1), score: 6 })
  const eveMissing = await ok(I, 'POST', `/v1/courses/${courseId}/assignments/${hw2}/missing`, {
    student_member_id: people.eve.member_id,
  })
  const eveHw2 = await grade({ submission_id: (eveMissing.submission_id ?? eveMissing.id) as string, score: 0 })
  await ok(I, 'POST', `/v1/courses/${courseId}/grades/post`, {
    grade_ids: [adaHw1, adaMid, cleoHw2, eveHw1, eveHw2],
  })
  // After the grades are posted, Eve hands HW1 in again and opens a third
  // attempt as a draft; and hands HW2 in after all, which Core makes a new
  // attempt beside the graded missing row.
  await handIn(people.eve, hw1)
  await startAttempt(people.eve, hw1)
  await handIn(people.eve, hw2)
})

async function openClass(page: Page, who: DemoActor = instructor()) {
  await signIn(page, who)
  await page.goto(`/courses/${courseId}/gradebook`)
  await expect(page.getByRole('heading', { name: 'Gradebook', level: 1 })).toBeVisible()
}

const matrix = (page: Page) => page.locator('.matrix__table')
const row = (page: Page, who: keyof typeof people) =>
  matrix(page)
    .locator('tbody tr')
    .filter({ hasText: name(who) })
/** The row's cell under the column whose heading holds text. */
async function cell(page: Page, who: keyof typeof people, heading: string) {
  const heads = await matrix(page).locator('thead th').allInnerTexts()
  const i = heads.findIndex((h) => h.includes(heading))
  expect(i, `a column headed ${heading} in ${JSON.stringify(heads)}`).toBeGreaterThan(0)
  return row(page, who).locator('th, td').nth(i)
}
const order = async (page: Page) =>
  (await matrix(page).locator('tbody .matrix__student-name').allInnerTexts()).map((s) => s.replace(` ${STAMP}`, ''))

test.describe('the whole class’s gradebook', () => {
  test('shows every student by every assignment, with totals, drafts and missing work told apart in words', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openClass(page)
    await expect(order(page)).resolves.toEqual(['Ada Lovelace', 'Ben Okafor', 'Cleo Chan', 'Dev Patel', 'Eve Santos'])
    await expect(page.locator('.classbook__count')).toHaveText('5 students')

    // The course total first, then the bucket's work and its total, then the midterm.
    const heads = (await matrix(page).locator('thead th .matrix__head-title').allInnerTexts()).map((s) => s.trim())
    expect(heads).toEqual(['Student', 'Course total', 'HW1 Loops', 'HW2 Lists', 'Assignments total', 'Midterm'])

    await expect(await cell(page, 'ada', 'HW1 Loops')).toHaveText('9')
    await expect(await cell(page, 'ada', 'Midterm')).toHaveText('85')
    await expect(await cell(page, 'ada', 'HW2 Lists')).toHaveText('To grade')
    await expect(await cell(page, 'ben', 'HW1 Loops')).toContainText('7')
    await expect(await cell(page, 'ben', 'HW1 Loops')).toContainText('Draft')
    await expect(await cell(page, 'cleo', 'HW1 Loops')).toHaveText('Missing')
    await expect(await cell(page, 'cleo', 'HW2 Lists')).toHaveText('15')
    await expect(await cell(page, 'dev', 'HW1 Loops')).toContainText('No grade')
    // Work handed in after a posted grade waits beside it: a resubmission
    // (with a draft attempt after it), and late work after a graded missing row.
    await expect(await cell(page, 'eve', 'HW1 Loops')).toHaveText(/^6\s*To grade$/)
    await expect(await cell(page, 'eve', 'HW2 Lists')).toHaveText(/^0\s*To grade$/)
    // Totals as written down at posting: Ada's course total is a percentage.
    await expect(await cell(page, 'ada', 'Course total')).toHaveText(/^\d+(\.\d+)?%$/)
    await expect(await cell(page, 'ben', 'Course total')).toContainText('No grade')
    // The class's mean of what is posted: Ada's 9 and Eve's 6 on HW1, Ben's draft left out.
    await expect(matrix(page).locator('tfoot td').nth(1)).toHaveText('7.5')

    // The header row and the names are held in place as the table scrolls.
    const stick = (sel: string) =>
      matrix(page)
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).position)
    await expect(stick('thead th')).resolves.toBe('sticky')
    await expect(stick('tbody th')).resolves.toBe('sticky')

    await photograph(page, 'class-gradebook-1280-light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await photograph(page, 'class-gradebook-1280-dark')
  })

  test('sorts by a column, finds a student by name or number, and filters by what waits', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openClass(page)
    const hw1Head = matrix(page).getByRole('button', { name: 'Sort by HW1 Loops' })
    await hw1Head.click()
    // Highest first, those with nothing for it last.
    await expect(order(page)).resolves.toEqual(['Ada Lovelace', 'Ben Okafor', 'Eve Santos', 'Cleo Chan', 'Dev Patel'])
    await expect(matrix(page).locator('thead th').nth(2)).toHaveAttribute('aria-sort', 'descending')
    await hw1Head.click()
    await expect(order(page)).resolves.toEqual(['Eve Santos', 'Ben Okafor', 'Ada Lovelace', 'Cleo Chan', 'Dev Patel'])
    await expect(matrix(page).locator('thead th').nth(2)).toHaveAttribute('aria-sort', 'ascending')

    const search = page.getByPlaceholder('Search by name or number')
    await search.fill('cleo')
    await expect(order(page)).resolves.toEqual(['Cleo Chan'])
    await expect(page.locator('.classbook__count')).toHaveText('1 of 5 students')
    await search.fill(people.dev.login_id)
    await expect(order(page)).resolves.toEqual(['Dev Patel'])
    await search.fill('')

    const show = page.locator('.classbook__filter').first()
    await pickOption(page, show, 'With missing work')
    await expect(order(page)).resolves.toEqual(['Cleo Chan'])
    await pickOption(page, show, 'With draft grades')
    await expect(order(page)).resolves.toEqual(['Ben Okafor'])
    await pickOption(page, show, 'With work to grade')
    // Still by HW1, lowest first.
    await expect(order(page)).resolves.toEqual(['Eve Santos', 'Ada Lovelace'])
  })

  test('exports what is shown as CSV, UTF-8 with a byte-order mark, drafts and missing work marked', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openClass(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(new RegExp(`^BOOK101-${STAMP}-gradebook-\\d{4}-\\d{2}-\\d{2}\\.csv$`))
    const bytes = readFileSync((await download.path())!)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const lines = bytes.toString('utf8').slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Student,Student number,Member ID,Status,Course total (%),HW1 Loops (out of 10),HW2 Lists (out of 20),Assignments total (%),Midterm (out of 100)',
    )
    const line = (k: keyof typeof people) => lines.find((l) => l.startsWith(name(k)))!.split(',')
    expect(line('ada').slice(1, 4)).toEqual([people.ada.login_id, people.ada.member_id, ''])
    expect(line('ada').slice(5)).toEqual(['9', 'To grade', expect.stringMatching(/^\d/), '85'])
    expect(line('ben')[5]).toBe('7 (draft)')
    expect(line('cleo').slice(5, 7)).toEqual(['Missing', '15'])
    expect(line('dev').slice(3)).toEqual(['', '', '', '', '', ''])
    expect(line('eve').slice(5, 7)).toEqual(['6 (newer work to grade)', '0 (newer work to grade)'])
  })

  test('opens a student’s own gradebook from their name, and comes back to the class', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openClass(page)
    await row(page, 'ada')
      .getByRole('link', { name: name('ada') })
      .click()
    await expect(page).toHaveURL(new RegExp(`/gradebook/${people.ada.member_id}$`))
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await page.getByRole('link', { name: 'Whole class', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/gradebook$`))
    await expect(matrix(page)).toBeVisible()

    // A search, a filter and an order are found again, by Back and by Whole class.
    const search = page.getByPlaceholder('Search by name or number')
    await search.fill('a')
    await pickOption(page, page.locator('.classbook__filter').first(), 'With work to grade')
    await matrix(page).getByRole('button', { name: 'Sort by HW1 Loops' }).click()
    await expect(order(page)).resolves.toEqual(['Ada Lovelace', 'Eve Santos'])
    await expect(page).toHaveURL(/[?&]q=a(&|$)/)
    await expect(page).toHaveURL(/[?&]show=toGrade(&|$)/)
    const kept = async () => {
      await expect(matrix(page)).toBeVisible()
      await expect(search).toHaveValue('a')
      await expect(page.locator('.classbook__count')).toHaveText('2 of 5 students')
      await expect(order(page)).resolves.toEqual(['Ada Lovelace', 'Eve Santos'])
      await expect(matrix(page).locator('thead th').nth(2)).toHaveAttribute('aria-sort', 'descending')
    }
    await row(page, 'eve')
      .getByRole('link', { name: name('eve') })
      .click()
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await page.goBack()
    await kept()
    await row(page, 'eve')
      .getByRole('link', { name: name('eve') })
      .click()
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await page.getByRole('link', { name: 'Whole class', exact: true }).click()
    await kept()
    await expect(page).toHaveURL(/[?&]show=toGrade(&|$)/)
    await search.fill('')
    await pickOption(page, page.locator('.classbook__filter').first(), 'Every student')

    // An assignment's own grades are a click from its heading.
    await matrix(page).getByRole('link', { name: 'The grades for HW1 Loops' }).click()
    await expect(page).toHaveURL(new RegExp(`/grades\\?assignment=${hw1}`))
  })

  test('is a list a student at a time on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openClass(page)
    await expect(matrix(page)).toHaveCount(0)
    const items = page.locator('.sgl__item')
    await expect(items).toHaveCount(5)
    const cleo = items.filter({ hasText: name('cleo') })
    await expect(cleo).toContainText('1 missing')
    await expect(items.filter({ hasText: name('eve') })).toContainText('2 to grade')
    await photograph(page, 'class-gradebook-390-light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await photograph(page, 'class-gradebook-390-dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await cleo.getByRole('button').first().click()
    await expect(cleo.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
    const hw1Line = cleo.locator('.sgl__grade').filter({ hasText: 'HW1 Loops' })
    await expect(hw1Line).toContainText('Missing')
    await expect(cleo.locator('.sgl__grade').filter({ hasText: 'HW2 Lists' })).toContainText('15 / 20')
    await cleo.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await photograph(page, 'class-gradebook-390-open-light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await photograph(page, 'class-gradebook-390-open-dark')
  })

  test('shows a seat listed to some students those alone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openClass(page, demo().actors.observer)
    await expect(order(page)).resolves.toEqual(['Ada Lovelace', 'Ben Okafor'])
    await expect(page.locator('.classbook__count')).toHaveText('2 students')
  })
})

// A class of its own, of 32 students by eight homeworks out of 100: more
// than the box holds either way, for where it is scrolled to. Fay has a
// posted 61.75 on HW1 with a draft 72.25 over it, and work handed in since;
// Gus a posted 72.25 with work handed in since. The rest have nothing.
test.describe('a class larger than the screen', () => {
  let bigId = ''
  let bigHw1 = ''
  const big: Record<'fay' | 'gus', DemoActor & { member_id: string }> = {} as never

  test.beforeAll(async () => {
    const d = demo()
    const made = await ok(root().token, 'POST', '/v1/courses', {
      dept_id: d.course.dept_id,
      term_id: d.course.term_id,
      code: 'BOOK102',
      section: STAMP,
      title: `A larger class ${STAMP}`,
    })
    bigId = made.course_id
    await ok(root().token, 'POST', `/v1/courses/${bigId}/activate`, {})
    await ok(root().token, 'POST', `/v1/courses/${bigId}/instructors`, { actor_id: instructor().actor_id })
    const I = instructor().token
    const tree = await ok(I, 'GET', `/v1/courses/${bigId}/components`)
    const top = (tree.components as { id: string; parent_id?: string | null }[]).find((c) => !c.parent_id)!.id
    const bucket = (
      await ok(I, 'POST', `/v1/courses/${bigId}/components`, { parent_id: top, name: 'Homework', weight: 1 })
    ).id
    for (let i = 1; i <= 8; i++) {
      const a = await ok(I, 'POST', `/v1/courses/${bigId}/assignments`, {
        title: `HW${i}`,
        points_possible: 100,
        component_id: bucket,
        due_at: new Date(Date.now() + i * 24 * 3600 * 1000).toISOString(),
      })
      await ok(I, 'POST', `/v1/courses/${bigId}/assignments/${a.id}/publish`, {})
      if (i === 1) bigHw1 = a.id
    }
    for (const [key, display] of [
      ['fay', 'Fay Wong'],
      ['gus', 'Gus Ruiz'],
    ] as const) {
      const who = await registerPerson(`${display} ${STAMP}`, { email: `${key}+${STAMP}@book.test` })
      const seat = await ok(I, 'POST', `/v1/courses/${bigId}/members`, { actor_id: who.actor_id, preset: 'student' })
      big[key] = { ...who, member_id: seat.member_id as string }
    }
    // Thirty more, who never sign in.
    for (let i = 1; i <= 30; i++) {
      const who = await ok(root().token, 'POST', '/v1/actors', {
        kind: 'human',
        display_name: `Filler ${String(i).padStart(2, '0')} ${STAMP}`,
        login_id: `bf${STAMP}${i}`,
      })
      await ok(I, 'POST', `/v1/courses/${bigId}/members`, { actor_id: who.actor_id, preset: 'student' })
    }
    const at = (who: { token: string }) =>
      call(who.token, 'POST', `/v1/courses/${bigId}/submissions`, { assignment_id: bigHw1, body: 'My work' }).then(
        async (s) => {
          expect(s.body.status, JSON.stringify(s.body)).toBe('executed')
          const id = (s.body.result.submission_id ?? s.body.result.id) as string
          await ok(who.token, 'POST', `/v1/courses/${bigId}/submissions/${id}/submit`, {})
          return id
        },
      )
    const gradeOn = async (submission_id: string, score: number) =>
      (await ok(I, 'POST', `/v1/courses/${bigId}/grades`, { no_rubric: true, submission_id, score })).grade_id as string
    const fayPosted = await gradeOn(await at(big.fay), 61.75)
    const gusPosted = await gradeOn(await at(big.gus), 72.25)
    await ok(I, 'POST', `/v1/courses/${bigId}/grades/post`, { grade_ids: [fayPosted, gusPosted] })
    await gradeOn(await at(big.fay), 72.25)
    await at(big.fay)
    await at(big.gus)
  })

  const box = (page: Page) => page.locator('.matrix')
  const where = (page: Page) => box(page).evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))

  test('fits a score, a draft and work to grade in a cell in every language, and averages the posted grade under a draft', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, instructor())
    for (const [locale, draft, toGrade] of [
      ['en', 'Draft', 'To grade'],
      ['zh-Hant', '草稿', '待評分'],
      ['zh-Hans', '草稿', '待评分'],
    ] as const) {
      await page.addInitScript((l) => {
        try {
          localStorage.setItem('aishie.locale', l)
        } catch {}
      }, locale)
      // Highest on HW1 first: Fay and Gus.
      await page.goto(`/courses/${bigId}/gradebook?sort=-a:${bigHw1}`)
      const fay = matrix(page).locator('tbody tr').filter({ hasText: big.fay.display_name }).locator('td').nth(1)
      const gus = matrix(page).locator('tbody tr').filter({ hasText: big.gus.display_name }).locator('td').nth(1)
      await expect(fay).toContainText('72.25')
      await expect(fay).toContainText(draft)
      await expect(fay).toContainText(toGrade)
      await expect(gus).toContainText('72.25')
      await expect(gus).toContainText(toGrade)
      // Nothing is cut off, and every row is still 44 px (the drawing of the rows near the screen counts on it).
      const cut = await matrix(page)
        .locator('td.matrix__cell')
        .evaluateAll((tds) =>
          tds
            .filter((td) => td.scrollWidth > td.clientWidth || td.scrollHeight > td.clientHeight)
            .map((td) => td.textContent),
        )
      expect(cut, locale).toEqual([])
      const heights = await matrix(page)
        .locator('tr.matrix__row')
        .evaluateAll((rs) => [...new Set(rs.map((r) => r.getBoundingClientRect().height))])
      expect(heights, locale).toEqual([44])
      // Fay's 61.75 still counts until her draft is posted: (61.75 + 72.25) / 2.
      await expect(matrix(page).locator('tfoot td').nth(1)).toHaveText('67')
      if (locale !== 'zh-Hant') {
        await photograph(page, `class-gradebook-waiting-1280-${locale}-light`)
        await page.emulateMedia({ colorScheme: 'dark' })
        await photograph(page, `class-gradebook-waiting-1280-${locale}-dark`)
        await page.emulateMedia({ colorScheme: 'light' })
      }
    }
  })

  test('is found scrolled where it was left, by Back and by Whole class', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, instructor())
    await page.goto(`/courses/${bigId}/gradebook`)
    await expect(matrix(page)).toBeVisible()
    const scroll = await box(page).evaluate((el) => ({
      down: el.scrollHeight - el.clientHeight,
      across: el.scrollWidth - el.clientWidth,
    }))
    expect(scroll.down).toBeGreaterThan(400)
    expect(scroll.across).toBeGreaterThan(100)

    await box(page).hover()
    await page.mouse.wheel(0, 400)
    await page.mouse.wheel(100, 0)
    await expect.poll(async () => Object.values(await where(page)).every((n) => n > 0)).toBe(true)
    await page.waitForTimeout(300)
    const left = await where(page)
    /** A student whose row is on the screen, a few rows below its top. */
    const onScreen = () =>
      matrix(page)
        .locator(`tbody tr[aria-rowindex="${Math.floor(left.top / 44) + 4}"] .matrix__student`)
        .first()

    await onScreen().click()
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await page.goBack()
    await expect(matrix(page)).toBeVisible()
    await expect.poll(() => where(page)).toEqual(left)

    await onScreen().click()
    await expect(page.locator('.gradebook__total')).toBeVisible()
    await page.getByRole('link', { name: 'Whole class', exact: true }).click()
    await expect(matrix(page)).toBeVisible()
    await expect.poll(() => where(page)).toEqual(left)
    // And it scrolls on from there: the rows near the screen are drawn.
    await expect(matrix(page).locator(`tbody tr[aria-rowindex="${Math.floor(left.top / 44) + 4}"]`)).toBeVisible()
  })

  test('fits its box to the window again without a loop of ResizeObservers the browser reports', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      const w = window as unknown as { loops: string[] }
      w.loops = []
      window.addEventListener('error', (e) => {
        if (String(e.message).includes('ResizeObserver loop')) w.loops.push(e.message)
      })
    })
    await signIn(page, instructor())
    await page.goto(`/courses/${bigId}/gradebook`)
    await expect(matrix(page)).toBeVisible()
    // The page's height changes under the box as the language changes and the class is read again.
    await chooseLanguage(page, '繁體中文')
    await expect(matrix(page).locator('tfoot th')).toHaveText('全班平均')
    await chooseLanguage(page, 'English')
    await expect(matrix(page).locator('tfoot th')).toHaveText('Class average')
    const refresh = page.getByRole('button', { name: 'Refresh' })
    await refresh.click()
    await expect(refresh).not.toHaveClass(/is-loading/)
    await expect(matrix(page)).toBeVisible()
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as unknown as { loops: string[] }).loops)).toEqual([])
    // Still fitted: its foot on the screen.
    await expect.poll(() => box(page).evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(800 - 16)
  })
})
