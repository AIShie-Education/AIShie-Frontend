/// <reference lib="dom" />
import type { Page } from '@playwright/test'

// The shapes as the browser draws them (docs/CONVENTIONS.md, "Shapes";
// src/styles/shapes.spec.ts reads them as they are written): every box that
// draws something (a ground, an edge, a shadow, what it clips) has a corner
// of 4 px or less but a round mark as wide as it is tall, nothing
// casts a shadow but a line drawn as one, nothing is frosted, and no gradient
// fills anything but the two named. With the solid buttons a screen shows,
// of which a view, and each dialog over it, has one at most. The end-to-end
// specs of the shapes use it, as does scripts/style-audit.mjs, which
// photographs the app's screens and writes what it finds beside them (Node
// reads this file as it is: its types are only annotations).

/** What may be round, being as wide as it is tall: a person's avatar, a dot, a radio's circle, a timeline's point. */
export const ROUND_MARKS: { selector: string; why: string }[] = [
  { selector: '.el-avatar--circle', why: 'a person’s avatar (a person’s page, a person found)' },
  { selector: '.account__avatar', why: 'the reader’s own avatar, on the account menu’s button' },
  { selector: '.askable-dot', why: 'the dot before an agent’s name that says whether it can be asked' },
  { selector: '.activity__dot', why: 'the activity’s live dot' },
  { selector: '.chat-panel__dot', why: 'the dot on the chat’s history button for an unread answer' },
  { selector: '.hist-row__dot', why: 'the dot before a conversation with an unread answer' },
  { selector: '.el-radio__inner', why: 'a radio’s circle, and the dot in it' },
  { selector: '.el-badge__content.is-dot', why: 'a dot that says there is something new' },
  { selector: '.el-timeline-item__node', why: 'a point on a timeline' },
]

/** The gradients that are not a fill, by the element they are on and the property. */
export const NAMED_GRADIENTS: { selector: string; property: 'backgroundImage' | 'maskImage'; why: string }[] = [
  {
    selector: '.course-tabs',
    property: 'maskImage',
    why: 'the course tabs’ fade at an end with more tabs past it: a mask, which says the strip scrolls',
  },
  {
    selector: '.image-view__stage',
    property: 'backgroundImage',
    why: 'the checkerboard under an image, which shows what of it is transparent',
  },
]

/** A shape the app does not draw, where it is drawn, and what the element says. */
export interface Offence {
  kind: 'radius' | 'pill' | 'shadow' | 'gradient' | 'backdrop'
  where: string
  value: string
  text: string
}

export interface AuditOptions {
  /** Only what is within what this selector finds (each one shown), and those themselves; else the whole page. */
  within?: string
  /** Nothing within what these selectors find. */
  except?: string[]
}

interface AuditArgs extends Required<AuditOptions> {
  roundMarks: string[]
  gradients: { selector: string; property: string }[]
  maxRadius: number
  maxRing: number
}

/** In the page: each offence, by the element and its ::before and ::after. */
function audit(args: AuditArgs): Offence[] {
  const out: Offence[] = []
  const label = (el: Element, pseudo: string) => {
    const classes = [...el.classList].slice(0, 3).join('.')
    const parent = el.parentElement?.closest('[class]')
    const context = parent ? ` in ${parent.tagName.toLowerCase()}.${[...parent.classList].slice(0, 2).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${pseudo}${context}`
  }
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const px = (s: string) => {
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : 0
  }
  /**
   * The largest corner of a box w × h, in px, as it is drawn: a percentage is
   * of the box's own side, and where two corners together are longer than
   * their side, the browser scales every corner down until they fit (999 px
   * on a tag is half its height). An elliptical corner counts by its longer
   * radius.
   */
  const radiusOf = (cs: CSSStyleDeclaration, w: number, h: number) => {
    const corners = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ].map((corner) => {
      const [x = '0', y = x] = corner.split(/\s+/)
      return {
        x: x.endsWith('%') ? (px(x) / 100) * w : px(x),
        y: y.endsWith('%') ? (px(y) / 100) * h : px(y),
      }
    })
    type Corner = { x: number; y: number }
    const [tl, tr, br, bl] = corners as [Corner, Corner, Corner, Corner]
    const fit = (side: number, a: number, b: number) => (a + b > side ? side / (a + b) : 1)
    const f = Math.min(1, fit(w, tl.x, tr.x), fit(w, bl.x, br.x), fit(h, tl.y, bl.y), fit(h, tr.y, br.y))
    return Math.max(...corners.map((c) => (c.x > 0 && c.y > 0 ? Math.max(c.x, c.y) * f : 0)))
  }
  /** Whether a box draws anything its corners would round: a ground, an edge, a shadow, or what it clips. */
  const paints = (cs: CSSStyleDeclaration) => {
    const seen = (colour: string) => !/^(?:transparent|rgba\(\d+, \d+, \d+, 0\))$/.test(colour)
    return (
      seen(cs.backgroundColor) ||
      cs.backgroundImage !== 'none' ||
      cs.boxShadow !== 'none' ||
      cs.overflow !== 'visible' ||
      ['top', 'right', 'bottom', 'left'].some(
        (side) =>
          px(cs.getPropertyValue(`border-${side}-width`)) > 0 &&
          cs.getPropertyValue(`border-${side}-style`) !== 'none' &&
          seen(cs.getPropertyValue(`border-${side}-color`)),
      )
    )
  }
  /** A shadow that is not a line: blurred, offset outside, or a ring wider than maxRing. */
  const shadowFault = (value: string) => {
    if (!value || value === 'none') return false
    let depth = 0
    let layer = ''
    const layers: string[] = []
    for (const c of value) {
      if (c === '(') depth++
      if (c === ')') depth--
      if (c === ',' && depth === 0) {
        layers.push(layer)
        layer = ''
      } else layer += c
    }
    layers.push(layer)
    return layers.some((l) => {
      const inset = /\binset\b/.test(l)
      const lengths = l
        .replace(/\w+\([^)]*\)/g, ' ')
        .split(/\s+/)
        .filter((w) => /^-?\d*\.?\d+(px)?$/.test(w))
        .map(Number.parseFloat)
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths
      const color = /rgba?\(([^)]*)\)/
        .exec(l)?.[1]
        ?.split(/[\s,/]+/)
        .filter(Boolean)
      if (color && color.length === 4 && Number(color[3]) === 0) return false
      if (blur !== 0) return true
      if (!inset && (x !== 0 || y !== 0)) return true
      return !inset && spread > args.maxRing
    })
  }
  const roots = args.within ? [...document.querySelectorAll(args.within)].filter(shown) : [document.body]
  const visited = new Set<Element>()
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (visited.has(el)) continue
      visited.add(el)
      if (args.except.some((s) => el.closest(s))) continue
      if (!shown(el)) continue
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null)
        if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue
        const box = el.getBoundingClientRect()
        const w = pseudo ? px(cs.width) : box.width
        const h = pseudo ? px(cs.height) : box.height
        const where = label(el, pseudo)
        if (w >= 1 && h >= 1 && paints(cs)) {
          const r = radiusOf(cs, w, h)
          if (r > args.maxRadius + 0.01) {
            const square = Math.abs(w - h) <= 1
            const mark = square && args.roundMarks.some((s) => el.matches(s))
            if (!mark) {
              const pill = r >= Math.min(w, h) / 2 - 0.5 && w > h * 1.3
              out.push({ kind: pill ? 'pill' : 'radius', where, value: cs.borderTopLeftRadius, text })
            }
          }
        }
        if (shadowFault(cs.boxShadow)) out.push({ kind: 'shadow', where, value: cs.boxShadow, text })
        for (const property of ['backgroundImage', 'maskImage', 'borderImageSource'] as const) {
          const value = cs[property] || (property === 'maskImage' ? cs.webkitMaskImage : '')
          if (!value || !value.includes('gradient(')) continue
          if (!pseudo && args.gradients.some((g) => g.property === property && el.matches(g.selector))) continue
          out.push({ kind: 'gradient', where, value: value.slice(0, 80), text })
        }
        const backdrop = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter
        if (backdrop && backdrop !== 'none') out.push({ kind: 'backdrop', where, value: backdrop, text })
      }
    }
  }
  return out
}

/**
 * Each shape the page shows that the app does not draw: a corner over 4 px
 * (a pill among them) but a round mark's, a shadow that is not a line, a
 * gradient but the two named, frosted glass.
 */
export function shapeOffences(page: Page, options: AuditOptions = {}): Promise<Offence[]> {
  return page.evaluate(audit, {
    within: options.within ?? '',
    except: options.except ?? [],
    roundMarks: ROUND_MARKS.map((m) => m.selector),
    gradients: NAMED_GRADIENTS.map(({ selector, property }) => ({ selector, property })),
    maxRadius: 4,
    maxRing: 2,
  })
}

/** What floats over the page, each of which may have its own one solid button: a dialog, a drawer, a message box, a menu. */
export const OVERLAYS = '.el-overlay, .el-popper'

/**
 * The solid buttons shown, by their words: those of the page (outside any
 * overlay), and those of each overlay open over it. A view, and each dialog,
 * has one at most (docs/CONVENTIONS.md, "Buttons"). A solid button is one of
 * a type (primary, or danger for a confirmation's last step) that is not
 * plain, text or a link.
 */
export function soloPrimary(page: Page, overlays = OVERLAYS): Promise<{ page: string[]; overlays: string[][] }> {
  return page.evaluate((overlays) => {
    const SOLID =
      '.el-button:is(.el-button--primary, .el-button--danger, .el-button--success, .el-button--warning, .el-button--info):not(.is-plain, .is-text, .is-link)'
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width >= 1 && r.height >= 1 && getComputedStyle(el).visibility !== 'hidden'
    }
    const words = (b: Element) => (b.textContent ?? '').trim() || b.getAttribute('aria-label') || '?'
    const open = [...document.querySelectorAll(overlays)].filter(shown)
    return {
      page: [...document.querySelectorAll(SOLID)].filter((b) => shown(b) && !b.closest(overlays)).map(words),
      overlays: open
        .map((o) => [...o.querySelectorAll(SOLID)].filter((b) => shown(b) && b.closest(overlays) === o).map(words))
        .filter((list) => list.length),
    }
  }, overlays)
}
