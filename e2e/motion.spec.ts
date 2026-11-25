/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

test('the global rule removes perceptible motion when the reader requests reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  const button = page.locator('button[type=submit]').first()
  await expect(button).toBeAttached()
  const motion = await button.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      transition: style.transitionDuration,
      transitionDelay: style.transitionDelay,
      animation: style.animationDuration,
      animationDelay: style.animationDelay,
      iterations: style.animationIterationCount,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }
  })
  const seconds = (value: string) => value.split(',').map((part) => (part.trim().endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part)))
  for (const duration of seconds(motion.transition)) expect(duration).toBeLessThanOrEqual(0.001)
  for (const duration of seconds(motion.animation)) expect(duration).toBeLessThanOrEqual(0.001)
  expect(seconds(motion.transitionDelay)).toEqual([0])
  expect(seconds(motion.animationDelay)).toEqual([0])
  expect(motion.iterations).toBe('1')
  expect(motion.scroll).toBe('auto')
})
