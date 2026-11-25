/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { coursePath, demo, signIn } from './support'

// Latin data on a Chinese page must use the same complete faces as on an
// English one: accents past Latin-1, Vietnamese and smart apostrophes included.
test('Latin names and curly apostrophes use Plex alone on a Traditional Chinese page', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.addInitScript(() => localStorage.setItem('aishie.locale', 'zh-Hant'))
  await page.goto(coursePath('members'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  const name = page.locator('.el-table__body tr.el-table__row:first-child td:first-child')
  await expect(name).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.el-table__body tr.el-table__row:first-child td:first-child' })
  for (const text of ['Nguyễn Văn An', 'Łukasz Nowak', 'O’Brien']) {
    await name.evaluate((el, value) => {
      el.textContent = value
    }, text)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    expect(fonts.map((f) => f.familyName), text).toEqual(['IBM Plex Sans'])
  }
})

test('Han data marked on an English page takes the Chinese small size and loads Noto TC', async ({ page }) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath('members'))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const px = await page.evaluate(() => {
    const el = document.createElement('span')
    el.lang = 'zh-Hant'
    el.className = 'font-probe'
    el.style.fontSize = 'var(--app-text-xs)'
    el.textContent = '林家明'
    document.body.append(el)
    return getComputedStyle(el).fontSize
  })
  const { root } = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.font-probe' })
  await expect
    .poll(async () => {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      return fonts.some((f) => f.familyName.startsWith('Noto Sans TC'))
    })
    .toBe(true)
  expect(px).toBe('13px')
})
