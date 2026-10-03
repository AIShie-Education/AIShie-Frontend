/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { coursePath, demo, openChat, photograph, pickOption, signIn, signInAsRoot } from './support'

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

interface Miss {
  text: string
  where: string
  fg: string
  bg: string
  ratio: number
}

/** The words on the page that read at less than AA, with their colours. */
function misses(page: Page): Promise<Miss[]> {
  return page.evaluate(() => {
    type Rgba = { r: number; g: number; b: number; a: number }
    const parse = (s: string): Rgba | null => {
      let m = /^rgba?\(([^)]+)\)$/.exec(s)
      if (m) {
        const p = m[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number)
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
      }
      m = /^color\(srgb ([^)]+)\)$/.exec(s)
      if (m) {
        const p = m[1]
          .split(/[\s/]+/)
          .filter(Boolean)
          .map(Number)
        return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
      }
      return null
    }
    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    })
    const luminance = ({ r, g, b }: Rgba) => {
      const f = (v: number) => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (x: Rgba, y: Rgba) => {
      const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
      return (hi + 0.05) / (lo + 0.05)
    }
    const hex = ({ r, g, b }: Rgba) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
    const page = parse(getComputedStyle(document.body).backgroundColor)!
    /** The ground under an element: its own and its ancestors' backgrounds, laid one over another; null under an image. */
    const groundOf = (el: Element): Rgba | null => {
      const layers: Rgba[] = []
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.backgroundImage !== 'none') return null
        const bg = parse(cs.backgroundColor)
        if (bg && bg.a > 0) {
          layers.push(bg)
          if (bg.a >= 1) break
        }
      }
      let ground = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop()! : page
      while (layers.length) ground = over(layers.pop()!, ground)
      return ground
    }
    const out: Miss[] = []
    for (const el of document.querySelectorAll('body *')) {
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
      // Words only: a separator says nothing a reader could miss.
      if (!/[\p{L}\p{N}]/u.test(text)) continue
      const box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility !== 'visible' || cs.clip !== 'auto') continue
      if (el.closest('[aria-hidden="true"], .is-disabled, [disabled], [aria-disabled="true"]')) continue
      let opacity = 1
      for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
      if (opacity < 0.1) continue
      const ink = parse(cs.color)
      const ground = groundOf(el)
      if (!ink || !ground) continue
      const fg = over({ ...ink, a: ink.a * opacity }, ground)
      const r = ratio(fg, ground)
      const size = parseFloat(cs.fontSize)
      const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66)
      if (r < (large ? 3 : 4.5))
        out.push({
          text: text.slice(0, 40),
          where: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
          fg: hex(fg),
          bg: hex(ground),
          ratio: Math.round(r * 100) / 100,
        })
    }
    return out
  })
}

/** Reads the page once it has settled: past a tab's or a row's fade, or a hovered row's. */
async function settled(page: Page): Promise<Miss[]> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  return misses(page)
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
