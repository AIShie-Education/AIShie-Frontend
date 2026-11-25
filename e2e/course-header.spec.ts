/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { coursePath, demo, inTraditionalChinese, signIn } from './support'

// Where a course's pages start their content (docs/CONVENTIONS.md, "A course's pages"): on a laptop's
// screen, 1280 × 800, with the side bar open, within 200 px of the window's top, measured where the
// browser draws the first thing under the page's header, as the instructor sees each tab's page, in
// English and in Chinese, whose smaller steps are a size larger. The pages known to miss it, by a line
// of their own, miss it by no more than they did. Design wave 3 once stopped a page's subtitle at the
// measure: it wrapped on nearly every one of these pages, which then started at 201 px and more, and no
// test said so.

/** Each tab's page, by its path under the course. */
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
  'groups',
  'agents',
  'activity',
  'my-actions',
]

/** The pages known to miss it, and where they start at most: their subtitle, or the grades' own tabs and it, take a second line. */
const KNOWN: Record<'en' | 'zh-Hant', Record<string, number>> = {
  en: { submissions: 201, grades: 214, gradebook: 214, scheme: 214 },
  'zh-Hant': { submissions: 207 },
}

for (const lang of ['en', 'zh-Hant'] as const)
  test(`a course’s pages start their content within 200 px of the window’s top, in ${lang === 'en' ? 'English' : 'Chinese'}`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, demo().actors.instructor)
    if (lang === 'zh-Hant') await inTraditionalChinese(page)
    const late: Record<string, number> = {}
    for (const sub of PAGES) {
      await page.goto(coursePath(sub))
      const header = page.locator('.page-header').first()
      await expect(header).toBeVisible()
      await expect(page.locator('#side-bar')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      // Its content loaded, and the faces its words are set in, which decide where a line wraps.
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      const top = await header.evaluate((h) => Math.round(h.nextElementSibling?.getBoundingClientRect().top ?? 0))
      expect(top, `${sub || 'overview'}: something under the header`).toBeGreaterThan(0)
      if (top > (KNOWN[lang][sub] ?? 200)) late[sub || 'overview'] = top
    }
    expect(late).toEqual({})
  })
