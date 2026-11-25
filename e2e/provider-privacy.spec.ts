import { expect, test, type Page } from '@playwright/test'
import { call, coursePath, demo, photograph, signIn } from './support'

// A real Core and the pinned agent runtime, both started by CI. The tutor is
// hosted through the runtime API and given an OpenAI model with a fake key;
// no paid model is called. The browser must learn the provider before the
// first question, through the same safe response the frontend consumes.
const STAMP = Date.now().toString(36)
const TUTOR = `Provider privacy tutor ${STAMP}`
const w = { tutorId: '' }

function done(r: { status: number; body: any }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

async function runtimeCall(
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  ifMatch?: string,
) {
  const reply = await call(token, 'POST', '/v1/auth/assertion', { audience: process.env.E2E_RUNTIME_AUDIENCE })
  expect(reply.status).toBe(200)
  // This endpoint is not a tool envelope; never include its assertion in an error message.
  const a = reply.body as unknown as { assertion?: string }
  expect(typeof a.assertion).toBe('string')
  const res = await fetch(`${process.env.E2E_RUNTIME_URL}/runtime/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${a.assertion}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  expect(res.status, JSON.stringify(data)).toBeLessThan(300)
  return { data, etag: res.headers.get('etag') }
}

const panelOf = (page: Page) => page.locator('#chat-panel')
async function openChat(page: Page) {
  await page.goto(coursePath())
  await expect(page.locator('.course-head')).toBeVisible()
  if (!(await panelOf(page).isVisible())) await page.locator('#chat-panel-toggle').click()
  await expect(panelOf(page)).toBeVisible()
  return panelOf(page)
}

test.describe.serial('a course agent discloses its real provider before the first question', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    w.tutorId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    await runtimeCall(I, 'POST', '/agents/inspect', { agent_id: w.tutorId })
    const hosted = await runtimeCall(I, 'POST', '/agents', { agent_id: w.tutorId })
    await runtimeCall(
      I,
      'PATCH',
      `/agents/${hosted.data.id}`,
      {
        model: { own: { provider: 'openai', adapter: 'openai_chat', model: 'gpt-5-mini' } },
        own_key: { value: `sk-e2e-${STAMP}-not-a-real-key` },
      },
      hosted.etag ?? `"${hosted.data.version}"`,
    )
  })

  test.afterAll(async () => {
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test('the privacy route returns only safe facts, shown in the points, composer line and full notice', async ({ page }) => {
    await signIn(page, demo().actors.ken)
    const panel = await openChat(page)
    const response = page.waitForResponse(
      (r) => r.url().includes(`/runtime/api/v1/agents/${w.tutorId}/privacy?course_id=${demo().course.id}`),
    )
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const privacy = await (await response).json()
    expect(Object.keys(privacy).sort()).toEqual(['agent_id', 'fallback', 'primary'])
    expect(privacy).toEqual({
      agent_id: w.tutorId,
      primary: { plan: 'own', provider: 'openai', provider_label: 'OpenAI', school_offer_label: null },
      fallback: null,
    })
    const wire = JSON.stringify(privacy)
    expect(wire).not.toContain('gpt-5-mini')
    expect(wire).not.toContain('sk-e2e')
    expect(wire).not.toContain('endpoint')
    expect(wire).not.toContain('api_key')

    const first = panel.locator('.chat-pane__privacy-first')
    await expect(first.locator('li').nth(1)).toHaveText(
      `${TUTOR} sends what you write here to OpenAI, its AI model’s provider, to answer it.`,
    )
    await first.getByRole('button', { name: 'Got it' }).click()
    await expect(panel.locator('.chat-pane__privacy-text')).toContainText(`${TUTOR} sends it to OpenAI.`)
    await panel.locator('.chat-pane__privacy-more').click()
    await expect(page.getByRole('dialog', { name: 'Who reads this, and where it goes' })).toContainText(
      'That model is from OpenAI, on its owner’s own API key.',
    )
    await photograph(page, 'provider-privacy-openai')
  })
})
