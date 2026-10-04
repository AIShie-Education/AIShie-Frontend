import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import { read } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import DeletionProposal from './DeletionProposal.vue'
import type { ActionRow } from './actionText'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn() }
})

const NONE = {
  submissions: 0,
  handed_in: 0,
  drafts: 0,
  missing: 0,
  grades: 0,
  posted: 0,
  files: 0,
  proposals: 0,
  totals: 0,
}
const proposal = (status = 'proposed') =>
  ({
    id: 'act-p',
    course_id: 'c1',
    actor_id: 'a-sato',
    member_id: 'm-sato',
    action_type: 'assignment.delete',
    target_type: 'assignment',
    target_id: 'asg-1',
    status,
    created_at: '2026-10-04T00:00:00Z',
    payload: { course_id: 'c1', assignment_id: 'asg-1', confirm: { ...NONE, submissions: 1, handed_in: 1 } },
  }) as unknown as ActionRow

function mountIt(action: ActionRow) {
  setActivePinia(createPinia())
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { assignment_write: 'autonomous', action_decide: 'autonomous' } as never
  return mount(DeletionProposal, { props: { action, courseId: 'c1' }, global: { plugins: [i18n, ElementPlus] } })
}
const cells = (w: ReturnType<typeof mountIt>) =>
  w.findAll('tbody tr').map((r) => r.findAll('th, td').map((c) => c.text().trim()))

beforeEach(() => {
  setLocale('en')
  vi.mocked(read).mockReset()
})

describe('DeletionProposal', () => {
  it('shows what was confirmed beside what would go now, and that approving would fail where more would go', async () => {
    vi.mocked(read).mockResolvedValue({
      assignment_id: 'asg-1',
      title: 'Quiz 3',
      published: true,
      in_grade: false,
      counts: { ...NONE, submissions: 2, handed_in: 1, drafts: 1 },
      refusal: null,
    } as never)
    const w = mountIt(proposal())
    await flushPromises()
    expect(read).toHaveBeenCalledWith('assignment.delete_preview', { course_id: 'c1', assignment_id: 'asg-1' })
    expect(w.text()).toContain('Approving will fail: more has been added since this was proposed.')
    expect(cells(w)).toEqual([
      ['Submissions', '1', '2'],
      ['Handed in', '1', '1'],
      ['Drafts', '0', '1'],
    ])
    w.unmount()
  })

  it('warns of nothing where no more would go', async () => {
    vi.mocked(read).mockResolvedValue({
      assignment_id: 'asg-1',
      title: 'Quiz 3',
      published: true,
      in_grade: false,
      counts: { ...NONE, submissions: 1, handed_in: 1 },
      refusal: null,
    } as never)
    const w = mountIt(proposal())
    await flushPromises()
    expect(w.text()).not.toContain('Approving will fail')
    w.unmount()
  })

  it('reads nothing once it was decided: it shows what was confirmed alone', async () => {
    const w = mountIt(proposal('executed'))
    await flushPromises()
    expect(read).not.toHaveBeenCalled()
    expect(w.find('thead').text()).toContain('Confirmed')
    expect(cells(w)).toEqual([
      ['Submissions', '1'],
      ['Handed in', '1'],
    ])
    w.unmount()
  })
})
