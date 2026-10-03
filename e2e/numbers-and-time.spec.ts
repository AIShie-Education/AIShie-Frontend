/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { call, chooseLanguage, coursePath, demo, signIn } from './support'

// Times are on the reader's clock, and a cut-off says which clock that is:
// an assignment's due date names the reader's time zone in the page's
// language, gives the exact instant in UTC on hover, and the form that sets
// it names the zone a date is picked in. The reader here keeps Hong Kong's
// time, as the school's people mostly do; Core has no school's zone to give.

/** The assignment's due date as Core holds it, and on a clock in Hong Kong (UTC+8, no summer time). */
async function hw1Due() {
  const d = demo()
  const got = await call(
    d.actors.instructor.token,
    'GET',
    `/v1/courses/${d.course.id}/assignments/${d.course.assignments.hw1}`,
  )
  const due = got.body.result?.due_at as string
  expect(due, 'HW1 has a due date').toBeTruthy()
  const at = Date.parse(due)
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  return { inHongKong: iso(at + 8 * 3600_000), utc: `${iso(at)} UTC` }
}

async function openHw1(page: Page) {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath(`assignments/${d.course.assignments.hw1}`))
  const line = page.locator('.page-header__subtitle')
  await expect(line).toBeVisible()
  return line
}

test.describe('a cut-off, on the reader’s clock', () => {
  test.use({ timezoneId: 'Asia/Hong_Kong' })

  test('an assignment’s due date names the time zone, the exact UTC on hover, and the form names the zone it is picked in', async ({
    page,
  }) => {
    const { inHongKong, utc } = await hw1Due()
    const line = await openHw1(page)
    await expect(line).toHaveText(
      new RegExp(`^Due ${inHongKong} \\(Hong Kong Standard Time\\), in \\d+ days · 10 points$`),
    )
    await line.locator('time').first().hover()
    const tip = page.getByRole('tooltip').filter({ hasText: 'UTC' })
    await expect(tip).toContainText(utc)
    await expect(tip).toContainText(/in \d+ days/)
    await page.mouse.move(0, 0)

    await page.locator('.page-header').getByRole('button', { name: 'Edit' }).click()
    const form = page.getByRole('dialog')
    await expect(form.locator('.assignment-form__due .app-form-hint')).toHaveText(
      'On your clock, in Hong Kong Standard Time. Work handed in after the due date is marked late.',
    )
    await form.getByRole('button', { name: 'Cancel' }).click()

    await chooseLanguage(page, '繁體中文')
    await expect(line).toHaveText(new RegExp(`^截止：香港標準時間 ${inHongKong}（\\d+ 天內） · 滿分10分$`))
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('the due date and its zone fit the screen, in English and in Chinese', async ({ page }) => {
      const line = await openHw1(page)
      await expect(line).toContainText('(Hong Kong Standard Time)')
      const fits = () =>
        page.evaluate(() => {
          const main = document.querySelector('.app-main')!
          return [
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            main.scrollWidth - main.clientWidth,
          ]
        })
      expect(await fits()).toEqual([0, 0])
      const box = (await line.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(390)

      // Read in Traditional Chinese from the next load on (the menu that chooses it is in the drawer here).
      await page.addInitScript(() => {
        try {
          localStorage.setItem('aishie.locale', 'zh-Hant')
        } catch {}
      })
      await page.reload()
      await expect(line).toContainText('香港標準時間')
      expect(await fits()).toEqual([0, 0])
    })
  })
})
