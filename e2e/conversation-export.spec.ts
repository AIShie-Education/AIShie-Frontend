/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import { buildDeptWorld, type DeptWorld, type Person } from './dept-world'
import {
  activityBar,
  call,
  demo,
  hostOnRuntime,
  photograph,
  showSideView,
  signIn,
  signInAsRoot,
  sideBar,
  type CoreReply,
} from './support'

// Exporting conversations for audit (匯出對話), with the real Core. A course
// agent made for this run, hosted on AIshie (the test plays the runtime),
// answers Yuki, who asks again and withdraws her second question. Root exports the course's conversations with that agent
// over two days on Hong Kong's calendar, sees what the export holds, and
// downloads both files: the JSON Lines file holds the conversation with all
// three messages, the withdrawn one marked; the CSV file opens with a byte
// order mark and marks the withdrawn message's row. Reloaded, the page lists
// the export among the recent ones, whose files are downloaded again from a
// new link. A department's administrator is offered only a course or a
// department of theirs, and the departments and courses beneath their
// appointment; an instructor has no such page. On a phone the page fits.

const STAMP = Date.now().toString(36)
const AGENT = `Audit tutor ${STAMP}`
const QUESTION = `Is my thesis outline on the right track (${STAMP})?`
const ANSWER = `It is; add one more example (${STAMP}).`
const WITHDRAWN = `What does the exam cover (${STAMP})?`
const REASON = 'asked the wrong course'
const ZONE = 'Asia/Hong_Kong'

const w = { agentId: '', agentMemberId: '', agentToken: '', conversationId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A day on Hong Kong's calendar, as YYYY-MM-DD, days from today. */
function hkDay(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    at,
  )
}

/** Picks a date in an Element Plus date picker by typing it, as YYYY-MM-DD. */
async function typeDate(page: Page, id: string, day: string) {
  const input = page.locator(`#${id}`)
  await input.click()
  await input.fill(day)
  await input.press('Enter')
  await page.keyboard.press('Escape')
}

/** The export page, opened from the side bar's administration. */
async function openExportPage(page: Page) {
  const side = await showSideView(page, 'Administration')
  await side.getByRole('link', { name: 'Export conversations', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/conversation-exports$/)
  await expect(page.locator('.page-header__title')).toHaveText('Export conversations')
}

/** The visible options of the Element Plus select open now. */
const dropdownItems = (page: Page) => page.locator('.el-select-dropdown:visible .el-select-dropdown__item')

/** Chooses the course in the course picker by typing part of it. */
async function chooseCourse(page: Page, typed: string, option: string | RegExp) {
  await page.locator('.course-picker__select').click()
  await page.keyboard.type(typed)
  await dropdownItems(page).filter({ hasText: option }).first().click()
}

/** Saves a download and reads its bytes. */
async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path()
  return readFile(path!)
}

/** Clicks a file's download button and waits for the browser to save it. */
async function download(page: Page, scope: Locator, format: 'jsonl' | 'csv') {
  const saving = page.waitForEvent('download')
  await scope.locator(`.export-file[data-format="${format}"] .export-file__download`).click()
  return saving
}

test.describe.serial('exporting conversations for audit', () => {
  test.beforeAll(async () => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    // The instructor's course agent, hosted on AIshie and seated to answer the course; the test plays the runtime.
    w.agentId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: AGENT, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    w.agentMemberId = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.agentId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id
    // Hosted as the site's runtime hosts it: issued its one token, which answers as the agent.
    w.agentToken = await hostOnRuntime(w.agentId)

    // Yuki asks; the agent answers; she asks again, and withdraws it.
    const Y = d.actors.yuki.token
    const opened = done(
      await call(Y, 'POST', `/v1/courses/${c}/conversations`, {
        respondent_member_id: w.agentMemberId,
        body: QUESTION,
      }),
      'conversation.open',
    )
    w.conversationId = opened.conversation_id
    done(
      await call(w.agentToken, 'POST', `/v1/courses/${c}/conversations/${w.conversationId}/answer`, {
        in_reply_to_message_id: opened.message_id,
        body: ANSWER,
      }),
      'conversation.answer',
    )
    const asked = done(
      await call(Y, 'POST', `/v1/courses/${c}/conversations/${w.conversationId}/ask`, { body: WITHDRAWN }),
      'conversation.ask',
    )
    done(
      await call(Y, 'POST', `/v1/courses/${c}/conversation-messages/${asked.message_id}/retract`, { reason: REASON }),
      'conversation.retract',
    )
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    if (w.agentId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.agentId}/suspend`, {})
  })

  test.describe('as root, in Hong Kong', () => {
    test.use({ timezoneId: ZONE, viewport: { width: 1280, height: 900 } })

    test('exports a course’s conversations with one agent over two days, and downloads both files', async ({
      page,
    }) => {
      const d = demo()
      await signInAsRoot(page)
      await openExportPage(page)

      // Root may export a course, a department or the whole site.
      const scopes = page.locator('.export-form__scopes')
      await expect(scopes.locator('.el-radio-button')).toHaveText(['A course', 'A department', 'The whole site'])
      // Nothing chosen: nothing is sent, and the course is asked for.
      await page.locator('.export-form__submit').click()
      await expect(page.locator('.el-form-item__error')).toHaveText('Choose a course.')

      await chooseCourse(page, d.tag, /CS101·A/)
      await expect(page.locator('.el-form-item__error')).toHaveCount(0)

      // Each course says its term: a course's code and section come again term after term.
      await expect(page.locator('.course-picker__select')).toContainText(
        `(Demo ${new Date().getFullYear()} (${d.tag}))`,
      )
      // The agent, found by its name in the directory.
      await page.locator('.participant-picker__select').click()
      await page.keyboard.type(`Audit tutor ${STAMP}`)
      await dropdownItems(page).filter({ hasText: AGENT }).first().click()

      // Yesterday up to and including today, on Hong Kong's calendar: sent with its offset, the end exclusive.
      await typeDate(page, 'export-from', hkDay(-1))
      await typeDate(page, 'export-to', hkDay(0))
      const span = page.locator('.export-form__span')
      await expect(span).toContainText('up to and including')
      await expect(span).toContainText(`in ${ZONE} (UTC+08:00)`)
      await expect(span.locator('code')).toHaveText([
        `from ${hkDay(-1)}T00:00:00+08:00`,
        `before ${hkDay(1)}T00:00:00+08:00`,
      ])
      await photograph(page, 'export-form')

      const asked = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/v1/conversation-exports'))
      await page.locator('.export-form__submit').click()
      const request = await asked
      expect(request.headers()['idempotency-key']).toBeTruthy()
      expect(request.postDataJSON()).toEqual({
        course_id: d.course.id,
        participant_actor_id: w.agentId,
        from: `${hkDay(-1)}T00:00:00+08:00`,
        before: `${hkDay(1)}T00:00:00+08:00`,
      })

      // What it holds: the one conversation, its three messages, one of them withdrawn.
      const outcome = page.locator('.export-outcome')
      await expect(outcome).toBeVisible({ timeout: 60_000 })
      await expect(outcome.locator('[data-count="conversations"]')).toHaveText('1')
      await expect(outcome.locator('[data-count="messages"]')).toContainText('3')
      await expect(outcome.locator('[data-count="messages"]')).toContainText('1 withdrawn')
      await expect(outcome.locator('[data-count="proposals"]')).toHaveText('0')
      await expect(outcome.locator('.export-summary__about')).toContainText(
        `CS101 · A Introduction to Programming (Demo ${new Date().getFullYear()} (${d.tag}))`,
      )
      await expect(outcome.locator('.export-summary__about')).toContainText(`Participant: ${AGENT}`)
      // Personal data: the notice says so, that the links expire, and when the files go.
      const privacy = outcome.locator('.export-outcome__privacy')
      await expect(privacy).toContainText('These files hold personal data')
      await expect(privacy).toContainText('about 15 minutes')
      await expect(privacy).toContainText('deleted from the server at')
      await expect(outcome.locator('.export-files__countdown')).toContainText('The download links work for another')
      await page.mouse.move(0, 0)
      await photograph(page, 'export-outcome')

      // JSON Lines: the conversation, with its three messages, the withdrawn one with its text and marked.
      const jsonl = await download(page, outcome, 'jsonl')
      expect(jsonl.suggestedFilename()).toMatch(/^conversations-[0-9a-f-]{36}\.jsonl$/)
      const lines = (await bytesOf(jsonl)).toString('utf8').trimEnd().split('\n')
      expect(lines).toHaveLength(1)
      const conv = JSON.parse(lines[0]!)
      expect(conv.id).toBe(w.conversationId)
      expect(conv.course.id).toBe(d.course.id)
      expect(conv.respondent.actor_id).toBe(w.agentId)
      expect(conv.messages.map((m: { body: string }) => m.body)).toEqual([QUESTION, ANSWER, WITHDRAWN])
      const withdrawn = conv.messages[2]
      expect(withdrawn.retracted?.reason).toBe(REASON)
      expect(conv.messages[0].retracted).toBeNull()

      // CSV: a byte order mark first, so that a spreadsheet reads it as UTF-8; the withdrawn message's row marked.
      const csv = await download(page, outcome, 'csv')
      expect(csv.suggestedFilename()).toMatch(/^messages-[0-9a-f-]{36}\.csv$/)
      const bytes = await bytesOf(csv)
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const rows = bytes.subarray(3).toString('utf8').split('\r\n')
      expect(rows[0]).toMatch(
        /^conversation_id,course_id,course_code,course_section,course_title,conversation_title,status,/,
      )
      const row = rows.find((r) => r.includes(WITHDRAWN))
      expect(row, 'the withdrawn message’s row').toBeTruthy()
      const cells = row!.split(',')
      expect(cells[0]).toBe(w.conversationId)
      expect(cells[6]).toBe('retracted')
      expect(row).toContain(REASON)
      expect(rows.filter((r) => r.includes(QUESTION))[0]!.split(',')[6]).toBe('posted')

      // Reloaded, it is among the recent exports, and its files are downloaded again from a new link.
      await page.reload()
      const recent = page.locator('.recent-exports .recent-export').first()
      await expect(recent).toBeVisible()
      await expect(recent.locator('.export-summary__about')).toContainText(`(${d.tag})`)
      await expect(recent.locator('.export-files__stale')).toHaveText('Each download asks the server for a new link.')
      const fresh = page.waitForRequest((r) => /\/v1\/conversation-exports\/[0-9a-f-]{36}\/csv$/.test(r.url()))
      const again = await download(page, recent, 'csv')
      await fresh
      expect([...(await bytesOf(again)).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      // A new link for each, on request: the countdown starts.
      await expect(recent.locator('.export-files__countdown')).toContainText('The download links work for another')
      await photograph(page, 'export-recent')
    })
  })

  test('an instructor is offered no such page, and is sent home from its address', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await expect(activityBar(page)).toBeVisible()
    await expect(activityBar(page).getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0)
    await page.goto('/admin/conversation-exports')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.export-form')).toHaveCount(0)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('the form, the export and its files fit the screen', async ({ page }) => {
      const d = demo()
      await signInAsRoot(page)
      await page.goto('/admin/conversation-exports')
      await expect(page.locator('.export-form')).toBeVisible()
      await chooseCourse(page, d.tag, /CS101·A/)
      await page.locator('.export-form__submit').click()
      const outcome = page.locator('.export-outcome')
      await expect(outcome).toBeVisible({ timeout: 60_000 })
      await expect(outcome.locator('.export-file')).toHaveCount(2)
      // Nothing scrolls sideways; the download buttons are whole and on the screen's width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      for (const b of await outcome.locator('.export-file__download').all()) {
        const box = (await b.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(390)
      }
      await photograph(page, 'export-phone')
    })
  })
})

test.describe.serial('a department’s administrator exporting', () => {
  let world: DeptWorld
  const core = process.env.E2E_CORE_URL || 'http://localhost:8080'

  async function signInAs(page: Page, who: Person) {
    await signIn(page, { email: who.email, display_name: who.display_name })
  }

  test.beforeAll(async () => {
    world = await buildDeptWorld(core, process.env.E2E_ROOT_TOKEN!, process.env.E2E_PASSWORD!)
  })

  test('is offered a course or a department of hers alone, never the whole site', async ({ page }) => {
    // Ada administers Engineering: Computing (with AI) and Design are beneath it; Humanities and History are not.
    await signInAs(page, world.people.ada)
    await openExportPage(page)
    await expect(page.locator('.page-header__subtitle')).toContainText('those of a course or department you administer')
    await expect(page.locator('.export-form__scopes .el-radio-button')).toHaveText(['A course', 'A department'])

    // The courses she may choose: Engineering's three, never History's.
    await page.locator('.course-picker__select').click()
    await page.keyboard.type(world.tag)
    const courses = dropdownItems(page)
    await expect(courses).toHaveCount(3)
    for (const c of [world.courses.ai, world.courses.computing, world.courses.design]) {
      await expect(courses.filter({ hasText: c.code })).toHaveCount(1)
    }
    await expect(courses.filter({ hasText: world.courses.history.code })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // The departments: Engineering and what is beneath it.
    await page.locator('.export-form__scopes').getByText('A department').click()
    await page.locator('#export-dept').click()
    const tree = page.locator('.dept-picker__popper:visible')
    await expect(tree.locator('.el-tree-node__content')).toHaveText([/Engineering/, /Computing/, /AI/, /Design/])
    await expect(tree.getByText('History')).toHaveCount(0)
    await expect(tree.getByText('Humanities')).toHaveCount(0)
    await tree.getByText('Engineering', { exact: true }).click()

    // A person is found by their whole email: Dora, a student with no role.
    const lookup = page.locator('.participant-picker__input input')
    await lookup.fill(world.people.dora.email)
    await lookup.press('Enter')
    await expect(page.locator('.participant-picker__chosen')).toContainText(world.people.dora.display_name)

    await page.locator('.export-form__submit').click()
    const outcome = page.locator('.export-outcome')
    await expect(outcome).toBeVisible({ timeout: 60_000 })
    await expect(outcome.locator('[data-count="conversations"]')).toHaveText('0')
    await expect(outcome.locator('.export-summary__about')).toContainText('Engineering')
    await expect(outcome.locator('.export-file')).toHaveCount(2)
    await page.mouse.move(0, 0)
    await photograph(page, 'export-dept-admin')
  })

  test('a person with no appointment and no platform role has no administration to open', async ({ page }) => {
    await signInAs(page, world.people.chan)
    await expect(activityBar(page)).toBeVisible()
    await expect(activityBar(page).getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0)
    await expect(sideBar(page).getByRole('link', { name: 'Export conversations' })).toHaveCount(0)
  })
})
