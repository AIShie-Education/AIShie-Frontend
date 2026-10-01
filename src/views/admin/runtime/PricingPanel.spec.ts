import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { setLocale } from '@/i18n'
import PricingPanel from './PricingPanel.vue'
import {
  ADMIN,
  ADMIN_ID,
  Servers,
  adminState,
  noRoute,
  priceTable,
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
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  vi.mocked(ElMessage).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function panel() {
  const { global } = await mountGlobal('/admin/runtime?tab=pricing')
  const w = mount(PricingPanel, { global, attachTo: document.body })
  await flushPromises()
  return w
}
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0] as { type: string; message: string } | undefined
const rowOf = (w: VueWrapper, sel: string) => w.findAll('tbody tr').find((r) => r.find(sel).exists())!
/** The dialog open now: Element Plus puts it in the body. */
const dialog = () => document.body.querySelector('.el-overlay:not([style*="display: none"]) .el-dialog') as HTMLElement
function fill(sel: string, v: string) {
  const input = dialog().querySelector(`${sel} input`) as HTMLInputElement
  input.value = v
  input.dispatchEvent(new Event('input'))
}
const fieldError = (sel: string) =>
  dialog().querySelector(sel)!.closest('.el-form-item')!.querySelector('.el-form-item__error')?.textContent?.trim() ??
  ''
async function click(el: Element | null) {
  ;(el as HTMLElement).click()
  await settle()
}

describe('the price table', () => {
  it('lists the site’s prices and the file’s, by provider, with where each comes from and the version in force', async () => {
    const w = await panel()
    expect(s.to('GET', ADMIN.prices)).toHaveLength(1)
    expect(w.find('.prices-card__version').text()).toBe('Table in force: 2026-09-27+site-20260930T081200Z')
    const keys = w.findAll('[data-price]').map((c) => c.attributes('data-price'))
    expect(keys).toEqual(['file:claude', 'site:gpt-4.1-mini-2026-09-01', 'file:0'])
    const site = rowOf(w, '[data-price="site:gpt-4.1-mini-2026-09-01"]')
    expect(site.find('.price-cell__input').text()).toBe('$0.4')
    expect(site.find('.price-cell__cache_read').text()).toBe('$0.1')
    expect(site.find('.price-cell__output').text()).toBe('$1.6')
    expect(site.find('.price-cell__source-tag').text()).toBe('Site')
    expect(site.find('.price-cell__edit').exists()).toBe(true)
    const file = rowOf(w, '[data-price="file:0"]')
    expect(file.find('.price-cell__source-tag').text()).toBe('Server’s price file')
    expect(file.find('.price-cell__replaced').text()).toBe('Replaced by the site’s price')
    expect(file.find('.price-cell').classes()).toContain('is-overridden')
    expect(file.find('.price-cell__edit').exists()).toBe(false)
    expect(rowOf(w, '[data-price="file:claude"]').find('.price-cell__glob').text()).toBe('Pattern')
    expect(w.text()).toContain('A change applies to calls from now on: costs already recorded keep the price they had.')
  })

  it('asks for the provider and the prices before adding one, and sends nothing without them', async () => {
    const w = await panel()
    await w.find('.prices-card__add').trigger('click')
    await flushPromises()
    fill('.price-form__model', 'gpt-4.1-nano')
    await flushPromises()
    await click(dialog().querySelector('.price-dialog__save'))
    expect(fieldError('.price-form__provider')).toBe('Required')
    expect(fieldError('.price-form__input')).toBe('Required')
    expect(s.to('POST', ADMIN.prices)).toHaveLength(0)
  })

  it('adds a price, suggesting its ID from the model and day, the cache prices the input’s unless given', async () => {
    const w = await panel()
    await w.find('.prices-card__add').trigger('click')
    await flushPromises()
    fill('.price-form__model', 'gpt-4.1-nano')
    await flushPromises()
    expect((dialog().querySelector('.price-form__id input') as HTMLInputElement).value).toBe('gpt-4.1-nano-2026-09-30')
    const vm = w.findComponent({ name: 'PriceDialog' }).vm as unknown as { form: Record<string, string> }
    vm.form.provider = 'openai'
    fill('.price-form__input', '0.1')
    fill('.price-form__output', '0.4')
    await click(dialog().querySelector('.price-dialog__save'))
    expect(JSON.parse(s.to('POST', ADMIN.prices)[0].body!)).toEqual({
      id: 'gpt-4.1-nano-2026-09-30',
      provider: 'openai',
      model: 'gpt-4.1-nano',
      from: '2026-09-30',
      usd_per_mtok: { input: '0.1', output: '0.4' },
    })
    expect(lastMessage()?.message).toBe('The price of gpt-4.1-nano from 2026-09-30 is saved.')
    expect(s.to('GET', ADMIN.prices)).toHaveLength(2)
    expect(w.find('[data-price="site:gpt-4.1-nano-2026-09-30"]').exists()).toBe(true)
  })

  it('says a price taken for the same model and day on the day', async () => {
    const w = await panel()
    s.once('POST', ADMIN.prices, () => refusal(409, 'conflict', 'price_exists', { field: '/from', id: 'mini' }))
    await w.find('.prices-card__add').trigger('click')
    await flushPromises()
    const vm = w.findComponent({ name: 'PriceDialog' }).vm as unknown as { form: Record<string, string> }
    Object.assign(vm.form, { provider: 'openai', model: 'gpt-4.1-mini', input: '1', output: '2' })
    await flushPromises()
    await click(dialog().querySelector('.price-dialog__save'))
    expect(s.to('POST', ADMIN.prices)).toHaveLength(1)
    expect(fieldError('.price-form__from')).toBe(
      'The table already has a price for this provider and model from this day (mini). Edit that one instead.',
    )
  })

  it('edits one of the site’s at the version read, sending only what changed', async () => {
    const w = await panel()
    await rowOf(w, '[data-price="site:gpt-4.1-mini-2026-09-01"]').find('.price-cell__edit').trigger('click')
    await flushPromises()
    expect(dialog().querySelector('.el-dialog__title')!.textContent).toBe('Edit the price of gpt-4.1-mini')
    expect(dialog().querySelector('.price-form__id')).toBeNull()
    expect((dialog().querySelector('.price-form__cacheWrite input') as HTMLInputElement).value).toBe('')
    fill('.price-form__output', '2')
    await click(dialog().querySelector('.price-dialog__save'))
    const [patch] = s.to('PATCH', ADMIN.price)
    expect(patch.url).toBe('/runtime/api/v1/admin/prices/gpt-4.1-mini-2026-09-01')
    expect(patch.headers['If-Match']).toBe('"2"')
    expect(JSON.parse(patch.body!)).toEqual({ usd_per_mtok: { output: '2' } })
  })

  it('on 412, reads it again, keeps what was changed here, and saves at the new version', async () => {
    const w = await panel()
    await rowOf(w, '[data-price="site:gpt-4.1-mini-2026-09-01"]').find('.price-cell__edit').trigger('click')
    await flushPromises()
    state.prices.rows[0] = { ...state.prices.rows[0], from: '2026-09-15', row_version: 5 }
    fill('.price-form__output', '2')
    await click(dialog().querySelector('.price-dialog__save'))
    expect(dialog().querySelector('.price-dialog__notice')!.textContent).toContain('This price changed meanwhile')
    await click(dialog().querySelector('.price-dialog__save'))
    const again = s.to('PATCH', ADMIN.price)[1]
    expect(again.headers['If-Match']).toBe('"5"')
    expect(JSON.parse(again.body!)).toEqual({ usd_per_mtok: { output: '2' } })
  })

  it('deletes one of the site’s at the version read, and shows the table as it is after', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, '[data-price="site:gpt-4.1-mini-2026-09-01"]').find('.price-cell__delete').trigger('click')
    await flushPromises()
    const [message, title] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    expect(title).toBe('Delete the price of gpt-4.1-mini from 2026-09-01?')
    expect(message).toBe(
      'Calls from now on are priced by the prices left. Costs already recorded keep the price they had.',
    )
    expect(s.to('DELETE', ADMIN.price)[0].headers['If-Match']).toBe('"2"')
    expect(w.find('[data-price="site:gpt-4.1-mini-2026-09-01"]').exists()).toBe(false)
    expect(s.to('GET', ADMIN.prices)).toHaveLength(1)
  })

  it('says why deleting one a quota in dollars needs was refused, with the agents it names', async () => {
    const w = await panel()
    s.once('DELETE', ADMIN.price, () =>
      refusal(422, 'failed_precondition', 'model_not_priced', {
        problems: [
          'agent "agt_1": it has a quota in dollars, and the price table has no price for openai gpt-4.1-mini',
        ],
      }),
    )
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await rowOf(w, '[data-price="site:gpt-4.1-mini-2026-09-01"]').find('.price-cell__delete').trigger('click')
    await settle()
    const alert = w.find('.prices-card__error')
    expect(alert.text()).toContain('A quota in dollars would hold agents whose models have no price.')
    expect(alert.find('.prices-card__problems').text()).toContain('agent "agt_1"')
  })

  it('lists the plan’s models without a price, each with “Add a price”, filled in from the offer', async () => {
    state.prices = priceTable({
      unpriced_offers: [{ id: 'fast', source: 'site', provider: 'openai', model: 'gpt-4.1-nano', enabled: true }],
    })
    const w = await panel()
    const notice = w.find('.prices-card__unpriced')
    expect(notice.text()).toContain('These models of the school’s plan have no price today')
    expect(notice.find('.unpriced__model').text()).toBe('openai · gpt-4.1-nano')
    await notice.find('.unpriced__add').trigger('click')
    await flushPromises()
    expect((dialog().querySelector('.price-form__model input') as HTMLInputElement).value).toBe('gpt-4.1-nano')
    expect((dialog().querySelector('.price-form__from input') as HTMLInputElement).value).toBe('2026-09-30')
    fill('.price-form__input', '0.1')
    fill('.price-form__output', '0.4')
    await click(dialog().querySelector('.price-dialog__save'))
    expect(JSON.parse(s.to('POST', ADMIN.prices)[0].body!)).toMatchObject({
      id: 'gpt-4.1-nano-2026-09-30',
      provider: 'openai',
      model: 'gpt-4.1-nano',
    })
    // Read again, and priced now.
    expect(s.to('GET', ADMIN.prices)).toHaveLength(2)
    expect(w.find('.prices-card__unpriced').exists()).toBe(false)
  })

  it('says once, for the whole tab, that an older runtime does not offer pricing', async () => {
    for (const re of [ADMIN.prices, ADMIN.tenants, ADMIN.budgets, ADMIN.costs]) s.on('GET', re, () => noRoute())
    const w = await panel()
    expect(w.findAll('.runtime-async__not-offered')).toHaveLength(1)
    expect(w.find('.tenants-card').exists()).toBe(false)
    expect(s.to('GET', ADMIN.tenants)).toHaveLength(0)
  })
})

describe('quotas per person', () => {
  const tenantRow = (w: VueWrapper, id: string) => rowOf(w, `[data-tenant="${id}"]`)

  it('lists a page of tenants, by name where they are a person, with the quota in force and the server’s', async () => {
    const w = await panel()
    const me = tenantRow(w, `ten_${ADMIN_ID}`)
    expect(me.find('.tenant-cell__name').text()).toBe('Ada Admin')
    expect(me.find('.tenant-cell__name').attributes('href')).toBe(`/admin/actors/${ADMIN_ID}`)
    expect(me.find('.tenant-cell__source').text()).toBe('Set here')
    expect(me.find('.tenant-cell__answers').text()).toBe('300')
    expect(me.find('.tenant-cell__usd').text()).toBe('$5.00')
    expect(me.text()).toContain('server: 200')
    expect(me.text()).toContain('server: No limit')
    expect(me.find('.tenant-cell__reset').exists()).toBe(true)
    const ops = tenantRow(w, 't_ops')
    expect(ops.find('.tenant-cell__id').text()).toBe('t_ops')
    expect(ops.find('.tenant-cell__source').text()).toBe('runtime.yaml')
    expect(ops.find('.tenant-cell__reset').exists()).toBe(false)
    // Two a page here: the third comes with the next.
    expect(w.find('[data-tenant^="ten_0192f3c1-1111"]').exists()).toBe(false)
    await w.find('.tenants-card .load-more button').trigger('click')
    await flushPromises()
    expect(s.to('GET', ADMIN.tenants)[1].url).toBe('/runtime/api/v1/admin/tenants?after=t_ops')
    const chan = tenantRow(w, 'ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b')
    expect(chan.find('.tenant-cell__source').text()).toBe('None')
    expect(chan.find('.tenant-cell__answers').text()).toBe('No limit')
  })

  it('sets a person’s quota, one of the two at least', async () => {
    const w = await panel()
    await w.find('.tenants-card .load-more button').trigger('click')
    await flushPromises()
    await tenantRow(w, 'ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b').find('.tenant-cell__edit').trigger('click')
    await flushPromises()
    expect(dialog().querySelector('.el-dialog__title')!.textContent).toBe('Quota for Chan Tai Man')
    await click(dialog().querySelector('.tenant-dialog__save'))
    expect(dialog().textContent).toContain('Set answers, dollars, or both')
    expect(s.to('PUT', ADMIN.tenant)).toHaveLength(0)
    fill('.quota-inputs__usd', '3.5')
    await click(dialog().querySelector('.tenant-dialog__save'))
    const [put] = s.to('PUT', ADMIN.tenant)
    expect(put.url).toBe('/runtime/api/v1/admin/tenants/ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b')
    expect(JSON.parse(put.body!)).toEqual({ per_day: { answers: null, usd: '3.5' } })
    expect(lastMessage()?.message).toBe('The quota for Chan Tai Man is saved.')
    const chan = tenantRow(w, 'ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b')
    expect(chan.find('.tenant-cell__usd').text()).toBe('$3.50')
    expect(chan.find('.tenant-cell__source').text()).toBe('Set here')
  })

  it('says why a quota in dollars was refused, with the agents whose models have no price', async () => {
    const w = await panel()
    s.once('PUT', ADMIN.tenant, () =>
      refusal(422, 'failed_precondition', 'model_not_priced', {
        field: '/per_day/usd',
        problems: ['agent "agt_2": no price for openai gpt-4.1-nano'],
      }),
    )
    await tenantRow(w, `ten_${ADMIN_ID}`).find('.tenant-cell__edit').trigger('click')
    await flushPromises()
    await click(dialog().querySelector('.tenant-dialog__save'))
    expect(dialog().querySelector('.tenant-dialog__error')!.textContent).toContain('agent "agt_2"')
  })

  it('goes back to the server’s quota for a person, saying what it is', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await tenantRow(w, `ten_${ADMIN_ID}`).find('.tenant-cell__reset').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'The quota set here is removed. runtime.yaml’s: 200 a day, and No limit.',
    )
    expect(s.to('DELETE', ADMIN.tenant)).toHaveLength(1)
    expect(tenantRow(w, `ten_${ADMIN_ID}`).find('.tenant-cell__source').text()).toBe('runtime.yaml')
  })
})

describe('agents’ daily budgets', () => {
  const input = (w: VueWrapper, scope: string, which: 'answers' | 'usd') =>
    w.find(`.budgets-card__${scope} .quota-inputs__${which} input`).element as HTMLInputElement

  it('shows those in force beside runtime.yaml’s, and who set them', async () => {
    const w = await panel()
    expect(input(w, 'per_agent_day', 'answers').value).toBe('500')
    expect(input(w, 'per_agent_day', 'usd').value).toBe('10')
    expect(input(w, 'per_asker_day', 'usd').value).toBe('')
    expect(w.find('.budgets-card__per_asker_day').text()).toContain('Server: $1.50')
    expect(w.find('.budgets-card__source').text()).toMatch(
      /^Set here, in place of the server’s defaults.\s*Changed by Ada Admin/,
    )
    expect(w.text()).toContain('The server’s own configured agents keep the budgets runtime.yaml gives them.')
    expect(w.find('.budgets-card__save').attributes('disabled')).toBeDefined()
  })

  it('saves both, each field empty for no limit', async () => {
    const w = await panel()
    const usd = w.find('.budgets-card__per_agent_day .quota-inputs__usd input')
    await usd.setValue('')
    await w.find('.budgets-card__per_asker_day .quota-inputs__usd input').setValue('0.75')
    await flushPromises()
    await w.find('.budgets-card__save').trigger('click')
    await flushPromises()
    expect(JSON.parse(s.to('PUT', ADMIN.budgets)[0].body!)).toEqual({
      per_agent_day: { answers: 500, usd: null },
      per_asker_day: { answers: 40, usd: '0.75' },
    })
    expect(lastMessage()?.message).toBe('The agents’ budgets are saved.')
  })

  it('refuses an amount that is not one, on its field', async () => {
    const w = await panel()
    await w.find('.budgets-card__per_asker_day .quota-inputs__usd input').setValue('1e3')
    await flushPromises()
    await w.find('.budgets-card__save').trigger('click')
    await settle()
    expect(w.find('.budgets-card__per_asker_day').text()).toContain('An amount of dollars above 0')
    expect(s.to('PUT', ADMIN.budgets)).toHaveLength(0)
  })

  it('goes back to runtime.yaml’s', async () => {
    const w = await panel()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await w.find('.budgets-card__reset').trigger('click')
    await flushPromises()
    expect(s.to('DELETE', ADMIN.budgets)).toHaveLength(1)
    expect(input(w, 'per_agent_day', 'answers').value).toBe('400')
    expect(w.find('.budgets-card__source').text()).toBe(
      'The server’s defaults (runtime.yaml), as its operator set them.',
    )
    expect(w.find('.budgets-card__reset').exists()).toBe(false)
  })
})

describe('what things cost', () => {
  const costs = () => s.to('GET', ADMIN.costs).map((c) => c.url)

  it('reads the thirty days to today by day, with the total, other kinds and calls without a price', async () => {
    const w = await panel()
    expect(costs()).toEqual(['/runtime/api/v1/admin/costs?since=2026-09-01&until=2026-09-30&group=day'])
    expect(w.find('.costs-card__cost').text()).toBe('$3.50')
    expect(w.find('.costs-card__calls').text()).toBe('300')
    expect(w.find('.costs-card__tokens').text()).toBe('400,000 in · 90,000 out')
    expect(w.find('.costs-card__other').text()).toBe('Document transcription: 4 calls, $0.10')
    expect(w.find('.costs-card__unpriced').text()).toContain(
      '7 calls had no price when they were made, and are counted as $0.',
    )
    expect(w.findAll('.cost-cell__day').map((d) => d.text())).toEqual(['2026-09-29'])
    await w.find('.costs-card .load-more button').trigger('click')
    await flushPromises()
    expect(costs()[1]).toBe('/runtime/api/v1/admin/costs?since=2026-09-01&until=2026-09-30&group=day&after=2026-09-29')
    expect(w.findAll('.cost-cell__day').map((d) => d.text())).toEqual(['2026-09-29', '2026-09-28'])
  })

  it('groups by person or model, on one kind of key, and marks a model without a price', async () => {
    const w = await panel()
    const groups = w.findAll('.costs-card__groups input')
    await groups[1].setValue(true)
    await flushPromises()
    expect(costs().at(-1)).toContain('group=tenant')
    expect(w.find('.cost-cell__name').text()).toBe('Ada Admin')
    expect(w.find('.cost-cell__id').text()).toBe('t_ops')

    const vm = w.findComponent({ name: 'CostsCard' }).vm as unknown as { keySource: string; group: string }
    vm.keySource = 'school'
    vm.group = 'model'
    await flushPromises()
    expect(costs().at(-1)).toBe(
      '/runtime/api/v1/admin/costs?since=2026-09-01&until=2026-09-30&group=model&key_source=school',
    )
    expect(w.find('.cost-cell__model').text()).toBe('openai · gpt-4.1-nano')
    expect(w.find('.cost-cell__meta').text()).toContain('School’s key')
    expect(w.find('.cost-cell__meta').text()).toContain('offers: fast')
    expect(w.find('.cost-cell__unpriced').text()).toBe('12 unpriced')
  })

  it('names the transcriber’s costs, under no agent and no person, as document transcription', async () => {
    const w = await panel()
    const vm = w.findComponent({ name: 'CostsCard' }).vm as unknown as { group: string }
    vm.group = 'agent'
    await flushPromises()
    expect(w.findAll('.cost-cell__agent').map((c) => c.text())).toEqual(['Study helper'])
    expect(w.find('.cost-cell__own').text()).toBe('Document transcription')
    expect(w.find('[data-key="transcription"]').find('code').exists()).toBe(false)
    vm.group = 'tenant'
    await flushPromises()
    expect(w.find('.cost-cell__own').text()).toBe('The site’s own: document transcription')
    setLocale('zh-Hant')
    await flushPromises()
    expect(w.find('.cost-cell__own').text()).toBe('全站：文件轉寫')
    vm.group = 'agent'
    await flushPromises()
    expect(w.find('.cost-cell__own').text()).toBe('文件轉寫')
  })

  it('asks for at most a year', async () => {
    const w = await panel()
    const vm = w.findComponent({ name: 'CostsCard' }).vm as unknown as { range: [string, string] }
    vm.range = ['2025-01-01', '2026-09-30']
    await flushPromises()
    expect(w.find('.costs-card__too-long').text()).toBe('Choose at most a year of days.')
    expect(costs()).toHaveLength(1)
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await panel()
    expect(w.find('.costs-card__tokens').text()).toBe('輸入 400,000 · 輸出 90,000')
    expect(w.find('.prices-card .app-card__title').text()).toContain('價目表')
  })
})
