/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import {
  accountMenu,
  call,
  coursePath,
  demo,
  inTraditionalChinese,
  openAccountMenu,
  openChat,
  photograph,
  root,
  showSideView,
  signIn,
  signInAsRoot,
  type CoreReply,
} from './support'

// The chrome, drawn as aishie.app draws its pages (design wave 3): straight
// corners and rules, never a card floating on a shadow. The pages before the
// app are a header of one row and a left-aligned column under it, no card; a
// phone's header is one row of 56 px with its rule, the chat's button at its
// right end, and nothing floats over a phone's page; the chat is docked
// beside the page, ruled at its left, with no shadow; the activity bar, the
// side bar, the header, the account's menu, the phone's menu, dialogs, message
// boxes, drawers and lists cast no shadow, and nothing in them is rounder
// than 4 px but a mark as wide as it is tall (a person's initial, a dot, a
// radio). With the shadows gone, the keyboard's focus ring is the one mark of
// focus: a text button's is the focus colour, as every other button's is.

const STAMP = Date.now().toString(36)

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/**
 * What, within the elements a selector finds, is drawn against the rules: a corner over 4 px on anything but a
 * mark as wide as it is tall; a shadow that is not a stroke (no blur, and inset, or a ring of 2 px at most); a
 * gradient; a frosted backdrop. Each as "what: the property". An agent's avatar is the shared components' to
 * draw (e2e/components-style.spec.ts), and is left out here.
 */
function offences(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const out: string[] = []
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}${[...el.classList]
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join('')}`
    /** A box-shadow's layers, split at the commas outside parentheses. */
    const layers = (v: string) => {
      const parts: string[] = []
      let depth = 0
      let at = 0
      for (let i = 0; i < v.length; i++) {
        if (v[i] === '(') depth++
        else if (v[i] === ')') depth--
        else if (v[i] === ',' && depth === 0) {
          parts.push(v.slice(at, i).trim())
          at = i + 1
        }
      }
      parts.push(v.slice(at).trim())
      return parts
    }
    /** A stroke: no blur, and either inset or no offset with a spread of 2 px at most. */
    const stroke = (layer: string) => {
      const lengths = layer
        .replace(/rgba?\([^)]*\)/g, '')
        .match(/-?[\d.]+px/g)
        ?.map(parseFloat) ?? [0, 0, 0, 0]
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths
      if (blur !== 0) return false
      if (/\binset\b/.test(layer)) return true
      return x === 0 && y === 0 && Math.abs(spread) <= 2
    }
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (el.closest('.agent-avatar')) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden') continue
        const radius = Math.max(
          ...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(
            (k) => parseFloat(cs[k as 'borderTopLeftRadius']) || 0,
          ),
        )
        const mark = Math.abs(r.width - r.height) <= 1 && radius >= Math.min(r.width, r.height) / 2 - 0.5
        if (radius > 4 && !mark) out.push(`${label(el)}: border-radius ${radius}px`)
        if (cs.boxShadow !== 'none' && !layers(cs.boxShadow).every(stroke)) out.push(`${label(el)}: ${cs.boxShadow}`)
        if (cs.backgroundImage.includes('gradient')) out.push(`${label(el)}: a gradient`)
        if (cs.backdropFilter && cs.backdropFilter !== 'none') out.push(`${label(el)}: backdrop-filter`)
      }
    }
    return out
  }, selector)
}

/**
 * A dialog's or a message box's frame: a line of 1 px drawn round it as a ring (no offset, no blur, a spread of
 * 1 px), which casts nothing and takes no width from what it holds; its corners; and the rule under its title.
 */
function frameOf(el: Element, head: string) {
  const cs = getComputedStyle(el)
  const title = getComputedStyle(el.querySelector(head)!)
  return {
    frame: /^rgba?\([^)]*\) 0px 0px 0px 1px$/.test(cs.boxShadow) && cs.borderTopStyle === 'none',
    radius: parseFloat(cs.borderTopLeftRadius),
    titleRule: `${title.borderBottomWidth} ${title.borderBottomStyle}`,
  }
}

/** The header: one row at most 56 px tall with its rule, everything in it on that row. */
async function oneRowHeader(page: Page, what: string) {
  const header = await page.locator('.app-header').evaluate((h) => {
    const r = h.getBoundingClientRect()
    const cs = getComputedStyle(h)
    const kids = [...h.querySelectorAll<HTMLElement>('button, a, .app-header__title')]
      .filter((k) => k.getBoundingClientRect().width > 0)
      .map((k) => k.getBoundingClientRect())
    return {
      height: Math.round(r.height),
      rule: `${cs.borderBottomWidth} ${cs.borderBottomStyle}`,
      shadow: cs.boxShadow,
      inRow: kids.every((k) => k.top >= r.top - 0.5 && k.bottom <= r.bottom + 0.5),
    }
  })
  expect(header.height, what).toBeLessThanOrEqual(56)
  expect(header, what).toMatchObject({ rule: '1px solid', shadow: 'none', inRow: true })
}

/**
 * The keyboard's focus ring on what has focus, and the focus colour (--app-focus) it is to be drawn in: 2 px of
 * the navy, never Element Plus's pale primary (2.1 to 2.5:1 on the page's grounds).
 */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const cs = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.color = 'var(--app-focus)'
    document.body.append(probe)
    const focus = getComputedStyle(probe).color
    probe.remove()
    return {
      what: el.textContent?.trim() || el.getAttribute('aria-label'),
      text: el.classList.contains('is-text'),
      ring: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      want: `2px solid ${focus}`,
    }
  })
}

/** Nothing on a phone's page is fixed or sticky over it but the header (overlays, lists and tooltips aside). */
async function nothingFloats(page: Page, what: string) {
  const pinned = await page.evaluate(() =>
    [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return false
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) return false
        return !el.closest('.app-header, .el-overlay, .el-popper, .el-message, .el-notification')
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
  )
  expect(pinned, `${what}: fixed or sticky over the page`).toEqual([])
}

/**
 * The page before the app at this address: its header one row with the wordmark at its left, ruled under; its
 * column left-aligned at the wordmark's edge, in the window's left quarter at 1280 px, with no frame, ground of its
 * own or shadow, its h1 first, nothing written over it; its solid button as wide as its words.
 */
async function expectAuthPage(page: Page, path: string, what: string, title: RegExp) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: title }), what).toBeVisible()
  const look = await page.evaluate(() => {
    const head = document.querySelector('.app-auth-page__head')!
    const mark = document.querySelector('.app-auth-page__wordmark')!.getBoundingClientRect()
    const column = document.querySelector('.app-auth-page__card')!
    const h1 = document.querySelector('h1')!.getBoundingClientRect()
    const cs = getComputedStyle(column)
    const page = getComputedStyle(document.querySelector('.app-auth-page')!)
    const button = column.querySelector('.el-button--primary')?.getBoundingClientRect()
    // Words in the column over its title: a small line over a heading, which the site never has.
    const over = [...column.querySelectorAll('*')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
      .filter((el) => el.getBoundingClientRect().bottom <= h1.top + 0.5)
      .map((el) => el.textContent!.trim())
    return {
      headHeight: Math.round(head.getBoundingClientRect().height),
      headRule: `${getComputedStyle(head).borderBottomWidth} ${getComputedStyle(head).borderBottomStyle}`,
      markLeft: Math.round(mark.left),
      titleLeft: Math.round(h1.left),
      frame: cs.borderTopStyle,
      shadow: cs.boxShadow,
      ownGround: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== page.backgroundColor,
      buttonWidth: button ? Math.round(button.width) : null,
      columnWidth: Math.round(h1.width),
      over,
    }
  })
  expect(look.headHeight, what).toBeLessThanOrEqual(56)
  expect(look.headRule, what).toBe('1px solid')
  expect(look.titleLeft, `${what}: the column at the wordmark's edge`).toBe(look.markLeft)
  expect(look.titleLeft, `${what}: in the window's left quarter`).toBeLessThan(1280 / 4)
  expect(look, what).toMatchObject({ frame: 'none', shadow: 'none', ownGround: false, over: [] })
  if (look.buttonWidth !== null) {
    expect(look.buttonWidth, `${what}: the button as wide as its words`).toBeLessThan(look.columnWidth)
  }
  expect(await offences(page, '.app-auth-page'), what).toEqual([])
}

test.describe('the pages before the app', () => {
  test('sign-in, a join link and an invitation are a left-aligned column under a header of one row, no card', async ({
    browser,
  }) => {
    const d = demo()
    const link = done(
      await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/join-links`, {}),
      'course.join_link_create',
    ) as { token: string }
    const person = done(
      await call(root().token, 'POST', '/v1/actors', {
        kind: 'human',
        display_name: `Chrome ${STAMP}`,
        email: `chrome+${STAMP}@e2e.test`,
      }),
      'actor.create',
    ) as { actor_id: string }
    const invite = done(
      await call(root().token, 'POST', `/v1/actors/${person.actor_id}/invite`, { expires_in_days: 1 }),
      'actor.invite',
    ) as { token: string }
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
    const page = await context.newPage()
    await expectAuthPage(page, '/login', 'sign-in', /^Sign in$/)
    await photograph(page, 'chrome-sign-in-1280')
    await expectAuthPage(page, `/join/${link.token}`, 'a join link', /Introduction to Programming/)
    // The course, its title the h1 and its code under it, ruled off from its facts: rows between rules, no tinted
    // box, and no line over the title.
    const course = await page.locator('.join__course').evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        first: el.firstElementChild!.tagName,
        top: cs.borderTopStyle,
        bottom: cs.borderBottomStyle,
        ground: cs.backgroundColor,
        radius: cs.borderRadius,
      }
    })
    expect(course).toEqual({ first: 'H1', top: 'none', bottom: 'solid', ground: 'rgba(0, 0, 0, 0)', radius: '0px' })
    await expect(page.locator('.join__code')).toHaveText('CS101 · A')
    // Its other way in, a text button, takes the keyboard's ring in the focus colour, as the solid one before it.
    await page.locator('.join__path .el-button--primary').focus()
    await page.keyboard.press('Tab')
    const ring = await focusRing(page)
    expect(ring).toMatchObject({ what: 'Create an account', text: true })
    expect(ring.ring).toBe(ring.want)
    await expectAuthPage(page, `/welcome#token=${invite.token}`, 'an invitation', /./)
    await context.close()
  })

  test('on a phone, sign-in shows the wordmark, its title, both fields and its button without scrolling', async ({
    browser,
  }) => {
    for (const locale of ['en-US', 'zh-TW']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        locale,
      })
      const page = await context.newPage()
      if (locale === 'zh-TW') {
        await page.addInitScript(() => {
          try {
            localStorage.setItem('aishie.locale', 'zh-Hant')
          } catch {}
        })
      }
      await page.goto('/login')
      await expect(page.locator('input[name=password]')).toBeVisible()
      const below = await page.evaluate(() =>
        ['.app-auth-page__wordmark', 'h1', 'input[name=login]', 'input[name=password]', 'button[type=submit]']
          .map((s) => [s, document.querySelector(s)!.getBoundingClientRect().bottom] as const)
          .filter(([, bottom]) => bottom > window.innerHeight)
          .map(([s]) => s),
      )
      expect(below, `${locale}: below the fold`).toEqual([])
      const head = await page.locator('.app-auth-page__head').boundingBox()
      expect(Math.round(head!.height)).toBeLessThanOrEqual(56)
      await photograph(page, `chrome-sign-in-phone-${locale}`)
      await context.close()
    }
  })
})

test.describe('the frame', () => {
  test('the activity bar, the side bar, the header and the account’s menu cast no shadow and are square', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    await showSideView(page, 'Courses')
    await openAccountMenu(page)
    await expect(accountMenu(page)).toBeVisible()
    expect(
      await offences(page, '.activity-bar, #side-bar, .app-header, .course-head, .course-nav, #account-menu'),
    ).toEqual([])
    // The menu framed in the line, its corners 2 px.
    const menu = await accountMenu(page).evaluate((el) => {
      const cs = getComputedStyle(el)
      return { border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow }
    })
    expect(menu).toEqual({ border: '1px solid', radius: '2px', shadow: 'none' })
    await page.keyboard.press('Escape')
    // The view shown on the activity bar: a navy line at its outer edge, no tinted ground.
    const shown = await page
      .locator('.activity-bar__button.is-active')
      .evaluate((b) => getComputedStyle(b).backgroundColor)
    expect(shown).toBe('rgba(0, 0, 0, 0)')
  })

  test('the chat docked beside the page casts no shadow, is ruled at its left and takes its width from the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, demo().actors.yuki)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    const closed = (await page.locator('.app-main-wrap').boundingBox())!.width
    const panel = await openChat(page)
    const look = await panel.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { shadow: cs.boxShadow, rule: `${cs.borderLeftWidth} ${cs.borderLeftStyle}`, radius: cs.borderRadius }
    })
    expect(look).toEqual({ shadow: 'none', rule: '1px solid', radius: '0px' })
    const width = (await panel.boundingBox())!.width
    expect(Math.round((await page.locator('.app-main-wrap').boundingBox())!.width)).toBe(Math.round(closed - width))
    expect(await offences(page, '#chat-panel')).toEqual([])
    // Its head row's Minimize and Close, text buttons, take the keyboard's ring in the focus colour.
    await panel.locator('.chat-panel__close').focus()
    await page.keyboard.press('Shift+Tab')
    const minimize = await focusRing(page)
    expect(minimize).toMatchObject({ what: 'Minimize the chat', text: true })
    expect(minimize.ring).toBe(minimize.want)
    await page.keyboard.press('Tab')
    const close = await focusRing(page)
    expect(close).toMatchObject({ what: 'Close the chat', text: true })
    expect(close.ring).toBe(close.want)
  })

  test('beside the side bar and the docked chat, a course’s way up stays on one row in Chinese, and the page keeps 420 px', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await inTraditionalChinese(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(coursePath('scheme'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
    await expect(page.locator('.course-crumbs')).toBeVisible()
    await expect(page.locator('#side-bar')).toBeVisible()
    await page.locator('#chat-panel-toggle').click()
    await expect(page.locator('#chat-panel')).toHaveClass(/is-docked/)
    // From the widest a laptop has down to the narrowest the chat docks in. From 1048 px down, the activity bar,
    // the side bar, the narrowest pane and 420 px of page do not all fit: the side bar gives way while the chat
    // is open.
    for (const width of [1280, 1100, 1048, 1047, 1024, 1000, 900]) {
      const what = `zh-Hant at ${width} px`
      await page.setViewportSize({ width, height: 800 })
      await expect(page.locator('#side-bar'), what).toHaveCount(width >= 1048 ? 1 : 0)
      await expect
        .poll(async () => Math.round((await page.locator('.app-main-wrap').boundingBox())!.width), { message: what })
        .toBeGreaterThanOrEqual(420)
      await oneRowHeader(page, what)
      // The way up on one line, every step on it: the course's title cut short rather than wrapped.
      const steps = await page.locator('.course-crumbs li').evaluateAll((lis) =>
        lis.map((li) => {
          const r = li.getBoundingClientRect()
          return { top: Math.round(r.top), height: Math.round(r.height) }
        }),
      )
      expect(steps.length, what).toBe(3)
      for (const step of steps) {
        expect(step.top, what).toBe(steps[0]!.top)
        expect(step.height, what).toBeLessThanOrEqual(32)
      }
      if (width === 1048) await photograph(page, 'chrome-crumbs-zh-Hant-1048')
      if (width === 900) await photograph(page, 'chrome-side-bar-gives-way-900')
    }
  })

  test('dialogs and message boxes are framed by a line and square-cornered, their titles over a rule, and cast no shadow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('members'))
    await page.getByRole('button', { name: 'Add member', exact: true }).click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    const look = await dialog.evaluate(frameOf, '.el-dialog__header')
    expect(look.radius).toBeLessThanOrEqual(2)
    expect(look).toMatchObject({ frame: true, titleRule: '1px solid' })
    // A list opened in it: a popper, framed, with no shadow.
    await dialog.locator('.el-select').first().click()
    const list = page.locator('.el-select__popper:visible').first()
    await expect(list).toBeVisible()
    expect(await list.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none')
    await photograph(page, 'chrome-dialog')

    // A message box: undoing final grades asks first.
    await page.goto(coursePath('grades'))
    await page.getByRole('button', { name: 'More posting actions' }).click()
    await page.locator('.grades-view__undo:visible').click()
    const undo = page.locator('.el-dialog:visible')
    await expect(undo).toBeVisible()
    await undo.locator('.el-dialog__footer .el-button--primary').click()
    const box = page.locator('.el-message-box:visible')
    await expect(box).toBeVisible()
    const boxLook = await box.evaluate(frameOf, '.el-message-box__header')
    expect(boxLook.radius).toBeLessThanOrEqual(2)
    expect(boxLook).toMatchObject({ frame: true, titleRule: '1px solid' })
    expect(await offences(page, '.el-message-box')).toEqual([])
    await photograph(page, 'chrome-message-box')
    await box.getByRole('button', { name: 'Cancel' }).click()
  })

  test('an administration drawer is square, ruled along the edge it opens from, and casts no shadow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signInAsRoot(page)
    await page.goto('/admin/presets')
    await page.getByRole('button', { name: /^Details/ }).first().click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toBeVisible()
    const look = await drawer.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { radius: cs.borderRadius, shadow: cs.boxShadow, rule: `${cs.borderLeftWidth} ${cs.borderLeftStyle}` }
    })
    expect(look).toEqual({ radius: '0px', shadow: 'none', rule: '1px solid' })
    await photograph(page, 'chrome-drawer')
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the header is one row of 56 px with its rule in all three languages, and nothing floats over the page', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
      // Run after signIn's own, which sets English on every page: the last one set wins.
      await page.addInitScript((l) => {
        try {
          localStorage.setItem('aishie.locale', l)
        } catch {}
      }, locale)
      for (const path of [coursePath(), coursePath('materials'), '/account']) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.locator('.page-header').first()).toBeVisible()
        await expect(page.locator('#chat-panel-toggle')).toBeVisible()
        await oneRowHeader(page, `${locale} ${path}`)
        await nothingFloats(page, `${locale} ${path}`)
        // Scrolled down, as up: nothing comes to float.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await nothingFloats(page, `${locale} ${path}, scrolled`)
      }
    }
  })

  test('the menu is square, ruled at its right edge, casts no shadow, and marks its view by a line under it', async ({
    page,
  }) => {
    await signIn(page, demo().actors.instructor)
    await page.goto(coursePath('materials'))
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const drawer = page.locator('.app-nav-drawer')
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(400)
    const look = await drawer.evaluate((el) => {
      const cs = getComputedStyle(el)
      const tab = getComputedStyle(el.querySelector('.side-bar__tab.is-active')!)
      return {
        radius: cs.borderRadius,
        shadow: cs.boxShadow,
        rule: `${cs.borderRightWidth} ${cs.borderRightStyle}`,
        tabGround: tab.backgroundColor,
        tabLine: `${tab.borderBottomWidth} ${tab.borderBottomStyle}`,
      }
    })
    expect(look).toEqual({
      radius: '0px',
      shadow: 'none',
      rule: '1px solid',
      tabGround: 'rgba(0, 0, 0, 0)',
      tabLine: '2px solid',
    })
    expect(await offences(page, '.app-nav-drawer')).toEqual([])
    await photograph(page, 'chrome-phone-menu')
  })
})
