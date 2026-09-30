import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { setLocale, type Locale } from '@/i18n'
import SsoAdminView from './SsoAdminView.vue'
import {
  FakeSsoCore,
  REDIRECT_URI,
  SSO,
  failed,
  goodReport,
  operatorProvider,
  refused,
  siteProvider,
} from './sso/ssoFakes'
import { mountGlobal, settle } from './runtime/testSetup'

// 登入方式: the page lists the operator's provider and the site's, in the
// sign-in page's order, and switches on and off, tests and deletes the site's,
// each over the version read.

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }) }
})

let core: FakeSsoCore

beforeEach(() => {
  setLocale('en')
  core = new FakeSsoCore([
    siteProvider({ id: 'lib-keycloak', display_name: 'Library', position: 5, linked_accounts: 0, version: 2 }),
    operatorProvider(),
    siteProvider(),
  ]).install()
  vi.mocked(ElMessage).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function page(locale: Locale = 'en') {
  setLocale(locale)
  const { global } = await mountGlobal('/admin/sign-in')
  const w = mount(SsoAdminView, { global, attachTo: document.body })
  await flushPromises()
  return w
}
const rows = (w: VueWrapper) => w.findAll('.sso-admin__table tbody tr')
const rowOf = (w: VueWrapper, id: string) => rows(w).find((r) => r.find(`[data-provider="${id}"]`).exists())!
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0] as { type: string; message: string } | undefined
const confirmCalls = () => vi.mocked(ElMessageBox.confirm).mock.calls
/** The dialog open now: Element Plus puts it in the body. */
const dialog = () => document.body.querySelector('.el-overlay:not([style*="display: none"]) .el-dialog') as HTMLElement

describe('the list of providers', () => {
  it('shows the operator’s first, read-only, then the site’s by position, each with its name, id, issuer and status', async () => {
    const w = await page()
    expect(core.to('GET', SSO.list)).toHaveLength(1)
    expect(w.find('.page-header').text()).toContain('Sign-in')
    expect(rows(w).map((r) => r.find('[data-provider]').attributes('data-provider'))).toEqual([
      'polyu-adfs',
      'hainanu-cas',
      'lib-keycloak',
    ])

    const op = rowOf(w, 'polyu-adfs')
    expect(op.find('.sso-cell__name').text()).toBe('PolyU NetID')
    expect(op.find('.sso-cell__id').text()).toBe('polyu-adfs')
    expect(op.find('.sso-cell__issuer').text()).toBe('https://adfs.polyu.edu.hk/adfs')
    expect(op.find('.sso-status__operator').text()).toBe('Set by the server’s operator')
    expect(op.find('.sso-status__status').text()).toBe('Offered')
    expect(op.text()).toContain('read-only here')
    expect(op.find('.sso-cell__always').text()).toBe('Always on')
    expect(op.find('.sso-cell__enabled').exists()).toBe(false)
    expect(op.find('.sso-cell__edit').exists()).toBe(false)
    expect(op.find('.sso-cell__delete').exists()).toBe(false)
    // It can be tested, as it is.
    expect(op.find('.sso-cell__test').exists()).toBe(true)
    expect(op.find('.sso-cell__count').text()).toBe('412')

    const site = rowOf(w, 'hainanu-cas')
    expect(site.find('.sso-cell__name').text()).toBe('海大統一認證')
    expect(site.find('.sso-status__operator').exists()).toBe(false)
    expect(site.find('.sso-cell__enabled').classes()).toContain('is-checked')
    expect(site.find('.sso-cell__edit').exists()).toBe(true)
    expect(site.find('.sso-cell__delete').exists()).toBe(true)
    expect(site.find('.sso-cell__count').text()).toBe('3')
    // The redirect URI to register, with its copy button.
    expect(w.find('.sso-admin__redirect .redirect-uri__value').text()).toBe(REDIRECT_URI)
    expect(w.find('.sso-admin__redirect .redirect-uri__copy').exists()).toBe(true)
    expect(w.find('.sso-admin__add').attributes('disabled')).toBeUndefined()
  })

  it('says why one is not offered: its id the operator’s, its secret one the keys no longer open, an older key', async () => {
    core.providers = [
      operatorProvider(),
      siteProvider({ id: 'polyu-adfs', status: 'id_taken', linked_accounts: 0, position: 1 }),
      siteProvider({ id: 'lost', status: 'secret_unavailable', position: 2 }),
      siteProvider({ id: 'rotated', client_secret_key_id: '0000000000000001', position: 3 }),
      siteProvider({ id: 'off', status: 'disabled', enabled: false, link_by_email: true, position: 4 }),
    ]
    const w = await page()
    const [, taken, lost, rotated, off] = rows(w)
    expect(taken.find('.sso-status__status').text()).toBe('ID taken')
    expect(taken.text()).toContain('The server’s operator has set a provider with the same ID')
    // Every write to it is refused: it is only tested.
    expect(taken.find('.sso-cell__enabled').classes()).toContain('is-disabled')
    expect(taken.find('.sso-cell__edit').exists()).toBe(false)
    expect(taken.find('.sso-cell__delete').exists()).toBe(false)
    expect(lost.find('.sso-status__status').text()).toBe('Secret can’t be opened')
    expect(lost.text()).toContain('give the secret again')
    expect(rotated.find('.sso-status__older-key').text()).toBe('Older key')
    expect(rotated.text()).toContain('aishie-core secrets rewrap')
    expect(off.find('.sso-status__status').text()).toBe('Off')
    expect(off.find('.sso-status__by-email').text()).toBe('Links by email')
    expect(off.find('.sso-cell__enabled').classes()).not.toContain('is-checked')
    expect(lost.find('.sso-status__older-key').exists()).toBe(false)
  })

  it('offers nothing to add without SECRETS_KEY on the server, and says so in each language', async () => {
    core.canAdd = false
    for (const [locale, words] of [
      ['en', 'SECRETS_KEY is not set on the server'],
      ['zh-Hant', '管理員需先在伺服器設定 SECRETS_KEY'],
      ['zh-Hans', '管理员需先在服务器设置 SECRETS_KEY'],
    ] as const) {
      const w = await page(locale)
      expect(w.find('.sso-admin__no-key').text()).toContain(words)
      expect(w.find('.sso-admin__add').attributes('disabled')).toBeDefined()
      // The operator's provider still works, and the site's are still listed.
      expect(rows(w)).toHaveLength(3)
      w.unmount()
    }
  })

  it('says so, and offers no provider to add, for someone who is not a platform administrator', async () => {
    core.once('GET', SSO.list, () =>
      refused(403, 'forbidden', 'only root and platform administrators', { reason: 'platform_role_required' }),
    )
    const w = await page()
    expect(w.text()).toContain('You do not have permission')
    expect(w.find('.sso-admin__add').exists()).toBe(false)
  })

  it('names the page in the side bar’s words in each language', async () => {
    for (const [locale, title] of [
      ['zh-Hant', '登入方式'],
      ['zh-Hans', '登录方式'],
      ['en', 'Sign-in'],
    ] as const) {
      const w = await page(locale)
      expect(w.find('.page-header__title').text()).toBe(title)
      w.unmount()
    }
  })
})

describe('switching a provider on and off', () => {
  it('sends the version read, says it reaches the sign-in page within a minute, and reads the list again', async () => {
    const w = await page()
    await rowOf(w, 'lib-keycloak').find('.sso-cell__enabled').trigger('click')
    await settle()
    // Nobody is linked at it: switching off asks nothing.
    expect(confirmCalls()).toHaveLength(0)
    const [post] = core.to('POST', SSO.enabled)
    expect(post.url).toBe('/v1/sso/providers/lib-keycloak/enabled')
    expect(JSON.parse(post.body!)).toEqual({ enabled: false, version: 2 })
    expect(post.headers['Idempotency-Key']).toBeTruthy()
    expect(lastMessage()).toMatchObject({ type: 'success' })
    expect(lastMessage()!.message).toBe(
      'Library is off: its button leaves the sign-in page within a minute. Nobody is unlinked.',
    )
    expect(core.to('GET', SSO.list)).toHaveLength(2)
    expect(rowOf(w, 'lib-keycloak').find('.sso-cell__enabled').classes()).not.toContain('is-checked')
    expect(rowOf(w, 'lib-keycloak').find('.sso-status__status').text()).toBe('Off')

    await rowOf(w, 'lib-keycloak').find('.sso-cell__enabled').trigger('click')
    await settle()
    expect(core.lastBody('POST', SSO.enabled)).toEqual({ enabled: true, version: 3 })
    // On, with nobody linked and no linking by email: said.
    expect(lastMessage()!.message).toContain('No account is linked at it yet')
  })

  it('asks first when accounts sign in through it, and unlinks nobody', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    const w = await page()
    await rowOf(w, 'hainanu-cas').find('.sso-cell__enabled').trigger('click')
    await settle()
    expect(confirmCalls()[0][0]).toBe(
      '3 accounts sign in through it: switched off, they cannot until it is on again. Nobody is unlinked.',
    )
    expect(confirmCalls()[0][1]).toBe('Switch off 海大統一認證?')
    expect(core.to('POST', SSO.enabled)).toHaveLength(0)

    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'hainanu-cas').find('.sso-cell__enabled').trigger('click')
    await settle()
    expect(core.lastBody('POST', SSO.enabled)).toEqual({ enabled: false, version: 4 })
  })

  it('reads the list again and says so when it changed meanwhile', async () => {
    const w = await page()
    // Someone else changed it after the page read it.
    core.find('lib-keycloak')!.version = 7
    await rowOf(w, 'lib-keycloak').find('.sso-cell__enabled').trigger('click')
    await settle()
    expect(core.lastBody('POST', SSO.enabled)).toEqual({ enabled: false, version: 2 })
    expect(lastMessage()).toMatchObject({ type: 'warning' })
    expect(lastMessage()!.message).toContain('Someone changed it meanwhile')
    expect(core.to('GET', SSO.list)).toHaveLength(2)
    expect(w.find('.sso-admin__error').exists()).toBe(false)
  })

  it('puts a refusal in words above the list, in Chinese too', async () => {
    const w = await page('zh-Hant')
    core.once('POST', SSO.enabled, () =>
      failed(422, 'failed_precondition', 'its client secret does not open', { reason: 'secret_unavailable' }),
    )
    await rowOf(w, 'lib-keycloak').find('.sso-cell__enabled').trigger('click')
    await settle()
    expect(w.find('.sso-admin__error').text()).toContain('伺服器的金鑰無法開啟其用戶端密鑰，因此無法啟用')
  })
})

describe('deleting a provider', () => {
  it('asks first, and deletes one nobody is linked at over the version read, without force', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const w = await page()
    await rowOf(w, 'lib-keycloak').find('.sso-cell__delete').trigger('click')
    await settle()
    expect(confirmCalls()[0][1]).toBe('Delete Library?')
    expect(confirmCalls()[0][0]).toContain('No account is linked at it.')
    expect(core.lastBody('POST', SSO.remove)).toEqual({ version: 2 })
    expect(lastMessage()!.message).toBe('Library is deleted.')
    expect(rows(w)).toHaveLength(2)
  })

  it('says how many accounts lose single sign-on, offers switching off instead, and sends force', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const w = await page()
    await rowOf(w, 'hainanu-cas').find('.sso-cell__delete').trigger('click')
    await settle()
    const [message, , opts] = confirmCalls()[0] as unknown as [string, string, { confirmButtonText: string }]
    expect(message).toContain('3 accounts are linked at it and will no longer be able to sign in through it')
    expect(message).toContain('Switch it off instead to keep them linked.')
    expect(opts.confirmButtonText).toBe('Delete and unlink 3 accounts')
    expect(core.lastBody('POST', SSO.remove)).toEqual({ version: 4, force: true })
    expect(lastMessage()!.message).toBe('海大統一認證 is deleted; 3 accounts were unlinked.')
  })

  it('says it in Chinese: 3 個帳號將無法再以此方式登入', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const w = await page('zh-Hant')
    await rowOf(w, 'hainanu-cas').find('.sso-cell__delete').trigger('click')
    await settle()
    expect(confirmCalls()[0][0]).toContain('3 個帳號將無法再以此方式登入')
    expect(core.to('POST', SSO.remove)).toHaveLength(0)
  })

  it('asks again with Core’s count when accounts were linked at it meanwhile', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const w = await page()
    core.find('lib-keycloak')!.linked_accounts = 2
    await rowOf(w, 'lib-keycloak').find('.sso-cell__delete').trigger('click')
    await settle()
    const sent = core.to('POST', SSO.remove).map((c) => JSON.parse(c.body!))
    expect(sent).toEqual([{ version: 2 }, { version: 2, force: true }])
    expect(confirmCalls()[1][0]).toContain('2 accounts are linked at it')
    // Each is its own intended write, under its own key.
    const keys = core.to('POST', SSO.remove).map((c) => c.headers['Idempotency-Key'])
    expect(new Set(keys).size).toBe(2)
    expect(lastMessage()!.message).toBe('Library is deleted; 2 accounts were unlinked.')
  })
})

describe('testing a provider', () => {
  it('reads its issuer as it is set up and shows endpoints, keys, problems and warnings', async () => {
    core.report = {
      ...goodReport('https://adfs.polyu.edu.hk/adfs'),
      ok: false,
      problems: ['the discovery document’s issuer is https://adfs.polyu.edu.hk/adfs/, not https://adfs.polyu.edu.hk/adfs'],
      warnings: ['the claim upn is not among claims_supported'],
    }
    const w = await page()
    await rowOf(w, 'polyu-adfs').find('.sso-cell__test').trigger('click')
    await settle()
    const [get] = core.to('GET', SSO.test)
    expect(get.url).toBe('/v1/sso/test?provider_id=polyu-adfs')
    const d = dialog()
    expect(d.querySelector('.el-dialog__title')!.textContent).toBe('Test PolyU NetID')
    expect(d.querySelector('.sso-report__verdict')!.textContent).toContain('Not ready')
    expect(d.querySelector('.sso-report__problems')!.textContent).toContain('adfs/, not')
    expect(d.querySelector('.sso-report__warnings')!.textContent).toContain('upn is not among claims_supported')
    expect(d.querySelector('.sso-report__endpoint-token')!.textContent).toContain(
      'https://adfs.polyu.edu.hk/adfs/protocol/openid-connect/token',
    )
    expect(d.querySelector('.sso-report__endpoint-endSession')!.textContent).toContain('None')
    expect(d.querySelector('.sso-report__key')!.textContent).toContain('RS256')
    expect(d.querySelector('.sso-report__key')!.textContent).toContain('key ID k-2026')
    await (d.querySelector('.sso-test-dialog__again') as HTMLElement).click()
    await settle()
    expect(core.to('GET', SSO.test)).toHaveLength(2)
  })
})

describe('the dialog from the list', () => {
  it('opens on the provider to edit, with the redirect URI and the key the list read', async () => {
    const w = await page()
    await rowOf(w, 'hainanu-cas').find('.sso-cell__edit').trigger('click')
    await settle()
    const d = dialog()
    expect(d.querySelector('.el-dialog__title')!.textContent).toBe('Edit 海大統一認證')
    expect(d.querySelector('.redirect-uri__value')!.textContent).toBe(REDIRECT_URI)
    expect(d.querySelector('.sso-form__id-fixed')!.textContent).toBe('hainanu-cas')
    expect(d.querySelector('.sso-form__secret-keep')!.textContent).toContain('Keep the current secret (…k3Qz)')
  })

  it('opens empty to add one, and the list is read again once it is added, switched off', async () => {
    const w = await page()
    await w.find('.sso-admin__add').trigger('click')
    await settle()
    expect(dialog().querySelector('.el-dialog__title')!.textContent).toBe('Add a single sign-on provider')
    expect((dialog().querySelector('.sso-form__id input') as HTMLInputElement).value).toBe('')
    const fill = async (sel: string, v: string) => {
      const input = dialog().querySelector(`${sel} input`) as HTMLInputElement
      input.value = v
      input.dispatchEvent(new Event('input'))
      await flushPromises()
    }
    await fill('.sso-form__id', 'school-google')
    await fill('.sso-form__name', 'School Google')
    await fill('.sso-form__issuer', 'https://accounts.google.com')
    await fill('.sso-form__client-id', 'client.apps.googleusercontent.com')
    await fill('.sso-form__secret', 'made-up-for-this-test-only')
    ;(dialog().querySelector('.sso-dialog__save') as HTMLElement).click()
    await settle()
    expect(core.to('POST', SSO.list)).toHaveLength(1)
    expect(core.to('GET', SSO.list)).toHaveLength(2)
    const added = rowOf(w, 'school-google')
    expect(added.find('.sso-status__status').text()).toBe('Off')
    expect(added.find('.sso-cell__enabled').classes()).not.toContain('is-checked')
    expect(rows(w).at(-1)!.find('[data-provider]').attributes('data-provider')).toBe('school-google')
  })
})
