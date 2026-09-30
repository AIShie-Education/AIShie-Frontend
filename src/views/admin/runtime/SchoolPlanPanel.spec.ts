import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { setLocale } from '@/i18n'
import SchoolPlanPanel from './SchoolPlanPanel.vue'
import {
  ADMIN,
  Servers,
  adminState,
  configOffer,
  json,
  noRoute,
  refusal,
  schoolPlan,
  siteOffer,
  withAdmin,
  withDollars,
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
  state = adminState({
    plan: schoolPlan({
      offers: [
        configOffer(),
        siteOffer(),
        siteOffer({
          id: 'kimi',
          label: 'Kimi',
          provider: 'moonshot',
          model: 'kimi-k2',
          endpoint: 'china',
          enabled: false,
          status: 'disabled',
          agents: 0,
          key_hint: 'sk-…a1b2',
          key_status: 'untested',
          version: 1,
        }),
        siteOffer({ id: 'standard', label: 'Old standard', status: 'id_taken', priced: false, agents: 1, version: 7 }),
      ],
    }),
  })
  s = withAdmin(new Servers(), state).install()
  vi.mocked(ElMessage).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function panel() {
  const { global } = await mountGlobal()
  const w = mount(SchoolPlanPanel, { global, attachTo: document.body })
  await flushPromises()
  return w
}
/** The table's row for an offer: its first cell names it by source and id. */
const rowOf = (w: VueWrapper, key: string) =>
  w.findAll('.offers-card__table tbody tr').find((r) => r.find(`[data-offer="${key}"]`).exists())!
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0] as { type: string; message: string } | undefined

describe('the models on the plan', () => {
  it('lists runtime.yaml’s first, read-only, then the site’s, each with how it stands, its key and its agents', async () => {
    const w = await panel()
    expect(s.to('GET', ADMIN.plan)).toHaveLength(1)
    const config = rowOf(w, 'config:standard')
    expect(config.find('.offer-cell__label').text()).toBe('School AI (standard)')
    expect(config.find('.offer-cell__model').text()).toBe('OpenAI · gpt-4.1-mini')
    expect(config.find('.offer-status__status').text()).toBe('Offered')
    expect(config.find('.offer-status__config').text()).toBe('Read-only')
    expect(config.text()).toContain('Set by the server’s operator, in runtime.yaml.')
    expect(config.find('.offer-key__server').text()).toBe('On the server')
    expect(config.find('.offer-cell__count').text()).toBe('14')
    // Nothing to change on it.
    expect(config.find('.el-switch').exists()).toBe(false)
    expect(config.find('.offer-cell__edit').exists()).toBe(false)
    expect(config.find('.offer-cell__delete').exists()).toBe(false)

    const fast = rowOf(w, 'site:fast')
    expect(fast.find('.offer-key__hint').text()).toBe('sk-…3f9a')
    expect(fast.find('.offer-key__status').text()).toBe('Tested')
    expect(fast.find('.offer-cell__enabled').classes()).toContain('is-checked')
    expect(fast.find('.offer-cell__enabled input').attributes('aria-label')).toBe('Offer School AI (fast) to owners')

    const kimi = rowOf(w, 'site:kimi')
    expect(kimi.find('.offer-cell__meta').text()).toBe('kimi · China')
    expect(kimi.find('.offer-status__status').text()).toBe('Turned off')
    expect(kimi.text()).toContain('Owners do not see it.')
    expect(kimi.find('.offer-key__status').text()).toBe('Not tested')
    expect(kimi.find('.offer-cell__enabled').classes()).not.toContain('is-checked')

    const shadowed = rowOf(w, 'site:standard')
    expect(shadowed.find('.offer-status__status').text()).toBe('Shadowed')
    expect(shadowed.text()).toContain('runtime.yaml has a model with the same ID, which owners get instead.')
    expect(shadowed.find('.offer-status__unpriced').text()).toBe('No price')
  })

  it('says a model the runtime no longer allows is not offered', async () => {
    state.plan.offers = [siteOffer({ status: 'model_not_allowed' })]
    const w = await panel()
    expect(rowOf(w, 'site:fast').find('.offer-status__status').text()).toBe('Not allowed')
    expect(w.text()).toContain('runtime.yaml’s model lists no longer allow its model, so it is not offered.')
  })

  it('turns one off at the version read, saying first what becomes of its agents', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'site:fast').find('.offer-cell__enabled').trigger('click')
    await flushPromises()
    const [message, title] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    expect(title).toBe('Turn off School AI (fast)?')
    expect(message).toBe(
      '3 agents use it: those whose owners have a model of their own behind it go on with that; the others stop until their owners choose another.',
    )
    const [patch] = s.to('PATCH', ADMIN.offer)
    expect(patch.url).toBe('/runtime/api/v1/admin/school-plan/offers/fast')
    expect(patch.headers['If-Match']).toBe('"4"')
    expect(JSON.parse(patch.body!)).toEqual({ enabled: false })
    expect(lastMessage()).toMatchObject({ type: 'success', message: 'School AI (fast) is turned off.' })
    // The plan read again, as it is now.
    expect(s.to('GET', ADMIN.plan)).toHaveLength(2)
    expect(rowOf(w, 'site:fast').find('.offer-status__status').text()).toBe('Turned off')
  })

  it('turns nothing off when told not to', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await rowOf(w, 'site:fast').find('.offer-cell__enabled').trigger('click')
    await flushPromises()
    expect(s.to('PATCH', ADMIN.offer)).toHaveLength(0)
    expect(rowOf(w, 'site:fast').find('.offer-cell__enabled').classes()).toContain('is-checked')
  })

  it('turns one no agent uses off without asking', async () => {
    state.plan.offers[2] = { ...state.plan.offers[2], enabled: true, status: 'offered' }
    const w = await panel()
    await rowOf(w, 'site:kimi').find('.offer-cell__enabled').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(JSON.parse(s.to('PATCH', ADMIN.offer)[0].body!)).toEqual({ enabled: false })
  })

  it('turns one on without asking', async () => {
    const w = await panel()
    await rowOf(w, 'site:kimi').find('.offer-cell__enabled').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    const [patch] = s.to('PATCH', ADMIN.offer)
    expect(patch.headers['If-Match']).toBe('"1"')
    expect(JSON.parse(patch.body!)).toEqual({ enabled: true })
    expect(lastMessage()?.message).toBe('Kimi is offered to owners.')
  })

  it('reads the plan again, and says so, when the offer changed meanwhile (412)', async () => {
    const w = await panel()
    state.plan.offers[1].version = 9
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'site:fast').find('.offer-cell__enabled').trigger('click')
    await flushPromises()
    expect(s.to('PATCH', ADMIN.offer)[0].headers['If-Match']).toBe('"4"')
    expect(lastMessage()).toMatchObject({
      type: 'warning',
      message:
        'This model changed meanwhile, in another tab or by another administrator. The list shows it as it is now: try again.',
    })
    expect(s.to('GET', ADMIN.plan)).toHaveLength(2)
    expect(state.plan.offers[1].enabled).toBe(true)
  })

  it('says why turning one on was refused', async () => {
    const w = await panel()
    s.once('PATCH', ADMIN.offer, () => refusal(422, 'failed_precondition', 'model_denied', { field: '/model' }))
    await rowOf(w, 'site:kimi').find('.offer-cell__enabled').trigger('click')
    await settle()
    expect(w.find('.offers-card__error').text()).toContain(
      'The server’s model lists (allowed_models and denied_models in runtime.yaml) do not allow this model',
    )
  })

  it('deletes one at the version read, saying first how many agents are on it and what becomes of them', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'site:fast').find('.offer-cell__delete').trigger('click')
    await flushPromises()
    const [message, title, opts] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    expect(title).toBe('Delete School AI (fast)?')
    expect(message).toBe(
      'The model and the school’s key for it are deleted for good. 3 agents use it: those whose owners have a model of their own behind it go on with that; the others stop until their owners choose another. Made again with the same ID, it takes its agents back.',
    )
    expect(opts).toMatchObject({ confirmButtonText: 'Delete' })
    const [del] = s.to('DELETE', ADMIN.offer)
    expect(del.headers['If-Match']).toBe('"4"')
    expect(lastMessage()?.message).toBe(
      'School AI (fast) is deleted. Its 3 agents answer with their owners’ models, or wait.',
    )
    expect(w.find('[data-offer="site:fast"]').exists()).toBe(false)
  })

  it('says none is on one before deleting it', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'site:kimi').find('.offer-cell__delete').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'The model and the school’s key for it are deleted for good. No agent uses it.',
    )
    expect(lastMessage()?.message).toBe('Kimi is deleted.')
  })

  it('takes one deleted meanwhile as gone', async () => {
    const w = await panel()
    state.plan.offers.splice(2, 1)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, 'site:kimi').find('.offer-cell__delete').trigger('click')
    await flushPromises()
    expect(lastMessage()).toMatchObject({ type: 'info', message: 'It was deleted meanwhile.' })
    expect(w.find('[data-offer="site:kimi"]').exists()).toBe(false)
  })

  it('says so when the plan has no model yet', async () => {
    state.plan.offers = []
    const w = await panel()
    expect(w.find('.offers-card__empty').text()).toContain('The plan offers no model yet.')
  })

  it('says quietly that an older runtime does not offer the plan, and shows no error', async () => {
    s.on('GET', ADMIN.plan, () => noRoute())
    const w = await panel()
    expect(w.find('.runtime-async__not-offered').exists()).toBe(true)
    expect(w.find('.offers-card').exists()).toBe(false)
    expect(w.find('.el-alert--error').exists()).toBe(false)
  })

  it('says who may, to someone the runtime does not count among its administrators', async () => {
    s.on('GET', ADMIN.plan, () => refusal(403, 'forbidden', 'not_admin'))
    const w = await panel()
    expect(w.find('.runtime-async__not-admin').text()).toContain('You are not one of this runtime’s administrators')
  })

  it('offers to try again when the runtime could not answer', async () => {
    let fail = true
    s.on('GET', ADMIN.plan, () =>
      fail
        ? json(503, { error: { code: 'unavailable', message: 'down', details: { reason: 'store_unavailable' } } })
        : json(200, state.plan),
    )
    const w = await panel()
    // A read is sent again twice after a 503, a moment apart, before it is an error.
    await vi.waitFor(() => expect(w.find('.runtime-async__error').exists()).toBe(true), { timeout: 5000 })
    expect(s.to('GET', ADMIN.plan)).toHaveLength(3)
    expect(w.find('.runtime-async__error').text()).toContain('The school’s runtime is not available right now.')
    fail = false
    await w.find('.runtime-async__error button').trigger('click')
    await flushPromises()
    expect(w.find('.offers-card').exists()).toBe(true)
  })

  it('reads in Simplified Chinese', async () => {
    setLocale('zh-Hans')
    const w = await panel()
    expect(rowOf(w, 'config:standard').find('.offer-status__config').text()).toBe('只读')
    expect(rowOf(w, 'site:kimi').find('.offer-status__status').text()).toBe('已关闭')
    expect(w.find('.offers-card__add').text()).toBe('添加模型')
  })
})

describe('the daily quotas', () => {
  const inputOf = (w: VueWrapper, key: string) => w.find(`.quotas-card__${key} input`)

  it('shows those in force, the server’s defaults beside them, and who set them', async () => {
    const w = await panel()
    expect((inputOf(w, 'per_owner_day').element as HTMLInputElement).value).toBe('150')
    expect((inputOf(w, 'per_asker_day').element as HTMLInputElement).value).toBe('20')
    expect((inputOf(w, 'per_day').element as HTMLInputElement).value).toBe('5000')
    expect(w.find('.quotas-card__per_owner_day .quotas-card__default').text()).toBe('Server default: 100')
    expect(w.find('.quotas-card__per_day .quotas-card__default').text()).toBe('Server default: no ceiling')
    // A runtime from before quotas in dollars: none to set.
    expect(w.find('.quotas-card__usd').exists()).toBe(false)
    expect(w.find('.quotas-card__source').text()).toMatch(
      /^Set here, in place of the server’s defaults.\s*Changed by Ada Admin, /,
    )
    expect(w.find('.quotas-card__save').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Quotas in dollars, where there are any, stay in force beside these.')
  })

  it('saves all three, no ceiling as null', async () => {
    const w = await panel()
    await inputOf(w, 'per_owner_day').setValue('200')
    await inputOf(w, 'per_day').setValue('')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await flushPromises()
    const [put] = s.to('PUT', ADMIN.quotas)
    expect(JSON.parse(put.body!)).toEqual({ per_owner_day: 200, per_asker_day: 20, per_day: null })
    expect(lastMessage()?.message).toBe('The quotas are saved. Every agent keeps them from its next answer.')
    expect(w.find('.quotas-card__save').attributes('disabled')).toBeDefined()
  })

  it('says what the server’s defaults are in dollars too, before going back to them', async () => {
    state.plan = withDollars(state.plan)
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await w.find('.quotas-card__reset').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'The quotas go back to runtime.yaml’s. Per owner: 100. Per person asking: 20. For the whole school: No ceiling. In dollars, per owner: No ceiling. Per person asking: $0.50. For the whole school: No ceiling.',
    )
  })

  it('keeps quotas being changed when the plan is read again', async () => {
    const w = await panel()
    await inputOf(w, 'per_owner_day').setValue('250')
    await flushPromises()
    await w.find('.offers-card__refresh').trigger('click')
    await flushPromises()
    expect(s.to('GET', ADMIN.plan)).toHaveLength(2)
    expect((inputOf(w, 'per_owner_day').element as HTMLInputElement).value).toBe('250')
    await w.find('.quotas-card__undo').trigger('click')
    expect((inputOf(w, 'per_owner_day').element as HTMLInputElement).value).toBe('150')
  })

  it('asks for the two that are required, and sends nothing without them', async () => {
    const w = await panel()
    await inputOf(w, 'per_asker_day').setValue('')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await settle()
    expect(w.find('.quotas-card__per_asker_day').text()).toContain('Required')
    expect(s.to('PUT', ADMIN.quotas)).toHaveLength(0)
  })

  it('puts a quota the runtime refused on its field', async () => {
    const w = await panel()
    await inputOf(w, 'per_owner_day').setValue('300')
    await flushPromises()
    s.once('PUT', ADMIN.quotas, () => refusal(400, 'invalid_argument', 'invalid_field', { field: '/per_owner_day' }))
    await w.find('.quotas-card__save').trigger('click')
    await settle()
    expect(w.find('.quotas-card__per_owner_day').text()).toContain('A whole number from 1 to 1,000,000.')
  })

  it('sets quotas in dollars beside those in answers, where the runtime has them', async () => {
    state.plan = withDollars(state.plan)
    const w = await panel()
    const usd = (k: string) => w.find(`.quotas-card__${k} .quotas-card__usd input`)
    expect((usd('per_owner_day').element as HTMLInputElement).value).toBe('2.5')
    expect((usd('per_asker_day').element as HTMLInputElement).value).toBe('')
    expect((usd('per_day').element as HTMLInputElement).value).toBe('100')
    expect(w.find('.quotas-card__per_asker_day .quotas-card__usd .quotas-card__default').text()).toBe(
      'Server default: $0.50',
    )
    expect(w.find('.quotas-card__per_owner_day .quotas-card__usd input').attributes('aria-label')).toBe(
      'Per owner: dollars a day',
    )
    expect(w.text()).toContain('every model of the plan needs a price for it')
    await usd('per_asker_day').setValue('0.25')
    await usd('per_day').setValue('')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await flushPromises()
    expect(JSON.parse(s.to('PUT', ADMIN.quotas)[0].body!)).toEqual({
      per_owner_day: 150,
      per_asker_day: 20,
      per_day: 5000,
      per_owner_day_usd: '2.5',
      per_asker_day_usd: '0.25',
      per_day_usd: null,
    })
    expect((usd('per_asker_day').element as HTMLInputElement).value).toBe('0.25')
  })

  it('refuses an amount of dollars that is not one, on its field', async () => {
    state.plan = withDollars(state.plan)
    const w = await panel()
    await w.find('.quotas-card__per_owner_day .quotas-card__usd input').setValue('0')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await settle()
    expect(w.find('.quotas-card__per_owner_day .quotas-card__usd').text()).toContain('An amount of dollars above 0')
    expect(s.to('PUT', ADMIN.quotas)).toHaveLength(0)
  })

  it('lists the models a quota in dollars needs a price for, each with “Add a price”, to try again after', async () => {
    state.plan = withDollars(state.plan)
    const w = await panel()
    s.once('PUT', ADMIN.quotas, () =>
      refusal(422, 'failed_precondition', 'offer_not_priced', {
        field: '/per_owner_day_usd',
        offers: ['standard', 'kimi'],
      }),
    )
    await w.find('.quotas-card__per_owner_day .quotas-card__usd input').setValue('3')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await settle()
    const notice = w.find('.quotas-card__unpriced')
    expect(notice.text()).toContain(
      'A quota in dollars needs a price for every model of the plan, and these have none today:',
    )
    expect(notice.findAll('.unpriced__label').map((x) => x.text())).toEqual(['School AI (standard)', 'Kimi'])
    await notice.find('[data-offer="kimi"] .unpriced__add').trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.price-dialog') as HTMLElement
    const value = (sel: string) => (dialog.querySelector(`${sel} input`) as HTMLInputElement).value
    expect(value('.price-form__model')).toBe('kimi-k2')
    for (const [sel, v] of [
      ['.price-form__input', '0.6'],
      ['.price-form__output', '2.5'],
    ]) {
      const i = dialog.querySelector(`${sel} input`) as HTMLInputElement
      i.value = v
      i.dispatchEvent(new Event('input'))
    }
    await flushPromises()
    ;(dialog.querySelector('.price-dialog__save') as HTMLElement).click()
    await settle()
    expect(JSON.parse(s.to('POST', ADMIN.prices)[0].body!)).toMatchObject({ provider: 'moonshot', model: 'kimi-k2' })
    expect(w.find('[data-offer="kimi"] .unpriced__done').text()).toBe('Priced: try again.')
    await w.find('.quotas-card__save').trigger('click')
    await flushPromises()
    expect(s.to('PUT', ADMIN.quotas)).toHaveLength(2)
    expect(w.find('.quotas-card__unpriced').exists()).toBe(false)
  })

  it('lists the agents a quota in dollars would leave without a price, with the way to the prices', async () => {
    state.plan = withDollars(state.plan)
    const w = await panel()
    s.once('PUT', ADMIN.quotas, () =>
      refusal(422, 'failed_precondition', 'model_not_priced', {
        field: '/per_day_usd',
        problems: [
          'agent "agt_1": it has a quota in dollars, and the price table has no price for openai gpt-4.1-nano',
        ],
      }),
    )
    await w.find('.quotas-card__per_day .quotas-card__usd input').setValue('50')
    await flushPromises()
    await w.find('.quotas-card__save').trigger('click')
    await settle()
    const alert = w.find('.quotas-card__error')
    expect(alert.text()).toContain('A quota in dollars would hold agents whose models have no price.')
    expect(alert.find('.quotas-card__problems').text()).toContain('agent "agt_1"')
    expect(alert.find('.quotas-card__to-prices').attributes('href')).toBe('/admin/runtime?tab=pricing')
  })

  it('goes back to the server’s defaults, saying first what they are', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await w.find('.quotas-card__reset').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'The quotas go back to runtime.yaml’s. Per owner: 100. Per person asking: 20. For the whole school: No ceiling.',
    )
    expect(s.to('DELETE', ADMIN.quotas)).toHaveLength(1)
    expect((inputOf(w, 'per_owner_day').element as HTMLInputElement).value).toBe('100')
    expect(w.find('.quotas-card__usd').exists()).toBe(false)
    expect(w.find('.quotas-card__source').text()).toBe(
      'The server’s defaults (runtime.yaml), as its operator set them.',
    )
    expect(w.find('.quotas-card__reset').exists()).toBe(false)
  })
})
