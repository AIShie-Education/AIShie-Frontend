/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, coursePath, demo, photograph, signIn, signInAsRoot } from './support'

// A page's look, as aishie.app sets its own (docs/CONVENTIONS.md, "Shapes"):
// sections are parted by a rule and room, not drawn as cards; a box (a line,
// 2 px corners, no ground) is kept for one thing the reader operates as a
// whole, and never holds another; a view has one solid primary button at
// most; no small capitalised or letter-spaced label sits over a heading; and
// what the views draw has no corner rounder than 4 px but a round mark (a
// dot, a person's avatar: as wide as it is tall) and casts no shadow. Read
// from the computed styles of every screen a teacher, a student and an
// administrator open, on a laptop and on a phone, in the light theme and the
// dark one, within the page itself: the header, the side bar, a course's
// context line and tabs, and the chat are the chrome's, checked by their own.

type Who = 'instructor' | 'yuki' | 'root'
interface Screen {
  name: string
  who: Who
  /** The path, or how to find it once signed in (a set or an agent the run made). */
  path: string | ((page: Page) => Promise<string | null>)
}

const d = () => demo()
const SCREENS: Screen[] = [
  { name: 'home', who: 'instructor', path: '/' },
  { name: 'overview', who: 'instructor', path: coursePath() },
  { name: 'materials', who: 'instructor', path: coursePath('materials') },
  { name: 'document', who: 'instructor', path: coursePath(`documents/${d().course.documents.week1}`) },
  { name: 'assignments', who: 'instructor', path: coursePath('assignments') },
  { name: 'assignment', who: 'instructor', path: coursePath(`assignments/${d().course.assignments.hw1}`) },
  { name: 'submissions', who: 'instructor', path: coursePath('submissions') },
  { name: 'submission', who: 'instructor', path: coursePath(`submissions/${d().course.submissions.yuki_hw1}`) },
  { name: 'grades', who: 'instructor', path: coursePath('grades') },
  { name: 'gradebook', who: 'instructor', path: coursePath('gradebook') },
  { name: 'scheme', who: 'instructor', path: coursePath('scheme') },
  { name: 'approvals', who: 'instructor', path: coursePath('approvals') },
  { name: 'action', who: 'instructor', path: coursePath(`actions/${d().course.proposed_grade_action}`) },
  { name: 'my-actions', who: 'instructor', path: coursePath('my-actions') },
  { name: 'members', who: 'instructor', path: coursePath('members') },
  { name: 'member', who: 'instructor', path: coursePath(`members/${d().actors.yuki.member_id}`) },
  { name: 'groups', who: 'instructor', path: coursePath('groups') },
  {
    name: 'group-set',
    who: 'instructor',
    path: async () => {
      const sets = await call(d().actors.instructor.token, 'GET', `/v1/courses/${d().course.id}/group-sets`)
      const first = (sets.body.result?.sets ?? sets.body.result?.items ?? [])[0] as { id: string } | undefined
      return first ? coursePath(`groups/${first.id}`) : null
    },
  },
  { name: 'activity', who: 'instructor', path: coursePath('activity') },
  { name: 'agents', who: 'instructor', path: coursePath('agents') },
  { name: 'account', who: 'instructor', path: '/account' },
  { name: 'my-agents', who: 'instructor', path: '/account/agents' },
  {
    name: 'agent',
    who: 'instructor',
    path: async () => {
      const mine = await call(d().actors.instructor.token, 'GET', '/v1/me/agents')
      const first = (mine.body.result?.agents ?? [])[0] as { actor_id: string } | undefined
      return first ? `/account/agents/${first.actor_id}` : null
    },
  },
  { name: 'student-home', who: 'yuki', path: '/' },
  { name: 'student-overview', who: 'yuki', path: coursePath() },
  { name: 'student-materials', who: 'yuki', path: coursePath('materials') },
  { name: 'student-assignment', who: 'yuki', path: coursePath(`assignments/${d().course.assignments.hw1}`) },
  { name: 'student-submission', who: 'yuki', path: coursePath(`submissions/${d().course.submissions.yuki_hw1}`) },
  { name: 'student-grades', who: 'yuki', path: coursePath('grades') },
  { name: 'student-agents', who: 'yuki', path: '/account/agents' },
  { name: 'admin-courses', who: 'root', path: '/admin/courses' },
  { name: 'admin-course', who: 'root', path: `/admin/courses/${d().course.id}` },
  { name: 'admin-actors', who: 'root', path: '/admin/actors' },
  { name: 'admin-actor', who: 'root', path: `/admin/actors/${d().actors.grader.actor_id}` },
  // A person's page, which an agent's is not: an invitation and single sign-on side by side, each a form.
  { name: 'admin-person', who: 'root', path: `/admin/actors/${d().actors.yuki.actor_id}` },
  { name: 'admin-terms', who: 'root', path: '/admin/terms' },
  { name: 'admin-departments', who: 'root', path: '/admin/departments' },
  { name: 'admin-presets', who: 'root', path: '/admin/presets' },
  { name: 'admin-sign-in', who: 'root', path: '/admin/sign-in' },
  { name: 'admin-exports', who: 'root', path: '/admin/conversation-exports' },
  { name: 'admin-runtime', who: 'root', path: '/admin/runtime' },
]

/**
 * What another part of design wave 3 takes away, and this spec lets be until
 * it has: each is checked to offend still, on some screen, so that the list
 * only shrinks. Empty since the tokens' part squared rendered Markdown's
 * listing and the components' part redrew a segmented control's edge.
 */
const PENDING: Record<string, string> = {}

/** What a screen draws against the rules above, each named by where it is. */
interface Audit {
  /** Pending selectors (PENDING) that offended here. */
  pending: string[]
  /** A section (.app-card) with a ground, a frame or rounded corners of its own. */
  boxedSections: string[]
  /** A box laid inside another box. */
  boxInBox: string[]
  /** A corner rounder than 4 px, but a round mark. */
  rounded: string[]
  /** A shadow that is not a stroke (an inset line, or a ring of 2 px at most). */
  shadows: string[]
  /** The solid primary buttons outside an overlay, and the solid red ones. */
  solids: string[]
  dangers: string[]
  /** A small capitalised or letter-spaced label. */
  eyebrows: string[]
}

/** Reads a screen's computed styles (in the page). */
function audit(pending: string[]): Audit {
  const out: Audit = {
    pending: [],
    boxedSections: [],
    boxInBox: [],
    rounded: [],
    shadows: [],
    solids: [],
    dangers: [],
    eyebrows: [],
  }
  const waits = (el: Element, what: string[]) => {
    const p = pending.find((sel) => el.matches(sel))
    if (p && !out.pending.includes(p)) out.pending.push(p)
    return p ? [] : what
  }
  const scope = document.querySelector('.course-body') ?? document.querySelector('.app-main')
  if (!scope) return out
  const name = (el: Element) => {
    const cls = [...el.classList].filter((c) => !c.startsWith('data-v')).slice(0, 2).join('.')
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${text ? ` «${text}»` : ''}`
  }
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none'
  }
  const overlay = (el: Element) => !!el.closest('.el-overlay, .el-popper, .el-dialog, .el-drawer, .el-message-box')
  /** Element Plus's own parts (a control, a tag, a table's inside), drawn by styles/element.css. */
  const elements = (el: Element) => [...el.classList].some((c) => c.startsWith('el-'))
  const transparent = (c: string) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
  /** The ground an element is drawn on: its nearest ancestor's that has one. */
  const groundUnder = (el: Element) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor
      if (!transparent(bg)) return bg
    }
    return 'rgb(255, 255, 255)'
  }
  const framed = (s: CSSStyleDeclaration) =>
    (['Top', 'Right', 'Bottom', 'Left'] as const).filter(
      (k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none',
    ).length >= 3
  const grounded = (el: Element, s: CSSStyleDeclaration) =>
    !transparent(s.backgroundColor) && s.backgroundColor !== groundUnder(el)
  /** What a box's rule does not count: a control, a tag, a table's parts, code, a picture, a mark. */
  const NOT_A_BOX =
    'input, textarea, select, button, label, code, pre, kbd, img, svg, canvas, video, td, th, tr, ' +
    '.el-input, .el-textarea, .el-select, .el-tag, .el-check-tag, .el-radio, .el-checkbox, .el-switch, ' +
    '.el-radio-button, .el-radio-group, .el-input-number, .el-date-editor, .el-upload, .el-avatar, .el-progress, ' +
    '.el-slider, .el-tabs__header, .el-table, .el-scrollbar__bar, .el-skeleton, .el-loading-mask, .el-badge__content, ' +
    '.el-alert, .el-button, .app-level-tag, .agent-avatar'
  const boxes: Element[] = []

  for (const el of scope.querySelectorAll('*')) {
    if (!shown(el) || overlay(el)) continue
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    // Corners: a round mark (a dot, an avatar) is as wide as it is tall.
    const radius = Math.max(
      parseFloat(s.borderTopLeftRadius) || 0,
      parseFloat(s.borderTopRightRadius) || 0,
      parseFloat(s.borderBottomLeftRadius) || 0,
      parseFloat(s.borderBottomRightRadius) || 0,
    )
    const mark = Math.abs(r.width - r.height) <= 2
    if (radius > 4 && !mark && !elements(el)) out.rounded.push(...waits(el, [`${name(el)} ${radius}px`]))
    // Shadows: only a stroke, a line drawn inside the edge or a ring of 2 px at most.
    if (s.boxShadow && s.boxShadow !== 'none') {
      for (const one of s.boxShadow.split(/,(?![^(]*\))/)) {
        const lengths = one.replace(/rgba?\([^)]*\)|#[0-9a-f]+|inset/gi, '').trim().split(/\s+/).map(parseFloat)
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths
        const stroke = blur === 0 && (/inset/.test(one) || (x === 0 && y === 0 && spread <= 2))
        if (!stroke) out.shadows.push(...waits(el, [`${name(el)} ${one.trim()}`]))
      }
    }
    // Boxes: a frame on three sides or more, or a ground of its own.
    if (r.width > 60 && r.height > 24 && !el.matches(NOT_A_BOX) && !el.closest(NOT_A_BOX) && (framed(s) || grounded(el, s)))
      boxes.push(el)
    // Eyebrows: small words set in capitals or letter-spaced (a code, in a monospace face, is not one).
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())
    const small = parseFloat(s.fontSize) <= 14
    const capped = s.textTransform === 'uppercase' || parseFloat(s.letterSpacing) > 0.05 * parseFloat(s.fontSize)
    if (own && small && capped && !/mono/i.test(s.fontFamily) && !el.closest('code, kbd, .app-mono'))
      out.eyebrows.push(name(el))
  }
  for (const b of boxes) {
    const outer = boxes.find((o) => o !== b && o.contains(b))
    if (outer) out.boxInBox.push(`${name(outer)} › ${name(b)}`)
  }
  for (const card of scope.querySelectorAll('.app-card')) {
    if (!shown(card) || overlay(card)) continue
    const s = getComputedStyle(card)
    const sides = (['Right', 'Bottom', 'Left'] as const).filter(
      (k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none',
    )
    if (sides.length || grounded(card, s) || parseFloat(s.borderTopLeftRadius) > 0)
      out.boxedSections.push(`${name(card)}${sides.length ? ` frame ${sides.join('/')}` : ''}`)
  }
  const solid = '.el-button:not(.is-plain):not(.is-text):not(.is-link)'
  for (const b of scope.querySelectorAll(`${solid}.el-button--primary`))
    if (shown(b) && !overlay(b)) out.solids.push(name(b))
  for (const b of scope.querySelectorAll(`${solid}.el-button--danger`))
    if (shown(b) && !overlay(b)) out.dangers.push(name(b))
  return out
}

async function signInAs(page: Page, who: Who) {
  if (who === 'root') await signInAsRoot(page)
  else await signIn(page, d().actors[who])
}

/** The two proposals the queue is shown with beside the demo's, the grader's, withdrawn again at the end. */
const extra: string[] = []

test.describe('a page’s sections, boxes, buttons and corners', () => {
  test.setTimeout(240_000)

  test.beforeAll(async () => {
    // The approvals queue with three proposals, so that the rule for its buttons is seen: the grader proposes two
    // more grades for Yuki's homework, which nothing else depends on and which it takes back afterwards.
    for (const [score, feedback] of [
      ['9', 'Screens: a second proposal for the queue.'],
      ['8.5', 'Screens: a third proposal for the queue.'],
    ]) {
      const r = await call(d().actors.grader.token, 'POST', `/v1/courses/${d().course.id}/grades`, {
        submission_id: d().course.submissions.yuki_hw1,
        score,
        feedback,
      })
      expect(r.body.status, JSON.stringify(r.body)).toBe('proposed')
      extra.push(r.body.action_id!)
    }
  })
  test.afterAll(async () => {
    for (const id of extra.splice(0))
      await call(d().actors.grader.token, 'POST', `/v1/courses/${d().course.id}/actions/${id}/withdraw`, {})
  })

  const VIEWS = [
    { label: 'on a laptop, light', width: 1280, height: 800, dark: false },
    { label: 'on a phone, dark', width: 390, height: 844, dark: true },
    { label: 'on a laptop, dark', width: 1280, height: 800, dark: true },
    { label: 'on a phone, light', width: 390, height: 844, dark: false },
  ]
  /** The last two views, for the screens a theme or a width changes most. */
  const BOTH = new Set([
    'overview',
    'materials',
    'approvals',
    'members',
    'submission',
    'home',
    'student-overview',
    'admin-person',
  ])

  for (const view of VIEWS) {
    test(`no section is a card, no box holds a box, one solid primary at most, no eyebrow, square corners and no shadow, ${view.label}`, async ({
      browser,
    }) => {
      const found: Record<string, Audit> = {}
      const screens = SCREENS.filter((s) => VIEWS.indexOf(view) < 2 || BOTH.has(s.name))
      for (const who of ['instructor', 'yuki', 'root'] as const) {
        const mine = screens.filter((s) => s.who === who)
        if (!mine.length) continue
        const context = await browser.newContext({
          viewport: { width: view.width, height: view.height },
          colorScheme: view.dark ? 'dark' : 'light',
          isMobile: view.width < 600,
          hasTouch: view.width < 600,
        })
        await context.addInitScript((dark) => {
          try {
            localStorage.setItem('aishie.theme', dark ? 'dark' : 'light')
          } catch {}
        }, view.dark)
        const page = await context.newPage()
        await signInAs(page, who)
        for (const screen of mine) {
          const path = typeof screen.path === 'string' ? screen.path : await screen.path(page)
          if (!path) continue
          await page.goto(path)
          await page.waitForLoadState('networkidle').catch(() => {})
          await expect(page.locator('.page-header h1, h1').first()).toBeAttached()
          await page.waitForTimeout(300)
          found[screen.name] = await page.evaluate(audit, Object.keys(PENDING))
          await photograph(page, `screens-${screen.name}-${view.width}-${view.dark ? 'dark' : 'light'}`)
        }
        await context.close()
      }
      const each = <K extends keyof Audit>(key: K) =>
        Object.fromEntries(Object.entries(found).filter(([, a]) => a[key].length).map(([n, a]) => [n, a[key]]))
      expect(Object.keys(found).length, 'screens read').toBeGreaterThan(screens.length - 3)
      expect.soft(each('boxedSections'), 'a section with a ground, a frame or round corners').toEqual({})
      expect.soft(each('boxInBox'), 'a box inside a box').toEqual({})
      expect.soft(each('rounded'), 'a corner rounder than 4 px, not a round mark').toEqual({})
      expect.soft(each('shadows'), 'a shadow that is not a stroke').toEqual({})
      expect.soft(each('eyebrows'), 'small capitalised or letter-spaced words').toEqual({})
      expect.soft(each('dangers'), 'a solid red button outside a confirmation').toEqual({})
      expect
        .soft(
          Object.fromEntries(Object.entries(found).filter(([, a]) => a.solids.length > 1).map(([n, a]) => [n, a.solids])),
          'more than one solid primary on a screen',
        )
        .toEqual({})
      // On the laptop in the light theme, every screen is read: what is pending must still be seen somewhere.
      if (VIEWS.indexOf(view) === 0) {
        const seen = new Set(Object.values(found).flatMap((a) => a.pending))
        expect(
          Object.keys(PENDING).filter((sel) => !seen.has(sel)),
          'pending, yet no screen draws it any more: take it off PENDING',
        ).toEqual([])
      }
    })
  }

  test('the audit itself finds a card, a box in a box, a round corner, a shadow, an eyebrow and a second solid', async ({
    page,
  }) => {
    await signIn(page, d().actors.instructor)
    await page.goto(coursePath('materials'))
    await expect(page.locator('.course-body .app-card').first()).toBeVisible()
    await page.evaluate(() => {
      const made = document.createElement('div')
      made.innerHTML = `
        <section class="app-card made-card" style="background: rgb(255, 0, 0); border: 1px solid red">
          <div class="made-outer" style="border: 1px solid red; width: 300px; height: 120px">
            <div class="made-inner" style="border: 1px solid blue; width: 200px; height: 60px; border-radius: 12px">x</div>
          </div>
          <p class="made-shadow" style="box-shadow: 0 8px 16px black; width: 100px">y</p>
          <span class="made-eyebrow" style="font-size: 12px; text-transform: uppercase">Due soon</span>
          <button class="el-button el-button--primary">One</button><button class="el-button el-button--primary">Two</button>
        </section>`
      document.querySelector('.course-body')!.append(made)
    })
    const a = await page.evaluate(audit, Object.keys(PENDING))
    expect(a.boxedSections.join()).toContain('made-card')
    expect(a.boxInBox.join()).toContain('made-inner')
    expect(a.rounded.join()).toContain('made-inner')
    expect(a.shadows.join()).toContain('made-shadow')
    expect(a.eyebrows.join()).toContain('made-eyebrow')
    expect(a.solids.length).toBeGreaterThanOrEqual(2)
  })

  test('the approvals queue has one solid Approve, the first proposal’s; the later ones say it in indigo words', async ({
    page,
  }) => {
    await signIn(page, d().actors.instructor)
    await page.goto(coursePath('approvals'))
    const cards = page.locator('.action-card')
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(3)
    const approve = (i: number) => cards.nth(i).getByRole('button', { name: 'Approve', exact: true })
    await expect(approve(0)).not.toHaveClass(/is-text/)
    await expect(approve(0)).toHaveClass(/el-button--primary/)
    for (const i of [1, 2]) {
      await expect(approve(i)).toHaveClass(/el-button--primary/)
      await expect(approve(i)).toHaveClass(/is-text/)
    }
    // A proposal is a box of its own: the site's line, 2 px corners, no ground.
    const box = await cards.first().evaluate((el) => {
      const s = getComputedStyle(el)
      return { radius: s.borderTopLeftRadius, width: s.borderTopWidth, ground: s.backgroundColor }
    })
    expect(box).toEqual({ radius: '2px', width: '1px', ground: 'rgba(0, 0, 0, 0)' })

    // Deciding out of turn: the second rejected, its form open. Its confirm is now the one solid button, and the
    // first's Approve is indigo words until the form is put away.
    const solids = async () => (await page.evaluate(audit, Object.keys(PENDING))).solids
    await cards.nth(1).getByRole('button', { name: 'Reject', exact: true }).click()
    const confirm = cards.nth(1).locator('.decide-panel__confirm').getByRole('button', { name: 'Reject', exact: true })
    await expect(confirm).toBeVisible()
    await expect(confirm).not.toHaveClass(/is-text/)
    await expect(approve(0)).toHaveClass(/is-text/)
    expect(await solids()).toEqual([expect.stringContaining('Reject')])
    await cards.nth(1).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(approve(0)).not.toHaveClass(/is-text/)
    expect(await solids()).toEqual([expect.stringContaining('Approve')])
  })

  test('a status that never varies is not shown: no Active column, no Published on each material, no Person beside one’s own seat', async ({
    page,
  }) => {
    await signIn(page, d().actors.instructor)
    // The overview's seat: whoever reads it is a person, and the seat is active.
    await page.goto(coursePath())
    const seat = page.locator('.overview .seat')
    await expect(seat).toBeVisible()
    await expect(seat.locator('dt', { hasText: /^Status$/ })).toHaveCount(0)
    await expect(seat.locator('.seat__tags').getByText('Person', { exact: true })).toHaveCount(0)
    // The materials: Not published is tagged; Published is the usual state, and is not.
    await page.goto(coursePath('materials'))
    const rows = page.locator('.material-row')
    await expect(rows.first()).toBeVisible()
    await expect(page.locator('.material-row__tags').getByText('Not published', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.material-row__tags').getByText('Published', { exact: true })).toHaveCount(0)
    // The members: a Status column only while some row shown is not active.
    await page.goto(coursePath('members'))
    const heads = page.locator('.members__table thead th')
    await expect(heads.first()).toBeVisible()
    const statuses = await call(d().actors.instructor.token, 'GET', `/v1/courses/${d().course.id}/members?limit=200`)
    const now = Date.now()
    const varies = (statuses.body.result?.members ?? []).some(
      (m: { status: string; expires_at?: string | null }) =>
        m.status !== 'active' || (!!m.expires_at && Date.parse(m.expires_at) <= now),
    )
    if (varies) await expect(heads.filter({ hasText: 'Status' })).toHaveCount(1)
    else await expect(heads.filter({ hasText: 'Status' })).toHaveCount(0)

    // My actions: a Status column while an action listed is not simply done (Executed, the usual), and Decided
    // while someone decided one; read from what the page itself was given.
    const listed = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/actions/mine'))
    await page.goto(coursePath('my-actions'))
    const mine = ((await (await listed).json()).result?.actions ?? []) as {
      status: string
      review_state: string
      decided_at?: string | null
    }[]
    const mineHeads = page.locator('.my-actions__table thead th')
    await expect(mineHeads.first()).toBeVisible()
    expect(mine.length).toBeGreaterThan(0)
    const statusShown = mine.some((a) => a.status !== 'executed' || a.review_state !== 'none')
    await expect(mineHeads.filter({ hasText: /^Status$/ })).toHaveCount(statusShown ? 1 : 0)
    await expect(mineHeads.filter({ hasText: /^Decided$/ })).toHaveCount(mine.some((a) => a.decided_at) ? 1 : 0)

    // The submissions: a State column only while some work listed is not handed in (Submitted, the usual);
    // read from what the page itself was given.
    const handedIn = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/submissions'))
    await page.goto(coursePath('submissions'))
    const work = ((await (await handedIn).json()).result?.submissions ?? []) as { state: string }[]
    const workHeads = page.locator('.submissions-table thead th')
    await expect(workHeads.first()).toBeVisible()
    expect(work.length).toBeGreaterThan(0)
    const stateShown = work.some((s) => s.state !== 'submitted')
    await expect(workHeads.filter({ hasText: /^State$/ })).toHaveCount(stateShown ? 1 : 0)

    // A submission's grades waiting for approval (the two this run proposed for Yuki's homework): every one of
    // them waits, as their heading says, and none says so again.
    await page.goto(coursePath(`submissions/${d().course.submissions.yuki_hw1}`))
    const waiting = page.locator('.pending-proposals')
    await expect(waiting.locator('.pending-proposals__row').first()).toBeVisible()
    await expect(waiting.locator('.pending-proposals__list')).not.toContainText('Awaiting approval')
  })

  test('the people list has a Status column only while someone in it is suspended', async ({ page }) => {
    await signInAsRoot(page)
    const heads = page.locator('.actors__table thead th')
    // The run's six people, every one of them active.
    await page.goto(`/admin/actors?q=${encodeURIComponent(`+${d().tag}@demo.test`)}`)
    await expect(page.locator('.actors__table .el-table__body tr')).toHaveCount(6)
    await expect(heads.filter({ hasText: /^Status$/ })).toHaveCount(0)
    await expect(page.locator('.actors__table .el-table__body')).not.toContainText('Active')
    // The same six, one of them as if suspended: the column, saying which.
    await page.route(
      (url) => url.pathname.endsWith('/v1/actors'),
      async (route) => {
        const res = await route.fetch()
        const body = await res.json()
        const actors = body.result?.actors as { status: string; display_name: string }[] | undefined
        if (actors?.[0]) actors[0].status = 'suspended'
        await route.fulfill({ response: res, json: body })
      },
    )
    await page.reload()
    await expect(heads.filter({ hasText: /^Status$/ })).toHaveCount(1)
    await expect(page.locator('.actors__table .el-table__body')).toContainText('Suspended')
    await page.unroute((url) => url.pathname.endsWith('/v1/actors'))
  })

  test('a text button keyboard-focused has the app’s ring: the focus colour, 2 px, 2 px clear of it', async ({ page }) => {
    await signIn(page, d().actors.instructor)
    /** The ring on a button reached by the keyboard, and what it is drawn against. */
    const ring = async (button: Locator) => {
      await button.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      return button.evaluate((el) => {
        const s = getComputedStyle(el)
        const probe = document.createElement('span')
        probe.style.color = 'var(--app-focus)'
        document.body.append(probe)
        const focus = getComputedStyle(probe).color
        probe.remove()
        return {
          visible: el.matches(':focus-visible'),
          colour: s.outlineColor === focus,
          width: s.outlineWidth,
          offset: s.outlineOffset,
          style: s.outlineStyle,
        }
      })
    }
    const app = { visible: true, colour: true, width: '2px', offset: '2px', style: 'solid' }
    // A member's Remove, red words.
    await page.goto(coursePath(`members/${d().actors.yuki.member_id}`))
    const remove = page.locator('.page-header').getByRole('button', { name: 'Remove', exact: true })
    await expect(remove).toHaveClass(/is-text/)
    expect(await ring(remove)).toEqual(app)
    // A later proposal's Approve, indigo words.
    await page.goto(coursePath('approvals'))
    const later = page.locator('.action-card').nth(1).getByRole('button', { name: 'Approve', exact: true })
    await expect(later).toHaveClass(/is-text/)
    expect(await ring(later)).toEqual(app)
  })

  test('on a touch screen a checkbox or a radio is as tall as a button beside it', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await signIn(page, d().actors.instructor)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    const tall = (sel: string) =>
      page.locator(sel).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
    for (const [path, toggle] of [
      [coursePath('materials'), '.page-header .el-checkbox'],
      [coursePath('members'), '.app-toolbar .el-checkbox'],
      [coursePath('groups'), '.app-toolbar .el-checkbox'],
      [coursePath('my-actions'), '.my-actions__toolbar .el-checkbox'],
    ] as const) {
      await page.goto(path)
      await expect(page.locator(toggle).first(), path).toBeVisible()
      for (const h of await tall(toggle)) expect(h, path).toBeGreaterThanOrEqual(44)
    }
    // A member's role, chosen among plain radios.
    await page.goto(coursePath(`members/${d().actors.yuki.member_id}`))
    await page.getByRole('button', { name: 'Change role' }).click()
    const roles = page.locator('.role-dialog__role')
    await expect(roles.first()).toBeVisible()
    for (const h of await tall('.role-dialog__role')) expect(h).toBeGreaterThanOrEqual(44)
    await context.close()
  })

  test('a row that opens something keeps its › at its end, on a laptop and on a phone', async ({ browser }) => {
    for (const phone of [false, true]) {
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        isMobile: phone,
        hasTouch: phone,
      })
      const page = await context.newPage()
      await signIn(page, d().actors.instructor)
      const each = async (path: string, row: string, go: string) => {
        await page.goto(path)
        const rows = page.locator(row)
        await expect(rows.first(), `${path} ${row}`).toBeVisible()
        const without = await rows.evaluateAll(
          (els, g) => els.filter((el) => !el.querySelector(g)).map((el) => el.textContent?.trim().slice(0, 40)),
          go,
        )
        expect(without, `${path}: ${row} without ${go}`).toEqual([])
      }
      // The overview's assignments.
      await each(coursePath(), '.assignments__row', '.assignments__go')
      if (phone) {
        // A phone's submissions, and an assignment's roster (the submissions of one assignment), a row each.
        await each(coursePath('submissions'), '.submission-cards__item', '.submission-cards__go')
        await each(
          coursePath(`submissions?assignment=${d().course.assignments.hw1}`),
          '.roster-cards__link',
          '.roster-cards__go',
        )
      }
      await context.close()
    }
  })
})
