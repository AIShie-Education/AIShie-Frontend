import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
import { expect, type Page } from '@playwright/test'

export interface DemoActor {
  actor_id: string
  member_id?: string
  email?: string
  display_name: string
  kind: 'human' | 'agent'
  /**
   * What the tests call Core with as them: an agent's API token, or a
   * person's signed-in session (people hold no API tokens), which lasts
   * Core's SESSION_TTL, 12 hours.
   */
  token: string
}
export interface Demo {
  core: string
  tag: string
  actors: Record<'instructor' | 'ta' | 'yuki' | 'ken' | 'mei' | 'observer' | 'grader' | 'tutor', DemoActor>
  course: {
    id: string
    root_component_id: string
    term_id: string
    dept_id: string
    components: { assignments: string; midterm: string }
    documents: { week1: string; week2: string; syllabus: string }
    assignments: { hw1: string; hw2: string }
    submissions: { yuki_hw1: string; ken_hw1_draft: string }
    proposed_grade_action: string
    midterm_draft_grade: string
  }
}

export function demo(): Demo {
  return JSON.parse(readFileSync(resolve(here, '.demo.json'), 'utf8'))
}

/**
 * Signs in through the sign-in form, as a person does, with their email and
 * the run's password (E2E_PASSWORD). Only people sign in to the app: an
 * agent is seen through Core, with its token (call).
 */
export async function signIn(
  page: Page,
  who: Pick<DemoActor, 'email' | 'display_name'>,
  password = process.env.E2E_PASSWORD!,
) {
  if (!who.email)
    throw new Error(`${who.display_name} has no email to sign in with (an agent never signs in to the app)`)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'en')
    } catch {}
  })
  await page.goto('/login')
  await page.fill('input[name=login]', who.email)
  await page.fill('input[name=password]', password)
  await page.click('button[type=submit]')
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * The platform's root, by the session the run was given: E2E_ROOT_TOKEN is
 * root's signed-in session (scripts/ci-core.sh), not an API token.
 */
export function root(): Pick<DemoActor, 'token'> {
  const token = process.env.E2E_ROOT_TOKEN
  if (!token) throw new Error('E2E_ROOT_TOKEN is required')
  return { token }
}

let rootEmail: Promise<string> | undefined

/**
 * Signs root in through the sign-in form, as any person signs in: with the
 * email Core has for root (asked once, with root's session) and the run's
 * password, which scripts/ci-core.sh gives root as well.
 */
export async function signInAsRoot(page: Page) {
  rootEmail ??= call(root().token, 'GET', '/v1/me').then((me) => {
    const email = me.body.result?.email
    if (!email) throw new Error(`root has no email to sign in with: ${JSON.stringify(me.body)}`)
    return email as string
  })
  await signIn(page, { email: await rootEmail, display_name: 'root' })
}

/** A path inside the run's course: coursePath('grades') → /courses/<id>/grades. */
export function coursePath(sub = '') {
  const d = demo()
  return `/courses/${d.course.id}${sub ? `/${sub}` : ''}`
}

/** The course's section tabs. */
export function courseTab(page: Page, name: string | RegExp) {
  return page.getByRole('navigation', { name: 'Course sections' }).getByRole('link', { name })
}

/**
 * The rail along the window's right edge, under the header, as an editor's
 * activity bar: a button for each side panel (the chat's). A phone has none.
 */
export function rail(page: Page) {
  return page.getByRole('toolbar', { name: 'Side panels' })
}

/** The chat's button, on the rail. */
export function chatButton(page: Page) {
  return rail(page).getByRole('button', { name: /^Chat with agents/ })
}

/** On a phone, the chat's button, floating at the bottom right while the chat's sheet is closed. */
export function floatingChatButton(page: Page) {
  return page.locator('.app-chat-fab').getByRole('button', { name: /^Chat with agents/ })
}

/** Picks an option from an Element Plus select, opened by clicking `trigger`. */
export async function pickOption(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: option })
    .first()
    .click()
}

/** The message Element Plus pops up after a write (ElMessage). */
export function toast(page: Page, text: string | RegExp) {
  return page.locator('.el-message').filter({ hasText: text })
}

/** Core's reply: `result` for a read or a write carried out, `action_id` for a proposal. */
export interface CoreReply {
  status?: string
  action_id?: string
  /** Each tool's own shape (see src/api/generated/tools.ts). */
  result?: any
  error?: { code: string; message: string; details?: Record<string, unknown> }
}

/** Calls a Core tool directly, for arranging what a test needs. */
export async function call(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: CoreReply }> {
  const d = demo()
  const res = await fetch(d.core + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/**
 * Takes up an invitation (actor.invite) with a password, as the page an
 * invitation link opens does (POST /v1/auth/invite), and returns the session
 * Core signs the person in with: the value of the cookie it sets, which Core
 * takes as a bearer token too.
 */
export async function acceptInvitation(core: string, invitation: string, password: string): Promise<string> {
  const res = await fetch(`${core.replace(/\/+$/, '')}/v1/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token: invitation, password }),
  })
  const session = res.headers
    .getSetCookie()
    .map((c) => /^ais_session=([^;]+)/.exec(c)?.[1])
    .find((v) => !!v)
  if (res.status !== 200 || !session) {
    throw new Error(`POST /v1/auth/invite: HTTP ${res.status} ${await res.text()}, and no session`)
  }
  return session
}

/**
 * Registers a person as the platform's root and gives them a password as a
 * person gets one, by an invitation they take up (the run's password, unless
 * another is given); returns them with the session that signed them in. They
 * sign in by their email or their login ID, whichever they were given. People
 * are given no API tokens.
 */
export async function registerPerson(
  name: string,
  signInBy: { email?: string; login_id?: string },
  password = process.env.E2E_PASSWORD!,
): Promise<DemoActor & { login_id?: string }> {
  const reg = await call(root().token, 'POST', '/v1/actors', { kind: 'human', display_name: name, ...signInBy })
  expect(reg.body.status, JSON.stringify(reg.body)).toBe('executed')
  const actorId = reg.body.result.actor_id as string
  const invited = await call(root().token, 'POST', `/v1/actors/${actorId}/invite`, { expires_in_days: 1 })
  expect(invited.body.status, JSON.stringify(invited.body)).toBe('executed')
  const token = await acceptInvitation(demo().core, invited.body.result.token as string, password)
  return { actor_id: actorId, display_name: name, kind: 'human', token, ...signInBy }
}

/**
 * With E2E_SHOTS set to a directory, photographs the page there as
 * <name>.png; otherwise does nothing. A tooltip or a dialog fades in: the
 * photograph waits for it to be whole.
 */
export async function photograph(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(dir, `${name}.png`), fullPage: false })
}

/** Reads the app in Traditional Chinese from the next page load on. */
export async function inTraditionalChinese(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'zh-Hant')
    } catch {}
  })
}
