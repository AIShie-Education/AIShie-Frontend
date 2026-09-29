/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { call, courseTab, coursePath, demo, photograph, signIn, type CoreReply } from './support'

// The chat is a panel beside every page, docked on the right as an editor's
// side panel is, and a sheet over the whole screen on a phone. Told through a
// course agent made for this run, which its runtime says answers in the site,
// and Yuki, a student, who asks it. The panel stays open, on what it shows,
// while she moves between pages, and as wide as she left it; an answer that
// comes while it is closed is counted on its button.

const STAMP = Date.now().toString(36)
const TUTOR = `Panel tutor ${STAMP}`
const TITLE = `Loops (${STAMP})`
const QUESTION = `How do I stop a while loop? (${STAMP})`
const ANSWER = `Use **break**, or make its condition false (${STAMP}).`
const LATER = `And a for loop? (${STAMP})`
const LATER_ANSWER = `The same: break leaves it (${STAMP}).`

const w = { tutorToken: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** The course agent's runtime: the latest question waiting for it, answered. */
async function tutorAnswers(body: string) {
  const c = demo().course.id
  let conv: { id: string; latest_opener_message_id?: string } | undefined
  await expect
    .poll(async () => {
      const inbox = await call(w.tutorToken, 'GET', `/v1/courses/${c}/conversations/inbox`)
      conv = (inbox.body.result?.conversations ?? [])[0]
      return conv?.latest_opener_message_id ?? null
    })
    .not.toBeNull()
  done(
    await call(w.tutorToken, 'POST', `/v1/courses/${c}/conversations/${conv!.id}/answer`, {
      in_reply_to_message_id: conv!.latest_opener_message_id,
      body,
    }),
    'conversation.answer',
  )
}

function chatButton(page: Page) {
  return page.getByRole('button', { name: /^Chat with agents/ })
}
function panelOf(page: Page) {
  return page.locator('#chat-panel')
}

test.describe.serial('the chat panel', () => {
  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    // The instructor's course agent, seated to answer the course, and what runs it, which answers in the site.
    const tutor = done(await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR }), 'agent.create').actor_id
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    w.tutorToken = done(
      await call(I, 'POST', `/v1/me/agents/${tutor}/tokens`, { label: `panel runtime ${STAMP}` }),
      'agent.issue_token',
    ).token
    done(await call(w.tutorToken, 'POST', '/v1/me/site-chat', { on: true }), 'me.site_chat')
  })

  test('opens beside the page, and stays open, on the same conversation, from page to page', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await expect(panelOf(page)).toHaveCount(0)
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'false')
    await chatButton(page).click()
    const panel = panelOf(page)
    await expect(panel).toBeVisible()
    await expect(chatButton(page)).toHaveAttribute('aria-expanded', 'true')

    // Docked on the right: the page is beside it, not under it.
    const viewport = page.viewportSize()!
    const box = (await panel.boundingBox())!
    expect(Math.round(box.x + box.width)).toBe(viewport.width)
    expect(Math.round(box.width)).toBe(400)
    const main = (await page.locator('.app-main').boundingBox())!
    expect(main.x + main.width).toBeLessThanOrEqual(box.x + 1)

    // On a course page it asks in that course, and offers its agents.
    await expect(panel.locator('.chat-panel__course')).toContainText('CS101')
    const row = panel.locator('button.resp-row').filter({ hasText: TUTOR })
    await expect(row).toContainText('Course agent')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-agents')
    await row.click()
    await panel.getByPlaceholder('Title (optional)').fill(TITLE)
    const composer = panel.locator('textarea')
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(panel.locator('.chat-pane__typing')).toContainText(`Waiting for ${TUTOR}`)
    await expect(panel.locator('.chat-pane__name')).toContainText(`CS101 · ${TUTOR}`)

    await tutorAnswers(ANSWER)
    await expect(panel.locator('.chat-msg').filter({ hasText: 'make its condition false' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(panel.locator('.chat-msg strong').filter({ hasText: 'break' })).toBeVisible()
    await photograph(page, 'chat-panel-conversation')

    // Moving around the course, and out of it: the panel stays, on the conversation.
    await courseTab(page, 'Materials').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('materials')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await courseTab(page, 'Assignments').click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('assignments')}$`))
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await page.locator('.app-nav').getByRole('link', { name: 'My courses' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(panel).toBeVisible()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Its history: the conversation, named by course and agent, with its title and where it stands.
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toContainText(`CS101 · ${TUTOR}`)
    await expect(item).toContainText('Answered')
    await page.mouse.move(0, 400)
    await photograph(page, 'chat-panel-history')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // Wider by its edge, from the keyboard; as wide, and open, after a reload.
    const edge = panel.getByRole('separator', { name: 'Resize the chat panel' })
    await edge.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(edge).toHaveAttribute('aria-valuenow', '432')
    await page.reload()
    await expect(panelOf(page)).toBeVisible()
    await expect(panelOf(page).getByRole('separator')).toHaveAttribute('aria-valuenow', '432')
    expect(Math.round((await panelOf(page).boundingBox())!.width)).toBe(432)

    // Ctrl+J closes it, and opens it again.
    await page.locator('.app-main').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(panelOf(page)).toBeVisible()
  })

  test('counts an answer that came while it was closed on its button, until it is read', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.goto(coursePath())
    await chatButton(page).click()
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
    const composer = panel.locator('textarea')
    await composer.fill(LATER)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: LATER })).toBeVisible()
    await panel.getByRole('button', { name: 'Close the chat' }).click()
    await expect(panelOf(page)).toHaveCount(0)

    await tutorAnswers(LATER_ANSWER)
    // It is looked for from any page, and after a reload too.
    await page.reload()
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents: 1 unread', { timeout: 40_000 })
    await expect(page.locator('.app-chat-badge .el-badge__content')).toHaveText('1')

    await chatButton(page).click()
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    const item = panel.locator('.hist-row').filter({ hasText: TITLE })
    await expect(item).toHaveClass(/is-unread/)
    await expect(item).toContainText('New answer')
    await item.click()
    await expect(panel.locator('.chat-msg').filter({ hasText: 'break leaves it' })).toBeVisible()
    await expect(chatButton(page)).toHaveAccessibleName('Chat with agents')
    await expect(page.locator('.app-chat-badge .el-badge__content')).toBeHidden()
  })

  test('shows the instructor what students asked the course agent, on the course’s agents page', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('agents'))
    const row = page.locator('.agent-row').filter({ hasText: TUTOR })
    await row.getByRole('button', { name: 'Conversation log' }).click()
    const log = page.locator('.agent-log')
    await expect(log.getByText(`Conversation log: ${TUTOR}`)).toBeVisible()
    const item = log.locator('.log-row').filter({ hasText: TITLE })
    await expect(item).toContainText('Yuki Tanaka')
    await item.click()
    await expect(log.locator('.chat-pane__name')).toHaveText(`Yuki Tanaka → ${TUTOR}`)
    await expect(log.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
    await expect(log.getByText('You are reading this as course staff.')).toBeVisible()
    // Read-only, and a message may be withdrawn by whoever decides actions for the student.
    await expect(log.locator('textarea')).toHaveCount(0)
    await expect(log.getByRole('button', { name: 'Withdraw' }).first()).toBeVisible()
    await log.getByRole('button', { name: 'All its conversations' }).click()
    await expect(item).toBeVisible()
  })

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('is a sheet over the whole screen, which fits it and closes with its button', async ({ page }) => {
      const d = demo()
      await signIn(page, d.actors.yuki)
      await page.goto(coursePath())
      await chatButton(page).click()
      const panel = panelOf(page)
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('role', 'dialog')
      const box = (await panel.boundingBox())!
      expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, 390, 844])
      await expect(panel.getByRole('separator')).toHaveCount(0)

      await panel.getByRole('button', { name: 'History', exact: true }).click()
      await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
      await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()
      // On a touch screen Enter is a new line, and the button sends.
      await expect(panel.locator('.chat-composer__hint')).toHaveText('Tap the button to send')
      await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
      const wide = await page.evaluate(() => {
        const el = document.querySelector('#chat-panel')!
        return { scroll: el.scrollWidth, client: el.clientWidth, page: document.documentElement.scrollWidth }
      })
      expect(wide.scroll).toBeLessThanOrEqual(wide.client)
      expect(wide.page).toBeLessThanOrEqual(390)
      await photograph(page, 'chat-panel-phone')

      await panel.getByRole('button', { name: 'Close the chat' }).click()
      await expect(panelOf(page)).toHaveCount(0)
      await expect(page.locator('.course-head')).toBeVisible()
    })
  })
})
