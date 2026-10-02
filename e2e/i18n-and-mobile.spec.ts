/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { chatButton, chooseLanguage, courseTab, coursePath, demo, expectNothingAtRightEdge, signIn } from './support'

/**
 * What scrolls sideways that should not: the page itself, or the app's main
 * area (a scroll container of its own). For each, the elements that stick out
 * past its right edge without an inner scroller of their own (a table's body,
 * the tab strip, a code block) to hold them.
 */
async function sidewaysScroll(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    const describe = (e: Element) => {
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
      return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
    }
    const scrollers = [document.documentElement, document.querySelector('.app-main')].filter(Boolean) as Element[]
    for (const s of scrollers) {
      const over = s.scrollWidth - s.clientWidth
      if (over <= 1) continue
      const edge = s === document.documentElement ? s.clientWidth : s.getBoundingClientRect().left + s.clientWidth
      const culprits: string[] = []
      for (const el of s.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (!r.width || r.right <= edge + 1) continue
        let held = false
        for (let p = el.parentElement; p && p !== s; p = p.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
            held = true
            break
          }
        }
        if (!held) culprits.push(`${describe(el)} → ${Math.round(r.right)}px`)
      }
      out.push(`${describe(s)} scrolls ${over}px sideways: ${culprits.slice(0, 6).join(', ')}`)
    }
    return out
  })
}

async function expectFits(page: Page, what: string) {
  await expect.poll(() => sidewaysScroll(page), { message: `${what} fits the screen` }).toEqual([])
}

/** The box stays within the viewport, left and right. */
async function expectWithinViewport(page: Page, selector: string) {
  const box = await page.locator(selector).last().boundingBox()
  expect(box, selector).not.toBeNull()
  const width = page.viewportSize()!.width
  expect(box!.x, `${selector} left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${selector} right edge`).toBeLessThanOrEqual(width)
}

test.describe('language', () => {
  test('switching to 繁體中文 changes the app’s text, and back', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    const tabs = page.getByRole('navigation', { name: 'Course sections' })
    await expect(tabs.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(tabs.getByRole('link', { name: 'Members' })).toBeVisible()

    await chooseLanguage(page, '繁體中文')

    const zhTabs = page.getByRole('navigation', { name: '課程分頁' })
    for (const name of ['概覽', '教材', '作業', '提交', '成績', '成員', '審批', '我的操作']) {
      await expect(zhTabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('link', { name: 'Overview' })).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
    // The chat with the course's agents, over every page from its button at the header's right end, and no longer a
    // tab of the course.
    await expect(page.locator('.app-header').getByRole('button', { name: '與代理對話' })).toBeVisible()
    await expect(zhTabs.getByRole('link', { name: '對話' })).toHaveCount(0)
    // Core's vocabularies too: the course's status and the caller's role.
    await expect(page.locator('.course-head')).not.toContainText('Active')
    await expect(page.locator('.course-head')).not.toContainText('Instructor')

    // It stays while moving around the course.
    await zhTabs.getByRole('link', { name: '成員' }).click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('members')}$`))
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '成員' })).toBeVisible()

    await chooseLanguage(page, 'English')
    await expect(courseTab(page, 'Overview')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('switching to 简体中文 sets the app in Simplified Chinese, in its own typefaces', async ({ page }) => {
    const d = demo()
    // The Chinese typefaces the page asks for, by script.
    const fonts: string[] = []
    page.on('request', (r) => {
      const m = r.url().match(/noto-(?:sans|serif)-(sc|tc)/)
      if (m) fonts.push(m[1])
    })
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(courseTab(page, 'Overview')).toBeVisible()

    await chooseLanguage(page, '简体中文')

    const zhTabs = page.getByRole('navigation', { name: '课程栏目' })
    for (const name of ['概览', '教材', '作业', '提交', '成绩', '成员', '审批', '我的操作']) {
      await expect(zhTabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    await expect(page.locator('.app-header').getByRole('button', { name: '与智能体对话' })).toBeVisible()
    // Simplified glyphs, from Noto Sans SC: the SC faces are fetched, the TC ones never.
    await expect.poll(() => fonts.includes('sc'), { message: 'an SC face is fetched' }).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Noto Sans SC/)
    expect(fonts).not.toContain('tc')

    await chooseLanguage(page, 'English')
    await expect(courseTab(page, 'Overview')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the course tabs scroll on their own, and the pages fit', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    const tabs = page.getByRole('navigation', { name: 'Course sections' })
    await expect(tabs).toBeVisible()
    await expectWithinViewport(page, '.course-tabs')
    // More tabs than fit: the strip scrolls, the page does not.
    const strip = await tabs.evaluate((n) => ({ scroll: n.scrollWidth, client: n.clientWidth }))
    expect(strip.scroll).toBeGreaterThan(strip.client)
    await expectFits(page, 'the overview')

    // A tab off to the right can be reached and opened.
    const activity = tabs.getByRole('link', { name: 'Activity' })
    await activity.scrollIntoViewIfNeeded()
    await activity.click()
    await expect(page).toHaveURL(new RegExp(`${coursePath('activity')}$`))
    await expectFits(page, 'the activity feed')

    for (const [path, what] of [
      ['materials', 'materials'],
      ['assignments', 'assignments'],
      [`assignments/${d.course.assignments.hw1}`, 'an assignment'],
      ['submissions', 'submissions'],
      [`submissions/${d.course.submissions.yuki_hw1}`, 'a submission'],
      ['grades', 'grades'],
      [`gradebook/${d.actors.yuki.member_id}`, 'a gradebook'],
      ['scheme', 'the grading scheme'],
      ['members', 'members'],
      [`members/${d.actors.ken.member_id}`, 'a member'],
      ['approvals', 'approvals'],
      ['my-actions', 'my actions'],
    ] as const) {
      await page.goto(coursePath(path))
      await expect(page.locator('.page-header').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      await expectFits(page, what)
    }
  })

  test('the chat is a sheet over the whole screen, opened from a floating button, and fits it', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('grades'))
    // No rail: the chat's button floats at the bottom right, within the screen.
    await expect(page.locator('.page-header').first()).toBeVisible()
    await expectNothingAtRightEdge(page, 'grades on a phone')
    await expectWithinViewport(page, '.app-chat-fab')
    await chatButton(page).click()
    const sheet = page.locator('#chat-panel')
    await expect(sheet.getByRole('heading', { name: 'Ask an agent' })).toBeVisible()
    await expectWithinViewport(page, '#chat-panel')
    const box = (await sheet.boundingBox())!
    expect(Math.round(box.width)).toBe(390)
    expect(Math.round(box.height)).toBe(844)
    await expectFits(page, 'the chat sheet')
    await sheet.getByRole('button', { name: 'History', exact: true }).click()
    await expectFits(page, 'the chat sheet’s history')
    await sheet.getByRole('button', { name: 'Close the chat' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('.page-header').first()).toBeVisible()
    await expect(chatButton(page)).toBeVisible()
  })

  test('a field one types into is in 16 px on a touch screen, the Markdown editor’s included, so iOS does not zoom into it', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath('grades'))
    await page.getByRole('button', { name: 'Enter a component grade' }).click()
    const dialog = page.getByRole('dialog', { name: 'Grade a directly graded component' })
    await expect(dialog).toBeVisible()
    const sizes = await dialog.evaluate((el) => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      field: getComputedStyle(el.querySelector('.enter-dialog__score-input input')!).fontSize,
      markdown: getComputedStyle(el.querySelector('.md-editor textarea')!).fontSize,
    }))
    expect(sizes).toEqual({ coarse: true, field: '16px', markdown: '16px' })
  })

  test('dialogs fit a phone', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)

    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'New material' }).click()
    await expect(page.getByRole('dialog', { name: 'New material' })).toBeVisible()
    await expectWithinViewport(page, '.el-dialog')
    await expectFits(page, 'the new material dialog')
    await page.getByRole('dialog', { name: 'New material' }).getByRole('button', { name: 'Cancel' }).click()

    await page.goto(coursePath('members'))
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByRole('dialog', { name: 'Add a member' })).toBeVisible()
    await expectWithinViewport(page, '.el-dialog')
    await expectFits(page, 'the add member dialog')
    await page.getByRole('dialog', { name: 'Add a member' }).getByRole('button', { name: 'Cancel' }).click()

    await page.goto(coursePath('grades'))
    await page.getByRole('button', { name: 'Enter a component grade' }).click()
    await expect(page.getByRole('dialog', { name: 'Grade a directly graded component' })).toBeVisible()
    await expectWithinViewport(page, '.el-dialog')
    await expectFits(page, 'the component grade dialog')

    await page.goto(coursePath('scheme'))
    await page.getByRole('button', { name: 'Add component' }).click()
    await expect(page.getByRole('dialog', { name: 'Add a component' })).toBeVisible()
    await expectWithinViewport(page, '.el-dialog')
    await expectFits(page, 'the add component dialog')

    // A confirmation box, too.
    await page.goto(coursePath(`members/${d.actors.ken.member_id}`))
    await page.locator('.page-header').getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('dialog', { name: 'Pause this seat?' })).toBeVisible()
    await expectWithinViewport(page, '.el-message-box')
    await page.getByRole('dialog', { name: 'Pause this seat?' }).getByRole('button', { name: 'Cancel' }).click()
  })
})
