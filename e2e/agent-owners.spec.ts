import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { call, courseTab, coursePath, demo, root, signIn, signInWithToken, toast, type DemoActor } from './support'

// An agent's owner decides what it did where they could have done it
// themselves, and nobody else of theirs. Two students of the course each
// bring an agent of their own in, which drafts their work: Nora through the
// app, whose delegate dialog offers her agent's writes only up to "Needs
// approval" and says why; Omar through Core. An instructor approves both
// requests. Each agent proposes a draft of HW1 for its owner. Nora finds her
// agent's proposal, and not Omar's agent's, under "Your agents' proposals",
// approves it, and it is carried out as her own doing (by_owner); the course's
// activity says so. Omar takes his agent's back. An agent's seat is edited
// with its action_decide offered no higher than "Needs approval", with why;
// and an agent's administration page shows its owner, fixed, with nothing to
// change it.
//
// With E2E_SHOTS set to a directory, the new queue and the greyed-out editor
// are photographed there in English and Traditional Chinese.

const STAMP = Date.now().toString(36)
const NORA_AGENT = `Nora's drafter ${STAMP}`
const OMAR_AGENT = `Omar's drafter ${STAMP}`
const NORA_DRAFT = `c_to_f drafted by Nora's agent (${STAMP})`
const OMAR_DRAFT = `c_to_f drafted by Omar's agent (${STAMP})`

interface Owner extends DemoActor {
  member_id: string
  agent: { actor_id: string; token: string }
}
let nora: Owner
let omar: Owner
let noraProposal = ''
let omarProposal = ''

const shots = process.env.E2E_SHOTS
async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
}

/** Signs in and reads the app in Traditional Chinese from then on. */
async function inChinese(browser: Browser, who: DemoActor) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await signIn(page, who)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'zh-Hant')
    } catch {}
  })
  return page
}

/** A student of the course, registered and seated as the demo's people are, who owns an agent with a token. */
async function student(key: string, name: string): Promise<Owner> {
  const d = demo()
  const email = `${key}+${STAMP}@owners.test`
  const reg = await call(root().token, 'POST', '/v1/actors', { kind: 'human', display_name: name, email })
  expect(reg.body.status, JSON.stringify(reg.body)).toBe('executed')
  const actorId = reg.body.result.actor_id as string
  const tok = await call(root().token, 'POST', `/v1/actors/${actorId}/tokens`, {
    label: `e2e ${STAMP}`,
    expires_in_days: 1,
  })
  const token = tok.body.result.token as string
  const pw = await call(token, 'POST', '/v1/me/password', { password: process.env.E2E_PASSWORD })
  expect(pw.body.status, JSON.stringify(pw.body)).toBe('executed')
  const seat = await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/members`, {
    actor_id: actorId,
    preset: 'student',
  })
  expect(seat.body.status, JSON.stringify(seat.body)).toBe('executed')
  const agent = await call(token, 'POST', '/v1/me/agents', { display_name: key === 'nora' ? NORA_AGENT : OMAR_AGENT })
  const agentId = agent.body.result.actor_id as string
  const agentTok = await call(token, 'POST', `/v1/me/agents/${agentId}/tokens`, { label: `e2e ${STAMP}` })
  return {
    actor_id: actorId,
    member_id: seat.body.result.member_id,
    email,
    display_name: name,
    kind: 'human',
    token,
    agent: { actor_id: agentId, token: agentTok.body.result.token },
  }
}

/** The instructor approves the owner's request to seat their agent. */
async function approveSeating(owner: Owner) {
  const d = demo()
  const got = await call(owner.token, 'GET', `/v1/me/agents/${owner.agent.actor_id}`)
  const request = got.body.result.requests?.[0]?.action_id as string
  expect(request, JSON.stringify(got.body)).toBeTruthy()
  const ok = await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/actions/${request}/decide`, {
    decision: 'approve',
  })
  expect(ok.body.result?.outcome, JSON.stringify(ok.body)).toBe('executed')
}

/** The agent drafts its owner's HW1: its seat writes submissions only by proposal. */
async function draftFor(owner: Owner, body: string): Promise<string> {
  const d = demo()
  const out = await call(owner.agent.token, 'POST', `/v1/courses/${d.course.id}/submissions`, {
    assignment_id: d.course.assignments.hw1,
    student_member_id: owner.member_id,
    body,
  })
  expect(out.body.status, JSON.stringify(out.body)).toBe('proposed')
  return out.body.action_id!
}

/** One permission's row in a permission editor, found by its key. */
function permRow(page: Page, scope: ReturnType<Page['locator']>, perm: string) {
  return scope
    .locator('.perm-editor__row')
    .filter({ has: page.locator('.perm-editor__key', { hasText: new RegExp(`^${perm}$`) }) })
}

test.describe.serial('an agent’s owner decides what it did, where they could have done it themselves', () => {
  test.beforeAll(async () => {
    nora = await student('nora', `Nora Lam ${STAMP}`)
    omar = await student('omar', `Omar Siu ${STAMP}`)
  })

  test('Nora brings her agent in to draft her work, offered no more than "Needs approval", with why', async ({
    page,
  }) => {
    await signIn(page, nora)
    await page.goto(`/account/agents/${nora.agent.actor_id}`)
    await page.getByRole('button', { name: 'Bring into a course' }).first().click()
    const bring = page.getByRole('dialog', { name: `Bring ${NORA_AGENT} into a course` })
    await bring.locator('.bring__course').filter({ hasText: 'CS101' }).click()
    await expect(bring.locator('.bring__preview')).toBeVisible()
    await bring.getByText('All permissions, and naming other levels').click()

    // Her own writes: her agent does them only by proposal, as the row says.
    const write = permRow(page, bring, 'submission_write')
    await expect(write.locator('.perm-editor__ceiling')).toHaveText('At most: Needs approval')
    await write.locator('.el-select').click()
    const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    await expect(options.filter({ hasText: 'Autonomous' })).toHaveClass(/is-disabled/)
    await expect(options.filter({ hasText: 'Reviewed after' })).toHaveClass(/is-disabled/)
    await options.filter({ hasText: 'Autonomous' }).hover()
    await expect(page.getByRole('tooltip').filter({ hasText: 'does this only by proposal' })).toBeVisible()
    await options.filter({ hasText: 'Needs approval' }).click()
    await expect(bring.getByText('1 set differently')).toBeVisible()
    // An agent brings no agents of its own: locked.
    await expect(permRow(page, bring, 'agent_delegate').locator('.perm-editor__ceiling')).toHaveText('Never here')
    await expect(permRow(page, bring, 'agent_delegate').locator('.el-select__wrapper')).toHaveClass(/is-disabled/)

    await bring.getByRole('button', { name: 'Send the request' }).click()
    await expect(bring).toBeHidden()
    const got = await call(nora.token, 'GET', `/v1/me/agents/${nora.agent.actor_id}`)
    expect(got.body.result.requests ?? []).toHaveLength(1)
  })

  test('the instructor seats both agents; each drafts its owner’s HW1, which waits for a decision', async () => {
    const d = demo()
    await approveSeating(nora)
    // Omar's comes in through Core, with the same writes at the most they may be.
    const req = await call(omar.token, 'POST', `/v1/courses/${d.course.id}/delegates`, {
      actor_id: omar.agent.actor_id,
      preset: 'delegate',
      answers_course: false,
      perms: { submission_write: 'confirm_required' },
    })
    expect(req.body.status, JSON.stringify(req.body)).toBe('proposed')
    await approveSeating(omar)
    noraProposal = await draftFor(nora, NORA_DRAFT)
    omarProposal = await draftFor(omar, OMAR_DRAFT)
  })

  test('Nora finds her agent’s draft, and not Omar’s, among her agents’ proposals, and approves it as her own doing', async ({
    page,
    browser,
  }) => {
    const d = demo()
    await page.setViewportSize({ width: 1280, height: 900 })
    await signIn(page, nora)
    await page.goto(coursePath())
    await courseTab(page, 'Your agents’ proposals').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('approvals')}$`))
    await expect(page.locator('.page-header')).toContainText('Your agents’ proposals')
    const cards = page.locator('.action-card')
    await expect(cards).toHaveCount(1)
    const card = cards.first()
    await expect(card).toContainText(NORA_AGENT)
    await expect(card).toContainText('Your agent')
    await expect(page.getByText(OMAR_AGENT)).toHaveCount(0)
    // A queue she may not read shows as nothing waiting, not as an error.
    await page.getByRole('tab', { name: /Awaiting review/ }).click()
    await expect(page.getByText('Nothing your agents did is waiting for review.')).toBeVisible()
    await page.getByRole('tab', { name: /Awaiting approval/ }).click()
    await shot(page, 'owner-queue-en')

    const zh = await inChinese(browser, nora)
    await zh.goto(coursePath('approvals'))
    await expect(zh.locator('.page-header')).toContainText('你的代理的提案')
    await expect(zh.locator('.action-card')).toContainText(NORA_AGENT)
    await shot(zh, 'owner-queue-zh-Hant')
    await zh.close()

    // Nor may she open the classmate's agent's proposal.
    const theirs = await call(nora.token, 'GET', `/v1/courses/${d.course.id}/actions/${omarProposal}`)
    expect(theirs.status).toBe(403)

    await card.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(card).toContainText('You decide this as its owner')
    await card.getByRole('button', { name: 'Approve now' }).click()
    await expect(toast(page, 'Approved and carried out, as your own doing')).toBeVisible()
    await expect(cards).toHaveCount(0)
    await expect(page.locator('.approvals__recent')).toContainText(
      'You decided this as the owner of the agent that proposed it',
    )

    // Carried out: her draft of HW1, which her agent wrote; decided from her own seat, as its owner.
    const got = await call(nora.token, 'GET', `/v1/courses/${d.course.id}/actions/${noraProposal}`)
    expect(got.body.result.status).toBe('executed')
    expect(got.body.result.decided_by_member_id).toBe(nora.member_id)
    const mine = await call(nora.token, 'GET', `/v1/courses/${d.course.id}/actions/mine?limit=100`)
    const decision = (mine.body.result.actions ?? []).find(
      (a: { action_type: string; target_id?: string }) =>
        a.action_type === 'action.decide' && a.target_id === noraProposal,
    )
    expect(decision?.status).toBe('executed')
    expect(decision?.authz_result).toBe('autonomous')
    expect(decision?.result?.by_owner).toBe(true)
    const subs = await call(
      nora.token,
      'GET',
      `/v1/courses/${d.course.id}/submissions?assignment_id=${d.course.assignments.hw1}`,
    )
    expect((subs.body.result.submissions ?? []).map((s: { state: string }) => s.state)).toEqual(['draft'])

    // Its page says who approved it: she did, as its owner.
    await page.goto(coursePath(`actions/${noraProposal}`))
    await expect(page.locator('.action-timeline')).toContainText(', its owner')
    await expect(page.locator('.action-view__owner')).toContainText(
      'Approved by the owner of the agent that proposed it',
    )
  })

  test('the course’s activity says the owner decided it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('activity'))
    await expect(page.locator('.event-item').filter({ hasText: 'Decided by its agent’s owner' }).first()).toBeVisible()
  })

  test('Omar takes his agent’s draft back, as its owner', async ({ page }) => {
    const d = demo()
    await signIn(page, omar)
    await page.goto(coursePath('approvals'))
    const card = page.locator('.action-card').filter({ hasText: OMAR_AGENT })
    await expect(card).toHaveCount(1)
    await expect(page.getByText(NORA_AGENT)).toHaveCount(0)
    await card.getByRole('button', { name: 'Withdraw' }).click()
    const box = page.getByRole('dialog', { name: 'Withdraw your agent’s proposal?' })
    await expect(box).toContainText('Your agent learns that you took it back')
    await box.getByRole('button', { name: 'Withdraw' }).click()
    await expect(toast(page, 'Your agent’s proposal is withdrawn')).toBeVisible()
    await expect(card).toHaveCount(0)

    const got = await call(omar.token, 'GET', `/v1/courses/${d.course.id}/actions/${omarProposal}`)
    expect(got.body.result.status).toBe('cancelled')
    expect(got.body.result.result.error.details).toMatchObject({ reason: 'withdrawn', by_owner: true })
    await page.goto(coursePath(`actions/${omarProposal}`))
    await expect(page.locator('.action-timeline')).toContainText('Withdrawn by its owner')
  })

  test('an agent’s seat is offered "Approve & review" no higher than "Needs approval", saying why', async ({
    page,
    browser,
  }) => {
    const d = demo()
    await page.setViewportSize({ width: 1280, height: 900 })
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath(`members/${d.actors.grader.member_id}`))
    const levels = page.locator('.app-card').filter({ has: page.getByRole('heading', { name: 'Permissions' }) })
    const decide = permRow(page, levels, 'action_decide')
    await expect(decide.locator('.perm-editor__ceiling')).toHaveText('At most: Needs approval')
    await levels.getByRole('button', { name: 'Edit permissions' }).click()
    await decide.locator('.el-select').click()
    const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    await expect(options.filter({ hasText: 'Autonomous' })).toHaveClass(/is-disabled/)
    await expect(options.filter({ hasText: 'Reviewed after' })).toHaveClass(/is-disabled/)
    await expect(options.filter({ hasText: 'Needs approval' })).not.toHaveClass(/is-disabled/)
    await options.filter({ hasText: 'Autonomous' }).hover()
    const why = page.getByRole('tooltip').filter({ hasText: 'an agent decides and reviews only by proposal' })
    await expect(why).toBeVisible()
    await decide.scrollIntoViewIfNeeded()
    await shot(page, 'agent-perms-greyed-en')

    const zh = await inChinese(browser, d.actors.instructor)
    await zh.goto(coursePath(`members/${d.actors.grader.member_id}`))
    const zhLevels = zh.locator('.app-card').filter({ has: zh.getByRole('heading', { name: '權限' }) })
    await zhLevels.getByRole('button', { name: '編輯權限' }).click()
    const zhDecide = permRow(zh, zhLevels, 'action_decide')
    await expect(zhDecide.locator('.perm-editor__ceiling')).toHaveText('最多：需批准')
    await zhDecide.locator('.el-select').click()
    const zhOptions = zh.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    await expect(zhOptions.filter({ hasText: '自主' })).toHaveClass(/is-disabled/)
    await zhOptions.filter({ hasText: '自主' }).hover()
    await expect(zh.getByRole('tooltip').filter({ hasText: '代理只能以提案的方式作出決定與覆核' })).toBeVisible()
    await zhDecide.scrollIntoViewIfNeeded()
    await shot(zh, 'agent-perms-greyed-zh-Hant')
    await zh.close()

    // A student's agent, too: it brings no agents of its own, decides nothing, as she decides
    // nothing, and drafts her work only by proposal.
    await page.keyboard.press('Escape')
    const seats = await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}/members?limit=200`)
    const agentSeat = (seats.body.result.members ?? []).find(
      (m: { actor_id: string }) => m.actor_id === nora.agent.actor_id,
    )
    expect(agentSeat?.perm_ceilings).toMatchObject({
      action_decide: 'denied',
      agent_delegate: 'denied',
      submission_write: 'confirm_required',
    })
    expect(agentSeat?.perm_ceiling_reasons).toMatchObject({
      action_decide: 'principal_level',
      agent_delegate: 'agent_never',
      submission_write: 'student_agent_by_proposal',
    })
    await page.goto(coursePath(`members/${agentSeat.id}`))
    await levels.getByRole('button', { name: 'Edit permissions' }).click()
    await expect(permRow(page, levels, 'agent_delegate').locator('.perm-editor__ceiling')).toHaveText('Never here')
    await expect(permRow(page, levels, 'agent_delegate').locator('.el-select__wrapper')).toHaveClass(/is-disabled/)
    await expect(permRow(page, levels, 'submission_write').locator('.perm-editor__ceiling')).toHaveText(
      'At most: Needs approval',
    )
    await expect(permRow(page, levels, 'action_decide').locator('.perm-editor__ceiling')).toHaveText('Never here')
  })

  test('an agent’s owner is fixed: its page says so, and offers nothing to change it', async ({ page }) => {
    await signInWithToken(page, root())
    await page.goto(`/admin/actors/${nora.agent.actor_id}`)
    await expect(page.locator('.page-header')).toContainText(NORA_AGENT)
    const owner = page.locator('.el-descriptions__cell').filter({ hasText: nora.display_name }).first()
    await expect(owner).toBeVisible()
    await expect(page.getByText('Given when it was registered, and never changed')).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Set owner|Change)$/ })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: /owner/i })).toHaveCount(0)
    // Nor does Core take one any more.
    const gone = await call(root().token, 'POST', `/v1/actors/${nora.agent.actor_id}/owner`, { owner_actor_id: null })
    expect(gone.status).toBe(404)
  })
})
