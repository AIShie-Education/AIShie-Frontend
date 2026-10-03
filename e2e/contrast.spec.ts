/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  coursePath,
  demo,
  openChat,
  photograph,
  pickOption,
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
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  return wordsBelowAA(page)
}

/** Hovers a table's row, at its left edge, where nothing in it has a tooltip of its own. */
async function hoverRow(row: Locator) {
  await row.hover({ position: { x: 4, y: 4 } })
}

const PAGES = ['', 'materials', 'assignments', 'submissions', 'grades', 'gradebook', 'members', 'approvals', 'activity']

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
    // The chat's window, over the overview.
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
}
