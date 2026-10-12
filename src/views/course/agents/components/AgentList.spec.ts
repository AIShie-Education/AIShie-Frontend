import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import type { CourseAgentRow } from './courseAgents'
import AgentList from './AgentList.vue'

vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: vi.fn(async () => Promise.reject(new Error('no reads here'))),
}))

afterEach(() => {
  document.body.innerHTML = ''
  setLocale('en')
})

/** A seat of an agent in the course, owned by `owner`, acting for `principal` where it is someone's delegate. */
function row(id: string, name: string, over: Partial<CourseAgentRow> & { owner?: string; principalId?: string } = {}) {
  const { owner, principalId, ...rest } = over
  return {
    member: {
      id,
      actor_id: `actor-${id}`,
      kind: 'agent',
      status: 'active',
      display_name: name,
      role: 'tutor',
      owner_actor_id: owner ? `actor-${owner}` : null,
      owner_name: owner === 'sato' ? 'Sato Hiroshi' : owner ? 'Mei Lin' : null,
      principal_member_id: principalId ?? null,
      hosting: 'mcp',
    },
    presetName: null,
    purpose: principalId ? 'delegate' : 'course',
    group: principalId ? 'personal' : 'course',
    principal: null,
    live: true,
    ownAnswer: 'denied',
    answer: 'denied',
    answerCapped: false,
    ...rest,
  } as unknown as CourseAgentRow
}

function mountList(rows: CourseAgentRow[]) {
  setActivePinia(createPinia())
  useSessionStore().$patch({ me: { id: 'actor-sato', kind: 'human', display_name: 'Sato Hiroshi' } } as never)
  useCourseStore().$patch({
    courseId: 'c1',
    course: { id: 'c1', code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-sato', role: 'instructor' } as never,
    perms: { member_read: 'autonomous' },
    permsSource: 'exact',
  } as never)
  return mount(AgentList, {
    props: {
      courseId: 'c1',
      group: 'personal',
      rows,
      presetsById: new Map(),
      myAgents: new Map(),
      askable: new Map(),
    },
    global: { plugins: [i18n, ElementPlus], components: icons, stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('AgentList', () => {
  it('says whose an agent is once: by its For … where the row names whom it acts for, else by its tag', async () => {
    const w = mountList([
      row('helper', 'Sato’s helper', { owner: 'sato', principalId: 'm-sato' }),
      row('meis', 'Mei’s helper', { owner: 'mei', principalId: 'm-mei' }),
      row('lab', 'Lab assistant', { owner: 'mei' }),
    ])
    await flushPromises()
    const [mine, meis, lab] = w.findAll('.agent-row')
    // Acting for someone: the meta line's For … says whose it is; no "Your agent" or "Mei Lin’s agent" beside it.
    expect(mine!.find('.agent-row__meta').text()).toContain('For')
    expect(mine!.find('.agent-badge').exists()).toBe(false)
    expect(mine!.text()).not.toContain('Your agent')
    expect(meis!.find('.agent-badge').exists()).toBe(false)
    expect(meis!.text()).not.toContain('Mei Lin’s agent')
    // Acting for nobody: its tag is the one place that says whose it is.
    expect(lab!.find('.agent-row__meta').text()).not.toContain('For')
    expect(lab!.find('.agent-badge').text()).toBe('Mei Lin’s agent')
  })
})
