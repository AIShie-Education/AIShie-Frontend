/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  inTraditionalChinese,
  openAccountMenu,
  registerPerson,
  root,
  signIn,
  type DemoActor,
} from './support'

// Which typeface draws which letters (docs/CONVENTIONS.md, Text). A page in
// Chinese sets Latin letters, figures and the dot of "CS101·A" in Plex and
// Source Serif, as an English page does, and Han and its punctuation in Noto;
// a page in English sets the Chinese it shows (a course's title, a name) in
// Noto TC, whose style sheets it fetches only once it shows some, never in a
// face of the system's (PingFang, Songti, PMingLiU). What draws an element's
// text is the browser's own answer (CSS.getPlatformFontsForNode), with how
// many glyphs each face drew.

const stamp = Date.now().toString(36)
const TITLE = `程式設計入門 ${stamp}`
let chan: DemoActor

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  // A course of its own with a Chinese title, whose one member is a person with a Chinese name.
  const made = await call(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'TYPE101',
    section: stamp,
    title: TITLE,
  })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  const courseId = made.body.result.course_id
  const active = await call(token, 'POST', `/v1/courses/${courseId}/activate`, {})
  expect(active.body.status, JSON.stringify(active.body)).toBe('executed')
  chan = await registerPerson('陳大文', { email: `chan+${stamp}@e2e.test` })
  const seated = await call(token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: chan.actor_id })
  expect(seated.body.status, JSON.stringify(seated.body)).toBe('executed')
})

/**
 * The faces that draw the text of an element and of what it holds, each by
 * its family and with how many glyphs it drew; a face of the system's is
 * marked so.
 */
async function faces(target: Locator): Promise<Record<string, number>> {
  const page = target.page()
  const mark = `faces-${Math.random().toString(36).slice(2)}`
  await target.evaluate((el, mark) => el.setAttribute('data-faces', mark), mark)
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: `[data-faces="${mark}"]` })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    const out: Record<string, number> = {}
    for (const f of fonts) {
      // A file names its family with its weight ("Noto Sans TC Thin", "Source Serif 4 SemiBold").
      const family = f.familyName.replace(/ (?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold)$/, '')
      const name = f.isCustomFont ? family : `${family} (system)`
      out[name] = (out[name] ?? 0) + f.glyphCount
    }
    return out
  } finally {
    await cdp.detach()
    await target.evaluate((el) => el.removeAttribute('data-faces'))
  }
}

/** An element put at the end of `parent` with this text, for `faces` to read. */
async function probe(parent: Locator, tag: string, text: string): Promise<Locator> {
  await parent.evaluate(
    (el, [tag, text]) => {
      const made = document.createElement(tag!)
      made.id = 'typeface-probe'
      made.textContent = text!
      el.append(made)
    },
    [tag, text],
  )
  return parent.page().locator('#typeface-probe')
}

/** Notes, from now on, each Chinese face and Chinese style sheet the page fetches: its script, tc or sc. */
function chineseFetched(page: Page): string[] {
  const fetched: string[] = []
  page.on('request', (r) => {
    const m = r.url().match(/noto-(?:sans|serif)-(tc|sc)|fonts-zh-han(t|s)/)
    if (m) fetched.push(m[1] ?? (m[2] === 't' ? 'tc' : 'sc'))
  })
  return fetched
}

test('a page in Traditional Chinese sets Latin letters, figures and the dot in Plex, and Han and its punctuation in Noto', async ({
  page,
}) => {
  await signIn(page, demo().actors.instructor)
  await inTraditionalChinese(page)
  await page.goto(coursePath())
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.locator('.course-head__code')).toHaveText('CS101·A')

  // The course's code and the dot between it and its section, and its title, in English: Plex alone.
  const code = page.locator('.course-head__code')
  await expect.poll(() => faces(code)).toEqual({ 'IBM Plex Sans': 'CS101·A'.length })
  expect(await faces(code.locator('.app-sep'))).toEqual({ 'IBM Plex Sans': 1 })
  const title = page.locator('.course-head__title')
  expect(await faces(title)).toEqual({ 'IBM Plex Sans': (await title.textContent())!.length })
  // A card's title, in Chinese: Noto Serif TC.
  const seat = page.locator('h2.app-card__title', { hasText: '你的席位' })
  await expect.poll(() => faces(seat)).toEqual({ 'Noto Serif TC': 4 })

  // Letters, figures and the dot in Plex; the corner brackets, the comma, the parentheses, the
  // doubled em dash and the ellipsis in Noto Sans TC, as Han is: none of them in a face of the system's.
  const sans = await probe(page.locator('.page-header'), 'span', '「CS101·A」，（你）——…')
  // (Noto draws the two em dashes as one glyph: 8 glyphs for 9 characters.)
  await expect.poll(() => faces(sans)).toEqual({ 'IBM Plex Sans': 7, 'Noto Sans TC': 8 })
  // They are one line, as Chinese writes its dash, about two of its characters wide.
  const dash = await sans.evaluate((el) => {
    const text = el.firstChild!
    const at = text.textContent!.indexOf('——')
    const r = document.createRange()
    r.setStart(text, at)
    r.setEnd(text, at + 2)
    return { width: r.getBoundingClientRect().width, em: parseFloat(getComputedStyle(el).fontSize) }
  })
  expect(dash.width).toBeGreaterThan(1.6 * dash.em)
  expect(dash.width).toBeLessThanOrEqual(2 * dash.em + 0.5)
  await sans.evaluate((el) => el.remove())

  // In a heading, the serif's: Source Serif for the letters, figures and the dot, Noto Serif TC for Han.
  const serif = await probe(page.locator('.page-header'), 'h2', 'CS101·A 第二週')
  await expect.poll(() => faces(serif)).toEqual({ 'Source Serif 4': 'CS101·A '.length, 'Noto Serif TC': 3 })
})

test('a page in English fetches no Chinese face while it shows no Chinese, not for the language menu either', async ({
  page,
}) => {
  const fetched = chineseFetched(page)
  await signIn(page, demo().actors.instructor)
  await page.goto(coursePath())
  await expect(page.locator('.course-head__title')).toHaveText('Introduction to Programming')

  // The language menu names each language in itself, and says which it is in.
  const menu = await openAccountMenu(page)
  await menu.locator('[data-opens="language"]').click()
  for (const [name, lang] of [
    ['繁體中文', 'zh-Hant'],
    ['简体中文', 'zh-Hans'],
    ['English', 'en'],
  ]) {
    await expect(menu.getByRole('menuitemradio', { name })).toHaveAttribute('lang', lang)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  expect(fetched).toEqual([])
})

test('a page in English sets the Chinese it shows in Noto TC, fetched once it shows some, in no face of the system’s', async ({
  page,
}) => {
  const fetched = chineseFetched(page)
  await signIn(page, chan)
  await expect(page.locator('.course-card__title')).toHaveText(TITLE)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // A course's title in the serif: Noto Serif TC for Han, Source Serif for the rest.
  await expect
    .poll(() => faces(page.locator('.course-card__title')))
    .toEqual({ 'Noto Serif TC': 6, 'Source Serif 4': TITLE.length - 6 })
  // "Hello, 陳大文": the same.
  await expect
    .poll(() => faces(page.locator('.page-header__title-text')))
    .toEqual({ 'Source Serif 4': 'Hello, '.length, 'Noto Serif TC': 3 })
  // Its code in Plex; in the sans, Han in Noto Sans TC.
  expect(await faces(page.locator('.course-card__code'))).toEqual({ 'IBM Plex Sans': `TYPE101·${stamp}`.length })
  const sans = await probe(page.locator('.page-header'), 'span', '程式設計入門 CS101')
  await expect.poll(() => faces(sans)).toEqual({ 'Noto Sans TC': 6, 'IBM Plex Sans': ' CS101'.length })

  // Traditional Chinese's, never Simplified's.
  expect(fetched).toContain('tc')
  expect(fetched).not.toContain('sc')
})
