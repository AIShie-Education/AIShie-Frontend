import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { forgetRuntimeAssertion } from '@/api/runtime'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { setLocale } from '@/i18n'
import { shortId } from '@/utils/format'
import TranscriptionCard from './TranscriptionCard.vue'
import {
  ADMIN,
  COURSE_ID,
  DOC_ID,
  Servers,
  adminState,
  ocrSettings,
  refusal,
  serviceCredential,
  transcriptionOff,
  transcriptionSettings,
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
const confirm = vi.mocked(ElMessageBox.confirm)

beforeEach(() => {
  setLocale('en')
  forgetRuntimeAssertion()
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  vi.mocked(ElMessage).mockReset()
  confirm.mockReset()
  confirm.mockResolvedValue('confirm' as never)
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card() {
  const { global } = await mountGlobal('/admin/runtime?tab=documents')
  const w = mount(TranscriptionCard, { global, attachTo: document.body })
  await flushPromises()
  return w
}
const patches = () => s.to('PATCH', ADMIN.settings).map((c) => JSON.parse(c.body!))
const find = (w: VueWrapper, cls: string) => w.find(`.transcription-card__${cls}`)
const live = () => state.service.credentials.filter((x) => x.live).map((x) => x.id)
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0]

describe('TranscriptionCard', () => {
  it('shows it running, its model, its numbers, its credential and today’s', async () => {
    const w = await card()
    expect(find(w, 'state').text()).toBe('Running')
    expect(find(w, 'enabled').classes()).toContain('is-checked')
    expect(w.find('label[for="transcription-enabled"]').text()).toBe('Transcribe documents into text versions')
    expect(find(w, 'offer-select').text()).toContain('School AI (fast)')
    expect((find(w, 'max-pages').find('input').element as HTMLInputElement).value).toBe('300')
    expect((find(w, 'per-day').find('input').element as HTMLInputElement).placeholder).toBe('No limit')
    expect((find(w, 'concurrency').find('input').element as HTMLInputElement).value).toBe('2')
    expect(find(w, 'credential-status').text()).toBe('Accepted')
    expect(find(w, 'hint').text()).toBe('aissvc_held00000000…')
    expect(find(w, 'seen').text()).toContain('Last accepted by AIshie')
    expect(find(w, 'issue').text()).toBe('Replace')
    expect(find(w, 'withdraw').exists()).toBe(true)
    expect(find(w, 'pages').text()).toBe('120')
    expect(find(w, 'documents').text()).toBe('9')
    expect(find(w, 'cost').text()).toBe('US$0.0312')
    // Nothing to save until something is changed.
    expect(find(w, 'save').exists()).toBe(false)
  })

  it('says when the day’s pages start again, in the reader’s time', async () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    const w = await card()
    expect(find(w, 'numbers-hint').text()).toBe(
      'A document with more pages is skipped, and so is what is claimed once the day’s pages are used up, until they start again at 08:00 (Hong Kong Standard Time); staff can send it again later. Leave “Pages a day” empty for no limit.',
    )
    setLocale('zh-Hant')
    await flushPromises()
    expect(find(w, 'numbers-hint').text()).toContain('當日頁數用完後至香港標準時間 08:00重新計算前')
  })

  it('turns it off and on at once, with the switch', async () => {
    const w = await card()
    await find(w, 'enabled').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ transcription: { enabled: false } }])
    expect(find(w, 'state').text()).toBe('Off')
    expect(lastMessage()).toMatchObject({ type: 'success', message: 'Transcription is off.' })
  })

  it('says what blocks it, as the runtime says', async () => {
    state.settings.transcription = transcriptionOff({
      enabled: true,
      state: 'blocked',
      blocked_reason: 'no_credential',
    })
    const w = await card()
    expect(find(w, 'state').text()).toBe('Blocked: no credential')
    expect(find(w, 'credential-status').text()).toBe('None')
    expect(find(w, 'issue').text()).toBe('Issue and give to the agent service')
    expect(find(w, 'withdraw').exists()).toBe(false)
  })

  it('saves only what changed of its form, and none for no daily limit', async () => {
    const w = await card()
    await find(w, 'max-pages').find('input').setValue('500')
    await find(w, 'per-day').find('input').setValue('2000')
    await flushPromises()
    await find(w, 'save').trigger('click')
    await flushPromises()
    expect(patches()).toEqual([{ transcription: { max_pages: 500, per_day_pages: 2000 } }])
    expect(lastMessage()).toMatchObject({ message: 'Transcription settings saved.' })
    expect(find(w, 'save').exists()).toBe(false)
  })

  it('says on the model’s field why a model that reads no files was refused', async () => {
    const w = await card()
    s.once('PATCH', ADMIN.settings, () =>
      refusal(422, 'failed_precondition', 'offer_no_file_input', { field: '/transcription/offer' }),
    )
    await find(w, 'max-pages').find('input').setValue('400')
    await find(w, 'save').trigger('click')
    await settle()
    expect(w.find('.el-form-item__error').text()).toContain('reads neither PDFs nor images')
  })

  it('offers the plan’s models, and says when the one chosen is gone from it', async () => {
    state.settings.transcription = transcriptionSettings({
      offer: 'gone',
      offer_status: 'not_found',
      state: 'blocked',
      blocked_reason: 'offer_unavailable',
    })
    const w = await card()
    expect(find(w, 'offer-status').text()).toBe('No longer on the plan')
    expect(find(w, 'state').text()).toBe('Blocked: its model is not available')
  })

  it('where it cannot run, says why, and offers only turning it off', async () => {
    state.settings.transcription = transcriptionOff({
      available: false,
      unavailable_reason: 'core_too_old',
      unavailable_detail: 'core: no document_text.queue in the catalogue',
    })
    const w = await card()
    expect(find(w, 'unavailable').text()).toContain('has no transcription queue yet')
    expect(find(w, 'details').text()).toContain('no document_text.queue')
    expect(find(w, 'enabled').classes()).toContain('is-disabled')
  })

  it('turned off by the server, says in each language to ask its operator, as the ⓘ beside it does', async () => {
    state.settings.transcription = transcriptionOff({ available: false, unavailable_reason: 'operator_off' })
    for (const [locale, ask] of [
      ['en', 'ask the server’s operator'],
      ['zh-Hant', '請聯絡伺服器營運者'],
      ['zh-Hans', '请联系服务器运维方'],
    ] as const) {
      setLocale(locale)
      const w = await card()
      expect(find(w, 'unavailable').find('.el-alert__title').text()).toContain(ask)
      w.unmount()
    }
  })

  it('says quietly that an older runtime does not transcribe', async () => {
    state.settings = ocrSettings()
    const w = await card()
    expect(find(w, 'not-offered').text()).toContain('This agent service does not offer this yet')
  })

  it('issues a credential and gives it to the runtime, which the page never shows', async () => {
    state.settings.transcription = transcriptionOff({ enabled: true, offer: 'fast', offer_status: 'ok' })
    state.service.credentials = [serviceCredential({ id: 'cred-stray', token_prefix: 'stray0000000' })]
    const w = await card()
    await find(w, 'issue').trigger('click')
    await flushPromises()
    const [token] = state.service.issued
    expect(state.service.received).toEqual([token])
    expect(live()).toHaveLength(1)
    expect(live()).not.toContain('cred-stray')
    expect(find(w, 'credential-status').text()).toBe('Accepted')
    expect(find(w, 'state').text()).toBe('Running')
    expect(lastMessage()).toMatchObject({ type: 'success', message: 'The agent service has a new credential.' })
    expect(document.body.innerHTML).not.toContain(token)
    expect(document.body.innerHTML).not.toContain(token.slice(-43))
  })

  it('revokes the new credential and says why when the runtime refuses it', async () => {
    s.on('PUT', ADMIN.credential, () => refusal(422, 'failed_precondition', 'credential_rejected', { status: 401 }))
    const w = await card()
    await find(w, 'issue').trigger('click')
    await flushPromises()
    expect(find(w, 'credential-error').text()).toContain('AIshie did not accept the credential when the agent service tried it')
    expect(live()).toEqual(['cred-held'])
    expect(document.body.innerHTML).not.toContain(state.service.issued[0])
  })

  it('with five live credentials, asks before replacing them all', async () => {
    for (const id of ['c2', 'c3', 'c4', 'c5'])
      state.service.credentials.push(serviceCredential({ id, token_prefix: `${id}0000000000`.slice(0, 12) }))
    const w = await card()
    await find(w, 'issue').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(String(confirm.mock.calls[0][0])).toContain('already has 5 credentials')
    expect(JSON.parse(s.to('POST', ADMIN.serviceCredentials)[0].body!)).toMatchObject({ replace: true })
    expect(live()).toHaveLength(1)

    // Not confirmed: nothing issued.
    for (const id of ['d1', 'd2', 'd3', 'd4'])
      state.service.credentials.push(serviceCredential({ id, token_prefix: `${id}0000000000`.slice(0, 12) }))
    confirm.mockRejectedValueOnce('cancel')
    await find(w, 'issue').trigger('click')
    await flushPromises()
    expect(s.to('POST', ADMIN.serviceCredentials)).toHaveLength(1)
  })

  it('revokes it: the runtime forgets it, and Core revokes it', async () => {
    const w = await card()
    await find(w, 'withdraw').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(s.to('DELETE', ADMIN.credential)).toHaveLength(1)
    expect(live()).toEqual([])
    expect(find(w, 'credential-status').text()).toBe('None')
    expect(find(w, 'state').text()).toBe('Blocked: no credential')
  })

  it('lists what it transcribed, by status, with the documents’ titles where Core gives them', async () => {
    const w = await card()
    const rows = w.findAll('.job-cell')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('.job-cell__status').text()).toBe('Done')
    expect(rows[0].find('.job-cell__doc').text()).toBe('Week 3 slides')
    expect(rows[0].find('.job-cell__doc').attributes('href')).toBe(
      `/courses/${COURSE_ID}/documents/${DOC_ID}?version=0192f3c1-eeee-7c3a-9b1f-2a4c6e8f0a1b&tab=text`,
    )
    expect(rows[1].find('.job-cell__reason').text()).toBe('More pages than the limit')
    // A job is a file's: named as its version names it, and linked to its text version.
    expect(rows[0].find('.job-cell__file').exists()).toBe(false)
    expect(rows[1].find('.job-cell__file').text()).toBe('week3-handout.pdf')
    expect(rows[1].find('.job-cell__doc').attributes('href')).toContain('&tab=text&file=file-2')
    expect(w.findAll('.job-cell__cost').map((c) => c.text())).toEqual(['US$0.0041', 'No price'])

    await w.find('.load-more button').trigger('click')
    await flushPromises()
    const more = w.findAll('.job-cell')
    expect(more).toHaveLength(3)
    // Core does not give this one's title: its id.
    expect(more[2].find('.job-cell__doc').text()).toBe(shortId('0192f3c1-ffff-7c3a-9b1f-2a4c6e8f0a1b'))
    // Nor its files' names: its place in the version.
    expect(more[2].find('.job-cell__file').text()).toBe('File 3')
    expect(more[2].find('.job-cell__reason').text()).toBe('The model answered 500 three times')
    expect(more[2].text()).toContain('Earlier upload')

    const filter = w.findAllComponents({ name: 'ElSelect' }).find((c) => c.classes('transcription-jobs__filter'))!
    filter.vm.$emit('update:modelValue', 'failed')
    await flushPromises()
    expect(s.to('GET', ADMIN.jobs).at(-1)!.url).toContain('status=failed')
    expect(w.findAll('.job-cell')).toHaveLength(1)
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    state.settings.transcription = transcriptionOff({
      enabled: true,
      state: 'blocked',
      blocked_reason: 'no_credential',
    })
    const w = await card()
    expect(find(w, 'state').text()).toBe('受阻：沒有憑證')
    expect(find(w, 'issue').text()).toBe('發放並交給執行環境')
    expect(find(w, 'credential-status').text()).toBe('未設定')
  })
})

describe('the jobs, by their own width', () => {
  it('put a job’s pages, cost and time under its document where they are as narrow as on a phone, 542 px', async () => {
    // The window is wide (matchMedia says nothing matches): the list decides, measured by its head.
    const sizes = fakeContainerWidths({ '.transcription-jobs__head': 543 })
    const w = await card()
    const heads = () => w.findAll('.transcription-jobs__table thead th').map((th) => th.text())
    expect(heads()).toEqual(['Document', 'Pages', 'Cost', 'Finished'])

    await sizes.resize('.transcription-jobs__head', 542)
    await flushPromises()
    expect(heads()).toEqual(['Document'])
    const meta = w.findAll('.job-cell')[0].findAll('.job-cell__meta').at(-1)!
    // Its time, relative to now, last.
    expect(meta.text().replace(/\s+/g, ' ')).toMatch(/^12 pages · US\$0\.0041 · \S/)
  })
})
