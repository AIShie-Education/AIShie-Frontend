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

/** Signs in through the sign-in form, as a person does. */
export async function signIn(page: Page, who: DemoActor) {
  if (!who.email) throw new Error(`${who.display_name} is an agent; use signInWithToken`)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'en')
    } catch {}
  })
  await page.goto('/login')
  await page.fill('input[name=login]', who.email)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).not.toHaveURL(/\/login/)
}

/** Signs in with the actor's API token, as the app's token option does. */
export async function signInWithToken(page: Page, who: Pick<DemoActor, 'token'>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'en')
    } catch {}
  })
  await page.goto('/login')
  await page.getByText('Use an API token').click()
  await page.getByPlaceholder('ais_…').fill(who.token)
  await page.getByRole('button', { name: 'Continue with token' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** The platform's root, by the token the run was given. */
export function root(): Pick<DemoActor, 'token'> {
  const token = process.env.E2E_ROOT_TOKEN
  if (!token) throw new Error('E2E_ROOT_TOKEN is required')
  return { token }
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
 * Registers a person as the platform's root, gives them the run's password
 * (through an API token of theirs, as they would set it themselves) and
 * returns them with that token. They sign in by their email or their login
 * ID, whichever they were given.
 */
export async function registerPerson(
  name: string,
  signInBy: { email?: string; login_id?: string },
): Promise<DemoActor & { login_id?: string }> {
  const reg = await call(root().token, 'POST', '/v1/actors', { kind: 'human', display_name: name, ...signInBy })
  expect(reg.body.status, JSON.stringify(reg.body)).toBe('executed')
  const actorId = reg.body.result.actor_id as string
  const tok = await call(root().token, 'POST', `/v1/actors/${actorId}/tokens`, { label: 'e2e', expires_in_days: 1 })
  expect(tok.body.status, JSON.stringify(tok.body)).toBe('executed')
  const token = tok.body.result.token as string
  const pw = await call(token, 'POST', '/v1/me/password', { password: process.env.E2E_PASSWORD })
  expect(pw.body.status, JSON.stringify(pw.body)).toBe('executed')
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
