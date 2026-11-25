/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { call, chooseLanguage, coursePath, demo, signIn } from './support'

// A cut-off names its clock, gives the exact instant in UTC without depending
// on hover, and its picker says which zone it uses. The integration Core is
// configured with Asia/Hong_Kong as the school's zone, so a reader elsewhere
// sees school time beside their own; unset behaviour is covered by unit tests.

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
  const inZone = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at))
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  }
  return { at, inHongKong: iso(at + 8 * 3600_000), inLondon: inZone('Europe/London'), utc: `${iso(at)} UTC` }
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
    const due = line.locator('time').first()
    await expect(due).toHaveAttribute('tabindex', '0')
    await due.focus()
    await expect(due).toBeFocused()
    await expect(page.getByRole('tooltip').filter({ hasText: 'UTC' })).toContainText(utc)
    const description = await due.getAttribute('aria-description')
    expect(description).toContain('Hong Kong Standard Time')
    expect(description).toContain(utc)
    expect(await line.locator('.time-text__zone').evaluate((el) => el.getClientRects().length)).toBe(1)
    await page.mouse.move(0, 0)

    await page.locator('.page-header').getByRole('button', { name: 'Edit' }).click()
    const form = page.getByRole('dialog')
    await expect(form.locator('.assignment-form__due .app-form-hint')).toHaveText(
      'On the school’s clock, in Hong Kong Standard Time. Work handed in after the due date is marked late.',
    )
    await form.getByRole('button', { name: 'Cancel' }).click()

    await chooseLanguage(page, '繁體中文')
    await expect(line).toHaveText(new RegExp(`^截止：香港標準時間 ${inHongKong}（\\d+天內） · 滿分10分$`))
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

test.describe('a cut-off on the school’s clock, with the reader abroad', () => {
  test.use({ timezoneId: 'Europe/London' })

  test('school time comes first and reader time is beside it, and the picker says it uses school time', async ({
    page,
  }) => {
    const { at, inHongKong, inLondon } = await hw1Due()
    const readerZone = await page.evaluate(
      (ms) =>
        new Intl.DateTimeFormat('en', { timeZone: 'Europe/London', timeZoneName: 'long' })
          .formatToParts(new Date(ms))
          .find((p) => p.type === 'timeZoneName')!.value,
      at,
    )
    const line = await openHw1(page)
    await expect(line).toContainText(
      `School: ${inHongKong} (Hong Kong Standard Time); your time: ${inLondon} (${readerZone})`,
    )
    await page.locator('.page-header').getByRole('button', { name: 'Edit' }).click()
    const form = page.getByRole('dialog')
    await expect(form.locator('.assignment-form__due .app-form-hint')).toHaveText(
      'On the school’s clock, in Hong Kong Standard Time. Work handed in after the due date is marked late.',
    )
  })
})
