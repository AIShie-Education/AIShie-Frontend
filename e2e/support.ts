import { readFileSync } from 'node:fs'
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
  await page.fill('input[name=email]', who.email)
  await page.fill('input[name=password]', process.env.E2E_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).not.toHaveURL(/\/login/)
}

/** Signs in with the actor's API token, as the app's token option does. */
export async function signInWithToken(page: Page, who: DemoActor) {
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

/** Calls a Core tool directly, for arranging what a test needs. */
export async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
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
