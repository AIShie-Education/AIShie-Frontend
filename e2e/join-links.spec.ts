import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import {
  call,
  coursePath,
  demo,
  expectSignedInAs,
  expectToasted,
  keepToasts,
  registerPerson,
  signIn,
  type CoreReply,
} from './support'

// A course's invite link, shown to a class as a QR code: whoever may create
// one (member_invite, which the instructor holds and the TA does not) makes
// it on the members page, and sees its address, its QR code and the ten
// minutes it works counting down, full screen too. A student with no account
// creates one through it and lands in the course; one with an account signs
// in through it, comes back, and is joined. A revoked link says so; a link
// kept to a school's domain takes no other email; an expired one says it was
// only ever for a few minutes. The join page works on a phone, in Traditional
// Chinese; and a member without the permission is offered no invite links.

const STAMP = Date.now().toString(36)
const PASSWORD = `a long pass phrase ${STAMP}`
const w = { link: '', linkId: '', token: '' }

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A link to the run's course, made as the instructor through Core, as the members page makes one. */
async function createLink(body: { max_uses?: number; allowed_email_domains?: string[] } = {}) {
  const d = demo()
  return done(
    await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/join-links`, body),
    'course.join_link_create',
  ) as { link_id: string; token: string; expires_at: string }
}

/** Core's own answer to anyone who opens a link: no credential at all. */
async function core(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(demo().core + path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/** Someone with an account and a password (chosen through an invitation), in no course of the run's. */
async function person(name: string, email: string) {
  const who = await registerPerson(name, { email }, PASSWORD)
  return { actor: who.actor_id, token: who.token, email }
}

async function seatOf(token: string): Promise<{ role: string } | undefined> {
  const r = await call(token, 'GET', '/v1/me/memberships')
  return (r.body.result.memberships ?? []).find((m: { course_id: string }) => m.course_id === demo().course.id)
}

/** A browser of its own, signed in as nobody, in English unless told otherwise. */
async function stranger(browser: Browser, opts: BrowserContextOptions & { locale?: string } = {}) {
  const context = await browser.newContext(opts)
  const page = await context.newPage()
  const lang = opts.locale === 'zh-HK' ? 'zh-Hant' : 'en'
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('aishie.locale', l)
    } catch {}
  }, lang)
  return { context, page }
}

/** The members page's invite link dialog, opened. */
async function openInvites(page: Page) {
  await page.goto(coursePath('members'))
  await page.locator('.page-header').getByRole('button', { name: 'Invite link' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite link' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe.serial('invite links', () => {
  test('an instructor creates a link, and sees its QR code, its address and its ten minutes counting down', async ({
    page,
  }) => {
    const d = demo()
    await signIn(page, d.actors.instructor)
    const dialog = await openInvites(page)
    await expect(dialog).toContainText(
      'The link works for 10 minutes. Anyone who has it can join this course as a student, or create an account through it and join.',
    )
    await dialog.locator('input[name="max_uses"]').fill('30')
    await dialog.getByRole('button', { name: 'Create link' }).click()

    const qr = dialog.getByRole('img', { name: 'QR code of the invite link to CS101 · A' })
    await expect(qr).toBeVisible()
    expect((await qr.boundingBox())!.width).toBeGreaterThanOrEqual(250)
    w.link = await dialog.locator('.join-reveal__url input').inputValue()
    expect(w.link).toMatch(/^http:\/\/localhost:\d+\/join\/aisjoin_[a-z2-7]+_[\w-]+$/)
    w.token = w.link.split('/join/')[1]!
    await expect(dialog.locator('.join-reveal__clock')).toHaveText(/^(10:00|09:[45]\d)$/)
    // It moves on, a second at a time.
    const first = await dialog.locator('.join-reveal__clock').textContent()
    await expect(dialog.locator('.join-reveal__clock')).not.toHaveText(first!, { timeout: 3000 })
    await expect(dialog).toContainText('Up to 30 people')

    // Listed below, with the time it has left, who created it, and no token.
    const row = dialog.locator('.join-link').first()
    await expect(row).toContainText('Working')
    await expect(row).toContainText('Shown above')
    await expect(row).toContainText('0 of 30 joined')
    await expect(row).toContainText('Sato Hiroshi')
    await expect(row.locator('.join-link__clock')).toHaveText(/^(10:00|09:[45]\d)$/)
    await expect(dialog.locator('.join-list')).not.toContainText('aisjoin_')
    w.linkId = (await row.getAttribute('data-link-id'))!

    // Saved as a PNG named for the course.
    const saved = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download QR (PNG)' }).click()
    expect((await saved).suggestedFilename()).toBe('CS101-A-invite-qr.png')

    // Put up for the class: the course, a code as large as the screen, and the time left.
    await dialog.getByRole('button', { name: 'Show full screen' }).click()
    const full = page.getByRole('dialog', { name: 'Invite link, full screen' })
    await expect(full).toBeVisible()
    await expect(full).toContainText('CS101 · A')
    await expect(full).toContainText('Introduction to Programming')
    await expect(full).toContainText('Scan to join')
    await expect(full.locator('.join-fs__clock')).toHaveText(/^\s*(10:00|09:[45]\d)\s*$/)
    const big = (await full.getByRole('img', { name: 'QR code of the invite link to CS101 · A' }).boundingBox())!
    // As large as the screen leaves room for, and all of it on the screen.
    const screen = page.viewportSize()!
    expect(big.height).toBeGreaterThan(screen.height * 0.45)
    expect(big.y).toBeGreaterThan(0)
    expect(big.y + big.height).toBeLessThan(screen.height)
    const clock = (await full.locator('.join-fs__clock').boundingBox())!
    expect(clock.y + clock.height).toBeLessThanOrEqual(screen.height)
    await page.keyboard.press('Escape')
    await expect(full).toBeHidden()
    await expect(dialog).toBeVisible()

    // Closed and opened again while it works, the dialog shows it again.
    await dialog.getByRole('button', { name: 'Close' }).last().click()
    await expect(dialog).toBeHidden()
    await page.locator('.page-header').getByRole('button', { name: 'Invite link' }).click()
    await expect(dialog.locator('.join-reveal__url input')).toHaveValue(w.link)
  })

  test('someone with no account creates one through the link, and lands in the course', async ({ browser }) => {
    expect(w.link, 'the link from the test before').not.toBe('')
    const { context, page } = await stranger(browser)
    const name = `Nora New ${STAMP}`
    const email = `nora+${STAMP}@e2e.test`
    await page.goto(w.link)
    await expect(page.getByText('You have been invited to join')).toBeVisible()
    await expect(page.locator('.join__code')).toHaveText('CS101 · A')
    await expect(page.getByRole('heading', { name: 'Introduction to Programming' })).toBeVisible()
    await expect(page.getByText('You will join as a student, straight away.')).toBeVisible()
    await expect(page.getByText(/^This link works for another (10:00|0\d:[0-5]\d)\.$/)).toBeVisible()

    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Create an account and join' })).toBeVisible()
    await expect(page.getByText('At least 10 characters. Longer is stronger')).toBeVisible()
    await page.fill('input[name=name]', name)
    // A link kept to no email domains asks for a student number, and takes an email too.
    await page.fill('input[name=login_id]', `N${STAMP}`)
    await page.fill('input[name=email]', email)
    await page.fill('input[name=password]', PASSWORD)
    await page.fill('input[name=repeat]', `${PASSWORD}!`)
    await page.getByRole('button', { name: 'Create account and join' }).click()
    await expect(page.getByText('The two passwords are not the same')).toBeVisible()
    await page.fill('input[name=repeat]', PASSWORD)
    await page.getByRole('button', { name: 'Create account and join' }).click()

    await expect(page).toHaveURL(new RegExp(`/courses/${demo().course.id}$`))
    await expectSignedInAs(page, name)

    // Core seated them as a student, through that link.
    const d = demo()
    const joined = await call(
      d.actors.instructor.token,
      'GET',
      `/v1/courses/${d.course.id}/members?join_link_id=${w.linkId}&limit=10`,
    )
    const seat = (joined.body.result.members ?? []).find((m: { display_name: string }) => m.display_name === name)
    expect(seat, JSON.stringify(joined.body)).toBeTruthy()
    expect(seat.role).toBe('student')

    // An email taken already is told to sign in instead.
    const again = await stranger(browser)
    await again.page.goto(w.link)
    await again.page.getByRole('button', { name: 'Create an account' }).click()
    await again.page.fill('input[name=name]', 'Nora Again')
    await again.page.fill('input[name=login_id]', `N${STAMP}-again`)
    await again.page.fill('input[name=email]', email)
    await again.page.fill('input[name=password]', PASSWORD)
    await again.page.fill('input[name=repeat]', PASSWORD)
    await again.page.getByRole('button', { name: 'Create account and join' }).click()
    await expect(again.page.getByText('An account with this email already exists. Sign in with it to join the course.')).toBeVisible()
    await expect(again.page.getByRole('button', { name: 'Sign in instead' })).toBeVisible()
    await again.context.close()
    await context.close()
  })

  test('someone with an account signs in through the link, comes back, and is joined', async ({ browser }) => {
    const who = await person(`Omar Existing ${STAMP}`, `omar+${STAMP}@e2e.test`)
    expect(await seatOf(who.token)).toBeUndefined()
    const { context, page } = await stranger(browser)
    await keepToasts(page)
    await page.goto(w.link)
    await page.getByRole('link', { name: 'Sign in to join' }).click()
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.fill('input[name=login]', who.email)
    await page.fill('input[name=password]', PASSWORD)
    await page.click('button[type=submit]')
    await expect(page).toHaveURL(new RegExp(`/courses/${demo().course.id}$`))
    expect((await seatOf(who.token))?.role).toBe('student')

    // Opened again, it joins nothing more: they are taken to the course, as they are.
    await page.goto(w.link)
    await expect(page.getByText(`Signed in as Omar Existing ${STAMP}`)).toBeVisible()
    await page.getByRole('button', { name: 'Join course' }).click()
    await expectToasted(page, 'You are already in this course.')
    await expect(page).toHaveURL(new RegExp(`/courses/${demo().course.id}$`))
    await context.close()

    // Two have joined through it now.
    const d = demo()
    const list = done(await call(d.actors.instructor.token, 'GET', `/v1/courses/${d.course.id}/join-links`), 'list')
    expect(list.links.find((l: { id: string }) => l.id === w.linkId).uses).toBe(2)
  })

  test('a revoked link says it was revoked', async ({ page, browser }) => {
    await keepToasts(page)
    const d = demo()
    await signIn(page, d.actors.instructor)
    const dialog = await openInvites(page)
    const row = dialog.locator(`.join-link[data-link-id="${w.linkId}"]`)
    await expect(row).toContainText('2 of 30 joined')
    await row.getByRole('button', { name: 'Revoke' }).click()
    const confirm = page.getByRole('dialog', { name: 'Revoke this invite link?' })
    await expect(confirm).toContainText('The 2 people who joined through it stay in the course.')
    await confirm.getByRole('button', { name: 'Revoke' }).click()
    await expectToasted(page, 'The invite link is revoked')
    // The link it showed is gone from above; below, it has ended.
    await expect(dialog.locator('.join-reveal')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Create link' })).toBeVisible()
    await dialog.getByText(/Show ended links/).click()
    await expect(dialog.locator(`.join-link[data-link-id="${w.linkId}"]`)).toContainText('Revoked')
    await expect(dialog.locator(`.join-link[data-link-id="${w.linkId}"]`)).toContainText('Sato Hiroshi')

    const { context, page: other } = await stranger(browser)
    await other.goto(w.link)
    await expect(other.getByText('You can no longer join through this link')).toBeVisible()
    await expect(other.getByText('This invite link has been revoked. Ask your instructor for a new one.')).toBeVisible()
    await expect(other.getByRole('button', { name: 'Create an account' })).toHaveCount(0)
    await context.close()
  })

  test('a link kept to a school’s domain takes no registration from another', async ({ browser }) => {
    const link = await createLink({ allowed_email_domains: ['campus.example.edu'] })
    const { context, page } = await stranger(browser)
    await page.goto(`/join/${link.token}`)
    await expect(page.getByText('Only people with an email at @campus.example.edu can join through this link.')).toBeVisible()
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByText('Use your email at @campus.example.edu.')).toBeVisible()
    await page.fill('input[name=name]', `Gil Gmail ${STAMP}`)
    await page.fill('input[name=email]', `gil+${STAMP}@gmail.com`)
    await page.fill('input[name=password]', PASSWORD)
    await page.fill('input[name=repeat]', PASSWORD)
    const asked: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/register')) asked.push(r.url())
    })
    await page.getByRole('button', { name: 'Create account and join' }).click()
    await expect(page.getByText('This link is only for emails at @campus.example.edu')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/join/${link.token}$`))
    expect(asked).toEqual([])
    await context.close()

    // Core refuses it too, however it is sent, and says why.
    const refused = await core('POST', `/v1/join/${link.token}/register`, {
      display_name: `Gil Gmail ${STAMP}`,
      email: `gil+${STAMP}@gmail.com`,
      password: PASSWORD,
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body.error.details.reason).toBe('email_domain_not_allowed')
  })

  test('an expired link says it was only ever for a few minutes', async ({ browser }) => {
    // Core has no clock to wind on; what it says of a link ten minutes old
    // is put in its place here, and the page counts a link down to it.
    const link = await createLink()
    const { context, page } = await stranger(browser)
    let expired = false
    await page.route(`**/v1/join/${link.token}`, async (route) => {
      const real = await route.fetch()
      const body = await real.json()
      if (!expired) {
        await route.fulfill({ response: real, json: { ...body, expires_at: new Date(Date.now() + 3000).toISOString() } })
        expired = true
        return
      }
      await route.fulfill({ response: real, json: { ...body, joinable: false, reason: 'expired', registration: false } })
    })
    await page.goto(`/join/${link.token}`)
    await expect(page.getByText(/^This link works for another 00:0[1-3]\.$/)).toBeVisible()
    await expect(page.getByText('You can no longer join through this link')).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(
        'This invite link has expired. Invite links work for only a few minutes, for joining in class: ask your instructor for a new one.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in to join' })).toHaveCount(0)
    await context.close()
  })

  test('the link on the members page, left to run out, says so, and a new one takes its place', async ({ page }) => {
    const d = demo()
    // This page's clock is ten minutes fast, as a classroom computer's can
    // be; Core's is not, and says so with every answer, and a link counts
    // down on Core's clock. (Winding this page's clock on while Core's stays
    // put does not run a link out: the next answer from Core, to whatever
    // the page reads meanwhile, says the link has its ten minutes still, and
    // the page shows it working again.) Core has no clock to wind on, so
    // what it says of the first link made here is changed: that it ends
    // eight seconds from now. The new link that replaces it is as Core makes it.
    await page.clock.install({ time: new Date(Date.now() + 10 * 60_000) })
    let first: { id: string; expiresAt: string } | undefined
    await page.route(
      (url) => url.pathname === `/v1/courses/${d.course.id}/join-links`,
      async (route) => {
        const real = await route.fetch()
        const body = await real.json()
        const r = body.result
        if (route.request().method() === 'POST' && r?.link_id) {
          first ??= { id: r.link_id, expiresAt: new Date(Date.now() + 8000).toISOString() }
          if (r.link_id === first.id) r.expires_at = first.expiresAt
        } else {
          for (const link of r?.links ?? []) if (first && link.id === first.id) link.expires_at = first.expiresAt
        }
        await route.fulfill({ response: real, json: body })
      },
    )
    await signIn(page, d.actors.instructor)
    const dialog = await openInvites(page)
    // Kept to a school's domain, typed as people type it.
    await dialog.locator('.join-form__domain-select').click()
    const domains = dialog.locator('.join-form__domain-select input')
    await domains.pressSequentially('@Campus.Example.EDU', { delay: 20 })
    await domains.press('Enter')
    await expect(dialog.locator('.join-form__domain-select')).toContainText('campus.example.edu')
    await dialog.getByRole('button', { name: 'Create link' }).click()
    await expect(dialog.locator('.join-reveal__facts')).toContainText('@campus.example.edu')
    const url = await dialog.locator('.join-reveal__url input').inputValue()
    // Counted on this page's own clock, it would have ended ten minutes ago.
    await expect(dialog.locator('.join-reveal__clock')).toHaveText(/^00:0[1-8]$/)
    await expect(dialog.getByText('This link has expired')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByRole('button', { name: 'Show full screen' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Create a new link' }).click()
    await expect(dialog.locator('.join-reveal__url input')).not.toHaveValue(url)
    // Counted on this page's own clock, it would end now.
    await expect(dialog.locator('.join-reveal__clock')).toHaveText(/^(10:00|09:5\d)$/)
    await expect(dialog.locator('.join-reveal__facts')).toContainText('@campus.example.edu')
  })

  test('on a phone, in Traditional Chinese, the join page fits, and a new student joins through it', async ({
    browser,
  }) => {
    const link = await createLink()
    const { context, page } = await stranger(browser, {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-HK',
    })
    await page.goto(`/join/${link.token}`)
    await expect(page.getByText('你獲邀加入')).toBeVisible()
    await expect(page.getByText('你會立即以學生身分加入。')).toBeVisible()
    await expect(page.getByText(/^此連結尚餘(10:00|09:[0-5]\d)有效。$/)).toBeVisible()
    await expect(page.getByRole('link', { name: '登入以加入' })).toBeVisible()
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(await fits()).toBe(true)

    await page.getByRole('button', { name: '建立帳戶' }).click()
    await expect(page.getByRole('heading', { name: '建立帳戶並加入' })).toBeVisible()
    expect(await fits()).toBe(true)
    await page.fill('input[name=name]', `陳小明 ${STAMP}`)
    await page.fill('input[name=login_id]', `M${STAMP}`)
    await page.fill('input[name=email]', `ming+${STAMP}@e2e.test`)
    await page.fill('input[name=password]', PASSWORD)
    await page.fill('input[name=repeat]', PASSWORD)
    await page.getByRole('button', { name: '建立帳戶並加入' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${demo().course.id}$`))
    await context.close()
  })

  test('a member without the permission is offered no invite links, until it is granted', async ({ page, browser }) => {
    const d = demo()
    await signIn(page, d.actors.ta)
    await page.goto(coursePath('members'))
    await expect(page.locator('.page-header')).toContainText('Members')
    await expect(page.locator('.members__table, .members__cards').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite link' })).toHaveCount(0)

    // The instructor sees the permission on the TA's seat, denied, as every permission is listed.
    const { context, page: instructor } = await stranger(browser)
    await signIn(instructor, d.actors.instructor)
    await instructor.goto(coursePath(`members/${d.actors.ta.member_id}`))
    await expect(instructor.locator('.perm-editor__row').filter({ hasText: 'Create invite links' })).toContainText(
      'Denied',
    )
    await context.close()

    // Granted, the TA may create links.
    const seat = `/v1/courses/${d.course.id}/members/${d.actors.ta.member_id}/perms`
    done(await call(d.actors.instructor.token, 'POST', seat, { perms: { member_invite: 'autonomous' } }), 'grant')
    try {
      await page.reload()
      await expect(page.locator('.page-header').getByRole('button', { name: 'Invite link' })).toBeVisible()
    } finally {
      done(await call(d.actors.instructor.token, 'POST', seat, { perms: { member_invite: 'denied' } }), 'revert')
    }
  })
})
