import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import PermsCard from './PermsCard.vue'

afterEach(() => {
  document.body.innerHTML = ''
  setLocale('en')
})

describe('PermsCard', () => {
  it('lets the keyboard and a tap open what a permission allows, as hovering does: its name takes focus', async () => {
    vi.useFakeTimers()
    setLocale('en')
    setActivePinia(createPinia())
    const course = useCourseStore()
    course.$patch({
      courseId: 'c1',
      perms: { document_read: 'autonomous', submission_write: 'autonomous' },
      permsSource: 'exact',
      membership: { member_id: 'm1', role: 'student' } as never,
    } as never)
    const w = mount(PermsCard, { attachTo: document.body, global: { plugins: [i18n, ElementPlus], components: icons } })
    await flushPromises()
    const names = w.findAll('.perms__name')
    expect(names.length).toBeGreaterThan(0)
    // Each a stop for the keyboard, its dotted underline a promise kept.
    expect(names.every((n) => n.attributes('tabindex') === '0')).toBe(true)
    const tips = w.findAllComponents({ name: 'ElTooltip' }).filter((x) => x.find('.perms__name').exists())
    expect(tips).toHaveLength(names.length)
    for (const tip of tips) expect(tip.props('trigger')).toEqual(['hover', 'focus'])
    // Focused, its tooltip says what it allows.
    await names[0]!.trigger('focus')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    const shown = [...document.body.querySelectorAll<HTMLElement>('.el-popper')].filter((p) => p.style.display !== 'none')
    expect(shown.map((p) => p.textContent?.trim()).join(' ')).toContain(i18n.global.t(`enums.permHelp.document_read`))
    vi.useRealTimers()
    w.unmount()
  })
})
