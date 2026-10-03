/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  hostOnRuntime,
  inTraditionalChinese,
  photograph,
  signIn,
  type CoreReply,
} from './support'

// The chat as an agent chat is worked: a new conversation offers a few ways
// to begin; the agent's answer is set across the width as Markdown, its code
// in a box with its language and a copy button, and each message can be
// copied; while an answer is awaited a working line counts the seconds, and
// the send button, with nothing written, stops the wait (the question is
// withdrawn and comes back to the box); a slash opens the commands, an @ the
// course's assignments and materials; the history is grouped by day and
// searched. Told in Traditional Chinese, at 1440 px, through Yuki and a
// course agent made for this run, whose runtime this test plays.

const STAMP = Date.now().toString(36)
const TUTOR = `Polish tutor ${STAMP}`
const TITLE = `溫度換算 (${STAMP})`
const QUESTION = `解釋這份作業的要求 (${STAMP})`
const ANSWER = [
  '## HW1 的要求',
  '',
  '這份作業要你寫一個函式，把**攝氏**換成**華氏**，並說明你怎樣測試它。',
  '',
  '```python',
  'def c_to_f(c):',
  '    """攝氏轉華氏"""',
  '    return c * 9 / 5 + 32',
  '',
  'assert c_to_f(100) == 212',
  '```',
  '',
  '| 攝氏 | 華氏 | 說明 |',
  '| ---: | ---: | --- |',
  '| 0 | 32 | 水的冰點 |',
  '| 37 | 98.6 | 體溫 |',
  '| 100 | 212 | 水的沸點 |',
  '',
  '> 提示：先用 `assert` 驗證幾個已知的值，再寫說明。',
  '',
  `1. 寫出 \`c_to_f\`\n2. 用表中的值測試\n3. 交上程式碼與說明 (${STAMP})`,
].join('\n')

const w = { tutorToken: '', tutorId: '' }

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

const panelOf = (page: Page) => page.locator('#chat-panel')

async function openChat(page: Page) {
  await page.goto(coursePath())
  await expect(page.locator('.course-head')).toBeVisible()
  if (!(await panelOf(page).isVisible())) await page.locator('#chat-panel-toggle').click()
  await expect(panelOf(page)).toBeVisible()
  return panelOf(page)
}

/** Opens the conversation of this run from the history. */
async function openConversation(page: Page) {
  const panel = await openChat(page)
  await panel.getByRole('button', { name: '過往對話', exact: true }).click()
  await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
  await expect(panel.locator('.chat-msg').first()).toBeVisible()
  return panel
}

test.describe.serial('the chat, as an agent chat', () => {
  test.use({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    const tutor = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    w.tutorId = tutor
    done(
      await call(I, 'POST', `/v1/courses/${d.course.id}/delegates`, {
        actor_id: tutor,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    )
    // Hosted as the site's runtime hosts it: issued its one token, which answers as the agent.
    w.tutorToken = await hostOnRuntime(tutor)
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test.beforeEach(async ({ page }) => {
    await signIn(page, demo().actors.yuki)
    await inTraditionalChinese(page)
  })

  test('a new conversation offers ways to begin; the wait is a working line, stopped from the send button', async ({
    page,
  }) => {
    const panel = await openChat(page)
    await panel.locator('button.resp-row').filter({ hasText: TUTOR }).click()
    const chips = panel.locator('.chat-pane__suggestion')
    await expect(chips).toHaveText(['解釋這份作業的要求', '幫我檢查我的思路', '總結這週的教材', '出幾道練習題給我'])
    await page.mouse.move(700, 450)
    await photograph(page, 'new-conversation')
    await chips.first().click()
    const composer = panel.locator('textarea')
    await expect(composer).toHaveValue('解釋這份作業的要求')
    await expect(composer).toBeFocused()
    await composer.fill(`${TITLE}\n${QUESTION}`)
    await composer.press('Enter')
    await expect(panel.locator('.chat-msg').filter({ hasText: QUESTION })).toBeVisible()

    // The working line: the glyph, 思考中…, and the seconds since the question.
    const line = panel.locator('.chat-pane__typing .chat-status')
    await expect(line.locator('.chat-status__label')).toHaveText('思考中…')
    await expect(line.locator('.chat-status__time')).toHaveText(/^\d+s$/)
    await page.waitForTimeout(2200)
    await expect(line.locator('.chat-status__time')).not.toHaveText('0s')
    await expect(panel.locator('.chat-pane__dots')).toHaveCount(0)
    // With nothing written, the send button stops the wait.
    const stop = panel.getByRole('button', { name: '停止', exact: true })
    await expect(stop).toBeVisible()
    await page.mouse.move(700, 450)
    await photograph(page, 'waiting')
    await stop.click()
    await expect(composer).toHaveValue(`${TITLE}\n${QUESTION}`)
    await expect(panel.locator('.chat-msg.is-retracted')).toContainText('你已撤回這則訊息')
    await expect(panel.locator('.chat-pane__typing')).toHaveCount(0)
    await expect(panel.locator('.chat-pane__notice')).toHaveText(`你撤回了問題，${TUTOR}不會回答它。`)
    // The agent's inbox leaves it out.
    const inbox = await call(w.tutorToken, 'GET', `/v1/courses/${demo().course.id}/conversations/inbox`)
    expect(inbox.body.result?.conversations ?? []).toEqual([])
    // Sent again, it is asked again.
    await composer.press('Enter')
    await expect(panel.locator('.chat-pane__typing .chat-status')).toBeVisible()
    await expect(panel.getByRole('button', { name: '停止', exact: true })).toBeVisible()
    await composer.fill('再補充一點')
    await expect(panel.getByRole('button', { name: '停止', exact: true })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: '傳送', exact: true })).toBeEnabled()
    await composer.fill('')
  })

  test('the answer is set as Markdown across the width, its code and each message copied with a button', async ({
    page,
  }) => {
    await tutorAnswers(ANSWER)
    const panel = await openConversation(page)
    const answer = panel.locator('.chat-msg.is-agent').filter({ hasText: 'HW1 的要求' })
    await expect(answer).toBeVisible()
    await expect(answer.locator('.chat-prose h2')).toHaveText('HW1 的要求')
    await expect(answer.locator('.chat-prose table tbody tr')).toHaveCount(3)
    // No bubble: as wide as the pane's text.
    const pane = (await panel.locator('.chat-pane__list').boundingBox())!
    const box = (await answer.boundingBox())!
    expect(box.width).toBeGreaterThan(pane.width - 8)
    // The person's words: a bubble on the right.
    const mine = panel.locator('.chat-msg.is-person').filter({ hasText: QUESTION }).last()
    const bubble = (await mine.locator('.chat-msg__body').boundingBox())!
    expect(Math.round(bubble.x + bubble.width)).toBeGreaterThanOrEqual(Math.round(pane.x + pane.width) - 2)

    const code = answer.locator('.md-code')
    await expect(code.locator('.md-code__lang')).toHaveText('python')
    // The code scrolls within its box, never the pane.
    expect(await code.locator('pre').evaluate((p) => getComputedStyle(p).overflowX)).toBe('auto')
    // The question at the top of the pane, the answer under it.
    await mine.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.mouse.move(900, 200)
    await photograph(page, 'conversation-code-table')
    await page.locator('html').evaluate((h) => h.classList.add('dark'))
    await photograph(page, 'conversation-dark')
    await page.locator('html').evaluate((h) => h.classList.remove('dark'))

    await code.getByRole('button', { name: '複製', exact: true }).click()
    await expect(code.locator('.md-code__copy')).toHaveText('已複製')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'def c_to_f(c):\n    """攝氏轉華氏"""\n    return c * 9 / 5 + 32\n\nassert c_to_f(100) == 212\n',
    )
    await expect(code.locator('.md-code__copy')).toHaveText('複製', { timeout: 4000 })

    // A message, copied as it was written: Markdown and all. Its actions show on hover.
    await answer.hover()
    await expect(answer.locator('.chat-msg__foot')).toHaveCSS('opacity', '1')
    await answer.getByRole('button', { name: '複製訊息', exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ANSWER)
    await mine.hover()
    await mine.getByRole('button', { name: '複製訊息', exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${TITLE}\n${QUESTION}`)
  })

  test('a slash opens the commands, and an @ the course’s assignments and materials', async ({ page }) => {
    const panel = await openConversation(page)
    const composer = panel.locator('textarea')
    await composer.click()
    await page.keyboard.type('/')
    const list = panel.getByRole('listbox', { name: '指令' })
    await expect(list.getByRole('option')).toHaveText([/\/new\s*新對話/, /\/history\s*對話紀錄/])
    await expect(composer).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.move(900, 200)
    await photograph(page, 'slash-menu')
    await page.keyboard.type('h')
    await expect(list.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(panel.locator('.chat-history')).toBeVisible()

    await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
    await composer.click()
    await page.keyboard.type('請看 @HW')
    const picker = panel.getByRole('listbox', { name: '作業與教材' })
    await expect(picker.getByRole('option').first()).toContainText('HW1 — Temperature converter')
    await expect(picker.getByRole('option').first()).toContainText('作業')
    await page.mouse.move(900, 200)
    await photograph(page, 'mention-picker')
    await page.keyboard.press('Enter')
    await expect(composer).toHaveValue('請看 「HW1 — Temperature converter」')
    await expect(picker).toHaveCount(0)
    // The materials too, by any part of their title.
    await page.keyboard.type(' 和 @welcome')
    await expect(panel.getByRole('listbox', { name: '作業與教材' }).getByRole('option')).toHaveText([
      /Week 1 — Welcome and setup\s*教材/,
    ])
    await page.keyboard.press('Escape')
    await expect(panel.getByRole('listbox')).toHaveCount(0)
    await expect(composer).toBeFocused()
    // Escape again leaves the box; ↑ in an empty box brings back the last message sent.
    await page.keyboard.press('Escape')
    await expect(composer).not.toBeFocused()
    await composer.fill('')
    await composer.press('ArrowUp')
    await expect(composer).toHaveValue(`${TITLE}\n${QUESTION}`)
    await composer.fill('')
  })

  test('the history is grouped by day and searched by title or agent', async ({ page }) => {
    const panel = await openChat(page)
    await panel.getByRole('button', { name: '過往對話', exact: true }).click()
    const history = panel.locator('.chat-history')
    await expect(history.locator('.chat-history__heading').first()).toHaveText('今天')
    const search = history.getByRole('textbox', { name: '搜尋標題或代理' })
    await search.fill(STAMP)
    await expect(history.locator('.hist-row')).toHaveCount(1)
    await expect(history.locator('.hist-row__title')).toHaveText(TITLE)
    await page.mouse.move(900, 200)
    await photograph(page, 'history-search')
    await search.fill(TUTOR.toUpperCase())
    await expect(history.locator('.hist-row')).toHaveCount(1)
    await search.fill(`nothing-${STAMP}`)
    await expect(history.locator('.hist-row')).toHaveCount(0)
    await expect(history.locator('.chat-history__none')).toContainText('沒有符合')
  })

  test('at a phone’s width, the conversation is a sheet that fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(coursePath())
    await page.locator('#chat-panel-toggle').click()
    const panel = panelOf(page)
    await panel.getByRole('button', { name: '過往對話', exact: true }).click()
    await panel.locator('.hist-row').filter({ hasText: TITLE }).click()
    await expect(panel.locator('.chat-msg.is-agent').filter({ hasText: 'HW1 的要求' })).toBeVisible()
    await panel.locator('.chat-pane__messages').evaluate((el) => (el.scrollTop = el.scrollHeight))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const table = panel.locator('.chat-prose table').first()
    expect((await table.boundingBox())!.width).toBeLessThanOrEqual(390)
    await photograph(page, 'phone')
  })
})
