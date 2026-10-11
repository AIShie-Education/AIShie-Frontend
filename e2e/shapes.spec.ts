/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { chatButton, coursePath, demo, signIn, signInAsRoot } from './support'
import { shapeOffences, soloPrimary } from './styleAudit'

// Element Plus's overlays in the app's shapes (docs/CONVENTIONS.md, "Shapes";
// styles/element.css), as aishie.app draws its own boxes: a dialog, a
// select's options, a date picker, a message box and a tooltip have 2 px
// corners and an edge, a drawer none, and none of them casts a shadow, in
// the light theme and in the dark one, whose Element Plus theme casts shadows
// of its own. A field focused turns its edge navy and doubles it, with no
// halo. A dialog and a message box have one solid button each. A page's
// table is ruled between its rows in the site's line, and an author's heading
// in rendered Markdown stays under the page's title, a listing ruled above
// and below with no ground; its words stop at the measure, but an image, a
// listing and a table run the column's width; its sections' headings are
// stepped in the serif, and none of its headings looks like another or like
// an author's bold words. The audit is checked first: it finds what it is
// for when it is planted in a page, and lets a round mark through.

/** Reads the app in a theme from the next page load on. */
async function inTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('aishie.theme', t)
    } catch {}
  }, theme)
}

/** What the audit finds within what a CSS selector names (each one shown), one to a line for the failure's message. */
async function offencesIn(page: Page, within: string) {
  return (await shapeOffences(page, { within })).map((o) => `${o.kind}: ${o.where}: ${o.value} «${o.text}»`)
}

test('the audit finds a shadow, a pill, a rounded box, a gradient, frosted glass and letters’ shadow, and lets a round mark through', async ({
  page,
}) => {
  await signIn(page, demo().actors.instructor)
  await page.goto(coursePath('materials'))
  await expect(page.locator('.page-header')).toBeVisible()
  await page.evaluate(() => {
    const at = document.createElement('div')
    at.className = 'planted'
    at.innerHTML = `
      <div class="planted-shadow" style="width:80px;height:40px;background:#fff;box-shadow:0 4px 12px rgb(0 0 0 / 20%)"></div>
      <div class="planted-ring" style="width:80px;height:40px;box-shadow:0 0 0 1px #888 inset, 0 0 0 2px #22407a"></div>
      <span class="planted-pill" style="display:inline-block;width:80px;height:20px;border-radius:999px;background:#eee"></span>
      <div class="planted-card" style="width:80px;height:40px;border:1px solid #ccc;border-radius:12px"></div>
      <div class="planted-quiet" style="width:80px;height:40px;border-radius:12px"></div>
      <div class="planted-fade" style="width:80px;height:40px;background-image:linear-gradient(red, blue)"></div>
      <div class="planted-glass" style="width:80px;height:40px;backdrop-filter:blur(8px)"></div>
      <p class="planted-letters" style="width:80px;text-shadow:0 1px 2px rgb(0 0 0 / 30%)">Aa</p>
      <p class="planted-plain" style="width:80px;text-shadow:none">Aa</p>
      <span class="askable-dot" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#333"></span>
      <span class="planted-circle" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#333"></span>
      <span class="askable-dot planted-wide" style="display:inline-block;width:24px;height:8px;border-radius:50%;background:#333"></span>`
    document.body.append(at)
  })
  const found = (await offencesIn(page, '.planted')).map((line) => line.replace(/ in .*?:/, ':'))
  expect(found).toEqual([
    'shadow: div.planted-shadow: rgba(0, 0, 0, 0.2) 0px 4px 12px 0px «»',
    'pill: span.planted-pill: 999px «»',
    'radius: div.planted-card: 12px «»',
    'gradient: div.planted-fade: linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255)) «»',
    'backdrop: div.planted-glass: blur(8px) «»',
    'text-shadow: p.planted-letters: rgba(0, 0, 0, 0.3) 0px 1px 2px «Aa»',
    // Round, but not a mark; and a mark is round only where it is as wide as it is tall.
    'radius: span.planted-circle: 50% «»',
    'pill: span.askable-dot.planted-wide: 50% «»',
  ])
})

for (const theme of ['light', 'dark'] as const) {
  test(`a dialog, a select’s options, a date picker and a tooltip have 2 px corners and no shadow, in the ${theme} theme`, async ({
    page,
  }) => {
    await inTheme(page, theme)
    await signIn(page, demo().actors.instructor)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    // New assignment: a dialog with fields, a select and a date picker, and one solid button.
    await page.goto(coursePath('assignments'))
    await page.locator('.page-header__actions .el-button--primary').click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(400)
    const shell = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow }
    })
    // Framed in the line by a ring of 1 px (styles/overlays.css), a stroke that takes no width from what it holds,
    // and nothing cast.
    expect(shell.radius).toBe('2px')
    expect(shell.shadow).toMatch(/^rgb\([^)]+\) 0px 0px 0px 1px$/)
    expect(await offencesIn(page, '.el-dialog')).toEqual([])
    expect((await soloPrimary(page)).overlays).toEqual([['Create']])

    // A field focused: its edge in the focus colour (--app-focus, the navy; in the dark theme its lighter step),
    // doubled by an outline on it in the same colour, and no halo.
    const title = dialog.locator('input').first()
    await title.focus()
    const focused = await title.evaluate((input) => {
      const wrapper = input.closest('.el-input__wrapper')!
      const cs = getComputedStyle(wrapper)
      return {
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
        outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      }
    })
    const focus = theme === 'dark' ? 'rgb(157, 179, 230)' : 'rgb(34, 64, 122)'
    expect(focused).toEqual({ radius: '2px', shadow: `${focus} 0px 0px 0px 1px inset`, outline: `1px solid ${focus}` })

    // The scheme's component it counts towards: a select's options, a box of their own.
    await dialog
      .locator('.el-form-item')
      .filter({ has: page.locator('.el-select') })
      .first()
      .locator('.el-select__wrapper')
      .click()
    const options = page.locator('.el-select-dropdown:visible').first()
    await expect(options).toBeVisible()
    await page.waitForTimeout(300)
    expect(await offencesIn(page, '.el-select__popper')).toEqual([])
    await page.keyboard.press('Escape')

    // Its due date: a date picker, today a square.
    await dialog.locator('.assignment-form__due .el-input__wrapper').click()
    const picker = page.locator('.el-picker-panel.el-date-picker:visible')
    await expect(picker.locator('.el-date-table')).toBeVisible()
    await page.waitForTimeout(300)
    expect(await offencesIn(page, '.el-picker__popper')).toEqual([])
    const today = picker.locator('.el-date-table td.today .el-date-table-cell__text')
    expect(await today.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('2px')
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    // A tooltip: the chat's button's.
    await chatButton(page).hover()
    const tip = page.locator('.el-popper:visible').filter({ hasText: /^Chat with agents/ })
    await expect(tip).toBeVisible()
    await page.waitForTimeout(300)
    expect(await offencesIn(page, '.el-popper.is-dark, .el-popper.is-light')).toEqual([])
  })

  test(`a drawer has no corners and casts no shadow, in the ${theme} theme`, async ({ page }) => {
    await inTheme(page, theme)
    await signInAsRoot(page)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // A permission preset's details.
    await page.goto('/admin/presets')
    await page.getByRole('button', { name: 'Details' }).first().click()
    const drawer = page.locator('.preset-drawer')
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(400)
    expect(await drawer.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none')
    expect(await offencesIn(page, '.el-drawer')).toEqual([])
  })

  test(`a message box has 2 px corners, no shadow and one solid button, in the ${theme} theme`, async ({ page }) => {
    await inTheme(page, theme)
    await signIn(page, demo().actors.instructor)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // Archiving a material asks first, its last step the one solid button, in red; cancelled.
    await page.goto(coursePath(`documents/${demo().course.documents.week1}`))
    await page.locator('.page-header__actions').getByRole('button', { name: 'Archive' }).click()
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible()
    await page.waitForTimeout(400)
    expect(await box.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('2px')
    expect(await offencesIn(page, '.el-message-box')).toEqual([])
    expect((await soloPrimary(page)).overlays).toEqual([['Archive']])
    await box.getByRole('button', { name: 'Cancel' }).click()
    await expect(box).toBeHidden()
  })
}

test('a table’s rows are parted by the site’s line, and an author’s headings stay under the page’s title', async ({
  page,
}) => {
  const d = demo()
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath('members'))
  const cell = page.locator('.el-table__body td.el-table__cell').first()
  await expect(cell).toBeVisible()
  // --app-line, aishie.app's --line: #d9d4c8.
  expect(await cell.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe('rgb(217, 212, 200)')

  // Week 1's material: "# Welcome to CS101", "## Before the lab", a listing and a quotation.
  await page.goto(coursePath(`documents/${d.course.documents.week1}`))
  const body = page.locator('.markdown-body').first()
  await expect(body.locator('h1')).toBeVisible()
  const sizes = await page.evaluate(() => {
    const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0)
    const md = document.querySelector('.markdown-body')!
    const pre = md.querySelector('pre')!
    const cs = getComputedStyle(pre)
    return {
      page: size(document.querySelector('.page-header__title')),
      h1: size(md.querySelector('h1')),
      h2: size(md.querySelector('h2')),
      listing: {
        top: cs.borderTopWidth,
        bottom: cs.borderBottomWidth,
        ground: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
      },
      measure: getComputedStyle(md.querySelector('p')!).maxWidth,
    }
  })
  expect(sizes.page).toBe(24)
  expect(sizes.h1).toBe(20)
  expect(sizes.h2).toBe(18)
  expect(sizes.listing).toEqual({ top: '1px', bottom: '1px', ground: 'rgba(0, 0, 0, 0)', radius: '0px' })
  // 34em of the text's 15 px.
  expect(sizes.measure).toBe('510px')
})

test('an author’s image, and an item or a quotation that holds a listing or a table, run the column’s width, and an author’s headings are told from each other and from bold words', async ({
  page,
}) => {
  const d = demo()
  await page.setViewportSize({ width: 1600, height: 900 })
  await signIn(page, d.actors.instructor)
  await page.goto(coursePath(`documents/${d.course.documents.week1}`))
  const body = page.locator('.markdown-body').first()
  await expect(body.locator('h1')).toBeVisible()
  // As markdown-it renders them: a paragraph of words; an image written on its own line, and one
  // in a link; a list item of words and a listing; a quotation holding a table; then a #, a ##, a
  // ### and a #### among paragraphs, one of them an author's bold line.
  const words = 'Words of running text, long enough to fill a line at the measure and run on to the next. '.repeat(4)
  await body.evaluate((md, text) => {
    const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
    md.innerHTML = `
      <p class="t-words">${text}</p>
      <p class="t-image"><img src="${pixel}" alt="A screenshot" width="1600" height="200"></p>
      <p class="t-linked"><a href="#"><img src="${pixel}" alt="A diagram" width="1600" height="200"></a></p>
      <ul><li class="t-item"><p class="t-item-words">${text}</p><pre><code>${'x = 1; '.repeat(40)}</code></pre></li></ul>
      <blockquote class="t-quote"><table><tbody><tr>${'<td>A cell of a wide table</td>'.repeat(12)}</tr></tbody></table></blockquote>
      <h1>A title</h1><p>${text}</p>
      <h2>A section</h2><p>${text}</p>
      <h3>A subsection</h3><p>${text}</p>
      <p class="t-bold"><strong>An author’s bold line</strong></p>
      <h4>A minor heading</h4><p>${text}</p>`
  }, words)

  const widths = await page.evaluate(() => {
    const md = document.querySelector('.markdown-body')!
    const w = (sel: string) => Math.round(md.querySelector(sel)!.getBoundingClientRect().width)
    return {
      column: Math.round(parseFloat(getComputedStyle(md).width)),
      words: w('.t-words'),
      image: w('.t-image img'),
      linked: w('.t-linked img'),
      item: w('.t-item'),
      itemWords: w('.t-item-words'),
      listing: w('.t-item pre'),
      quote: w('.t-quote'),
    }
  })
  // The column is wider than the measure here, or the test says nothing.
  expect(widths.column).toBeGreaterThan(600)
  // Words stop at 34em of 15 px, in a list item too; an image, a listing and a table do not.
  expect(widths.words).toBe(510)
  expect(widths.itemWords).toBe(510)
  expect(widths.image).toBe(widths.column)
  expect(widths.linked).toBe(widths.column)
  expect(widths.listing).toBe(widths.item)
  expect(widths.item).toBeGreaterThan(510)
  expect(widths.quote).toBe(widths.column)

  // Every heading in the ink and a heading's weight. #, ## and ### in the serif, a step apart under
  // the page's 24 px title; #### the text's size in the sans, as the site's h4. An author's bold
  // words in a heading's weight too, but in the text's ink: a ### is larger and in the serif, a ####
  // in the ink. So, in every language (Chinese's heading weight 700, its strong text 500), no two
  // of them alike.
  for (const lang of ['en', 'zh-Hant', 'zh-Hans'] as const) {
    const looks = await page.evaluate((l) => {
      document.documentElement.lang = l
      const md = document.querySelector('.markdown-body')!
      const look = (sel: string) => {
        const cs = getComputedStyle(md.querySelector(sel)!)
        // The stack's first face: Source Serif 4 or IBM Plex Sans; in Chinese, AIshie Latin Serif or AIshie Latin.
        const face = /serif/i.test(cs.fontFamily.split(',')[0]!) ? 'serif' : 'sans'
        return `${cs.fontSize} ${cs.fontWeight} ${cs.color} ${face}`
      }
      return {
        h1: look('h1'),
        h2: look('h2'),
        h3: look('h3'),
        h4: look('h4'),
        bold: look('.t-bold strong'),
        words: look('.t-words'),
      }
    }, lang)
    const heading = lang === 'en' ? 600 : 700
    expect(looks, lang).toEqual({
      h1: `20px ${heading} rgb(28, 28, 28) serif`,
      h2: `18px ${heading} rgb(28, 28, 28) serif`,
      h3: `16px ${heading} rgb(28, 28, 28) serif`,
      h4: `15px ${heading} rgb(28, 28, 28) sans`,
      bold: `15px ${heading} rgb(58, 58, 58) sans`,
      words: '15px 400 rgb(58, 58, 58) sans',
    })
    expect(new Set(Object.values(looks)).size, lang).toBe(6)
  }
})
