/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { coursePath, demo, inTraditionalChinese, signIn } from './support'

// The type scale (styles/tokens.css, docs/CONVENTIONS.md "Type"): in
// Chinese, the two smallest sizes are a step larger (13 and 14 px, not 12
// and 13) and strong text is 500, not a 600 that Noto Sans lacks and sets at
// 700; in English, as before. No Chinese a course's pages show is smaller
// than 13 px, Element Plus's included (a switch's words, a date picker's
// days, months and time panel). The larger Chinese cuts nothing short: no
// tag, button or tab of a course's pages holds less than its words, and no
// page scrolls sideways, on a laptop or on a phone.

/** A course's pages, as an instructor sees them. */
const PAGES = [
  '',
  'materials',
  'assignments',
  'submissions',
  'grades',
  'gradebook',
  'scheme',
  'members',
  'approvals',
  'agents',
  'activity',
  'my-actions',
]

/** The small controls whose words a larger size could push past their edges. */
const CONTROLS = [
  '.el-tag',
  '.el-button',
  '.el-check-tag',
  '.el-radio-button__inner',
  '.el-tabs__item',
  '.course-tabs a',
  '.course-tabs button',
  '.course-crumbs a',
  '.course-head__code',
]

/** Each control shown whose words reach past its edges, with what it says. */
async function cutShort(page: Page): Promise<string[]> {
  return page.evaluate((selectors) => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>(selectors.join(', '))) {
      if (!el.offsetParent || !el.textContent?.trim()) continue
      const box = el.getBoundingClientRect()
      const words = document.createRange()
      words.selectNodeContents(el)
      const at = words.getBoundingClientRect()
      if (!at.width || !at.height) continue
      const past =
        at.left < box.left - 1 || at.right > box.right + 1 || at.top < box.top - 1 || at.bottom > box.bottom + 1
      if (past) out.push(`${el.className}: «${el.textContent.trim()}» ${Math.round(at.width)}×${Math.round(at.height)} in ${Math.round(box.width)}×${Math.round(box.height)}`)
    }
    return out
  }, CONTROLS)
}

/** Each piece of Chinese shown smaller than 13 px, with its size and what holds it. */
async function smallChinese(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>()
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? ''
      const el = n.parentElement
      if (!el || !/\p{Script=Han}/u.test(text)) continue
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
      // Words kept for screen readers alone, in a box of a pixel.
      const box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 13) out.add(`${el.className || el.tagName}: «${text.trim().slice(0, 20)}» ${size}px`)
    }
    return [...out]
  })
}

async function sideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** The value of one of the type's tokens, as the page has it. */
function token(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

async function everyPageFits(page: Page) {
  for (const sub of PAGES) {
    await page.goto(coursePath(sub))
    await expect(page.locator('.page-header').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await cutShort(page), `${sub || 'overview'}: words past their control's edges`).toEqual([])
    expect(await sideways(page), `${sub || 'overview'}: the page scrolls sideways`).toBeLessThanOrEqual(0)
    expect(await smallChinese(page), `${sub || 'overview'}: Chinese under 13 px`).toEqual([])
  }
}

test('Chinese takes the two smallest sizes a step larger and strong text at 500; English as before', async ({
  page,
}) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath('approvals'))
  await expect(page.locator('.course-head__code')).toBeVisible()
  expect([await token(page, '--app-text-xs'), await token(page, '--app-text-sm')]).toEqual(['12px', '13px'])
  const english = await page.locator('.course-head__code').evaluate((el) => {
    const s = getComputedStyle(el)
    return [s.fontSize, s.fontWeight]
  })
  expect(english).toEqual(['13px', '600'])

  await inTraditionalChinese(page)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.locator('.course-head__code')).toBeVisible()
  expect([await token(page, '--app-text-xs'), await token(page, '--app-text-sm')]).toEqual(['13px', '14px'])
  expect(await token(page, '--app-weight-strong')).toBe('500')
  const chinese = await page.locator('.course-head__code').evaluate((el) => {
    const s = getComputedStyle(el)
    return [s.fontSize, s.fontWeight]
  })
  expect(chinese).toEqual(['14px', '500'])
  // Element Plus's small text too: a tag's words, and its tooltips'.
  const tag = page.locator('.course-head .el-tag').first()
  await expect(tag).toBeVisible()
  expect(await tag.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px')
})

test('strong text with no rule of its own takes the strong weight, not the browser’s bold', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.yuki)
  const attempt = page.locator('.my-work__attempt strong').first()
  await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
  await expect(attempt).toBeVisible()
  expect(await attempt.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600')
  await inTraditionalChinese(page)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(attempt).toBeVisible()
  // 「第 1 次」: 500, which Noto Sans has, not a 700 it would set for the browser's bold.
  expect(await attempt.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('500')
})

test('a date picker’s days, months and time panel set Chinese at 13 px or more', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await inTraditionalChinese(page)
  await page.goto(coursePath('assignments'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await page.locator('.page-header__actions .el-button--primary').click()
  const due = page.locator('.assignment-form__due')
  await expect(due).toBeVisible()
  await due.locator('.el-input__wrapper').click()
  const panel = page.locator('.el-picker-panel.el-date-picker:visible')
  await expect(panel.locator('.el-date-table')).toBeVisible()
  // 日 一 二 … 六 over the days, and 此刻 and 確定 under them.
  const weekday = panel.locator('.el-date-table th').first()
  expect(await weekday.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px')
  expect(await smallChinese(page), 'the days').toEqual([])
  // The months, from the month at the panel's head: 一月 to 十二月.
  await panel.locator('.el-date-picker__header-label').nth(1).click()
  await expect(panel.locator('.el-month-table')).toBeVisible()
  expect(await smallChinese(page), 'the months').toEqual([])
  // Back to the days with a month, then the time panel, from the time field at the panel's head: 取消 and 確定.
  await panel.locator('.el-month-table td').first().click()
  await expect(panel.locator('.el-date-table')).toBeVisible()
  await panel.locator('.el-date-picker__time-header .el-date-picker__editor-wrap').nth(1).locator('input').click()
  await expect(page.locator('.el-time-panel:visible .el-time-panel__btn.confirm')).toBeVisible()
  expect(await smallChinese(page), 'the time panel').toEqual([])
})

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('nothing of a course’s pages is cut short, in Chinese or English, and no Chinese is under 13 px', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await everyPageFits(page)
    await inTraditionalChinese(page)
    await everyPageFits(page)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('nothing of a course’s pages is cut short, in Chinese or English, and no Chinese is under 13 px', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await everyPageFits(page)
    await inTraditionalChinese(page)
    await everyPageFits(page)
  })
})
