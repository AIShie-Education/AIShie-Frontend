/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { coursePath, demo, inTraditionalChinese, photograph, signIn } from './support'

// A tab left open runs the build it loaded. While it is shown it reads
// index.html again every five minutes, and says so, quietly, when another
// build is live: never reloading by itself. Against the build the tests
// serve (vite preview, as CI runs them), which is one build for the whole
// run, it says nothing; the dev server has no build to compare, and is not
// asked.
test.describe('a newer build', () => {
  test.skip(!process.env.E2E_PREVIEW, 'the dev server serves no build to compare with')

  test('is looked for every five minutes, and said nothing of while the build served is the one loaded', async ({
    page,
  }) => {
    await page.clock.install()
    const reads: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/' && r.resourceType() === 'fetch') reads.push(r.headers()['cache-control'] ?? '')
    })
    await signIn(page, demo().actors.yuki)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    await page.clock.fastForward('05:01')
    await expect.poll(() => reads.length).toBeGreaterThan(0)
    await page.waitForTimeout(500)
    await expect(page.locator('.new-version')).toHaveCount(0)
  })

  test('is said when index.html names another build, and loads only when asked', async ({ page }) => {
    await page.clock.install()
    await signIn(page, demo().actors.yuki)
    await inTraditionalChinese(page)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    let loads = 0
    page.on('load', () => loads++)
    // What the server would answer after a deploy: the same page, naming another entry.
    const html = await (await page.request.get('/')).text()
    await page.route(
      (url) => url.pathname === '/',
      async (route) => {
        if (route.request().resourceType() !== 'fetch') return route.continue()
        await route.fulfill({
          contentType: 'text/html',
          body: html.replace(/\/assets\/index-[^"']+\.js/, '/assets/index-NEWBUILD.js'),
        })
      },
    )
    await page.clock.fastForward('05:01')
    const notice = page.locator('.new-version')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toContainText('已有新版本')
    await photograph(page, 'new-version-notice')
    // It waits: nothing reloads meanwhile, and the page still works under it.
    await page.clock.fastForward('10:00')
    expect(loads).toBe(0)
    await notice.getByRole('button', { name: '稍後' }).click()
    await expect(notice).toHaveCount(0)
    await page.clock.fastForward('05:01')
    await page.waitForTimeout(300)
    await expect(notice).toHaveCount(0)
  })
})
