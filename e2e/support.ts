import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
import { expect, type Locator, type Page } from '@playwright/test'

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
      localStorage.setItem('aishie.locale', 'en')
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
 * The chat's round button, floating at the bottom right of every page (on a
 * phone too) while the chat is closed or minimized, named with how many
 * answers are unread ("Chat with agents: 1 unread").
 */
export function chatButton(page: Page) {
  return page.locator('.app-chat-fab').getByRole('button', { name: /^Chat with agents/ })
}

/** The count of unread answers on the chat's button. */
export function chatBadge(page: Page) {
  return page.locator('.app-chat-fab .el-badge__content')
}

/** The chat: a window floating over the page (on a phone, a sheet over the whole screen). */
export function chatWindow(page: Page) {
  return page.locator('#chat-panel')
}

/** Opens the chat from its button, unless it is open already. */
export async function openChat(page: Page) {
  const panel = chatWindow(page)
  if (!(await panel.isVisible())) await chatButton(page).click()
  await expect(panel).toBeVisible()
  return panel
}

/** Minimizes the chat's window from its title bar (in the language shown): it opens again on what it showed. */
export async function minimizeChat(page: Page) {
  await chatWindow(page).locator('.chat-panel__minimize').click()
  await expect(chatWindow(page)).toHaveCount(0)
}

/**
 * Nothing sits along the window's right edge while the chat is closed: no
 * rail (the "Side panels" toolbar that once ran there), nothing fixed or
 * sticky there but the header, and down the edge, under the header, only the
 * page's own ground; and the header runs from beside the side bar (on a
 * phone, from the left) to the window's right edge.
 */
export async function expectNothingAtRightEdge(page: Page, what: string) {
  await expect(page.getByRole('toolbar', { name: 'Side panels' }), what).toHaveCount(0)
  await expect(page.locator('.app-rail'), what).toHaveCount(0)
  const found = await page.evaluate(() => {
    const win = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const header = document.querySelector('.app-header')!.getBoundingClientRect()
    const column = document.querySelector('.app-main-wrap')!.getBoundingClientRect()
    // What is fixed or sticky and reaches the right edge, bar the header. (The chat's button keeps 16 px from it.)
    const pinned: string[] = []
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.right < win.width - 1) continue
      if (el.closest('.app-header')) continue
      pinned.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
    }
    // Down the right edge, under the header: the page, or its ground.
    const alien: string[] = []
    for (let y = header.bottom + 4; y < win.height; y += 40) {
      const el = document.elementFromPoint(win.width - 3, y)
      if (!el) continue
      if (el.closest('.app-main') || ['app-body', 'app-main-wrap', 'app-shell'].some((c) => el.classList.contains(c)))
        continue
      if (el === document.body || el === document.documentElement) continue
      alien.push(`${Math.round(y)}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
    }
    return {
      win,
      header: { left: header.left, right: header.right },
      column: { left: column.left, right: column.right },
      pinned,
      alien,
    }
  })
  expect(found.pinned, `${what}: fixed or sticky at the right edge`).toEqual([])
  expect(found.alien, `${what}: down the right edge`).toEqual([])
  expect(Math.round(found.header.right), `${what}: the header's right end`).toBe(found.win.width)
  expect(Math.round(found.column.right), `${what}: the page's column's right end`).toBe(found.win.width)
  expect(Math.round(found.header.left), `${what}: the header's left end`).toBe(Math.round(found.column.left))
}

/**
 * The activity bar along the window's left edge, as an editor's: a button for
 * each view of the side bar beside it (Courses, Agents, Administration). A
 * phone has none: the header's menu shows the views as tabs.
 */
export function activityBar(page: Page) {
  return page.getByRole('toolbar', { name: 'Side bar views' })
}

/** The side bar, beside the activity bar, with the view chosen; absent while it is collapsed. */
export function sideBar(page: Page) {
  return page.locator('#side-bar')
}

/** Shows a view in the side bar by its button on the activity bar, unless it is shown already. */
export async function showSideView(page: Page, name: 'Courses' | 'Agents' | 'Administration') {
  const button = activityBar(page).getByRole('button', { name, exact: true })
  await expect(button).toBeVisible()
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(sideBar(page).getByRole('heading', { name, exact: true })).toBeVisible()
  return sideBar(page)
}

/**
 * The caller's account: a menu button at the bottom of the activity bar,
 * named by whose it is ("Account: Yuki Tanaka", in the language shown). Its
 * menu holds the account's settings, the language, the theme and signing
 * out. A phone has none: the account is at the bottom of the side menu.
 */
export function accountButton(page: Page) {
  return page.locator('#account-button')
}

/** The account's menu, open. */
export function accountMenu(page: Page) {
  return page.locator('#account-menu')
}

/** Opens the account's menu from its button. */
export async function openAccountMenu(page: Page) {
  await accountButton(page).click()
  await expect(accountMenu(page)).toBeVisible()
  return accountMenu(page)
}

/** Says who is signed in, as the account's button names them. */
export async function expectSignedInAs(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(accountButton(page)).toHaveAttribute('aria-label', new RegExp(`[:：]\\s*${escaped}$`))
}

/** Signs out, from the account's menu. */
export async function signOut(page: Page) {
  const menu = await openAccountMenu(page)
  await menu.getByRole('menuitem', { name: /^(Sign out|登出|退出登录)$/ }).click()
  await expect(page).toHaveURL(/\/login/)
}

/** Chooses the language the app is read in, from the account's menu. */
export async function chooseLanguage(page: Page, label: '繁體中文' | '简体中文' | 'English') {
  const menu = await openAccountMenu(page)
  await menu.locator('[data-opens="language"]').click()
  await menu.getByRole('menuitemradio', { name: label }).click()
  await expect(accountMenu(page)).toHaveCount(0)
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
      localStorage.setItem('aishie.locale', 'zh-Hant')
    } catch {}
  })
}

/** A file as a test hands it to the page: its name, its type and its bytes. */
export interface FileSpec {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * Drops files on an element as a person drags them there from their
 * computer: dragenter, dragover and drop, each carrying a DataTransfer that
 * holds them. Dropped on the page rather than on a drop zone, they go to
 * whatever takes files there.
 */
export async function dropFiles(target: Locator, files: FileSpec[]) {
  const dataTransfer = await target.page().evaluateHandle(
    (fs) => {
      const dt = new DataTransfer()
      for (const f of fs) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.mimeType }))
      return dt
    },
    files.map((f) => ({ name: f.name, mimeType: f.mimeType, bytes: [...f.buffer] })),
  )
  for (const type of ['dragenter', 'dragover', 'drop']) await target.dispatchEvent(type, { dataTransfer })
  await dataTransfer.dispose()
}
