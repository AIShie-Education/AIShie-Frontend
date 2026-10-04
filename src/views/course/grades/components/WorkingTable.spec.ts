import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import WorkingTable from './WorkingTable.vue'
import type { WorkingItem } from './grading'

beforeEach(() => setLocale('en'))

describe('WorkingTable, a total written while an assignment since deleted counted', () => {
  it('says the line was an assignment since deleted, and nothing of its grade', async () => {
    const items = [
      { id: 'hw1', kind: 'assignment', fraction: '0.9', weight: '10' },
      // As Core leaves it: the line, emptied (AIShie-Core #73).
      { id: 'hw-gone', kind: 'assignment', deleted: true } as unknown as WorkingItem,
    ] as WorkingItem[]
    const w = mount(WorkingTable, {
      props: { items, name: (i: WorkingItem) => (i.id === 'hw1' ? 'HW1' : null) },
      global: { plugins: [i18n, ElementPlus], stubs: { IdText: true } },
      attachTo: document.body,
    })
    await flushPromises()
    const rows = w.findAll('tr.el-table__row').map((r) => r.findAll('td').map((c) => c.text().trim()))
    expect(rows[0][0]).toContain('HW1')
    expect(rows[0][1]).toBe('90%')
    expect(rows[1][0]).toContain('An assignment since deleted')
    expect(rows[1][1]).toBe('—')
    expect(rows[1][2]).toBe('—')
    // Its share is not worked out; the rest is all of it.
    expect(rows[0][2]).toContain('100%')
    w.unmount()
  })
})
