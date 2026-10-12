/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { coursePath, demo, signIn, signInAsRoot, wordsBelowAA } from './support'

// What the shared components draw, as a browser draws it (design wave 3, docs/CONVENTIONS.md "Tags",
// "Buttons", "Notes and alerts", "Empty places", "Filters"): on the pages that hold most of them, at a
// laptop's size and a phone's, in both themes, every tag, chip, badge, button, agent's avatar, note and
// empty place is a box with corners of 4 px at most (the app's are 2), never a pill; none casts a shadow,
// only a stroke (an inset line, or a ring with no blur and no offset); no tag but a count lies on a solid
// ground, which is a button's (a level of autonomy is a label, and autonomous an outline in the faint line,
// as an attribute's is); no button but the one main action and a confirmation's last step has a ground,
// and none has an edge (a text button's is none); an agent's avatar carries no light of the brand's; a note
// and where data goes have no ground and no box, a rule at their left; an empty place draws no picture (an
// action in its slot keeps its icon). Element Plus's own round marks (a radio, a dot) are not these
// components, and are left to the audit of every element.
// A filter's chip has a control's edge, never a tag's outline; what is chosen, a chip or a segmented
// control's part, has a bar at its foot, which says so without its hue; and what failed to load says so in
// red, with Retry's icon in its column.

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
    // Tags: only a count is solid; any other lies on no ground, or on a tint a step from the ground under it, never
    // on a button's (a level of autonomy among them: autonomous was solid ink, and read as a button).
    const rgb = (c: string) => {
      const p = (c.match(/[\d.]+/g) ?? []).map(Number)
      const k = c.startsWith('color(') ? 255 : 1
      return { r: p[0] * k, g: p[1] * k, b: p[2] * k, a: p.length > 3 ? p[3] : 1 }
    }
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) =>
      [r, g, b]
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const under = (el: Element) => {
      for (let e = el.parentElement; e; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor
        if (!transparent(bg)) return rgb(bg)
      }
      return rgb(getComputedStyle(document.body).backgroundColor)
    }
    for (const el of document.querySelectorAll('.el-tag:not(.app-tag--count)')) {
      if (!visible(el)) continue
      const bg = getComputedStyle(el).backgroundColor
      if (transparent(bg)) continue
      const own = rgb(bg)
      const base = under(el)
      const laid = {
        r: own.r * own.a + base.r * (1 - own.a),
        g: own.g * own.a + base.g * (1 - own.a),
        b: own.b * own.a + base.b * (1 - own.a),
      }
      const [hi, lo] = [lum(laid), lum(base)].sort((x, y) => y - x)
      const ratio = (hi + 0.05) / (lo + 0.05)
      if (ratio >= 1.5) out.push(`${name(el)}: a solid ground, ${bg}, ${ratio.toFixed(2)}:1 from the ground under it`)
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
        for (const sub of [
          'materials',
          'members',
          'activity',
          'approvals',
          `members/${d.actors.grader.member_id}`,
          'agents',
        ]) {
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

/**
 * How what can be chosen is drawn, as the browser draws it: on Members, a filter's chip that is not chosen
 * (its edge against its ground, and whether a tag's outline is drawn in the same colour), and the bar at the
 * foot of each chip (its contrast on the chip's ground; 0 for none); elsewhere, each part of a segmented control.
 */
function chosenLooks(what: 'chips' | 'segments') {
  const lum = (c: string) => {
    const [r = 0, g = 0, b = 0] = (c.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [x = 0, y = 0] = [lum(a), lum(b)].sort((p, q) => q - p)
    return +((x + 0.05) / (y + 0.05)).toFixed(2)
  }
  const clear = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c)
  /** Its own ground, or the nearest one under it. */
  const ground = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor
      if (!clear(bg)) return bg
    }
    return 'rgb(255, 255, 255)'
  }
  /** Its shadows: each one's colour, its four lengths, and whether it is inset. */
  const shadows = (el: Element) =>
    getComputedStyle(el)
      .boxShadow.split(/,(?![^(]*\))/)
      .filter((s) => s.trim() !== 'none')
      .map((s) => {
        const colour = s.match(/rgba?\([^)]*\)/)?.[0] ?? ''
        const [x = 0, y = 0, blur = 0, spread = 0] = (s.replace(colour, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
        return { colour, x, y, blur, spread, inset: /\binset\b/.test(s) }
      })
  /** A bar at its foot (an inset line 2 px or more high along its bottom alone), by its contrast on its ground. */
  const bar = (el: Element) => {
    const b = shadows(el).find((s) => s.inset && s.x === 0 && s.y <= -2 && s.blur === 0 && s.spread === 0)
    return b ? contrast(b.colour, ground(el)) : 0
  }
  if (what === 'segments')
    return {
      parts: [...document.querySelectorAll('.el-radio-button')].map((p) => ({
        chosen: p.classList.contains('is-active'),
        bar: bar(p.querySelector('.el-radio-button__inner')!),
      })),
    }
  const chip = document.querySelector('.filter-chips .el-check-tag:not(.is-checked)')!
  const tag = document.querySelector('.app-tag--outline')!
  const edge = shadows(chip).find((s) => s.inset && s.spread === 1)?.colour ?? ''
  return {
    chipEdge: contrast(edge, ground(chip)),
    sameEdgeAsTag: edge === getComputedStyle(tag).borderTopColor,
    chips: [...document.querySelectorAll('.filter-chips .el-check-tag')].map((c) => ({
      chosen: c.classList.contains('is-checked'),
      bar: bar(c),
    })),
  }
}

for (const theme of ['light', 'dark'] as const)
  test(`a filter’s chip is drawn as a control and an identity’s tag as a label, and what is chosen has a bar at its foot, not its hue alone, ${theme}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('aishie.theme', t)
      } catch {}
    }, theme)
    const page = await context.newPage()
    try {
      await signIn(page, demo().actors.instructor)
      await page.goto(coursePath('members'))
      await expect(page.locator('.filter-chips .el-check-tag.is-checked')).toBeVisible()
      await expect(page.locator('.app-tag--outline').first()).toBeVisible()
      await page.mouse.move(0, 0)
      const members = (await page.evaluate(chosenLooks, 'chips' as const)) as {
        chipEdge: number
        sameEdgeAsTag: boolean
        chips: { chosen: boolean; bar: number }[]
      }
      // A chip's edge is a control's, 3:1 as a field's is; a tag's outline is not, so that the two are told apart.
      expect(members.chipEdge).toBeGreaterThanOrEqual(3)
      expect(members.sameEdgeAsTag).toBe(false)
      // The chosen chip has a bar that reads on its ground at 3:1 or more; the others have none.
      expect(members.chips.filter((c) => c.chosen)).toHaveLength(1)
      for (const c of members.chips)
        if (c.chosen) expect(c.bar).toBeGreaterThanOrEqual(3)
        else expect(c.bar).toBe(0)

      // The students' own agents: a segmented control whose chosen part, the policy in force, is marked the same way.
      await page.goto(coursePath('agents'))
      await expect(page.locator('.el-radio-button.is-active').first()).toBeVisible()
      await page.mouse.move(0, 0)
      const { parts } = (await page.evaluate(chosenLooks, 'segments' as const)) as {
        parts: { chosen: boolean; bar: number }[]
      }
      expect(parts.length).toBeGreaterThan(1)
      for (const p of parts)
        if (p.chosen) expect(p.bar).toBeGreaterThanOrEqual(3)
        else expect(p.bar).toBe(0)
    } finally {
      await context.close()
    }
  })

/**
 * Each level of autonomy's tag shown, as the browser draws it: its level, its ground's contrast with the ground under
 * it (1 where it has none), its edge's colour and width, and its words' colour; and the faint line an attribute's
 * outline is drawn in, and the ink.
 */
function levelLooks() {
  const rgb = (c: string) => {
    const p = (c.match(/[\d.]+/g) ?? []).map(Number)
    const k = c.startsWith('color(') ? 255 : 1
    return { r: p[0] * k, g: p[1] * k, b: p[2] * k, a: p.length > 3 ? p[3] : 1 }
  }
  const clear = (c: string) => c === 'transparent' || rgb(c).a === 0
  const lum = ({ r, g, b }: { r: number; g: number; b: number }) =>
    [r, g, b]
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const under = (el: Element) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor
      if (!clear(bg)) return rgb(bg)
    }
    return rgb(getComputedStyle(document.body).backgroundColor)
  }
  /** A token's colour as the browser writes a computed one. */
  const token = (name: string) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  }
  return {
    line: token('--app-line-strong'),
    ink: token('--app-ink'),
    tags: [...document.querySelectorAll('.el-tag.app-level-tag')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const cs = getComputedStyle(el)
        const own = rgb(cs.backgroundColor)
        const base = under(el)
        const laid = {
          r: own.r * own.a + base.r * (1 - own.a),
          g: own.g * own.a + base.g * (1 - own.a),
          b: own.b * own.a + base.b * (1 - own.a),
        }
        const [hi, lo] = [lum(laid), lum(base)].sort((x, y) => y - x)
        return {
          level: ['denied', 'confirm_required', 'pending_review', 'autonomous'].find((l) =>
            el.classList.contains(`is-${l}`),
          ),
          text: (el.textContent ?? '').trim(),
          ground: +((hi + 0.05) / (lo + 0.05)).toFixed(2),
          edge: cs.borderTopColor,
          edgeWidth: cs.borderTopWidth,
          words: cs.color,
        }
      }),
  }
}

for (const theme of ['light', 'dark'] as const)
  test(`a level of autonomy is a label, never on a button's solid ground, and autonomous an outline in the faint line, ${theme}`, async ({
    browser,
  }) => {
    type Looks = Awaited<ReturnType<typeof levelLooks>>
    const check = (looks: Looks, where: string) => {
      expect(looks.tags.length, where).toBeGreaterThan(0)
      for (const tag of looks.tags) expect(tag.ground, `${where}: ${tag.text}`).toBeLessThan(1.5)
      const free = looks.tags.filter((tag) => tag.level === 'autonomous')
      expect(free.length, where).toBeGreaterThan(0)
      for (const tag of free) {
        expect(tag.ground, `${where}: ${tag.text}`).toBe(1)
        expect({ edge: tag.edge, width: tag.edgeWidth, words: tag.words }, `${where}: ${tag.text}`).toEqual({
          edge: looks.line,
          width: '1px',
          words: looks.ink,
        })
      }
      // Each other level keeps a look of its own: none is drawn as autonomous is.
      for (const tag of looks.tags.filter((t) => t.level !== 'autonomous'))
        expect(tag.ground === 1 && tag.edge === looks.line, `${where}: ${tag.text}`).toBe(false)
    }
    /** A page of its own for each person, in the theme. */
    const pageIn = async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('aishie.theme', t)
        } catch {}
      }, theme)
      return context.newPage()
    }

    // The course's agents, where an agent the teacher does not manage says how it replies: Answers at once.
    const page = await pageIn()
    try {
      await signIn(page, demo().actors.instructor)
      await page.goto(coursePath('agents'))
      await expect(page.locator('.agent-row__replies .app-level-tag.is-autonomous').first()).toHaveText(
        'Answers at once',
      )
      await page.mouse.move(0, 0)
      check(await page.evaluate(levelLooks), 'agents')
      expect(await wordsBelowAA(page, '.app-level-tag')).toEqual([])
    } finally {
      await page.context().close()
    }

    // The presets compared, every permission's level of each preset, autonomous and denied side by side.
    const admin = await pageIn()
    try {
      await signInAsRoot(admin)
      await admin.goto('/admin/presets')
      await expect(admin.locator('.app-level-tag.is-autonomous').first()).toBeVisible()
      await admin.mouse.move(0, 0)
      check(await admin.evaluate(levelLooks), 'presets')
      expect(await wordsBelowAA(admin, '.app-level-tag')).toEqual([])
    } finally {
      await admin.context().close()
    }
  })

test('a list that failed to load says so in red, at its left, and offers Retry with its icon in the same column', async ({
  page,
}) => {
  await signIn(page, demo().actors.instructor)
  const list = /\/v1\/courses\/[^/]+\/members(\?|$)/
  await page.route(list, (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', error: { code: 'internal', message: 'Down' } }),
        })
      : r.continue(),
  )
  await page.goto(coursePath('members'))
  const failed = page.locator('.async-state__result')
  await expect(failed).toContainText('Something went wrong')
  await expect(failed.locator('.app-result__title .app-result__glyph')).toBeVisible()
  await expect(failed.locator('.async-state__retry svg')).toBeVisible()
  await page.mouse.move(0, 0)
  const look = await failed.evaluate((el) => {
    const glyph = el.querySelector('.app-result__glyph')!
    const retry = el.querySelector('.async-state__retry')!
    const icon = retry.querySelector('svg')!
    const red = getComputedStyle(document.documentElement).getPropertyValue('--app-danger-fg').trim()
    const probe = document.createElement('span')
    probe.style.color = red
    document.body.append(probe)
    const redRgb = getComputedStyle(probe).color
    probe.remove()
    return {
      glyphColour: getComputedStyle(glyph).color,
      red: redRgb,
      glyphLeft: Math.round(glyph.getBoundingClientRect().left),
      iconLeft: Math.round(icon.getBoundingClientRect().left),
      retryGround: getComputedStyle(retry).backgroundColor,
    }
  })
  // A glyph of what went wrong, in the refused colour, never Element Plus's filled circle (hidden).
  expect(look.glyphColour).toBe(look.red)
  await expect(failed.locator('.el-result__icon')).toBeHidden()
  // Retry: words after their icon, the icon in the glyph's column, and no ground: not a second solid button.
  expect(Math.abs(look.iconLeft - look.glyphLeft)).toBeLessThanOrEqual(1)
  expect(look.retryGround).toBe('rgba(0, 0, 0, 0)')
  await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible()

  // A title that wraps (a narrow pane's, a phone's) keeps its glyph on its first line, at that line's middle.
  const wrapped = await failed.evaluate((el) => {
    ;(el as HTMLElement).style.width = '120px'
    const words = el.querySelector('.app-result__title > span')!
    const range = document.createRange()
    range.selectNodeContents(words)
    const lines = [...range.getClientRects()]
    const glyph = el.querySelector('.app-result__glyph svg')!.getBoundingClientRect()
    return {
      lines: new Set(lines.map((r) => Math.round(r.top))).size,
      firstTop: lines[0]!.top,
      firstBottom: lines[0]!.bottom,
      glyphMiddle: (glyph.top + glyph.bottom) / 2,
    }
  })
  expect(wrapped.lines).toBeGreaterThan(1)
  expect(Math.abs(wrapped.glyphMiddle - (wrapped.firstTop + wrapped.firstBottom) / 2)).toBeLessThanOrEqual(2)
})
