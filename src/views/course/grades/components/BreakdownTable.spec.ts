import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { i18n, setLocale } from '@/i18n'
import BreakdownTable from './BreakdownTable.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

const ITEMS = [
  { criterion: 'Correctness', points: 6, max: 6 },
  { criterion: 'Testing', points: 2.5, max: 3, comment: 'three cases, all integers' },
]

function mountTable() {
  const w = mount(BreakdownTable, {
    props: { items: ITEMS, score: '8.5' },
    global: { plugins: [i18n, ElementPlus] },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

describe('BreakdownTable', () => {
  it('is a table where it has room, and a block per criterion where it is as narrow as on a phone, by its own width', async () => {
    // The window is wide (jsdom has no matchMedia): its own width decides, measured by its total, 542 px of
    // table less the total's padding.
    const sizes = fakeContainerWidths({ '.bd-table__total': 519 })
    const w = mountTable()
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.bd-list').exists()).toBe(false)

    await sizes.resize('.bd-table__total', 518)
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(false)
    expect(w.findAll('.bd-list__item').map((li) => li.find('.bd-table__criterion').text())).toEqual([
      'Correctness',
      'Testing',
    ])
    expect(w.find('.bd-list__comment').text()).toBe('three cases, all integers')
  })
})
