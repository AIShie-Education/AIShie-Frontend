import { expect, test, type Locator } from '@playwright/test'
import {
  call,
  coursePath,
  courseTab,
  demo,
  hostOnRuntime,
  inTraditionalChinese,
  openChat,
  registerPerson,
  root,
  signIn,
  type CoreReply,
} from './support'

// An agent looks like one wherever it is shown: its avatar, a rounded square
// with its initials (a person is a circle), and "AI" after its name, in every
// language; agents as a kind take the person-beside-a-seat icon, never a
// chip. What it made says so: a draft grade names the agent that drafted it,
// and what its draft fills into the form is marked until the grader changes
// it; the course's activity says who proposed and who approved, to a student
// too, of her own actions and her own agent's. Told through a student
// registered for this run, whose HW1 the grading agent drafts a grade for,
// which the instructor approves; and another, whose own agent drafts his HW1,
// which the instructor approves. A name with no spaces wraps in its row with
// its "AI", and never makes the page scroll sideways.

const STAMP = Date.now().toString(36)
const w = {
  submission: '',
  proposal: '',
  tutorId: '',
  tutorSeat: '',
  hyphenId: '',
  helperId: '',
  seatAction: '',
  botId: '',
  botSeat: '',
}
// A course agent with a long name, which the chat's header must cut short without losing its "AI".
const LONG = `Introduction to Programming weekly revision and practice tutor ${STAMP}`
// One with a long name and no spaces, which must still wrap in its row, its "AI" with it.
const HYPHEN = `cs101-introduction-to-programming-weekly-revision-tutor-${STAMP}`
// A student's own agent, which drafts his HW1.
const HELPER = `Ben’s revision helper ${STAMP}`
// The conversation he opens with the course agent of the long name.
const LOOPS = `Loops ${STAMP}`
const LOOPS_ASKED = `How does a while loop end? (${STAMP})`
// An agent nobody owns, which the course seats itself to tutor him: a course agent, though nobody's delegate.
const BOT = `Course Q&A bot ${STAMP}`
let ada: Awaited<ReturnType<typeof registerPerson>>
let ben: Awaited<ReturnType<typeof registerPerson>>

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

test.describe.serial('an agent is shown as one, and what it made says so', () => {
  test.beforeAll(async () => {
    const d = demo()
    const c = d.course.id
    const I = d.actors.instructor.token
    ada = await registerPerson(`Ada ${STAMP}`, { email: `ada+${STAMP}@identity.test` })
    done(await call(I, 'POST', `/v1/courses/${c}/members`, { actor_id: ada.actor_id, preset: 'student' }), 'member.add')
    w.submission = done(
      await call(ada.token, 'POST', `/v1/courses/${c}/submissions`, {
        assignment_id: d.course.assignments.hw1,
        body: `def c_to_f(c):\n    return (c + 32) * 9 / 5  # ${STAMP}`,
      }),
      'submission.create',
    ).submission_id
    done(
      await call(ada.token, 'POST', `/v1/courses/${c}/submissions/${w.submission}/submit`, { files: [] }),
      'submission.submit',
    )
    // The grading agent drafts her grade: its seat grades only by proposal.
    const proposed = await call(d.actors.grader.token, 'POST', `/v1/courses/${c}/grades`, {
      submission_id: w.submission,
      score: '7',
      feedback: `The formula should be c × 9/5 + 32 (${STAMP}).`,
      breakdown: [{ criterion: 'Correctness', points: 4, max: 6 }],
    })
    expect(proposed.body.status, JSON.stringify(proposed.body)).toBe('proposed')
    w.proposal = proposed.body.action_id!
    done(
      await call(I, 'POST', `/v1/courses/${c}/actions/${w.proposal}/decide`, { decision: 'approve' }),
      'action.decide',
    )
    // The instructor's course agent with a long name, hosted on AIshie, for the chat's header.
    w.tutorId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: LONG, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    w.tutorSeat = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id
    await hostOnRuntime(w.tutorId)
    // Its course agent with a long name and no spaces, for the chat's list of agents and the course's Agents.
    w.hyphenId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: HYPHEN, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.hyphenId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    await hostOnRuntime(w.hyphenId)

    // Ben brings in an agent of his own, which the instructor seats.
    ben = await registerPerson(`Ben ${STAMP}`, { email: `ben+${STAMP}@identity.test` })
    const seat = done(
      await call(I, 'POST', `/v1/courses/${c}/members`, { actor_id: ben.actor_id, preset: 'student' }),
      'member.add',
    )
    w.helperId = done(
      await call(ben.token, 'POST', '/v1/me/agents', { display_name: HELPER, hosting: 'mcp' }),
      'agent.create',
    ).actor_id
    const helperToken = done(
      await call(ben.token, 'POST', `/v1/me/agents/${w.helperId}/tokens`, { label: `e2e ${STAMP}` }),
      'agent.issue_token',
    ).token as string
    const asked = await call(ben.token, 'POST', `/v1/courses/${c}/delegates`, {
      actor_id: w.helperId,
      preset: 'delegate',
      answers_course: false,
      perms: { submission_write: 'confirm_required' },
    })
    expect(asked.body.status, JSON.stringify(asked.body)).toBe('proposed')
    w.seatAction = asked.body.action_id!
    done(
      await call(I, 'POST', `/v1/courses/${c}/actions/${asked.body.action_id}/decide`, { decision: 'approve' }),
      'action.decide (seating)',
    )
    // It drafts his HW1 and hands it in, each by proposal, which he approves as its owner.
    const draft = await call(helperToken, 'POST', `/v1/courses/${c}/submissions`, {
      assignment_id: d.course.assignments.hw1,
      student_member_id: seat.member_id,
      body: `def c_to_f(c):\n    return c * 9 / 5 + 32  # drafted by Ben's agent ${STAMP}`,
    })
    expect(draft.body.status, JSON.stringify(draft.body)).toBe('proposed')
    const drafted = done(
      await call(ben.token, 'POST', `/v1/courses/${c}/actions/${draft.body.action_id}/decide`, { decision: 'approve' }),
      'action.decide (draft)',
    )
    expect(drafted.outcome, JSON.stringify(drafted)).toBe('executed')
    const handIn = await call(
      helperToken,
      'POST',
      `/v1/courses/${c}/submissions/${drafted.result.submission_id}/submit`,
      {
        files: [],
      },
    )
    expect(handIn.body.status, JSON.stringify(handIn.body)).toBe('proposed')
    const handedIn = done(
      await call(ben.token, 'POST', `/v1/courses/${c}/actions/${handIn.body.action_id}/decide`, {
        decision: 'approve',
      }),
      'action.decide (hand-in)',
    )
    expect(handedIn.outcome, JSON.stringify(handedIn)).toBe('executed')

    // He asks the course agent of the long name, in a conversation he names.
    done(
      await call(ben.token, 'POST', `/v1/courses/${c}/conversations`, {
        respondent_member_id: w.tutorSeat,
        title: LOOPS,
        body: LOOPS_ASKED,
      }),
      'conversation.open',
    )

    // The course seats an agent nobody owns to tutor him, hosted on AIshie: nobody's delegate, so Core
    // says it answers no course (answers_course is a delegate's), though it is the course's.
    w.botId = done(
      await call(root().token, 'POST', '/v1/actors', { kind: 'agent', display_name: BOT, hosting: 'runtime' }),
      'actor.register',
    ).actor_id
    w.botSeat = done(
      await call(I, 'POST', `/v1/courses/${c}/members`, {
        actor_id: w.botId,
        preset: 'tutor',
        student_scope: 'listed',
        listed_students: [seat.member_id],
      }),
      'member.add (bot)',
    ).member_id
    await hostOnRuntime(w.botId)
  })

  // A person may have five agents at once: this run's are suspended when they are done with, for the specs after it.
  test.afterAll(async () => {
    for (const id of [w.tutorId, w.hyphenId])
      if (id) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${id}/suspend`, {})
    if (w.helperId && ben) await call(ben.token, 'POST', `/v1/me/agents/${w.helperId}/suspend`, {})
    const I = demo().actors.instructor.token
    if (w.botSeat) await call(I, 'POST', `/v1/courses/${demo().course.id}/members/${w.botSeat}/remove`, {})
    if (w.botId) await call(root().token, 'POST', `/v1/actors/${w.botId}/suspend`, {})
  })

  test('agents as a kind take the seat icon, and a proposal’s proposer its avatar and “AI”', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('approvals'))
    // The course's Agents tab and the activity bar's Agents view: the seat, not a chip. The tab is in
    // the strip, or under More where the strip has no room for it (in English at 1280 px, beside the
    // side bar). Asked again until the strip has measured its tabs and put away those that do not fit.
    const strip = page.getByRole('navigation', { name: 'Course sections' })
    const underMore = page.getByRole('menuitem', { name: 'Agents' })
    await expect(async () => {
      if (await courseTab(page, 'Agents').count()) {
        await expect(courseTab(page, 'Agents').locator('svg.agent-seat-icon')).toBeVisible({ timeout: 1000 })
        return
      }
      if (!(await underMore.isVisible())) await strip.getByRole('button', { name: /^More/ }).click()
      await expect(underMore.locator('svg.agent-seat-icon')).toBeVisible({ timeout: 1000 })
    }).toPass()
    if (await underMore.isVisible()) await page.keyboard.press('Escape')
    await expect(page.locator('.activity-bar svg.agent-seat-icon')).toBeVisible()
    // The grading agent's proposal from the demo, still waiting.
    const actor = page.locator('.action-card').filter({ hasText: 'grader-v2' }).first().locator('.action-actor')
    await expect(actor.locator('.agent-avatar')).toBeVisible()
    await expect(actor.locator('.ai-badge')).toHaveText('AI')
    await expect(actor.locator('.agent-avatar__initials')).toHaveAttribute('data-initials', 'GV')
    // The "AI" says it: no tag of "Agent" besides.
    await expect(actor).not.toContainText('Agent')
  })

  test('the activity says who proposed and who approved', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('activity'))
    const who = page
      .locator('.event-item')
      .filter({ hasText: 'Proposal approved' })
      .locator('.event-item__who')
      .filter({ hasText: 'grader-v2' })
      .first()
    await expect(who).toContainText(/grader-v2\s*AI\s*proposed\s*→\s*Sato Hiroshi.*approved/)
    await expect(who.locator('.agent-avatar')).toHaveCount(1)

    // Not the action log's events alone: the grade the approval entered says who proposed it and who
    // approved it, on its first line, read from the action it was done under.
    const entered = page
      .locator('.event-item')
      .filter({ hasText: 'Draft grade entered' })
      .filter({ has: page.locator('.event-item__who', { hasText: 'grader-v2' }) })
      .first()
    await expect(entered.locator('.event-item__who')).toContainText(
      /grader-v2\s*AI\s*proposed\s*→\s*Sato Hiroshi.*approved/,
    )
    expect(await entered.locator('.event-item__body > *').first().getAttribute('class')).toContain('event-item__who')

    // The Agents chip keeps what agents did or proposed: every row it leaves names an agent first.
    const chip = page.locator('.activity__chip--agents')
    await expect(chip.locator('.activity__chip-count')).not.toHaveText('0')
    await chip.click()
    const rows = page.locator('.event-item')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) await expect(row.locator('.event-item__who .ai-badge').first()).toBeVisible()
  })

  test('a student is shown who acted in her own actions, and is never asked about anyone else’s', async ({ page }) => {
    // Reads of one action (action.get), which she owns no agent to make; and of her own list of them.
    const gets: string[] = []
    const mine: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (/\/actions\/[0-9a-f-]{36}$/.test(url.pathname)) gets.push(r.url())
      if (url.pathname.endsWith('/actions/mine')) mine.push(url.search)
    })
    await signIn(page, ada)
    await page.goto(coursePath('activity'))
    const submitted = page
      .locator('.event-item')
      .filter({ has: page.locator('.event-item__who', { hasText: `Ada ${STAMP}` }) })
      .first()
    await expect(submitted.locator('.event-item__who')).toContainText(/did it/)
    await expect(submitted.locator('.event-item__who .ai-badge')).toHaveCount(0)
    // She owns no agent here: nothing for an Agents chip to keep.
    await expect(page.locator('.activity__chip--agents')).toHaveCount(0)
    expect(gets).toEqual([])
    // Her chats are no part of it.
    expect(mine.length).toBeGreaterThan(0)
    for (const q of mine) expect(q).toContain('exclude_types=conversation.ask')
  })

  test('a student is shown what his own agent did, by its name, and the Agents chip keeps it', async ({ page }) => {
    await signIn(page, ben)
    await page.goto(coursePath('activity'))
    const who = page.locator('.event-item__who').filter({ hasText: HELPER }).first()
    // 「(you)」 is the language's, written right after the name (common.labels.youTag).
    await expect(who).toContainText(
      new RegExp(`${HELPER}\\s*AI\\s*proposed\\s*→\\s*Ben ${STAMP}\\(you\\)\\s*approved`),
    )
    await expect(who.locator('.agent-avatar')).toHaveCount(1)
    const chip = page.locator('.activity__chip--agents')
    await expect(chip.locator('.activity__chip-count')).not.toHaveText('0')
    await chip.click()
    const rows = page.locator('.event-item')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) await expect(row.locator('.event-item__who .ai-badge').first()).toBeVisible()
  })

  test('a student is shown no id for whoever she cannot name, in her activity or her own actions', async ({ page }) => {
    await signIn(page, ben)
    await page.goto(coursePath('activity'))
    // His request to bring in his agent, which the instructor approved: someone in the course, not an id.
    const seating = page
      .locator('.event-item__who')
      .filter({ hasText: new RegExp(`Ben ${STAMP}\\(you\\)\\s*proposed\\s*→`) })
      .first()
    await expect(seating).toContainText(
      new RegExp(`Ben ${STAMP}\\(you\\)\\s*proposed\\s*→\\s*Someone in the course\\s*approved`),
    )
    await expect(page.locator('.event-item__who .id-text')).toHaveCount(0)

    // His agent, the member it added, by the name he gave it: not someone in the course, who approved it.
    const added = page.locator('.event-item').filter({ has: seating }).filter({ hasText: 'Member added' })
    await expect(added.locator('.event-item__subject')).toContainText(new RegExp(`${HELPER}\\s*AI`))
    await expect(added.locator('.event-item__subject')).not.toContainText('Someone in the course')
    await expect(added.locator('.event-item__facts')).toHaveText('Personal agent')
    // And no hover-only id behind anyone he cannot name: the line holds no member id at all.
    await expect(page.locator('.member-name.is-unnamed[title]')).toHaveCount(0)

    // His own actions: his agent brought in, by the name its avatar is drawn from, and who decided it.
    await page.goto(coursePath('my-actions'))
    const row = page.locator('tr').filter({ hasText: 'Bring in an agent' }).filter({ hasText: HELPER }).first()
    await expect(row.locator('.action-target')).toContainText(HELPER)
    await expect(row).toContainText('Someone in the course')
    await expect(row.locator('.id-text')).toHaveCount(0)
    // The conversation he started, with the agent he asked by name.
    const started = page.locator('tr').filter({ hasText: 'Start a conversation' }).filter({ hasText: LOOPS }).first()
    await expect(started.locator('.action-target')).toContainText(new RegExp(`→\\s*${LONG}\\s*AI`))
    await expect(started.locator('.action-target')).not.toContainText('Someone in the course')

    // What came of bringing it in names the seat it made as the request named the agent.
    await page.goto(coursePath(`actions/${w.seatAction}`))
    const made = page
      .locator('.fields-view')
      .filter({ has: page.locator('dt', { hasText: /^Member$/ }) })
      .last()
    await expect(made.locator('dd')).toHaveText(HELPER)
  })

  test('a chat’s news says it is about a conversation, in words, and opens it', async ({ page }) => {
    await signIn(page, ben)
    await inTraditionalChinese(page)
    await page.goto(coursePath('activity'))
    for (const title of ['開始對話', '新訊息']) {
      const ev = page
        .locator('.event-item')
        .filter({ has: page.locator('.event-item__title', { hasText: title }) })
        .first()
      await expect(ev.locator('.event-item__subject')).toHaveText('對話')
      await expect(ev).not.toContainText('conversation')
    }
    // The course's overview's recent activity says the same.
    await page.goto(coursePath())
    const recent = page
      .locator('.event-item')
      .filter({ has: page.locator('.event-item__title', { hasText: '新訊息' }) })
      .first()
    await expect(recent.locator('.event-item__subject')).toHaveText('對話')
    // It opens the chat on that conversation, beside the page.
    await recent.locator('.event-item__subject').click()
    const panel = page.locator('#chat-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(LOOPS_ASKED)
    await expect(page).toHaveURL(new RegExp(`${coursePath()}$`))
  })

  test('the chat calls an agent the course seated itself a course agent, which answers others too', async ({
    page,
  }) => {
    await signIn(page, ben)
    await page.goto(coursePath())
    const panel = await openChat(page)
    const row = panel.locator('.resp-row').filter({ hasText: BOT })
    await expect(row).toContainText('Course agent')
    await expect(row).not.toContainText('Personal agent')
    await expect(row).toContainText('It answers other members too')
    // And so its draft says, once chosen.
    await row.click()
    await expect(panel.locator('.chat-pane__shared')).toContainText('may repeat to them')
  })

  test('a draft grade names the agent that drafted it, and marks what it filled in until it is changed', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath(`submissions/${w.submission}`))
    const panel = page.locator('.grade-panel')
    const drafter = panel.locator('.grade-panel__drafter')
    await expect(drafter).toContainText(/Drafted by\s*grader-v2\s*AI/)
    await expect(drafter.locator('.agent-avatar')).toBeVisible()

    await panel.getByRole('button', { name: 'Start from the current draft' }).click()
    const score = panel.locator('.el-form-item').filter({ has: page.getByPlaceholder('e.g. 8.5') })
    const feedback = panel.locator('.el-form-item').filter({ hasText: 'Feedback' }).first()
    await expect(score).toHaveClass(/is-prefilled/)
    await expect(feedback).toHaveClass(/is-prefilled/)
    await expect(panel.locator('.grade-panel__prefilled-note')).toContainText('as grader-v2 drafted them')

    // Changed, the score is the grader's: its mark goes, the feedback's stays.
    await page.getByPlaceholder('e.g. 8.5').fill('8')
    await expect(score).not.toHaveClass(/is-prefilled/)
    await expect(feedback).toHaveClass(/is-prefilled/)
    // Cleared, nothing is the agent's.
    await panel.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(panel.locator('.is-prefilled')).toHaveCount(0)
    await expect(panel.locator('.grade-panel__prefilled-note')).toHaveCount(0)

    // Filled in again, each mark is said to a screen reader with its field's label; saved, the grade is
    // the grader's, and nothing is marked as the agent's.
    await panel.getByRole('button', { name: 'Start from the current draft' }).click()
    await expect(score.locator('.el-form-item__label')).toContainText('(as an agent drafted it: not changed yet)')
    await panel.getByRole('button', { name: 'Save draft grade' }).click()
    await page.locator('.el-message-box').getByRole('button', { name: 'Confirm' }).click()
    await expect(panel.locator('.grade-panel__drafter')).toContainText('Sato Hiroshi')
    await expect(panel.locator('.is-prefilled')).toHaveCount(0)
    await expect(panel.locator('.grade-panel__prefilled-note')).toHaveCount(0)
  })

  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ])
    test(`the chat's header cuts a long name short, never its “AI” nor whether it can be asked, at ${size.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      // As her own agent, too: whose it is goes on hover, not in a chip that takes the name's room.
      await page.route('**/conversations/respondents', async (route) => {
        const res = await route.fetch()
        const body = await res.json()
        for (const r of body.result?.respondents ?? []) if (r.display_name === LONG) r.is_my_delegate = true
        await route.fulfill({ response: res, json: body })
      })
      await signIn(page, demo().actors.yuki)
      await page.goto(coursePath())
      const panel = await openChat(page)
      await panel.locator('button.resp-row').filter({ hasText: LONG }).click()
      const row = panel.locator('.chat-pane__name-row')
      await expect(row.locator('.chat-pane__name')).toContainText(LONG.slice(0, 12))
      await expect(row.locator('.agent-badge')).toHaveCount(0)
      const box = async (sel: string) => (await row.locator(sel).first().boundingBox())!
      const [name, ai, ask, all] = await Promise.all([
        box('.chat-pane__name'),
        box('.ai-badge'),
        box('.chat-pane__presence'),
        row.boundingBox(),
      ])
      // The name keeps room to be read; the "AI" follows it and ends before whether it can be asked.
      expect(name.width).toBeGreaterThan(50)
      expect(ai.x).toBeGreaterThanOrEqual(name.x + name.width)
      expect(ai.width).toBeGreaterThan(14)
      expect(ai.x + ai.width).toBeLessThanOrEqual(ask.x)
      expect(ask.x + ask.width).toBeLessThanOrEqual(all!.x + all!.width + 0.5)
      // The name is cut short, whole words and all, rather than pushing the rest out.
      expect(await row.locator('.chat-pane__name').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    })

  test('a name with no spaces wraps in its row with its “AI”, and the page never scrolls sideways, at 390 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const inside = async (row: Locator) => {
      const [r, ai] = await Promise.all([row.boundingBox(), row.locator('.ai-badge').first().boundingBox()])
      expect(ai!.x).toBeGreaterThanOrEqual(r!.x)
      expect(ai!.x + ai!.width).toBeLessThanOrEqual(r!.x + r!.width + 0.5)
      expect(ai!.y + ai!.height).toBeLessThanOrEqual(r!.y + r!.height + 0.5)
    }
    const sideways = () => page.locator('main.app-main').evaluate((m) => m.scrollWidth - m.clientWidth)
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('agents'))
    const row = page.locator('.agent-row').filter({ hasText: HYPHEN }).first()
    await expect(row).toBeVisible()
    await inside(row)
    expect(await sideways()).toBeLessThanOrEqual(0)
    // The chat's list of agents.
    await page.goto(coursePath())
    const panel = await openChat(page)
    const pick = panel.locator('button.resp-row').filter({ hasText: HYPHEN })
    await pick.scrollIntoViewIfNeeded()
    await inside(pick)
    expect(await panel.locator('.chat-panel__pick').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(
      0,
    )
    // My agents: the "AI" ends the name's last line, never the line of tags under it.
    await page.goto('/account/agents')
    for (const n of [LONG, HYPHEN]) {
      const item = page.locator('.agents-item').filter({ hasText: n }).first()
      await expect(item).toBeVisible()
      await inside(item)
      const name = item.locator('.agents-item__name')
      await expect(name.locator('.ai-badge')).toBeVisible()
      const [box, ai] = await Promise.all([name.boundingBox(), name.locator('.ai-badge').boundingBox()])
      expect(ai!.y).toBeGreaterThanOrEqual(box!.y - 0.5)
      expect(ai!.y + ai!.height).toBeLessThanOrEqual(box!.y + box!.height + 0.5)
    }
    expect(await sideways()).toBeLessThanOrEqual(0)
  })

  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ])
    test(`the members’ list shows an agent’s name whole beside its dot and avatar, its “AI” with it, at ${size.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      await signIn(page, demo().actors.instructor)
      await page.goto(coursePath('members'))
      const rows = page.locator('.members__table .el-table__row')
      // Long names, one with no spaces, hosted on AIshie (a dot before them says whether they can be asked)
      // or reached over MCP (no dot); with the dot and the avatar before it, a name as short as
      // "CS101 課程代理" was cut short too, at "CS101 課…".
      for (const [n, dot] of [
        [LONG, true],
        [HYPHEN, true],
        [BOT, true],
        [HELPER, false],
        ['grader-v2', false],
      ] as const) {
        const agent = rows.filter({ hasText: n }).first().locator('.members__agent')
        await expect(agent).toBeVisible()
        await expect(agent.locator('.askable-dot')).toHaveCount(dot ? 1 : 0)
        await expect(agent.locator('.agent-avatar')).toBeVisible()
        await expect(agent.locator('.ai-badge')).toBeVisible()
        // Nothing of the name hidden, and all of it within its cell, the "AI" too.
        const hidden = await agent.evaluate((el) =>
          [el, ...el.querySelectorAll('.agent-name, .agent-name *')]
            .filter((e) => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis')
            .map((e) => e.className),
        )
        expect(hidden, n).toEqual([])
        const cell = agent.locator('xpath=ancestor::div[contains(@class, "cell")][1]')
        const [c, a, ai] = await Promise.all([
          cell.boundingBox(),
          agent.boundingBox(),
          agent.locator('.ai-badge').boundingBox(),
        ])
        expect(a!.x + a!.width, n).toBeLessThanOrEqual(c!.x + c!.width + 0.5)
        expect(ai!.x + ai!.width, n).toBeLessThanOrEqual(c!.x + c!.width + 0.5)
      }
      // Each role's tag whole in its cell: "Teaching assistant", with the person's icon the row shows already,
      // overran the column and was cut short.
      const cut = await page.locator('.members__table td .app-tag').evaluateAll((tags) =>
        tags
          .filter((t) => {
            const cell = t.closest('.cell')!.getBoundingClientRect()
            const r = t.getBoundingClientRect()
            return r.width > 0 && r.right > cell.right + 0.5
          })
          .map((t) => t.textContent!.trim()),
      )
      expect(cut).toEqual([])
    })

  test('in Chinese, the “AI” stays “AI”, and a personal agent is called one', async ({ page }) => {
    await signIn(page, demo().actors.instructor)
    await inTraditionalChinese(page)
    await page.goto(coursePath('approvals'))
    const actor = page.locator('.action-card').filter({ hasText: 'grader-v2' }).first().locator('.action-actor')
    await expect(actor.locator('.ai-badge')).toHaveText('AI')
    await page.goto(coursePath('agents'))
    await expect(page.locator('.course-agents')).toContainText('個人代理')
    await expect(page.locator('.course-agents')).not.toContainText('個人助手')
  })
})
