import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  accountButton,
  call,
  demo,
  expectSignedInAs,
  inTraditionalChinese,
  photograph,
  pickOption,
  registerPerson,
  root,
  signIn,
  signInAsRoot,
  toast,
  type DemoActor,
} from './support'

// Signing in with a student or staff number (a login ID), and temporary
// passwords (AIShie-Core#34), in a course of the test's own. The sign-in page
// asks for a number or an email, as Core says it takes both, and a student
// signs in with their number, in any case. The instructor sees students'
// numbers on the roster and a member's page, and resets a student's
// password: the dialog says what that does, then shows the temporary password
// once, with the number, to copy, and the reset is in the activity. It is
// offered on no teaching assistant's seat, nor the instructor's own. The
// student signs in with it and may do nothing but choose their own password
// (the temporary one again is refused in words), then goes where they were
// going. A link that asks for no email registers someone by their student
// number, which is said to be what they sign in with, and a number taken is
// told to sign in instead. An instructor finds someone to add by their
// number; an administrator gives a person a number, sees one typed in
// through a link as unverified, and vouches for it.
//
// With E2E_SHOTS set to a directory, the new screens are photographed there
// in English and Traditional Chinese.

const STAMP = Date.now().toString(36)
const PASSWORD = process.env.E2E_PASSWORD!
const OWN_PASSWORD = `my very own pass phrase ${STAMP}`
let courseId = ''
let myMemberId = ''
let lena: DemoActor & { member_id: string; login_id: string }
let theo: DemoActor & { member_id: string }
/** The temporary password the instructor was shown last, handed to Lena. */
let temporary = ''
/** Whoever registered through the link with a student number of their own. */
const joiner = { name: `Jun Joiner ${STAMP}`, loginId: `J${STAMP}`, actorId: '' }

function instructor(): DemoActor {
  return demo().actors.instructor
}

async function ok(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const out = await call(token, method, path, body)
  expect(out.body.status, `${method} ${path}: ${JSON.stringify(out.body)}`).toBe('executed')
  return out.body.result
}

/** A browser of its own, signed in as nobody, in the language given. */
async function stranger(browser: Browser, baseURL: string | undefined, lang: 'en' | 'zh-Hant' = 'en') {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('aishie.locale', l)
    } catch {}
  }, lang)
  return { context, page }
}

/** Signs in on the sign-in page with a name (an email or a number) and a password. */
async function signInAs(page: Page, name: string, password: string) {
  await page.fill('input[name=login]', name)
  await page.fill('input[name=password]', password)
  await page.click('button[type=submit]')
}

test.beforeAll(async () => {
  const d = demo()
  const token = root().token
  const made = await ok(token, 'POST', '/v1/courses', {
    dept_id: d.course.dept_id,
    term_id: d.course.term_id,
    code: 'SIGN101',
    section: STAMP,
    title: `Signing in by number ${STAMP}`,
  })
  courseId = made.course_id
  await ok(token, 'POST', `/v1/courses/${courseId}/activate`, {})
  const seated = await ok(token, 'POST', `/v1/courses/${courseId}/instructors`, { actor_id: instructor().actor_id })
  myMemberId = seated.member_id

  const l = await registerPerson(`Lena Number ${STAMP}`, { login_id: `S${STAMP}` })
  const lSeat = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: l.actor_id,
    preset: 'student',
  })
  lena = { ...l, login_id: `S${STAMP}`, member_id: lSeat.member_id }
  const t = await registerPerson(`Theo Assistant ${STAMP}`, { email: `theo+${STAMP}@ids.test`, login_id: `T${STAMP}` })
  const tSeat = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/members`, {
    actor_id: t.actor_id,
    preset: 'ta',
  })
  theo = { ...t, member_id: tSeat.member_id }
})

test.describe.serial('student and staff numbers, and temporary passwords', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the sign-in page asks for a student/staff number or email, and a student signs in with theirs', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Student/staff number or email')).toBeVisible()
    await expect(page.locator('input[name=login]')).toHaveAttribute('type', 'text')
    await photograph(page, 'sign-in-en')

    // In any case, as Core matches it.
    await signInAs(page, lena.login_id.toLowerCase(), PASSWORD)
    await expect(page).not.toHaveURL(/\/login/)
    await expectSignedInAs(page, lena.display_name)
    // Their own number, on their account page.
    await page.goto('/account')
    const profile = page.locator('.profile-card')
    await expect(profile).toContainText('Student/staff number')
    await expect(profile).toContainText(lena.login_id)
    await expect(profile).not.toContainText('Not yet confirmed')

    const zh = await page
      .context()
      .browser()!
      .newContext({ baseURL: new URL(page.url()).origin })
    const zhPage = await zh.newPage()
    await inTraditionalChinese(zhPage)
    await zhPage.goto('/login')
    await expect(zhPage.getByLabel('學號／工號或電子郵件')).toBeVisible()
    await photograph(zhPage, 'sign-in-zh-Hant')
    // A name or password that is wrong says both might be.
    await signInAs(zhPage, lena.login_id, 'not the password at all')
    await expect(zhPage.getByText('學號／工號或電子郵件，或密碼不正確。')).toBeVisible()
    await zh.close()
  })

  test('an instructor sees students’ numbers, and resets a student’s password, shown once', async ({ page }) => {
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/members`)
    const row = page.locator('.el-table__row').filter({ hasText: lena.display_name })
    await expect(row).toContainText(lena.login_id)

    // Offered on no teaching assistant's seat, nor on one's own.
    await page.goto(`/courses/${courseId}/members/${theo.member_id}`)
    await expect(page.locator('.page-header')).toContainText(theo.display_name)
    await expect(page.getByText(`T${STAMP}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await page.goto(`/courses/${courseId}/members/${myMemberId}`)
    await expect(page.getByText('This is your own seat.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0)

    await page.goto(`/courses/${courseId}/members/${lena.member_id}`)
    await expect(page.locator('.page-header')).toContainText(lena.display_name)
    await expect(page.locator('.member__login-id')).toHaveText(lena.login_id)
    await page.getByRole('button', { name: 'Reset password' }).click()
    const dialog = page.getByRole('dialog', { name: `Reset the password of ${lena.display_name}?` })
    await expect(dialog).toContainText(`Every session ${lena.display_name} has is signed out now.`)
    await expect(dialog).toContainText('they must choose a password of their own before anything else')
    await expect(dialog).toContainText('shown to you once, here, and kept nowhere')
    await dialog.getByRole('button', { name: 'Reset password' }).click()

    const result = page.getByRole('dialog', { name: `Temporary password for ${lena.display_name}` })
    await expect(result).toContainText('Shown only now')
    await expect(result).toContainText('never in a class group or any public channel')
    await expect(result.locator('.reset-dialog__login')).toHaveText(lena.login_id)
    const shown = result.locator('[data-test="temporary-password"]')
    await expect(shown).toHaveText(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/)
    // Lena was signed in twice: by the invitation she took up when she was
    // registered (beforeAll), and in the test before. Both sessions end.
    await expect(result).toContainText('Their 2 sessions were signed out.')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await result.getByRole('button', { name: 'Copy' }).click()
    await expect(toast(page, 'Copied')).toBeVisible()
    const first = (await shown.textContent())!.trim()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first)
    await photograph(page, 'reset-password-en')
    await result.getByRole('button', { name: 'Done' }).click()
    await expect(result).toBeHidden()
    // Closed, it is nowhere on the page.
    await expect(page.getByText(first)).toHaveCount(0)

    await page.goto(`/courses/${courseId}/activity`)
    const item = page.locator('.event-item').filter({ hasText: 'Student’s password reset' }).first()
    await expect(item).toBeVisible()
    await expect(item).toContainText('2 sessions signed out')

    // In Traditional Chinese: a second reset, whose password is the one handed on.
    await inTraditionalChinese(page)
    await page.goto(`/courses/${courseId}/members/${lena.member_id}`)
    await page.getByRole('button', { name: '重設密碼' }).click()
    await page
      .getByRole('dialog', { name: `重設 ${lena.display_name} 的密碼？` })
      .getByRole('button', { name: '重設密碼' })
      .click()
    const zh = page.getByRole('dialog', { name: `${lena.display_name} 的臨時密碼` })
    await expect(zh).toContainText('只會顯示這一次')
    await expect(zh.locator('.reset-dialog__login')).toHaveText(lena.login_id)
    temporary = (await zh.locator('[data-test="temporary-password"]').textContent())!.trim()
    expect(temporary).not.toBe(first)
    await photograph(page, 'reset-password-zh-Hant')
    await zh.getByRole('button', { name: '完成' }).click()
  })

  test('the student must choose their own password first, and then goes where they were going', async ({
    browser,
    baseURL,
  }) => {
    expect(temporary, 'the password from the test before').not.toBe('')
    // An administrator sees the password is a temporary one, and who set it.
    const admin = await stranger(browser, baseURL)
    await signInAsRoot(admin.page)
    await admin.page.goto(`/admin/actors/${lena.actor_id}`)
    const set = admin.page.locator('.creds-other').filter({ hasText: 'Temporary' })
    await expect(set).toHaveCount(1)
    await expect(set).toContainText(`Set by ${instructor().display_name}`)
    await expect(set).toContainText('They must choose their own at their next sign-in.')
    await admin.context.close()

    const { context, page } = await stranger(browser, baseURL)
    // On the way to the course's grades, they are asked to sign in.
    await page.goto(`/courses/${courseId}/grades`)
    await expect(page).toHaveURL(/\/login\?next=/)
    // The password they had before works no more.
    await signInAs(page, lena.login_id, PASSWORD)
    await expect(page.getByText('The student/staff number or email, or the password, is not correct.')).toBeVisible()
    await signInAs(page, lena.login_id, temporary)
    await expect(page).toHaveURL(/\/change-password\?next=/)
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible()
    await expect(page.getByText('set for you by your instructor')).toBeVisible()
    // Nothing else is offered: no menu, no course.
    await expect(accountButton(page)).toHaveCount(0)
    await photograph(page, 'forced-change-en')

    // Anywhere else, Core refuses them, and they are brought back.
    await page.goto(`/courses/${courseId}`)
    await expect(page).toHaveURL(/\/change-password\?next=/)
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible()

    // The temporary one again is refused, in words.
    await page.fill('input[name=new-password]', temporary)
    await page.fill('input[name=repeat]', temporary)
    await page.getByRole('button', { name: 'Set my password and continue' }).click()
    await expect(page.getByText('That is the temporary password you were given. Choose one of your own.')).toBeVisible()

    // In Traditional Chinese, from the page's own language menu.
    await pickOption(page, page.locator('.change-pw__lang .el-select'), '繁體中文')
    await expect(page.getByRole('heading', { name: '設定你自己的密碼' })).toBeVisible()
    await expect(page.getByText('這是你獲發的臨時密碼，請設定你自己的密碼。')).toBeVisible()
    await photograph(page, 'forced-change-zh-Hant')

    await page.fill('input[name=new-password]', OWN_PASSWORD)
    await page.fill('input[name=repeat]', OWN_PASSWORD)
    await page.getByRole('button', { name: '設定密碼並繼續' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}$`))
    await expectSignedInAs(page, lena.display_name)
    await context.close()

    // Their own password is the one they sign in with now.
    const again = await stranger(browser, baseURL)
    await again.page.goto('/login')
    await signInAs(again.page, lena.login_id, OWN_PASSWORD)
    await expect(again.page).not.toHaveURL(/\/(login|change-password)/)
    await again.context.close()
  })

  test('a link that asks for no email registers someone by their student number', async ({ browser, baseURL }) => {
    const link = await ok(instructor().token, 'POST', `/v1/courses/${courseId}/join-links`, {})
    const url = `/join/${link.token}`

    const zh = await stranger(browser, baseURL, 'zh-Hant')
    await zh.page.goto(url)
    await zh.page.getByRole('button', { name: '建立帳戶' }).click()
    await expect(zh.page.getByText('學校發給你的學號。日後以此登入。')).toBeVisible()
    await zh.page.fill('input[name=name]', '林俊')
    await zh.page.fill('input[name=login_id]', '2024 001')
    await zh.page.locator('input[name=email]').focus()
    await expect(zh.page.getByText('只可使用英文字母、數字、句點、連字號及底線，不可有空格')).toBeVisible()
    await zh.page.fill('input[name=login_id]', `J${STAMP}`)
    await zh.page.locator('input[name=email]').focus()
    await expect(zh.page.getByText('只可使用英文字母、數字、句點、連字號及底線，不可有空格')).toHaveCount(0)
    await photograph(zh.page, 'join-student-number-zh-Hant')
    await zh.context.close()

    const { context, page } = await stranger(browser, baseURL)
    await page.goto(url)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(
      page.getByText('Your student number, as your school gives it. You sign in with it from now on.'),
    ).toBeVisible()
    await expect(page.getByText('If you have one. You can sign in with it as well.')).toBeVisible()
    await page.fill('input[name=name]', joiner.name)
    await page.fill('input[name=login_id]', joiner.loginId)
    await page.fill('input[name=password]', OWN_PASSWORD)
    await page.fill('input[name=repeat]', OWN_PASSWORD)
    await photograph(page, 'join-student-number-en')
    await page.getByRole('button', { name: 'Create account and join' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}$`))
    await expectSignedInAs(page, joiner.name)
    // They typed it themselves: their account page says nobody has confirmed it yet.
    await page.goto('/account')
    await expect(page.locator('.profile-card')).toContainText(joiner.loginId)
    await expect(page.locator('.profile-card')).toContainText('Not yet confirmed by an administrator')
    await context.close()

    // Their number, and no email, is what they sign in with.
    const back = await stranger(browser, baseURL)
    await back.page.goto('/login')
    await signInAs(back.page, joiner.loginId, OWN_PASSWORD)
    await expect(back.page).not.toHaveURL(/\/login/)
    await back.context.close()

    // A number someone has already is told to sign in instead.
    const again = await stranger(browser, baseURL)
    await again.page.goto(url)
    await again.page.getByRole('button', { name: 'Create an account' }).click()
    await again.page.fill('input[name=name]', `Someone Else ${STAMP}`)
    await again.page.fill('input[name=login_id]', joiner.loginId.toLowerCase())
    await again.page.fill('input[name=password]', OWN_PASSWORD)
    await again.page.fill('input[name=repeat]', OWN_PASSWORD)
    await again.page.getByRole('button', { name: 'Create account and join' }).click()
    await expect(
      again.page.getByText('An account with this student number already exists. Sign in with it to join the course.'),
    ).toBeVisible()
    await expect(again.page.getByRole('button', { name: 'Sign in instead' })).toBeVisible()
    await again.context.close()

    const members = await ok(instructor().token, 'GET', `/v1/courses/${courseId}/members?limit=100`)
    const seat = (members.members as { actor_id: string; display_name: string; role: string }[]).find(
      (m) => m.display_name === joiner.name,
    )
    expect(seat?.role).toBe('student')
    joiner.actorId = seat!.actor_id
  })

  test('an instructor finds someone to add by their whole student number', async ({ page }) => {
    const nils = await registerPerson(`Nils Lookup ${STAMP}`, { login_id: `N${STAMP}` })
    await signIn(page, instructor())
    await page.goto(`/courses/${courseId}/members`)
    await page.getByRole('button', { name: 'Add member' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a member' })
    const find = dialog.getByLabel('Find by student/staff number or email')
    await find.fill(`n${STAMP}`)
    await find.press('Enter')
    await expect(dialog.locator('.add-member__actor')).toContainText(nils.display_name)
    await dialog.getByRole('button', { name: 'Add member' }).click()
    await expect(toast(page, 'Member added')).toBeVisible()
    await expect(page.locator('.page-header')).toContainText(nils.display_name)
    await expect(page.locator('.member__login-id')).toHaveText(`N${STAMP}`)
  })

  test('an administrator gives a person a number, and vouches for one typed in through a link', async ({ page }) => {
    await signInAsRoot(page)
    await page.goto('/admin/actors')
    await page.locator('.page-header').getByRole('button', { name: 'Register' }).click()
    const register = page.getByRole('dialog', { name: 'Register a person or agent' })
    await register.getByLabel('Display name').fill(`Olga Staff ${STAMP}`)
    await register.getByLabel('Student/staff number').fill('has space')
    await register.getByLabel('Display name').focus()
    await expect(
      register.getByText('Only letters, digits, dots, hyphens and underscores, with no spaces'),
    ).toBeVisible()
    await register.getByLabel('Student/staff number').fill(`O${STAMP}`)
    await register.getByRole('button', { name: 'Register' }).click()
    await expect(toast(page, `Olga Staff ${STAMP} is registered`)).toBeVisible()
    await page.getByPlaceholder('Search by name, email or student/staff number, or paste an ID').fill(`o${STAMP}`)
    const row = page.locator('.actors__table .el-table__body tr').filter({ hasText: `Olga Staff ${STAMP}` })
    await expect(row).toContainText(`O${STAMP}`)
    await expect(row).not.toContainText('Unverified')

    // One typed in through a link reads as unverified, until an administrator vouches for it.
    await page.goto(`/admin/actors/${joiner.actorId}`)
    const desc = page.locator('.actor__desc')
    await expect(desc).toContainText(joiner.loginId)
    await expect(desc.getByText('Unverified')).toBeVisible()
    await page.locator('.page-header').getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit registration' })
    await expect(edit.locator('input[name=login_id]')).toHaveValue(joiner.loginId)
    await edit.getByText('I have checked it: save it as confirmed').click()
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(desc).toContainText(joiner.loginId)
    await expect(desc.getByText('Unverified')).toHaveCount(0)

    // A number someone has already is refused in words.
    await page.locator('.page-header').getByRole('button', { name: 'Edit', exact: true }).click()
    await edit.locator('input[name=login_id]').fill(`O${STAMP}`)
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Someone is already registered with that student or staff number.')).toBeVisible()
  })
})
