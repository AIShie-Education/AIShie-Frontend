/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { coursePath, demo, signIn, signInAsRoot } from './support'

// What the shared components draw, as a browser draws it (design wave 3, docs/CONVENTIONS.md "Tags",
// "Buttons", "Notes and alerts", "Empty places", "Filters"): on the pages that hold most of them, at a
// laptop's size and a phone's, in both themes, every tag, chip, badge, button, agent's avatar, note and
// empty place is a box with corners of 4 px at most (the app's are 2), never a pill; none casts a shadow,
// only a stroke (an inset line, or a ring with no blur and no offset); no button but the one main action
// and a confirmation's last step has a ground, and none has an edge (a text button's is none); an agent's
// avatar carries no light of the brand's; a note and where data goes have no ground and no box, a rule at
// their left; an empty place draws no picture (an action in its slot keeps its icon). Element Plus's own
// round marks (a radio, a dot) are not these components, and are left to the audit of every element.

/** What breaks the look, by element; an empty list where nothing does. */
function offences(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility === 'visible'
    }
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} «${(el.textContent ?? '').trim().slice(0, 24)}»`
    const transparent = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
    const corners = (cs: CSSStyleDeclaration) =>
      [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map(
        (v) => parseFloat(v) || 0,
      )
    /** A shadow that is a stroke: no blur, and inset, or a ring of no offset and 2 px at most. */
    const stroke = (shadow: string) =>
      shadow === 'none' ||
      shadow
        .split(/,(?![^(]*\))/)
        .map((s) => s.replace(/(rgba?|color)\([^)]*\)/g, '').trim())
        .every((s) => {
          const inset = /\binset\b/.test(s)
          const [x = 0, y = 0, blur = 0, spread = 0] = (s.match(/-?[\d.]+px|\b0\b/g) ?? []).map((n) => parseFloat(n))
          return blur === 0 && (inset || (x === 0 && y === 0 && Math.abs(spread) <= 2))
        })
    const SELECTORS = [
      '.el-tag',
      '.el-check-tag',
      '.el-badge__content:not(.is-dot)',
      '.ai-badge',
      '.agent-badge__owner',
      '.el-button',
      '.el-radio-button__inner',
      '.agent-avatar',
      '.app-note',
      '.data-flow',
      '.app-empty',
    ]
    for (const el of document.querySelectorAll(SELECTORS.join(','))) {
      if (!visible(el)) continue
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const radius = Math.max(...corners(cs))
      if (radius > 4) out.push(`${name(el)}: corners of ${radius}px${radius >= r.height / 2 - 0.5 ? ' (a pill)' : ''}`)
      if (!stroke(cs.boxShadow)) out.push(`${name(el)}: a shadow, ${cs.boxShadow}`)
    }
    // Buttons: a solid ground only for the one main action and a confirmation's last step; no edge on any.
    for (const el of document.querySelectorAll('.el-button')) {
      if (!visible(el)) continue
      const cs = getComputedStyle(el)
      const solid =
        /\bel-button--(primary|danger|success|warning|info)\b/.test(el.className) &&
        !/\bis-(text|link|plain)\b/.test(el.className)
      if (solid || el.classList.contains('is-disabled')) continue
      if (!transparent(cs.backgroundColor)) out.push(`${name(el)}: a ground at rest, ${cs.backgroundColor}`)
      const edge = cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0 && !transparent(cs.borderTopColor)
      if (edge) out.push(`${name(el)}: an outline, ${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`)
      if (!el.classList.contains('is-link') && cs.borderTopStyle !== 'none')
        out.push(`${name(el)}: a text button with an edge's style, ${cs.borderTopStyle}`)
    }
    for (const el of document.querySelectorAll('.agent-avatar')) {
      if (visible(el) && el.querySelector('.agent-avatar__light')) out.push(`${name(el)}: the brand's light`)
    }
    for (const el of document.querySelectorAll('.app-note, .data-flow:not(.is-compact)')) {
      if (!visible(el)) continue
      const cs = getComputedStyle(el)
      if (!transparent(cs.backgroundColor)) out.push(`${name(el)}: a ground, ${cs.backgroundColor}`)
      for (const side of ['Top', 'Right', 'Bottom'] as const)
        if (cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
          out.push(`${name(el)}: a box's ${side.toLowerCase()} edge`)
      if (cs.borderLeftStyle === 'none') out.push(`${name(el)}: no rule at its left`)
    }
    for (const el of document.querySelectorAll('.app-empty')) {
      if (visible(el) && el.querySelector(':scope > svg, :scope > img')) out.push(`${name(el)}: a picture`)
    }
    return out
  })
}

/** Reads a page once it has settled, the pointer off it, so that nothing is hovered. */
async function audit(page: Page, path: string): Promise<string[]> {
  await page.goto(path)
  await expect(page.locator('h1').first()).toBeAttached()
  await page.waitForLoadState('networkidle')
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  return offences(page)
}

const SIZES = [
  { name: 'a laptop', width: 1280, height: 800, touch: false },
  { name: 'a phone', width: 390, height: 844, touch: true },
]

for (const theme of ['light', 'dark'] as const)
  for (const size of SIZES)
    test(`tags, chips, badges, buttons, avatars and notes are straight-cornered, flat and unboxed on ${size.name}, ${theme}`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const d = demo()
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        isMobile: size.touch,
        hasTouch: size.touch,
        locale: 'en-US',
      })
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('aishie.theme', t)
        } catch {}
      }, theme)
      const page = await context.newPage()
      try {
        await signIn(page, d.actors.instructor)
        const found: Record<string, string[]> = {}
        for (const sub of ['materials', 'members', 'activity', 'approvals', `members/${d.actors.grader.member_id}`]) {
          const o = await audit(page, coursePath(sub))
          if (o.length) found[sub] = o
        }
        expect(found).toEqual({})
      } finally {
        await context.close()
      }
    })

test('a proposal’s decisions: Approve the one solid button, Request changes and Reject words without an edge', async ({
  page,
}) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath('approvals'))
  const card = page.locator('.action-card').first()
  await expect(card).toBeVisible()
  await page.mouse.move(0, 0)
  const look = (name: string) =>
    card.getByRole('button', { name, exact: true }).evaluate((el) => {
      const cs = getComputedStyle(el)
      return { ground: cs.backgroundColor, edge: cs.borderTopStyle }
    })
  expect((await look('Approve')).ground).not.toBe('rgba(0, 0, 0, 0)')
  for (const name of ['Request changes', 'Reject'])
    expect(await look(name)).toEqual({ ground: 'rgba(0, 0, 0, 0)', edge: 'none' })
})

test('a page with nothing to show says so at its left, with no picture', async ({ page }) => {
  await signInAsRoot(page)
  await page.goto('/admin/runtime')
  const empty = page.locator('.app-empty--page')
  await expect(empty).toContainText('This server has no agent service')
  await expect(empty.locator('svg')).toHaveCount(0)
  const [box, title] = await Promise.all([empty.boundingBox(), empty.locator('.app-empty__title').boundingBox()])
  expect(title!.x).toBe(box!.x)
  expect(await empty.evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/^(start|left)$/)
})
