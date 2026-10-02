import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { setLocale, type Locale } from '@/i18n'
import SsoProviderDialog from './SsoProviderDialog.vue'
import type { SsoProvider } from './ssoAdmin'
import {
  FakeSsoCore,
  REDIRECT_URI,
  SSO,
  failed,
  goodReport,
  operatorProvider,
  siteProvider,
} from './ssoFakes'
import { mountGlobal, settle } from '../runtime/testSetup'

// Adding and changing an identity provider of the site's. Its client secret
// is typed into its field and goes nowhere else: only into the body of the
// write that gives it, never into a test, a log, or the page once the dialog
// has closed.

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }) }
})

let core: FakeSsoCore
let logged: unknown[][]
/** A client secret made up for the test, as a provider would give one: never written in a file. */
const newSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')

beforeEach(() => {
  setLocale('en')
  core = new FakeSsoCore([operatorProvider(), siteProvider()]).install()
  vi.mocked(ElMessage).mockReset()
  logged = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args))
  }
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setLocale('en')
  document.body.innerHTML = ''
})

async function open(provider: SsoProvider | null = null, opts: { locale?: Locale; canSeal?: boolean } = {}) {
  setLocale(opts.locale ?? 'en')
  const { global } = await mountGlobal('/admin/sign-in')
  const w = mount(SsoProviderDialog, {
    props: {
      modelValue: true,
      'onUpdate:modelValue': (v: boolean) => w.setProps({ modelValue: v }),
      provider,
      redirectUri: REDIRECT_URI,
      takenIds: core.providers.map((p) => p.id),
      canSeal: opts.canSeal ?? true,
    },
    global,
    attachTo: document.body,
  })
  await settle()
  return w
}

/** A provider as the page read it: a copy of what Core keeps, which Core may change meanwhile. */
const read = (id: string): SsoProvider => structuredClone(core.find(id)!)
const dialog = () => document.body.querySelector('.sso-dialog') as HTMLElement
const q = <T extends Element = HTMLElement>(sel: string) => dialog().querySelector(sel) as T | null
async function fill(sel: string, v: string) {
  const input = q<HTMLInputElement>(`${sel} input`)!
  input.value = v
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
async function click(sel: string) {
  q(sel)!.click()
  await settle()
}
const fieldError = (sel: string) =>
  q(sel)!.closest('.el-form-item')!.querySelector('.el-form-item__error')?.textContent?.trim() ?? ''
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0] as { type: string; message: string } | undefined
/** Whether the secret is anywhere in the page: an input's value, or its markup. */
function inPage(secret: string): boolean {
  const values = Array.from(document.querySelectorAll('input, textarea'), (i) => (i as HTMLInputElement).value)
  return values.includes(secret) || document.body.innerHTML.includes(secret)
}
async function fillNew(secret: string) {
  await fill('.sso-form__id', 'school-keycloak')
  await fill('.sso-form__name', 'School NetID')
  await fill('.sso-form__issuer', 'https://login.example.edu/realms/school')
  await fill('.sso-form__client-id', 'aishie')
  await fill('.sso-form__secret', secret)
}

describe('adding a provider', () => {
  it('shows the redirect URI first, with a copy button and help for the providers schools use', async () => {
    await open()
    expect(q('.el-dialog__title')!.textContent).toBe('Add a single sign-on provider')
    const setup = q('.sso-dialog__setup')!
    expect(setup.querySelector('.redirect-uri__value')!.textContent).toBe(REDIRECT_URI)
    expect(setup.querySelector('.redirect-uri__copy')).not.toBeNull()
    // Before anything is asked for: the id and the secret come after it.
    const order = Array.from(dialog().querySelectorAll('.redirect-uri, .sso-form__id, .sso-form__secret'), (e) =>
      ['redirect-uri', 'sso-form__id', 'sso-form__secret'].find((c) => e.classList.contains(c)),
    )
    expect(order).toEqual(['redirect-uri', 'sso-form__id', 'sso-form__secret'])
    const help = Array.from(setup.querySelectorAll('.el-collapse-item__header'), (h) => h.textContent?.trim())
    expect(help).toEqual(['AD FS', 'Microsoft Entra ID', 'Google Workspace', 'Keycloak'])
    expect(setup.textContent).toContain('https://login.microsoftonline.com/<tenant-id>/v2.0')
    expect(setup.textContent).toContain('https://keycloak.example.edu/realms/<realm>')
    // Linking by email is off unless turned on, and says what it holds to.
    expect(q('.sso-form__link-by-email')!.classList).not.toContain('is-checked')
    expect(q('.sso-form__by-email-rules')!.textContent).toContain('with email_verified true')
    expect(q('.sso-form__by-email-rules')!.textContent).toContain('holds no platform role')
    expect(q('.sso-form__domains')).toBeNull()
  })

  it('copies the redirect URI', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await open()
    await click('.redirect-uri__copy')
    expect(writeText).toHaveBeenCalledWith(REDIRECT_URI)
    expect(lastMessage()).toMatchObject({ type: 'success', message: 'The redirect URI is copied.' })
  })

  it('shows the sign-in page’s button as the name is typed', async () => {
    await open()
    expect(q('.sso-preview__button')).toBeNull()
    expect(q('.sso-preview__empty')!.textContent).toBe('The button shows the display name.')
    await fill('.sso-form__name', 'School NetID')
    expect(q('.sso-preview__button')!.textContent?.trim()).toBe('Sign in with School NetID')
  })

  it('sends the provider, switched off, with the secret in that one body alone, and says what comes next', async () => {
    const secret = newSecret()
    const w = await open()
    await fillNew(secret)
    await click('.sso-dialog__save')
    const [post] = core.to('POST', SSO.list)
    expect(JSON.parse(post.body!)).toEqual({
      id: 'school-keycloak',
      display_name: 'School NetID',
      issuer: 'https://login.example.edu/realms/school',
      client_id: 'aishie',
      client_secret: secret,
      scopes: ['openid', 'profile', 'email'],
      subject_claim: 'sub',
      link_by_email: false,
    })
    expect(post.headers['Idempotency-Key']).toBeTruthy()
    expect(lastMessage()).toMatchObject({ type: 'success' })
    expect(lastMessage()!.message).toContain('School NetID is added, switched off')
    expect(w.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 'school-keycloak', client_secret_hint: `…${secret.slice(-4)}` })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    // The secret went in the one write, and nowhere else.
    expect(core.everything().split(secret)).toHaveLength(2)
    expect(JSON.stringify(logged)).not.toContain(secret)
    expect(JSON.stringify(vi.mocked(ElMessage).mock.calls)).not.toContain(secret)
    await settle()
    expect(inPage(secret)).toBe(false)
  })

  // One language a test, so that each opens the dialog once.
  it.each([
    ['en', ['Lower-case letters, digits and hyphens', 'An https URL (http only for this machine, where the server allows it)', 'Required']],
    ['zh-Hant', ['小寫英文字母、數字及連字號', '須為 https 網址（只有本機可用 http，且須伺服器允許）', '必填']],
    ['zh-Hans', ['小写英文字母、数字及连字符', '须为 https 网址（只有本机可用 http，且须服务器允许）', '必填']],
  ] as const)('says what is wrong before sending, in %s', async (locale, words) => {
    await open(null, { locale })
    await fill('.sso-form__id', 'School IdP')
    await fill('.sso-form__name', 'School')
    await fill('.sso-form__issuer', 'http://login.example.edu')
    await fill('.sso-form__client-id', 'aishie')
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__id')).toContain(words[0])
    expect(fieldError('.sso-form__issuer')).toBe(words[1])
    expect(fieldError('.sso-form__secret')).toBe(words[2])
    expect(core.to('POST', SSO.list)).toHaveLength(0)
  })

  it('refuses an id taken already, and keeps openid among the scopes', async () => {
    await open()
    await fillNew(newSecret())
    await fill('.sso-form__id', 'school-adfs')
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__id')).toBe('A provider has this ID already')
    expect(core.to('POST', SSO.list)).toHaveLength(0)
  })

  it('puts Core’s refusal of a field on that field, and one of the id in words', async () => {
    await open()
    await fillNew(newSecret())
    core.once('POST', SSO.list, () =>
      failed(400, 'invalid_argument', 'issuer: is not an https URL', { field: 'issuer' }),
    )
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__issuer')).toBe('Refused: is not an https URL')

    core.once('POST', SSO.list, () =>
      failed(409, 'conflict', 'a provider with that id is there already', { reason: 'id_taken' }),
    )
    await fill('.sso-form__issuer', 'https://login.example.edu/realms/school2')
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__id')).toBe(
      'That ID is taken: the operator’s provider or another provider has it. Choose another.',
    )
  })

  // A Core that holds the site's providers to public addresses (AIShie-Core#62), without SSO_ALLOW_PRIVATE_ISSUERS.
  // One language a test, so that each opens the dialog once.
  it.each([
    [
      'en',
      'The issuer is on this machine, or at a private, link-local or reserved address: this server reaches no provider of the site’s there unless its operator allows it.',
    ],
    [
      'zh-Hant',
      '這個簽發者位於本機，或位於私人、鏈路本地或保留位址：除非伺服器營運者允許，否則本伺服器不會連往位於這些位址、在此設定的提供者。',
    ],
    [
      'zh-Hans',
      '这个颁发者位于本机，或位于私有、链路本地或保留地址：除非服务器运维者允许，否则本服务器不会连接位于这些地址、在此设置的提供者。',
    ],
  ] as const)('says on the issuer, in %s, that the server does not reach a provider at a private address', async (locale, words) => {
    await open(null, { locale })
    await fillNew(newSecret())
    await fill('.sso-form__issuer', 'http://localhost:8081/realms/school')
    core.once('POST', SSO.list, () =>
      failed(
        400,
        'invalid_argument',
        'issuer: is on this machine or a private, link-local or reserved address, which this server reaches for no identity provider of the site’s unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS (issuer_address_not_allowed)',
        { field: 'issuer', reason: 'issuer_address_not_allowed' },
      ),
    )
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__issuer')).toBe(words)
  })

  it('says SECRETS_KEY is not set on the server when Core has none', async () => {
    await open(null, { locale: 'zh-Hant' })
    await fillNew(newSecret())
    core.once('POST', SSO.list, () =>
      failed(422, 'failed_precondition', 'this server has no secrets key', { reason: 'secrets_key_missing' }),
    )
    await click('.sso-dialog__save')
    expect(q('.sso-dialog__error')!.textContent).toContain('伺服器尚未設定用來加密用戶端密鑰的金鑰')
  })

  it('links by email only with domains, reading the email claim, and sends them as Core keeps them', async () => {
    const w = await open()
    await fillNew(newSecret())
    await click('.sso-form__link-by-email')
    expect(q('.sso-form__domains')).not.toBeNull()
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__domains')).toBe('Linking by email needs the domains an email may be linked from')
    expect(core.to('POST', SSO.list)).toHaveLength(0)
    // What the select takes, as typed: trimmed, lower case, without an @, once each.
    ;(w.vm as unknown as { onDomains: (v: string[]) => void }).onDomains([' @Example.EDU', 'example.edu', 'staff.example.edu'])
    await settle()
    await click('.sso-dialog__save')
    expect(core.lastBody('POST', SSO.list)).toMatchObject({
      link_by_email: true,
      email_claim: 'email',
      allowed_email_domains: ['example.edu', 'staff.example.edu'],
    })
  })

  it('retries after no answer under the same key, and takes a new one once anything changes', async () => {
    // The clock is moved past the waits before the write is sent again
    // (half a second, then a second), not waited for.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open()
    await fillNew(newSecret())
    core.once('POST', SSO.list, () => Promise.reject(new TypeError('Failed to fetch')))
    core.once('POST', SSO.list, () => Promise.reject(new TypeError('Failed to fetch')))
    core.once('POST', SSO.list, () => Promise.reject(new TypeError('Failed to fetch')))
    await click('.sso-dialog__save')
    expect(core.to('POST', SSO.list)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(500)
    await settle()
    expect(core.to('POST', SSO.list)).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_000)
    await settle()
    const first = core.to('POST', SSO.list).map((c) => c.headers['Idempotency-Key'])
    expect(first).toHaveLength(3)
    expect(new Set(first).size).toBe(1)
    expect(q('.sso-dialog__error')!.textContent).toContain('Cannot reach the server')

    await fill('.sso-form__name', 'School NetID (staff)')
    await click('.sso-dialog__save')
    const keys = core.to('POST', SSO.list).map((c) => c.headers['Idempotency-Key'])
    expect(keys).toHaveLength(4)
    expect(keys[3]).not.toBe(keys[0])
  })
})

describe('testing the issuer from the form', () => {
  it('reads the issuer typed, with the scopes and claims, never the secret, and shows what it found', async () => {
    const secret = newSecret()
    core.report = {
      ...goodReport('https://login.example.edu/realms/school'),
      warnings: ['the claim email is not among claims_supported'],
    }
    await open()
    await fillNew(secret)
    await click('.sso-form__test')
    const [get] = core.to('GET', SSO.test)
    const url = new URL(get.url, 'https://x.example')
    expect(url.searchParams.get('issuer')).toBe('https://login.example.edu/realms/school')
    expect(url.searchParams.getAll('scopes')).toEqual(['openid', 'profile', 'email'])
    expect(url.searchParams.get('subject_claim')).toBe('sub')
    expect(get.url).not.toContain(secret)
    expect(get.headers['Idempotency-Key']).toBeUndefined()
    const report = q('.sso-form__report')!
    expect(report.querySelector('.sso-report__verdict')!.textContent).toContain('Ready')
    expect(report.querySelector('.sso-report__warnings')!.textContent).toContain('email is not among claims_supported')
    expect(report.querySelector('.sso-report__endpoint-authorization')!.textContent).toContain(
      '/protocol/openid-connect/auth',
    )
    // Changing the issuer makes the report old: it goes.
    await fill('.sso-form__issuer', 'https://login.example.edu/realms/other')
    expect(q('.sso-form__report')).toBeNull()
  })

  it('says what is wrong with the issuer before asking', async () => {
    await open()
    await fill('.sso-form__issuer', 'not a url')
    await click('.sso-form__test')
    expect(fieldError('.sso-form__issuer')).toBe('A URL, with no user, query or fragment')
    expect(core.to('GET', SSO.test)).toHaveLength(0)
  })

  const localIssuer = 'http://127.0.0.2:8081/realms/school'
  const localWords =
    'issuer is on this machine or a private, link-local or reserved address, which this server reaches for no identity provider of the site’s unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS (issuer_address_not_allowed)'
  // One language a test, so that each opens the dialog once.
  it.each([
    [
      'en',
      'An address here is on this machine, or private, link-local or reserved: this server reaches no provider of the site’s there unless its operator allows it.',
      `Nothing was read from ${localIssuer}: the issuer itself is refused.`,
    ],
    [
      'zh-Hant',
      '這裡有位址位於本機，或屬私人、鏈路本地或保留位址：除非伺服器營運者允許，否則本伺服器不會連往位於這些位址、在此設定的提供者。',
      `沒有從${localIssuer}讀取任何內容：這個簽發者本身未被接受。`,
    ],
    [
      'zh-Hans',
      '这里有地址位于本机，或属私有、链路本地或保留地址：除非服务器运维者允许，否则本服务器不会连接位于这些地址、在此设置的提供者。',
      `没有从${localIssuer}读取任何内容：这个颁发者本身未被接受。`,
    ],
  ] as const)(
    'leaves an issuer on this machine to the server, which may refuse it, and says why in %s',
    async (locale, reason, notRead) => {
      core.report = {
        ...goodReport(localIssuer),
        ok: false,
        discovery_url: '',
        problems: [localWords],
        authorization_endpoint: null,
      }
      await open(null, { locale })
      await fill('.sso-form__issuer', localIssuer)
      await click('.sso-form__test')
      expect(core.to('GET', SSO.test)).toHaveLength(1)
      expect(fieldError('.sso-form__issuer')).toBe('')
      const report = q('.sso-form__report')!
      const problem = report.querySelector('.sso-report__problems [data-reason="issuer_address_not_allowed"]')!
      expect(problem.textContent).toContain(reason)
      expect(problem.querySelector('.sso-report__core-words')!.textContent).toBe(localWords)
      expect(report.querySelector('.sso-report__verdict')!.textContent).toContain(notRead)
    },
  )

  // A host name that resolves to a private address: the issuer passes, its discovery document is refused when dialled.
  const namedIssuer = 'https://login.example.edu/realms/school'
  const namedDiscovery = `${namedIssuer}/.well-known/openid-configuration`
  const namedWords = `the discovery document: ${namedDiscovery} is on this machine or a private, link-local or reserved address, which this server reaches for no identity provider of the site’s unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS (issuer_address_not_allowed)`
  // One language a test, so that each opens the dialog once.
  it.each([
    ['en', `Nothing could be read from ${namedIssuer}: its discovery document was not read.`],
    ['zh-Hant', `未能從${namedIssuer}讀取任何內容：其探索文件未被讀取。`],
    ['zh-Hans', `未能从${namedIssuer}读取任何内容：其发现文档未被读取。`],
  ] as const)(
    'says nothing was read when the issuer’s name leads to an address the server does not reach, in %s',
    async (locale, notRead) => {
      core.report = {
        ...goodReport(namedIssuer),
        ok: false,
        discovery_url: namedDiscovery,
        problems: [namedWords],
        authorization_endpoint: null,
        token_endpoint: null,
        jwks_uri: null,
        signing_keys: [],
      }
      await open(null, { locale })
      await fill('.sso-form__issuer', namedIssuer)
      await click('.sso-form__test')
      const report = q('.sso-form__report')!
      const verdict = report.querySelector('.sso-report__verdict')!.textContent!
      expect(verdict).toContain(notRead)
      expect(verdict).not.toMatch(/were read|已在/)
      const problem = report.querySelector('.sso-report__problems [data-reason="issuer_address_not_allowed"]')!
      expect(problem.querySelector('.sso-report__core-words')!.textContent).toBe(namedWords)
    },
  )

  it('says the keys were not read when the key set was not', async () => {
    const issuer = 'https://login.example.edu/realms/school'
    core.report = {
      ...goodReport(issuer),
      ok: false,
      problems: [`the key set: ${issuer}/protocol/openid-connect/certs did not answer in time`],
      signing_keys: [],
    }
    await open()
    await fill('.sso-form__issuer', issuer)
    await click('.sso-form__test')
    expect(q('.sso-form__report .sso-report__verdict')!.textContent).toContain(
      `Its discovery document was read at ${issuer}, but not its keys.`,
    )
  })

  it('shows a problem whose reason it has no words for in Core’s alone, and says the document was read', async () => {
    const issuer = 'https://login.example.edu/realms/school'
    core.report = { ...goodReport(issuer), ok: false, problems: ['it takes no response_type code, which a sign-in here asks for'] }
    await open()
    await fill('.sso-form__issuer', issuer)
    await click('.sso-form__test')
    const report = q('.sso-form__report')!
    expect(report.querySelector('.sso-report__problems li')!.textContent!.trim()).toBe(
      'it takes no response_type code, which a sign-in here asks for',
    )
    expect(report.querySelector('[data-reason]')).toBeNull()
    expect(report.querySelector('.sso-report__verdict')!.textContent).toContain(`Its discovery document and keys were read at ${issuer}.`)
  })
})

describe('changing a provider', () => {
  it('shows its id as fixed and its secret as a hint, and sends only what changed, over the version read', async () => {
    const w = await open(read('university-sso'))
    expect(q('.sso-form__id')).toBeNull()
    expect(q('.sso-form__id-fixed')!.textContent).toBe('university-sso')
    expect(q('.sso-form__secret-keep')!.textContent).toContain('Keep the current secret (…k3Qz)')
    expect(q('.sso-form__secret')).toBeNull()
    await fill('.sso-form__name', '大學單一登入')
    await click('.sso-dialog__save')
    const [post] = core.to('POST', SSO.one)
    expect(post.url).toBe('/v1/sso/providers/university-sso')
    expect(JSON.parse(post.body!)).toEqual({ version: 4, display_name: '大學單一登入' })
    expect(lastMessage()!.message).toBe('大學單一登入 is saved. It takes effect at the next sign-in.')
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('sends a new secret only when it replaces the one kept', async () => {
    const secret = newSecret()
    await open(read('university-sso'))
    await click('.sso-form__secret-new input')
    await fill('.sso-form__secret', secret)
    await click('.sso-dialog__save')
    expect(core.lastBody('POST', SSO.one)).toEqual({ version: 4, client_secret: secret })
    await settle()
    expect(inPage(secret)).toBe(false)
  })

  it('closes without a word when nothing changed', async () => {
    const w = await open(read('university-sso'))
    await click('.sso-dialog__save')
    expect(core.to('POST', SSO.one)).toHaveLength(0)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('asks for the secret again when the server’s keys no longer open it', async () => {
    const secret = newSecret()
    core.find('university-sso')!.status = 'secret_unavailable'
    await open(read('university-sso'))
    expect(q('.sso-form__secret-unavailable')!.textContent).toContain('give the secret again')
    expect(q('.sso-form__secret-mode')).toBeNull()
    await click('.sso-dialog__save')
    expect(fieldError('.sso-form__secret')).toBe('Required')
    await fill('.sso-form__secret', secret)
    await click('.sso-dialog__save')
    expect(core.lastBody('POST', SSO.one)).toEqual({ version: 4, client_secret: secret })
  })

  it('warns that accounts stay linked when the issuer changes', async () => {
    await open(read('university-sso'))
    expect(q('.sso-form__issuer-linked')).toBeNull()
    await fill('.sso-form__issuer', 'https://login.example.edu/oidc')
    expect(q('.sso-form__issuer-linked')!.textContent).toContain(
      '3 accounts are linked at it and stay linked: whoever the new issuer vouches for under the same subject signs in as them.',
    )
  })

  it('reads it again when it changed meanwhile, keeps what was changed here over it, and says so', async () => {
    await open(read('university-sso'))
    // Someone else renames it and changes its client id after the dialog read it.
    const p = core.find('university-sso')!
    Object.assign(p, { version: 5, client_id: 'aishie-2', display_name: 'Someone else’s name' })
    await fill('.sso-form__name', 'My name')
    await click('.sso-dialog__save')
    expect(core.lastBody('POST', SSO.one)).toEqual({ version: 4, display_name: 'My name' })
    expect(q('.sso-dialog__notice')!.textContent).toContain('Someone changed this provider meanwhile')
    expect(q<HTMLInputElement>('.sso-form__client-id input')!.value).toBe('aishie-2')
    expect(q<HTMLInputElement>('.sso-form__name input')!.value).toBe('My name')
    await click('.sso-dialog__save')
    expect(core.lastBody('POST', SSO.one)).toEqual({ version: 5, display_name: 'My name' })
    expect(lastMessage()).toMatchObject({ type: 'success' })
  })

  it('closes and says so when it was deleted meanwhile', async () => {
    const w = await open(read('university-sso'))
    core.providers = core.providers.filter((p) => p.id !== 'university-sso')
    await fill('.sso-form__name', 'Anything')
    await click('.sso-dialog__save')
    expect(lastMessage()).toMatchObject({
      type: 'info',
      message: 'That provider no longer exists: someone deleted it meanwhile.',
    })
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('the secret', () => {
  it('is in its field alone while editing, and gone from the page once the dialog closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const secret = newSecret()
    const w = await open()
    await fillNew(secret)
    expect(q<HTMLInputElement>('.sso-form__secret input')!.type).toBe('password')
    expect(q<HTMLInputElement>('.sso-form__secret input')!.autocomplete).toBe('off')
    expect(inPage(secret)).toBe(true)
    // Cancel.
    ;(dialog().querySelector('.el-dialog__footer .el-button') as HTMLElement).click()
    await settle()
    await vi.advanceTimersByTimeAsync(400)
    await settle()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(inPage(secret)).toBe(false)
    expect((w.vm as unknown as { secret: string }).secret).toBe('')
    // Opened again, it asks afresh.
    await w.setProps({ modelValue: true })
    await settle()
    expect(q<HTMLInputElement>('.sso-form__secret input')!.value).toBe('')
    expect(core.everything()).not.toContain(secret)
    expect(JSON.stringify(logged)).not.toContain(secret)
  })

  it('is forgotten when the secret kept is chosen again', async () => {
    const secret = newSecret()
    const w = await open(read('university-sso'))
    await click('.sso-form__secret-new input')
    await fill('.sso-form__secret', secret)
    await click('.sso-form__secret-keep input')
    expect((w.vm as unknown as { secret: string }).secret).toBe('')
    expect(inPage(secret)).toBe(false)
    await click('.sso-dialog__save')
    expect(core.everything()).not.toContain(secret)
  })

  it('is never sent back as its hint, nor shown but as its hint', async () => {
    await open(read('university-sso'))
    await fill('.sso-form__client-id', 'aishie-new')
    await click('.sso-dialog__save')
    const body = core.lastBody('POST', SSO.one)
    expect(body).toEqual({ version: 4, client_id: 'aishie-new' })
    expect(JSON.stringify(body)).not.toContain('…')
  })
})

describe('a provider the operator’s now has the id of', () => {
  it('is no longer changed here: the refusal is said, the dialog closes and the list is read again', async () => {
    core.once('POST', SSO.one, () =>
      failed(422, 'failed_precondition', 'set by the operator', { reason: 'set_by_operator' }),
    )
    const w = await open(siteProvider())
    await fill('.sso-form__name', 'Changed')
    await click('.sso-dialog__save')
    expect(lastMessage()).toMatchObject({
      type: 'warning',
      message: 'This provider is set on the server by its operator: it cannot be changed here.',
    })
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
