import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { setLocale } from '@/i18n'
import OcrCard from './OcrCard.vue'
import {
  ADMIN,
  ADMIN_ID,
  Servers,
  adminState,
  noRoute,
  ocrSettings,
  refusal,
  withAdmin,
  type AdminState,
} from './adminFakes'
import { mountGlobal, settle } from './testSetup'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }) }
})

let s: Servers
let state: AdminState

beforeEach(() => {
  setLocale('en')
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  vi.mocked(ElMessage).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card() {
  const { global } = await mountGlobal('/admin/runtime?tab=documents')
  const w = mount(OcrCard, { global, attachTo: document.body })
  await flushPromises()
  return w
}
const patches = () => s.to('PATCH', ADMIN.settings).map((c) => JSON.parse(c.body!))
const boxes = (w: VueWrapper) =>
  w.findAll('.ocr-card__choice').map((c) => ({
    text: c.find('.ocr-card__name').text(),
    code: c.find('.ocr-card__code').text(),
    checked: c.classes().includes('is-checked'),
    serverDefault: c.find('.ocr-card__default').exists(),
  }))

describe('OcrCard', () => {
  it('shows OCR on, the languages installed by their names with the server’s marked, and who changed it', async () => {
    const w = await card()
    expect(w.find('.ocr-card__state').text()).toBe('On')
    expect(w.find('.ocr-card__enabled').classes()).toContain('is-checked')
    // The switch is named by its label.
    expect(w.find('.ocr-card__enabled input').attributes('id')).toBe('ocr-enabled')
    expect(w.find('label[for="ocr-enabled"]').text()).toBe('Read scanned documents and images')
    expect(boxes(w)).toEqual([
      { text: '简体中文', code: 'chi_sim', checked: false, serverDefault: true },
      { text: '繁體中文', code: 'chi_tra', checked: true, serverDefault: true },
      { text: 'English', code: 'eng', checked: true, serverDefault: true },
      { text: '日本語', code: 'jpn', checked: false, serverDefault: false },
    ])
    expect(w.find('.ocr-card__order').text()).toBe('Read in this order: 繁體中文 and English')
    // Not the server's default: it may be put back.
    expect(w.find('.ocr-card__use-default').exists()).toBe(true)
    expect(w.text()).toContain('The server’s languages: 简体中文, 繁體中文, and English.')
    const changed = w.find('.ocr-card__changed')
    expect(changed.text()).toMatch(/^Changed by Ada Admin, /)
    expect(changed.find('a').attributes('href')).toBe(`/admin/actors/${ADMIN_ID}`)
  })

  it('turns OCR off and on at once, with the switch', async () => {
    const w = await card()
    await w.find('.ocr-card__enabled').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ ocr: { enabled: false } }])
    expect(w.find('.ocr-card__state').text()).toBe('Off')
    expect(vi.mocked(ElMessage).mock.calls.at(-1)?.[0]).toMatchObject({ type: 'success', message: 'OCR is off.' })
    await w.find('.ocr-card__enabled').trigger('click')
    await flushPromises()
    expect(patches()[1]).toEqual({ ocr: { enabled: true } })
    expect(w.find('.ocr-card__state').text()).toBe('On')
  })

  it('saves the languages in the order they were chosen, and offers to undo', async () => {
    const w = await card()
    expect(w.find('.ocr-card__save').exists()).toBe(false)
    const [sim, , eng] = w.findAll('.ocr-card__choice input')
    await eng.setValue(false)
    await sim.setValue(true)
    expect(w.find('.ocr-card__order').text()).toBe('Read in this order: 繁體中文 and 简体中文')
    await w.find('.ocr-card__undo').trigger('click')
    expect(w.find('.ocr-card__order').text()).toBe('Read in this order: 繁體中文 and English')

    await w.findAll('.ocr-card__choice input')[3].setValue(true)
    await w.find('.ocr-card__save').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ ocr: { languages: ['chi_tra', 'eng', 'jpn'] } }])
    expect(vi.mocked(ElMessage).mock.calls.at(-1)?.[0]).toMatchObject({
      message: 'OCR reads in 繁體中文, English, and 日本語.',
    })
    expect(w.find('.ocr-card__save').exists()).toBe(false)
  })

  it('keeps the languages being chosen when the switch is turned', async () => {
    const w = await card()
    await w.findAll('.ocr-card__choice input')[3].setValue(true)
    await w.find('.ocr-card__enabled').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ ocr: { enabled: false } }])
    expect(w.find('.ocr-card__order').text()).toBe('Read in this order: 繁體中文, English, and 日本語')
    expect(w.find('.ocr-card__save').exists()).toBe(true)
  })

  it('asks for one language at least, and sends none then', async () => {
    const w = await card()
    const inputs = w.findAll('.ocr-card__choice input')
    await inputs[1].setValue(false)
    await inputs[2].setValue(false)
    expect(w.find('.ocr-card__problem').text()).toBe('Choose at least one, or use the server’s default.')
    expect(w.find('.ocr-card__save').attributes('disabled')).toBeDefined()
    await w.find('.ocr-card__save').trigger('click')
    expect(patches()).toEqual([])
  })

  it('goes back to the server’s languages (null)', async () => {
    const w = await card()
    await w.find('.ocr-card__use-default').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ ocr: { languages: null } }])
    expect(w.find('.ocr-card__order').text()).toBe('Read in this order: 简体中文, 繁體中文, and English')
    expect(w.find('.ocr-card__use-default').exists()).toBe(false)
  })

  it.each([
    [
      'operator_off',
      'The server’s operator has turned OCR off (OCR=off), so it never runs, whatever is set here. What you set is kept for when it is turned on.',
    ],
    [
      'not_installed',
      'OCR’s programs or languages are not installed on this server, so it cannot run. What you set is kept for when they are.',
    ],
  ] as const)('where OCR cannot run (%s), says why, and offers only turning it off', async (reason, words) => {
    state.settings = ocrSettings({
      available: false,
      unavailable_reason: reason,
      unavailable_detail: 'ocr: not available: tesseract has no chi_tra data',
      enabled: false,
      available_languages: [],
    })
    const w = await card()
    expect(w.find('.ocr-card__state').text()).toBe('Not available')
    expect(w.find('.ocr-card__unavailable .el-alert__title').text()).toBe(words)
    expect(w.find('.ocr-card__details').text()).toContain('tesseract has no chi_tra data')
    // Off, and cannot be turned on.
    expect(w.find('.ocr-card__enabled').classes()).toContain('is-disabled')
    expect(w.find('.ocr-card__choices').exists()).toBe(false)
    expect(w.find('.ocr-card__kept').text()).toBe('Kept for when OCR can run: 繁體中文 and English')
  })

  it('may turn off, where OCR cannot run, what the site had on', async () => {
    state.settings = ocrSettings({
      available: false,
      unavailable_reason: 'operator_off',
      enabled: true,
      available_languages: [],
    })
    const w = await card()
    expect(w.find('.ocr-card__enabled').classes()).not.toContain('is-disabled')
    await w.find('.ocr-card__enabled').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ ocr: { enabled: false } }])
  })

  it('says why a change was refused, and reads the settings again when OCR could not run after all', async () => {
    const w = await card()
    s.once('PATCH', ADMIN.settings, () =>
      refusal(422, 'failed_precondition', 'ocr_unavailable', { field: '/ocr/enabled' }),
    )
    await w.find('.ocr-card__enabled').trigger('click')
    await settle()
    expect(w.find('.ocr-card__error').text()).toContain('OCR cannot run on this server now')
    expect(s.to('GET', ADMIN.settings)).toHaveLength(2)
  })

  it('says quietly that an older runtime does not offer it', async () => {
    s.on('GET', ADMIN.settings, () => noRoute())
    const w = await card()
    expect(w.find('.runtime-async__not-offered').text()).toBe(
      'This runtime does not offer this yet: it comes with a newer version of the agent runtime.',
    )
    expect(w.find('.el-alert--error').exists()).toBe(false)
  })

  it('says when it has never been changed here', async () => {
    state.settings = ocrSettings({ updated_at: null, updated_by: null, languages: ['chi_sim', 'chi_tra', 'eng'] })
    const w = await card()
    expect(w.find('.ocr-card__changed').text()).toBe('Not changed here: as the server’s operator set it.')
    expect(w.find('.ocr-card__use-default').exists()).toBe(false)
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await card()
    expect(w.find('.ocr-card__state').text()).toBe('已開啟')
    expect(w.find('.ocr-card__order').text()).toBe('辨識次序：繁體中文和English')
    expect(w.find('.ocr-card__changed').text()).toMatch(/^由Ada Admin於.+更改$/)
  })
})
