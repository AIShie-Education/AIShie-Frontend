import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { setLocale } from '@/i18n'
import UsageCard from './UsageCard.vue'
import { ADMIN, ADMIN_ID, Servers, adminState, planUsage, refusal, withAdmin, type AdminState } from './adminFakes'
import { mountGlobal } from './testSetup'

let s: Servers
let state: AdminState

beforeEach(() => {
  setLocale('en')
  state = adminState()
  s = withAdmin(new Servers(), state).install()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card() {
  const { global } = await mountGlobal('/admin/runtime?tab=usage')
  const w = mount(UsageCard, { global, attachTo: document.body })
  await flushPromises()
  return w
}
/** An element's words, each piece of text apart (a tag is a span of its own). */
function words(el: Element): string {
  const out: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim())
  return out.join(' ')
}
const rows = (w: Awaited<ReturnType<typeof card>>) =>
  w.findAll('.usage-card__table tbody tr').map((r) => r.findAll('td').map((c) => words(c.element)))

describe('UsageCard', () => {
  it('shows today’s totals against the quotas in force, and each owner, the busiest first', async () => {
    const w = await card()
    expect(s.to('GET', ADMIN.usage)).toHaveLength(1)
    expect(w.find('.usage-card__answers').text()).toBe('262')
    expect(w.find('.usage-card__of').text()).toBe('of 5000 a day')
    expect(w.find('.usage-card__calls').text()).toBe('700')
    expect(w.find('.usage-card__cost').text()).toBe('$2.118200')
    expect(w.find('.usage-card__limits').text()).toBe('Up to 150 a day per owner, and 20 per person asking.')
    expect(rows(w)).toEqual([
      ['Ada Admin', '150 / 150 Used up for today', '380', '$1.020000'],
      ['Chan Tai Man', '96 / 150', '301', '$0.998100'],
      ['The operator’s agents ten_operator', '16', '19', '$0.100100'],
    ])
    const link = w.find('.usage-owner__name')
    expect(link.attributes('href')).toBe(`/admin/actors/${ADMIN_ID}`)
  })

  it('names by id an owner the runtime has not seen, and says there is no ceiling for the school', async () => {
    state.usage = planUsage({
      limits: { per_owner_day: 100, per_asker_day: 20, per_day: null },
      owners: [
        {
          tenant_id: 'ten_0192f3c1-2222-7c3a-9b1f-2a4c6e8f0a1b',
          owner_actor_id: '0192f3c1-2222-7c3a-9b1f-2a4c6e8f0a1b',
          display_name: null,
          answers: 3,
          model_calls: 3,
          cost_usd: '0.000300',
        },
      ],
    })
    const w = await card()
    expect(w.find('.usage-card__of').text()).toBe('no ceiling for the school')
    expect(w.find('.usage-owner__unknown').text()).toContain('Someone the agent service has not seen yet')
  })

  it('says the quotas in dollars in force, where there are any', async () => {
    state.usage = planUsage({
      limits: {
        per_owner_day: 150,
        per_asker_day: 20,
        per_day: 5000,
        per_owner_day_usd: '2.500000',
        per_asker_day_usd: null,
        per_day_usd: '100.000000',
      },
    })
    const w = await card()
    expect(w.find('.usage-card__limits').text()).toBe(
      'Up to 150 a day per owner, and 20 per person asking. In dollars: $2.50 per owner, No limit per person asking, and $100.00 for the whole school. This cost leaves out the transcription of documents, which the whole school’s ceiling in dollars counts too.',
    )
    expect(w.find('.usage-card__of-usd').text()).toBe('of $100.00 a day')
  })

  it('says since when, and when the counts start again, in the reader’s time, from the runtime’s day', async () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    const w = await card()
    expect(w.find('.usage-card__since').text()).toBe(
      'Since 2026-09-30 08:00. The counts start again at 08:00 (Hong Kong Standard Time).',
    )
    // A runtime whose day starts at midnight in Hong Kong.
    state.usage = planUsage({ since: '2026-09-29T16:00:00Z' })
    await w.find('.usage-card__refresh').trigger('click')
    await flushPromises()
    expect(w.find('.usage-card__since').text()).toBe(
      'Since 2026-09-30 00:00. The counts start again at 00:00 (Hong Kong Standard Time).',
    )
    expect(w.find('.usage-card__since .daily-reset').attributes('datetime')).toMatch(/T16:00:00\.000Z$/)
  })

  it('says so when nobody has used the plan today', async () => {
    state.usage = planUsage({ owners: [], total: { answers: 0, model_calls: 0, cost_usd: '0.000000' } })
    const w = await card()
    expect(w.find('.usage-card__empty').text()).toContain('Nobody has used the school’s plan today.')
  })

  it('reads again when asked', async () => {
    const w = await card()
    await w.find('.usage-card__refresh').trigger('click')
    await flushPromises()
    expect(s.to('GET', ADMIN.usage)).toHaveLength(2)
  })

  it('says who may, to someone who is not one of the runtime’s administrators', async () => {
    s.on('GET', ADMIN.usage, () => refusal(403, 'forbidden', 'not_admin'))
    const w = await card()
    expect(w.find('.runtime-async__not-admin').exists()).toBe(true)
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await card()
    expect(w.find('.usage-card__of').text()).toBe('每日上限 5000')
    expect(rows(w)[0][1]).toBe('150 / 150 今日已用完')
  })
})

describe('UsageCard, by its own width', () => {
  it('puts an owner’s model calls and cost under their name where the card is as narrow as on a phone, 542 px', async () => {
    // The window is wide (matchMedia says nothing matches): the card decides, measured by its title.
    const sizes = fakeContainerWidths({ '.usage-card .app-card__title': 543 })
    const w = await card()
    expect(rows(w)[0]).toEqual(['Ada Admin', '150 / 150 Used up for today', '380', '$1.020000'])

    await sizes.resize('.usage-card .app-card__title', 542)
    await flushPromises()
    expect(rows(w)[0]).toEqual(['Ada Admin Model calls: 380 · $1.020000', '150 / 150 Used up for today'])
  })
})
