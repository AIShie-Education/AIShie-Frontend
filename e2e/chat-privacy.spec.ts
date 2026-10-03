import { expect, test, type Page } from '@playwright/test'
import { call, coursePath, demo, hostOnRuntime, photograph, signIn, type CoreReply } from './support'

// Where a student asks, the chat says who else can read the conversation and
// where the agent sends what they write (AIShie-Frontend#79): the first time
// they start a conversation, its points on the new conversation, until they
// say they have seen them; after that, a line under the composer; and "More"
// opens the whole notice, in their language. Told through Ken and a course
// agent made for this run, hosted as the site's runtime hosts it (the run has
// no runtime: nobody's model is named, as for anyone not its owner).

const STAMP = Date.now().toString(36)
const TUTOR = `Privacy tutor ${STAMP}`
const QUESTION = `Who marks the lab report? (${STAMP})`
const LINE = `Course staff, agents that decide actions in the course, and site and department administrators can read this conversation. ${TUTOR} sends it to its AI model’s provider to answer.`

const w = { tutorId: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

const panelOf = (page: Page) => page.locator('#chat-panel')

async function openChat(page: Page) {
  await page.goto(coursePath())
  await expect(page.locator('.course-head')).toBeVisible()
  if (!(await panelOf(page).isVisible())) await page.locator('#chat-panel-toggle').click()
  await expect(panelOf(page)).toBeVisible()
  return panelOf(page)
}

/** The whole notice, in its dialog over the page. */
const noticeOf = (page: Page) => page.getByRole('dialog', { name: 'Who reads this, and where it goes' })

test.describe.serial('the chat says who reads a conversation and where it goes', () => {
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
    await hostOnRuntime(w.tutorId)
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test('the first time, on the new conversation; then under the composer; More opens the notice', async ({ page }) => {
    await signIn(page, demo().actors.ken)
    const panel = await openChat(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()

    // The first time: its points, before anything is asked.
    const first = panel.locator('.chat-pane__privacy-first')
    await expect(first.getByRole('heading', { name: 'Before you ask' })).toBeVisible()
    await expect(first.locator('li')).toHaveText([
      'Course staff and agents that decide actions in the course can read this conversation, and the site’s and the department’s administrators can export it for audit.',
      `${TUTOR} sends what you write here to its AI model’s provider to answer it.`,
      'Nothing here is deleted: a message you withdraw is hidden, but kept.',
    ])
    await expect(panel.locator('.chat-pane__privacy')).toHaveCount(0)
    await photograph(page, 'privacy-first')

    // More: the whole notice.
    await first.getByRole('button', { name: 'More' }).click()
    const notice = noticeOf(page)
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: 'Who can read this conversation' })).toBeVisible()
    await expect(notice).toContainText('The two taking part')
    await expect(notice).toContainText('who may export it for audit, withdrawn messages included')
    await expect(notice).toContainText(`${TUTOR} is hosted on AIshie.`)
    await expect(notice).toContainText('This page cannot show you which provider it is.')
    await expect(notice).toContainText('Conversations are never deleted.')
    await photograph(page, 'privacy-notice')
    await page.keyboard.press('Escape')
    await expect(notice).toBeHidden()

    // Seen: the line under the composer takes its place, and stays so in this browser.
    await first.getByRole('button', { name: 'Got it' }).click()
    await expect(first).toHaveCount(0)
    const line = panel.locator('.chat-pane__privacy')
    await expect(line.locator('.chat-pane__privacy-text')).toHaveText(LINE)
    await photograph(page, 'privacy-line-new')

    // In the conversation, where they ask again.
    const composer = panel.locator('textarea')
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(line.locator('.chat-pane__privacy-text')).toHaveText(LINE)
    await line.getByRole('button', { name: 'More: who reads this conversation, and where it goes' }).click()
    await expect(noticeOf(page)).toContainText('its files on the site, which exports list without their contents.')
    await page.keyboard.press('Escape')
    await photograph(page, 'privacy-line')
  })

  test('in the student’s own language', async ({ page }) => {
    await signIn(page, demo().actors.ken)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('aishie.locale', 'zh-Hans')
      } catch {}
    })
    const panel = await openChat(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const first = panel.locator('.chat-pane__privacy-first')
    await expect(first.getByRole('heading', { name: '提问之前' })).toBeVisible()
    await first.getByRole('button', { name: '知道了' }).click()
    await expect(panel.locator('.chat-pane__privacy-text')).toHaveText(
      `课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话。${TUTOR}会把内容发送给其 AI 模型的供应商来生成回答。`,
    )
    await panel.locator('.chat-pane__privacy').getByRole('button', { name: /^详情/ }).click()
    await expect(page.getByRole('dialog', { name: '谁会阅读，内容会发送到哪里' })).toContainText('对话永远不会被删除。')
  })
})
