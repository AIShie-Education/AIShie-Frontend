import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import MemberName from './MemberName.vue'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => Promise.reject(new Error('no reads here'))) }
})

const ID = '01a0ff30-2028-7c6f-ae30-180e430c5829'
const global = { plugins: [i18n, ElementPlus], components: icons }

/** A course whose caller holds these levels, and whose member list holds these members. */
function course(perms: Record<string, string>, members: { id: string; display_name: string; kind: string }[] = []) {
  setActivePinia(createPinia())
  const c = useCourseStore()
  c.courseId = 'course-1'
  c.permsSource = 'exact'
  c.perms = perms as never
  if (members.length) {
    c.members = new Map(members.map((m) => [m.id, m])) as never
    c.membersState = 'loaded'
  }
  return c
}

beforeEach(() => setLocale('en'))

describe('MemberName', () => {
  it('names a member from the member list', async () => {
    course({ member_read: 'autonomous' }, [{ id: ID, display_name: 'Sato Hiroshi', kind: 'human' }])
    const w = mount(MemberName, { props: { id: ID }, global })
    await flushPromises()
    expect(w.text()).toBe('Sato Hiroshi')
  })

  it('shows one who may read the member list a short id for a member it does not hold', async () => {
    course({ member_read: 'autonomous' }, [{ id: 'someone-else', display_name: 'Ken', kind: 'human' }])
    const w = mount(MemberName, { props: { id: ID }, global })
    await flushPromises()
    expect(w.find('.id-text').exists()).toBe(true)
    expect(w.text()).toContain('430c5829')
  })

  it('shows a student no id: someone in the course, whose id she could not look up', async () => {
    course({ member_read: 'denied', document_read: 'autonomous' })
    const w = mount(MemberName, { props: { id: ID, showKind: true }, global })
    await flushPromises()
    expect(w.find('.id-text').exists()).toBe(false)
    expect(w.text()).toBe('Someone in the course')
    expect(w.text()).not.toContain('430c5829')
    // Not in a tooltip either: a touch screen or a keyboard cannot reach one, and a screen reader
    // would read the whole id out as the name's description. She quotes the action instead.
    expect(w.html()).not.toContain(ID)
    expect(w.find('.is-unnamed').attributes('title')).toBeUndefined()
    expect(w.find('[tabindex]').exists()).toBe(false)
    setLocale('zh-Hant')
    await flushPromises()
    expect(w.text()).toBe('一位成員')
    setLocale('zh-Hans')
    await flushPromises()
    expect(w.text()).toBe('一位成员')
  })

  it('names a student’s own agent by the name she knows it by, with no id', async () => {
    course({ member_read: 'denied', document_read: 'autonomous' })
    const w = mount(MemberName, { props: { id: ID, showKind: true, agent: { name: 'Revision helper' } }, global })
    await flushPromises()
    expect(w.find('.id-text').exists()).toBe(false)
    expect(w.text()).toContain('Revision helper')
    expect(w.text()).toContain('AI')
  })
})
