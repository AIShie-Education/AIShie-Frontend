import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  call,
  demo,
  expectSignedInAs,
  expectToasted,
  keepToasts,
  photograph,
  registerPerson,
  root,
  showSideView,
  signInAsRoot,
} from './support'
import { startStandInIdp, type StandInIdp } from './stand-in-idp'

// 登入方式: root sets up an identity provider of the site's on the
// administration page, against a stand-in provider (stand-in-idp.ts), tests
// it, adds it, switched off, and switches it on; the sign-in page shows its
// button, and a person the provider vouches for signs in through it, linked
// to their account by the verified email it vouches for. Switched off, the
// button goes; deleted, the one account linked at it is unlinked.
//
// GET /v1/auth/methods may be kept by a browser for a minute: each look at
// the sign-in page is from a browser context of its own, as someone else's
// browser would be.

const tag = `s${Date.now().toString(36)}`
const PROVIDER_ID = `e2e-${tag}`
const NAME = `Campus ${tag}`
const DOMAIN = `${tag}.example.edu`

let idp: StandInIdp
let redirectUri: string
let person: { actor_id: string; display_name: string; email: string }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ baseURL }) => {
  const listed = await call(root().token, 'GET', '/v1/sso/providers')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  expect(listed.body.result.can_add, 'scripts/ci-core.sh gives Core a SECRETS_KEY').toBe(true)
  redirectUri = listed.body.result.redirect_uri
  expect(redirectUri).toBe(`${demo().core.replace(/\/+$/, '')}/v1/auth/sso/callback`)
  const email = `mori@${DOMAIN}`
  const reg = await registerPerson(`Mori ${tag}`, { email })
  person = { actor_id: reg.actor_id, display_name: reg.display_name, email }
  idp = await startStandInIdp({ redirectUri, backTo: baseURL!, subject: `mori-${tag}@campus.example`, email })
})

test.afterAll(async () => {
  // A run that failed on the way leaves nothing offered on the sign-in page of the tests after it.
  const left = await call(root().token, 'GET', `/v1/sso/providers/${PROVIDER_ID}`)
  if (left.status === 200) {
    await call(root().token, 'POST', `/v1/sso/providers/${PROVIDER_ID}/delete`, { force: true })
  }
  await idp?.close()
})

/** The sign-in page, as a browser that has not seen it before sees it. */
async function freshSignInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aishie.locale', 'en')
    } catch {}
  })
  await page.goto('/login')
  // The password form, or, where single sign-on is offered, the link to it beneath the providers.
  await expect(page.locator('input[name=password]:visible, button.login__use-password:visible').first()).toBeVisible()
  return page
}

const ssoButton = (page: Page) => page.getByRole('button', { name: `Sign in with ${NAME}` })
const providerRow = (page: Page) => page.locator('.sso-admin__table tbody tr').filter({ has: page.locator(`[data-provider="${PROVIDER_ID}"]`) })

async function openSignInAdmin(page: Page) {
  await signInAsRoot(page)
  const side = await showSideView(page, 'Administration')
  await side.getByRole('link', { name: 'Sign-in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/sign-in$/)
  await expect(page.locator('.page-header__title')).toHaveText('Sign-in')
}

test('root adds a provider, tests it and switches it on; a person signs in through its button', async ({
  page,
  browser,
}) => {
  await keepToasts(page)
  await openSignInAdmin(page)
  await expect(page.locator('.sso-admin__redirect .redirect-uri__value')).toHaveText(redirectUri)

  await page.getByRole('button', { name: 'Add provider' }).click()
  const dialog = page.locator('.sso-dialog')
  await expect(dialog.getByText('Add a single sign-on provider')).toBeVisible()
  // The redirect URI to register, before anything else is asked for.
  await expect(dialog.locator('.redirect-uri__value')).toHaveText(redirectUri)
  await expect(dialog.getByRole('button', { name: 'Copy the redirect URI' })).toBeVisible()

  await dialog.locator('.sso-form__id input').fill(PROVIDER_ID)
  await dialog.locator('.sso-form__name input').fill(NAME)
  await expect(dialog.locator('.sso-preview__button')).toHaveText(`Sign in with ${NAME}`)
  await dialog.locator('.sso-form__issuer input').fill(idp.issuer)
  await dialog.locator('.sso-form__client-id input').fill(idp.clientId)
  await dialog.locator('.sso-form__secret input').fill(idp.clientSecret)

  // Tested before it is added: nobody signs in, and no secret is sent.
  await dialog.getByRole('button', { name: 'Test', exact: true }).click()
  const report = dialog.locator('.sso-form__report')
  await expect(report.locator('.sso-report__verdict')).toContainText('Ready: a sign-in can go through this issuer.')
  await expect(report.locator('.sso-report__endpoint-authorization')).toHaveText(`${idp.issuer}/authorize`)
  await expect(report.locator('.sso-report__endpoint-token')).toHaveText(`${idp.issuer}/token`)
  await expect(report.locator('.sso-report__key')).toContainText('RS256')
  await expect(report.locator('.sso-report__key')).toContainText('key ID e2e')
  expect(idp.signIns).toBe(0)
  await dialog.locator('.redirect-uri').scrollIntoViewIfNeeded()
  await photograph(page, 'sso-dialog-top')
  await report.scrollIntoViewIfNeeded()
  await photograph(page, 'sso-dialog-report')

  // Linking by email, kept to the domain the person's email is in.
  await dialog.locator('.sso-form__link-by-email').click()
  const domains = dialog.locator('.sso-form__domains')
  await domains.click()
  await page.keyboard.type(DOMAIN)
  await page.keyboard.press('Enter')
  await expect(domains).toContainText(DOMAIN)
  await photograph(page, 'sso-dialog')

  await dialog.getByRole('button', { name: 'Add provider' }).click()
  await expectToasted(
    page,
    `${NAME} is added, switched off: test it, link accounts at it or turn on linking by email, then switch it on in the list.`,
  )
  await expect(dialog).toBeHidden()
  // Its secret is nowhere in the page once the dialog is gone.
  expect(await page.content()).not.toContain(idp.clientSecret)

  const row = providerRow(page)
  await expect(row.locator('.sso-cell__name')).toHaveText(NAME)
  await expect(row.locator('.sso-cell__issuer')).toHaveText(idp.issuer)
  await expect(row.locator('.sso-status__status')).toHaveText('Off')
  await expect(row.locator('.sso-status__by-email')).toHaveText('Links by email')
  await expect(row.locator('.sso-cell__count')).toHaveText('0')

  // Switched off, the sign-in page does not offer it.
  const before = await freshSignInPage(browser)
  await expect(ssoButton(before)).toHaveCount(0)
  await before.context().close()

  // Tested as it is set up, from the list.
  await row.getByRole('button', { name: 'Test' }).click()
  const testDialog = page.locator('.sso-test-dialog')
  await expect(testDialog.locator('.sso-report__verdict')).toContainText('Ready')
  await photograph(page, 'sso-test')
  await testDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await expect(row.getByRole('switch', { name: `Offer ${NAME} on the sign-in page` })).not.toBeChecked()
  await row.locator('.sso-cell__enabled').click()
  await expectToasted(page, `${NAME} is on: its button is on the sign-in page within a minute.`)
  await expect(row.locator('.sso-status__status')).toHaveText('Offered')
  await photograph(page, 'sso-list')

  // The sign-in page shows its button first, as the page's primary, and the password behind a
  // link; the person signs in through it.
  const signIn = await freshSignInPage(browser)
  await expect(ssoButton(signIn)).toBeVisible()
  await expect(ssoButton(signIn)).toHaveClass(/el-button--primary/)
  await expect(signIn.locator('input[name=password]')).toBeHidden()
  await expect(signIn.getByRole('button', { name: 'Use your student number and password instead' })).toBeVisible()
  await photograph(signIn, 'sso-sign-in')
  await ssoButton(signIn).click()
  await expect(signIn).not.toHaveURL(/\/login/)
  await expectSignedInAs(signIn, person.display_name)
  expect(idp.signIns).toBe(1)
  expect(idp.redeemed).toBe(1)
  await signIn.context().close()

  // Linked by the email the provider vouched for: one account signs in through it now.
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(row.locator('.sso-cell__count')).toHaveText('1')
})

test('switched off, its button leaves the sign-in page; deleted, its one account is unlinked', async ({
  page,
  browser,
}) => {
  await keepToasts(page)
  await openSignInAdmin(page)
  const row = providerRow(page)
  await expect(row.locator('.sso-status__status')).toHaveText('Offered')

  await expect(row.getByRole('switch', { name: `Offer ${NAME} on the sign-in page` })).toBeChecked()
  await row.locator('.sso-cell__enabled').click()
  const confirm = page.locator('.el-message-box')
  await expect(confirm).toContainText('One account signs in through it')
  await confirm.getByRole('button', { name: 'Switch off' }).click()
  await expectToasted(page, `${NAME} is off: its button leaves the sign-in page within a minute. Nobody is unlinked.`)
  await expect(row.locator('.sso-status__status')).toHaveText('Off')

  const signIn = await freshSignInPage(browser)
  await expect(ssoButton(signIn)).toHaveCount(0)
  // Nobody was unlinked: switched off, it is still their way in, closed for now.
  const methods = await (await signIn.request.get('/v1/auth/methods')).json()
  expect(methods.sso_providers.map((p: { id: string }) => p.id)).not.toContain(PROVIDER_ID)
  await signIn.context().close()
  await expect(row.locator('.sso-cell__count')).toHaveText('1')

  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(confirm).toContainText('1 account is linked at it and will no longer be able to sign in through it')
  await photograph(page, 'sso-delete')
  await confirm.getByRole('button', { name: 'Delete and unlink 1 account' }).click()
  await expectToasted(page, `${NAME} is deleted; 1 account was unlinked.`)
  await expect(row).toHaveCount(0)

  const gone = await call(root().token, 'GET', `/v1/sso/providers/${PROVIDER_ID}`)
  expect(gone.status).toBe(404)
  const person_ = await call(root().token, 'GET', `/v1/actors/${person.actor_id}`)
  expect(person_.body.result.has_sso).toBe(false)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the page and its dialog fit the screen', async ({ page }) => {
    const id = `${PROVIDER_ID}-phone`
    const made = await call(root().token, 'POST', '/v1/sso/providers', {
      id,
      display_name: `${NAME} on a phone, with a name long enough to wrap`,
      issuer: idp.issuer,
      client_id: idp.clientId,
      client_secret: idp.clientSecret,
    })
    expect(made.body.status, JSON.stringify(made.body.error)).toBe('executed')
    try {
      await signInAsRoot(page)
      await page.goto('/admin/sign-in')
      await expect(page.locator('.page-header__title')).toHaveText('Sign-in')
      await expect(page.locator('.sso-admin__redirect')).toBeVisible()
      // A card for each provider: its status, count and actions under its name.
      const row = page.locator('.sso-admin__table tbody tr').filter({ has: page.locator(`[data-provider="${id}"]`) })
      await expect(row.locator('.sso-cell__linked')).toHaveText('No account linked')
      await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible()
      const fits = () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
      expect(await fits()).toBe(true)
      await row.scrollIntoViewIfNeeded()
      await photograph(page, 'sso-phone-list')
      await page.getByRole('button', { name: 'Add provider' }).click()
      await expect(page.locator('.sso-dialog')).toBeVisible()
      await page.locator('.sso-dialog .sso-form__name input').fill('A long name for a provider, to see it fit')
      expect(await fits()).toBe(true)
      const box = await page.locator('.sso-dialog').boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(390)
      await photograph(page, 'sso-phone-dialog')
    } finally {
      await call(root().token, 'POST', `/v1/sso/providers/${id}/delete`, { force: true })
    }
  })
})
