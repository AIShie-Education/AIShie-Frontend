import { expect, test, type Page } from '@playwright/test'
import { call, demo, pickOption, root, signInWithToken, toast } from './support'

// Everyone registered is in the administrators' directory, and a person an
// administrator registers gets in by an invitation link: they open it, choose
// a password, and are signed in.
const stamp = Date.now().toString(36)
const PERSON = { name: `Iris Invited ${stamp}`, email: `iris+${stamp}@e2e.test` }
const PASSWORD = `correct horse ${stamp}`
let link = ''

function englishFirst(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem('aishiteru.locale', 'en')
    } catch {}
  })
}

test.describe.serial('the directory and invitations', () => {
  test('the directory lists everyone, narrowed by a search, a kind or an ID', async ({ page }) => {
    const d = demo()
    await signInWithToken(page, root())
    await page.goto('/admin/actors')
    await expect(page.locator('.page-header')).toContainText('People & agents')
    const rows = page.locator('.actors__table .el-table__body tr')
    const search = page.getByPlaceholder('Search by name or email, or paste an ID')

    // The run's six people have emails that end in +<the run's tag>@demo.test.
    await search.fill(`+${d.tag}@demo.test`)
    await expect(page).toHaveURL(new RegExp(`[?&]q=%2B${d.tag}`))
    await expect(rows).toHaveCount(6)
    const yuki = rows.filter({ hasText: 'Yuki Tanaka' })
    await expect(yuki).toContainText(d.actors.yuki.email!)
    await expect(yuki).toContainText('Person')
    await expect(yuki).toContainText('Active')
    await expect(yuki).toContainText('Password')
    await expect(rows.filter({ hasText: 'grader-v2' })).toHaveCount(0)

    // "yuki" is a person (Yuki Tanaka) and an agent (tutor-yuki); with
    // Agents picked, Core is asked for agents only, and the person goes.
    await search.fill('yuki')
    await expect(page).toHaveURL(/[?&]q=yuki/)
    await expect(rows.filter({ hasText: 'Yuki Tanaka' }).first()).toBeVisible()
    await expect(rows.filter({ hasText: 'tutor-yuki' }).first()).toBeVisible()
    const askedForAgents = page.waitForRequest((req) => {
      const u = new URL(req.url())
      return (
        u.pathname === '/v1/actors' && u.searchParams.get('kind') === 'agent' && u.searchParams.get('search') === 'yuki'
      )
    })
    await pickOption(page, page.locator('.actors__filter').first(), 'Agents')
    await askedForAgents
    await expect(page).toHaveURL(/[?&]kind=agent/)
    await expect(rows.filter({ hasText: 'Yuki Tanaka' })).toHaveCount(0)
    await expect(rows.filter({ hasText: 'tutor-yuki' }).first()).toBeVisible()
    await expect(rows.filter({ hasText: 'tutor-yuki' }).first()).toContainText('Agent')

    // A whole ID finds that one actor, whatever the filters; Enter opens them.
    await search.fill(d.actors.yuki.actor_id)
    await expect(page.getByText('Found by ID. Press Enter to open their page.')).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Yuki Tanaka')
    await search.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/admin/actors/${d.actors.yuki.actor_id}$`))
    await expect(page.locator('.page-header')).toContainText('Yuki Tanaka')
  })

  test('an administrator registers a person, finds them, and makes an invitation link', async ({ page }) => {
    await signInWithToken(page, root())
    await page.goto('/admin/actors')
    await page.locator('.page-header').getByRole('button', { name: 'Register' }).click()
    const dialog = page.getByRole('dialog', { name: 'Register a person or agent' })
    await dialog.getByLabel('Display name').fill(PERSON.name)
    await dialog.getByLabel('Email').fill(PERSON.email)
    await dialog.getByRole('button', { name: 'Register' }).click()
    await expect(toast(page, `${PERSON.name} is registered`)).toBeVisible()

    const panel = page.locator('.actors__new')
    await expect(panel).toContainText('Create an invitation link on their page')
    await expect(panel.getByRole('button', { name: 'Create an invitation link' })).toBeVisible()

    // Found again in the directory by a piece of the email, any case.
    await page.getByPlaceholder('Search by name or email, or paste an ID').fill(`IRIS+${stamp}`.toUpperCase())
    await expect(page).toHaveURL(/[?&]q=IRIS/)
    const rows = page.locator('.actors__table .el-table__body tr')
    await expect(rows).toHaveCount(1)
    const row = rows.filter({ hasText: PERSON.name })
    await expect(row).toContainText(PERSON.email)
    await expect(row).toContainText('No password or single sign-on yet')
    await row.getByRole('link', { name: PERSON.name }).click()
    await expect(page).toHaveURL(/\/admin\/actors\/[0-9a-f-]{36}$/)
    await expect(page.locator('.page-header')).toContainText(PERSON.name)

    const card = page.locator('.invite')
    await expect(card).toContainText('Invitation link')
    await card.getByRole('button', { name: 'Create invitation link' }).click()
    const reveal = page.getByRole('dialog', { name: 'Copy the invitation link now' })
    await expect(reveal).toContainText('This is the only time the link is shown.')
    await expect(reveal).toContainText(PERSON.email)
    link = await reveal.locator('#reveal-invite-link').inputValue()
    expect(link).toMatch(/^http:\/\/localhost:\d+\/welcome#token=aisinv_[a-z2-7]{12}_[\w-]{40,}$/)

    // Not copied: closing asks first.
    await reveal.getByRole('button', { name: 'Done' }).click()
    await page
      .getByRole('dialog', { name: 'Close without copying?' })
      .getByRole('button', { name: 'Close anyway' })
      .click()
    await expect(reveal).toBeHidden()

    // The page reads the actor again: an invitation is waiting.
    await expect(page.locator('.actor__desc')).toContainText('Invited until')
    await expect(card.getByRole('button', { name: 'Create a new link' })).toBeVisible()
    await expect(card).toContainText(
      /A link made earlier works until \d{4}-\d\d-\d\d \d\d:\d\d\. Making a new one replaces it\./,
    )
  })

  test('the link sets a password and signs the person in; used, it is no longer valid', async ({ browser }) => {
    expect(link, 'the link from the test before').not.toBe('')
    const context = await browser.newContext()
    const page = await context.newPage()
    await englishFirst(page)

    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible()
    // The token leaves the address at once.
    await expect(page).toHaveURL(/\/welcome$/)
    expect(await page.evaluate(() => window.location.href)).not.toContain('aisinv_')

    await page.fill('input[name=password]', PASSWORD)
    await page.fill('input[name=repeat]', PASSWORD)
    await page.getByRole('button', { name: 'Set password and sign in' }).click()
    await expect(page.getByText('Your password is set')).toBeVisible()
    await expect(
      page.getByText(`From now on, sign in with ${PERSON.email} and the password you just chose.`),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.app-user')).toContainText(PERSON.name)

    // Signing out, and in again with the email and the new password.
    await page.locator('.app-user').click()
    await page.getByText('Sign out').click()
    await expect(page).toHaveURL(/\/login/)
    await page.fill('input[name=email]', PERSON.email)
    await page.fill('input[name=password]', PASSWORD)
    await page.click('button[type=submit]')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('.app-user')).toContainText(PERSON.name)

    // The same link again, in this browser signed in as them: it says whom
    // it would sign in instead, and then that it is no longer valid.
    await page.goto(link)
    await expect(page.getByText(`This browser is signed in as ${PERSON.name}.`)).toBeVisible()
    await page.fill('input[name=password]', `${PASSWORD} again`)
    await page.fill('input[name=repeat]', `${PASSWORD} again`)
    await page.getByRole('button', { name: 'Set password and sign in' }).click()
    await expect(page.getByText('This invitation is no longer valid')).toBeVisible()
    await expect(page.getByText('Ask your administrator for a new link.')).toBeVisible()
    // Refused, it changed nothing: still signed in, with the password chosen first.
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.app-user')).toContainText(PERSON.name)
    await context.close()

    // The directory says they have a password now, and no invitation waiting.
    const out = await call(root().token, 'GET', `/v1/actors?search=${encodeURIComponent(PERSON.email)}`)
    const listed = out.body.result.actors
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ has_password: true, has_sso: false })
    expect(listed[0].invite_expires_at).toBeUndefined()
  })

  test('the directory shows the password the invitation set', async ({ page }) => {
    await signInWithToken(page, root())
    await page.goto(`/admin/actors?q=${encodeURIComponent(PERSON.email)}`)
    const row = page.locator('.actors__table .el-table__body tr').filter({ hasText: PERSON.name })
    await expect(row).toContainText('Password')
    await expect(row).not.toContainText('No password or single sign-on yet')
    await expect(row).not.toContainText('Invited until')
  })
})

test('a new link opened in a tab already on the welcome page takes the place of the last', async ({ page }) => {
  const token = root().token
  const email = `vera+${stamp}@e2e.test`
  const reg = await call(token, 'POST', '/v1/actors', { kind: 'human', display_name: `Vera Visitor ${stamp}`, email })
  expect(reg.body.status, JSON.stringify(reg.body)).toBe('executed')
  const invited = await call(token, 'POST', `/v1/actors/${reg.body.result.actor_id}/invite`, {})
  expect(invited.body.status, JSON.stringify(invited.body)).toBe('executed')
  const submit = page.getByRole('button', { name: 'Set password and sign in' })
  async function choose(password: string) {
    await page.fill('input[name=password]', password)
    await page.fill('input[name=repeat]', password)
    await submit.click()
  }
  await englishFirst(page)

  // No token, then a token no invitation has: each link only changes the fragment.
  await page.goto('/welcome')
  await expect(page.getByText('This link is incomplete')).toBeVisible()
  await page.goto(`/welcome#token=aisinv_abcdefghijkl_${'x'.repeat(43)}`)
  await expect(submit).toBeVisible()
  await expect(page).toHaveURL(/\/welcome$/)
  await choose(PASSWORD)
  await expect(page.getByText('This invitation is no longer valid')).toBeVisible()

  // The real link, in the same tab: the form again, its token out of the address, and it works.
  await page.goto(`/welcome#token=${invited.body.result.token}`)
  await expect(submit).toBeVisible()
  await expect(page.getByText('This invitation is no longer valid')).toHaveCount(0)
  await expect(page).toHaveURL(/\/welcome$/)
  expect(await page.evaluate(() => window.location.href + JSON.stringify(window.history.state))).not.toContain(
    'aisinv_',
  )
  await choose(PASSWORD)
  await expect(page.getByText(`From now on, sign in with ${email} and the password you just chose.`)).toBeVisible()
})

test('a link without its code says it is incomplete', async ({ page }) => {
  await englishFirst(page)
  await page.goto('/welcome')
  await expect(page.getByText('This link is incomplete')).toBeVisible()
  await expect(page.locator('input[name=password]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Go to sign in' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('an email is given, and a new one withdraws the invitation waiting', async ({ page }) => {
  const token = root().token
  const name = `Wanda Waiting ${stamp}`
  const reg = await call(token, 'POST', '/v1/actors', { kind: 'human', display_name: name })
  expect(reg.body.status, JSON.stringify(reg.body)).toBe('executed')
  const id: string = reg.body.result.actor_id

  // Registered without an email: nothing to invite them to sign in with yet.
  await signInWithToken(page, root())
  await page.goto(`/admin/actors/${id}`)
  const card = page.locator('.invite')
  await expect(card).toContainText('They have no email')
  await card.getByRole('button', { name: 'Give them an email' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit registration' })
  await dialog.getByLabel('Email').fill(`wanda+${stamp}@e2e.test`)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved')).toBeVisible()
  await expect(page.locator('.page-header')).toContainText(`wanda+${stamp}@e2e.test`)
  await expect(card.getByRole('button', { name: 'Create invitation link' })).toBeVisible()

  const invited = await call(token, 'POST', `/v1/actors/${id}/invite`, {})
  expect(invited.body.status, JSON.stringify(invited.body)).toBe('executed')
  await page.reload()
  await expect(page.locator('.actor__desc')).toContainText('Invited until')

  // Another email: the dialog says the link waiting goes, and it does.
  await page.locator('.page-header').getByRole('button', { name: 'Edit', exact: true }).click()
  await dialog.getByLabel('Email').fill(`wanda.new+${stamp}@e2e.test`)
  await expect(dialog).toContainText('Changing the email withdraws the invitation link waiting')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.page-header')).toContainText(`wanda.new+${stamp}@e2e.test`)
  await expect(page.locator('.actor__desc')).toContainText('No password or single sign-on yet')
  await expect(page.locator('.actor__desc')).not.toContainText('Invited until')
  const taken = await fetch(`${demo().core}/v1/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: invited.body.result.token, password: 'a long enough password' }),
  })
  expect(taken.status).toBe(401)
})
