/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import {
  accountButton,
  accountMenu,
  activityBar,
  coursePath,
  demo,
  inTraditionalChinese,
  openAccountMenu,
  photograph,
  signIn,
  signInAsRoot,
} from './support'

// The account, as an editor's Accounts: one button, the initial of the
// caller's name, at the bottom of the activity bar, whose menu says who is
// signed in and holds the account's settings, the language and the theme
// (each a submenu, the choice in use checked) and signing out. The header
// holds the page's title and the chat's button. On a phone, the account is a row at the
// bottom of the side menu, its submenus opening beneath their items.

test.describe('the account menu', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is the only menu: at the bottom of the activity bar, none in the header', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    // The header holds the title, and no button but the chat's.
    await expect(page.locator('.app-header button')).toHaveCount(1)
    await expect(page.locator('.app-header button')).toHaveAttribute('aria-controls', 'chat-panel')
    await expect(page.locator('.app-header .el-dropdown')).toHaveCount(0)

    const button = accountButton(page)
    await expect(button).toHaveAttribute('aria-label', `Account: ${d.actors.instructor.display_name}`)
    await expect(button).toHaveAttribute('aria-haspopup', 'menu')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(button).toHaveText(d.actors.instructor.display_name.trim().slice(0, 1).toUpperCase())
    // Low in the activity bar, below its views, against the window's left edge.
    const box = (await button.boundingBox())!
    const views = (await activityBar(page).boundingBox())!
    const win = page.viewportSize()!
    expect(box.x).toBeLessThan(48)
    expect(box.y).toBeGreaterThan(views.y + views.height)
    expect(win.height - (box.y + box.height)).toBeLessThan(24)

    const menu = await openAccountMenu(page)
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.locator('.account-menu__name')).toHaveText(d.actors.instructor.display_name)
    await expect(menu.locator('.account-menu__email')).toHaveText(d.actors.instructor.email!)
    await expect(menu.locator(':scope > [role="menuitem"], :scope > [role="none"] > [role="menuitem"]')).toHaveText([
      'Account settings',
      /Language\s*English$/,
      /Theme\s*System$/,
      'About AIshie',
      'Sign out',
    ])
    await expect(menu).not.toContainText('My agents')
    // Beside the bar, over the page, within the window.
    const m = (await menu.boundingBox())!
    expect(m.x).toBeGreaterThanOrEqual(box.x + box.width)
    expect(m.y + m.height).toBeLessThanOrEqual(win.height)

    await menu.getByRole('menuitem', { name: 'Account settings' }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(accountMenu(page)).toHaveCount(0)
  })

  test('is worked from the keyboard: the language and the theme are chosen in their submenus', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()

    const button = accountButton(page)
    await button.focus()
    await page.keyboard.press('Enter')
    const menu = accountMenu(page)
    await expect(menu.getByRole('menuitem', { name: 'Account settings' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    const language = menu.locator('[data-opens="language"]')
    await expect(language).toBeFocused()
    await expect(language).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('ArrowRight')
    await expect(language).toHaveAttribute('aria-expanded', 'true')
    const languages = menu.getByRole('menu', { name: 'Language' })
    await expect(languages.getByRole('menuitemradio')).toHaveText(['繁體中文', '简体中文', 'English'])
    // On the one in use, checked.
    await expect(languages.getByRole('menuitemradio', { name: 'English' })).toBeFocused()
    await expect(languages.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
    // ArrowLeft goes back, and ArrowRight in again.
    await page.keyboard.press('ArrowLeft')
    await expect(language).toBeFocused()
    await expect(languages).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowUp')
    await expect(languages.getByRole('menuitemradio', { name: '简体中文' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-label', `账号：${d.actors.instructor.display_name}`)

    // The theme: dark, remembered; then the system's again. ArrowDown on the button opens it on its first item.
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: '账号设置' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.locator('[data-opens="language"]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    const theme = menu.locator('[data-opens="theme"]')
    await expect(theme).toBeFocused()
    await page.keyboard.press('Space')
    const themes = menu.getByRole('menu', { name: '主题' })
    await expect(themes.getByRole('menuitemradio')).toHaveText(['浅色', '深色', '跟随系统'])
    await expect(themes.getByRole('menuitemradio', { name: '跟随系统' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // (The tests' own sign-in puts every page they load in English.)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    // Escape closes a submenu first, then the menu; Tab closes it too, back on the button.
    await openAccountMenu(page)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    const themesEn = menu.getByRole('menu', { name: 'Theme' })
    await expect(themesEn.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    await expect(themesEn.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(themesEn).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(menu.locator('[data-opens="theme"]')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(button).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(menu).toHaveCount(0)
    await expect(button).toBeFocused()

    await openAccountMenu(page)
    await menu.locator('[data-opens="theme"]').click()
    await themesEn.getByRole('menuitemradio', { name: 'System' }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })

  test('opens About over the whole window, and closes back on its button', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    await page.goto(coursePath())
    await expect(page.locator('.course-head')).toBeVisible()
    const button = accountButton(page)
    await button.focus()
    await page.keyboard.press('ArrowUp')
    const menu = accountMenu(page)
    await page.keyboard.press('ArrowUp')
    await expect(menu.getByRole('menuitem', { name: 'About AIshie' })).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.locator('.about-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('The LMS for the agent era')
    // Modal: its overlay is what lies over the side bar, the header and the page, not they over it.
    const url = page.url()
    for (const [x, y] of [
      [150, 140],
      [700, 28],
      [1300, 600],
    ] as const) {
      const over = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y)
        return !!el?.closest('.el-overlay')
      }, [x, y] as const)
      expect(over, `the overlay at ${x},${y}`).toBe(true)
    }
    // Escape closes it, and focus is on the account button again.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()
    // A click beside it, over the side bar, closes it and follows nothing there.
    await (await openAccountMenu(page)).getByRole('menuitem', { name: 'About AIshie' }).click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(150, 140)
    await expect(dialog).toBeHidden()
    expect(page.url()).toBe(url)
  })

  test('says a platform role beside the name', async ({ page }) => {
    await signInAsRoot(page)
    const menu = await openAccountMenu(page)
    await expect(menu.locator('.account-menu__role')).toHaveText('Root')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })

  test('in Traditional Chinese, open on the language', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await inTraditionalChinese(page)
    await page.goto(coursePath())
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
    const menu = await openAccountMenu(page)
    await menu.locator('[data-opens="language"]').click()
    await expect(menu.getByRole('menuitemradio', { name: '繁體中文' })).toHaveAttribute('aria-checked', 'true')
    await photograph(page, 'account-menu')
    await page.locator('html').evaluate((h) => h.classList.add('dark'))
    await photograph(page, 'account-menu-dark')
    await page.locator('html').evaluate((h) => h.classList.remove('dark'))
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the account is at the bottom of the side menu, its submenus opening beneath their items', async ({ page }) => {
    const d = demo()
    await signIn(page, d.actors.yuki)
    await inTraditionalChinese(page)
    await page.goto(coursePath())
    await expect(accountButton(page)).toHaveCount(0)
    await page.locator('.app-header').getByRole('button', { name: '選單' }).click()
    const drawer = page.locator('.app-nav-drawer')
    const row = drawer.locator('#account-button-drawer')
    await expect(row).toBeVisible()
    await expect(row).toContainText(d.actors.yuki.display_name)
    await expect(row).toContainText(d.actors.yuki.email!)
    const r = (await row.boundingBox())!
    expect(844 - (r.y + r.height)).toBeLessThan(4)
    await row.click()
    const menu = drawer.locator('#account-menu-drawer')
    await expect(menu).toBeVisible()
    await menu.locator('[data-opens="theme"]').click()
    const themes = menu.getByRole('menu', { name: '主題' })
    await expect(themes.getByRole('menuitemradio')).toHaveText(['淺色', '深色', '跟隨系統'])
    // Within the side menu, and the screen.
    const m = (await menu.boundingBox())!
    expect(m.x).toBeGreaterThanOrEqual(0)
    expect(m.x + m.width).toBeLessThanOrEqual(390)
    expect(m.y).toBeGreaterThanOrEqual(0)
    await photograph(page, 'account-menu-phone')
    await themes.getByRole('menuitemradio', { name: '深色' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await row.click()
    await menu.locator('[data-opens="theme"]').click()
    await themes.getByRole('menuitemradio', { name: '跟隨系統' }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    // Signing out, from it.
    await row.click()
    await menu.getByRole('menuitem', { name: '登出' }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
