/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  coursePath,
  demo,
  openChat,
  photograph,
  pickOption,
  ratioForReport,
  signIn,
  signInAsRoot,
  wordsBelowAA,
  type ContrastMiss as Miss,
} from './support'

// Every word on the pages a teacher spends the day in reads at WCAG AA,
// 4.5:1 (3:1 at 24 px, or 18.66 px bold), against the ground it is drawn on,
// in the light theme and in the dark one: the tokens' pairs
// (src/styles/contrast.spec.ts) as the pages put them together, a meta line
// on a hovered fill or a placeholder's ink on a card included. A page is
// read as it first shows, and again in the states that lay another ground
// under its text: a table's row hovered, a seat's permission changed while
// they are edited (the waiting pill's ground), and the administration's
// presets, hovered. A control that is disabled is not held to it, as WCAG
// does not; nor is a separator (a dot, a dash), nor text kept for a screen
// reader alone.

/** Reads the page once it has settled: past a tab's or a row's fade, or a hovered row's. */
async function settled(page: Page): Promise<Miss[]> {
  // Long-lived AR/SSE traffic is not a page that failed to settle. Wait for
  // fonts and the short visual transition, not for network idle.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  return wordsBelowAA(page)
}

/** Hovers a table's row, at its left edge, where nothing in it has a tooltip of its own. */
async function hoverRow(row: Locator) {
  await row.hover({ position: { x: 4, y: 4 } })
}

const PAGES = ['', 'materials', 'assignments', 'submissions', 'grades', 'gradebook', 'scheme', 'members', 'approvals', 'activity']

for (const theme of ['light', 'dark'] as const) {
  test(`every word on a teacher's pages reads at AA in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000)
    const d = demo()
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('aishie.theme', t)
      } catch {}
    }, theme)
    await signIn(page, d.actors.instructor)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

    const found: Record<string, Miss[]> = {}
    const look = async (name: string) => {
      const m = await settled(page)
      if (m.length) found[name] = m
    }
    for (const sub of [
      ...PAGES,
      `documents/${d.course.documents.week1}`,
      `actions/${d.course.proposed_grade_action}`,
    ]) {
      await page.goto(coursePath(sub))
      await expect(page.locator('h1').first()).toBeAttached()
      await look(sub || 'overview')
      // Its first table's first row, hovered: Element Plus lays a fill under it.
      const row = page.locator('.el-table__body tr.el-table__row').first()
      if (await row.isVisible()) {
        await hoverRow(row)
        await look(`${sub || 'overview'}, a row hovered`)
        await page.mouse.move(0, 0)
      }
      if (sub === 'members') {
        // A selected chip keeps its AA label on its hover ground too (a tap
        // can leave that hover stuck on a touch screen).
        await page.locator('.filter-chips .el-check-tag.is-checked').hover()
        await look('members, the chosen chip hovered')
        await page.mouse.move(0, 0)
      }
    }
    // A seat's permissions being edited, one changed: its row lies on the waiting pill's ground, the
    // permission's key with it. Cancelled: the seat keeps what it has.
    await page.goto(coursePath(`members/${d.actors.observer.member_id}`))
    await page.getByRole('button', { name: 'Edit permissions' }).click()
    const changed = page.locator('.perm-editor__row').filter({ hasText: 'member_read' })
    await pickOption(page, changed.locator('.level-select'), 'Denied')
    await expect(changed).toHaveClass(/is-changed/)
    await look('a permission changed')
    await photograph(page, `contrast-perm-changed-${theme}`)
    await page.getByRole('button', { name: 'Cancel' }).click()
    // The chat's pane, beside the overview.
    await page.goto(coursePath())
    await openChat(page)
    await look('chat')
    await photograph(page, `contrast-${theme}`)

    expect(found).toEqual({})
  })

  test(`every word of the administration's presets reads at AA in the ${theme} theme, a row hovered`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('aishie.theme', t)
      } catch {}
    }, theme)
    await signInAsRoot(page)
    await page.goto('/admin/presets')
    // A permission's row of the presets side by side: its name, and its key under it.
    const row = page.locator('.preset-matrix .el-table__body tr.el-table__row').filter({ hasText: 'member_read' })
    await expect(row.first()).toBeVisible()
    const found: Record<string, Miss[]> = {}
    const first = await settled(page)
    if (first.length) found.presets = first
    await hoverRow(row.first())
    const hovered = await settled(page)
    if (hovered.length) found['presets, a row hovered'] = hovered
    await photograph(page, `contrast-presets-${theme}`)

    expect(found).toEqual({})
  })

  test(`every word on a student's course pages and chat reads at AA in the ${theme} theme`, async ({ page }) => {
    const d = demo()
    await page.addInitScript((t) => localStorage.setItem('aishie.theme', t), theme)
    await signIn(page, d.actors.yuki)
    const found: Record<string, Miss[]> = {}
    for (const sub of ['', 'materials', 'assignments', 'submissions', 'grades', 'activity']) {
      await page.goto(coursePath(sub))
      await expect(page.locator('h1').first()).toBeAttached()
      const misses = await settled(page)
      if (misses.length) found[sub || 'overview'] = misses
    }
    await page.goto(coursePath())
    await openChat(page)
    const chat = await settled(page)
    if (chat.length) found.chat = chat
    expect(found).toEqual({})
  })
}

test.describe('contrast on a phone in Traditional Chinese', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('a student’s course pages and chat are measured at 390×844', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await page.addInitScript(() => localStorage.setItem('aishie.locale', 'zh-Hant'))
    const found: Record<string, Miss[]> = {}
    for (const sub of ['', 'assignments', 'submissions', 'grades']) {
      await page.goto(coursePath(sub))
      await expect(page.locator('h1').first()).toBeAttached()
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
      const misses = await settled(page)
      if (misses.length) found[sub || 'overview'] = misses
    }
    await page.goto(coursePath())
    await page.locator('.app-chat-entry button').first().click()
    await expect(page.locator('#chat-panel')).toBeVisible()
    const chat = await settled(page)
    if (chat.length) found.chat = chat
    expect(found).toEqual({})
  })
})

test('the contrast reader measures visible aria-hidden text and fails rather than skipping an unmeasurable word', async ({
  page,
}) => {
  await page.setContent(`<style>
    body { background: #fff; }
    .quiet { color: #aaa; }
    .clipped { position: absolute; clip: rect(0, 0, 0, 0); }
  </style>
  <span class="quiet" aria-hidden="true">Visible hint</span>
  <span class="clipped">Screen reader alone</span>
  <div style="background-image: linear-gradient(transparent, transparent); color: #444">Gradient words</div>
  <span class="unparseable">Unparseable ink</span>`)
  await page.evaluate(() => {
    const original = window.getComputedStyle
    window.getComputedStyle = (el: Element) => {
      const style = original(el)
      if (!el.classList.contains('unparseable')) return style
      return new Proxy(style, { get: (target, key) => (key === 'color' ? 'oklch(50% 0.1 20)' : Reflect.get(target, key)) })
    }
  })
  const misses = await wordsBelowAA(page)
  expect(misses.find((m) => m.text === 'Visible hint')).toBeTruthy()
  expect(misses.find((m) => m.text === 'Gradient words')?.bg).toBe('ground not measurable')
  expect(misses.find((m) => m.text === 'Unparseable ink')?.bg).toBe('ink not measurable')
  expect(misses.find((m) => m.text === 'Screen reader alone')).toBeUndefined()
  expect(ratioForReport(4.4994)).toBe(4.49)
})
