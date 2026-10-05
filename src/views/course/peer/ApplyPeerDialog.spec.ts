import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import ApplyPeerDialog from './ApplyPeerDialog.vue'
import PeerProposal from './PeerProposal.vue'
import type { PeerResults } from './peer'

let writes: { tool: string; args: Record<string, unknown> }[] = []
let answer: unknown
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return answer
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

function results(closesAt = '2026-10-05T12:00:00Z'): PeerResults {
  return {
    form: {
      assignment_id: 'a1',
      enabled: true,
      kind: 'share',
      self_evaluation: false,
      opens: 'on_hand_in',
      closes_at: closesAt,
      weight: 20,
      share_with_students: 'none',
      version: 2,
      visible_to: [],
      students_see: [],
      updated_at: '2026-10-05T00:00:00Z',
    },
    groups: [
      {
        group_id: 'g1',
        name: 'Alpha',
        window: { state: 'closed', opens: 'on_hand_in', closes_at: closesAt },
        group_score: 80,
        points_possible: 100,
        flags: [],
        sheets: [],
        members: [
          {
            member_id: 'm-ken',
            display_name: 'Ken Wong',
            submitted: true,
            rated_by: ['m-mei'],
            factor: 0.9,
            score: 78.4,
            grade: { grade_id: 'g-ken', score: 80, state: 'draft' },
            flags: [],
          },
          {
            member_id: 'm-mei',
            display_name: 'Mei Chan',
            submitted: true,
            rated_by: ['m-ken'],
            factor: 1.1,
            score: 81.6,
            grade: { grade_id: 'g-mei', score: 70, state: 'posted', adjustment_kind: 'delta' },
            flags: [],
          },
        ],
      },
    ],
  } as unknown as PeerResults
}

beforeEach(() => {
  setLocale('en')
  writes = []
  answer = {
    status: 'executed',
    actionId: 'act-1',
    reviewState: 'none',
    result: { written: [{ student_member_id: 'm-ken' }], snapshots: 0 },
    replayed: false,
  }
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountDialog(r: PeerResults, level: 'autonomous' | 'confirm_required' = 'autonomous') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { grade_submit: 'autonomous', grade_post: level } as never
  const w = mount(ApplyPeerDialog, {
    props: { courseId: 'c1', assignmentId: 'a1', results: r, visible: true },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return w
}
const dialogText = () => document.querySelector('.el-dialog')?.textContent ?? ''
const row = (id: string) => document.querySelector(`[data-test="peer-apply-${id}"]`)?.textContent ?? ''
const confirm = () => document.querySelector('[data-test="peer-apply-confirm"]') as HTMLButtonElement

describe('ApplyPeerDialog', () => {
  it('shows each member’s score now and after, keeps a grader’s own adjustment, and counts it at a press', async () => {
    const w = await mountDialog(results())
    expect(dialogText()).toContain('at 20%')
    expect(dialogText()).toContain('your adjustment wins')
    expect(row('m-ken')).toContain('80')
    expect(row('m-ken')).toContain('Draft')
    expect(row('m-ken')).toContain('78.4')
    expect(row('m-ken')).toContain('1.6 below the group’s')
    expect(row('m-mei')).toContain('Your adjustment, kept')
    expect(dialogText()).toContain('1 grade will change.')
    confirm().click()
    await flushPromises()
    expect(writes).toEqual([{ tool: 'grade.apply_peer', args: { course_id: 'c1', assignment_id: 'a1' } }])
    expect(w.emitted('done')?.[0]?.[0]).toEqual({ status: 'executed', written: 1 })
    w.unmount()
  })

  it('cannot count it while it is still open', async () => {
    const w = await mountDialog(results('2099-01-01T00:00:00Z'))
    expect(dialogText()).toContain('It is still open')
    expect(confirm().disabled).toBe(true)
    w.unmount()
  })

  it('says a proposal records the factors, and that approving is refused if a grade changes', async () => {
    const w = await mountDialog(results(), 'confirm_required')
    expect(dialogText()).toContain('The factors as they are now are recorded with it')
    expect(dialogText()).toContain('Needs approval')
    w.unmount()
  })
})

describe('PeerProposal', () => {
  function mountProposal(action: Record<string, unknown>) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', name: 'course-grade', component: { render: () => null } }],
    })
    return mount(PeerProposal, {
      props: { courseId: 'c1', action: { id: 'act-1', course_id: 'c1', status: 'proposed', ...action } as never },
      global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
    })
  }

  it('shows each member’s factor as the proposal of counting peer evaluation recorded it', () => {
    const w = mountProposal({
      action_type: 'grade.apply_peer',
      payload: {
        course_id: 'c1',
        assignment_id: 'a1',
        form_version: 2,
        grades: [
          { grade_id: 'g-ken', student_member_id: 'm-ken', factor: 0.9 },
          { grade_id: 'g-mei', student_member_id: 'm-mei' },
        ],
      },
    })
    const rows = w.findAll('[data-test="peer-proposal-factors"] tbody tr').map((r) => r.find('td').text())
    expect(rows[0]).toContain('90% of an even share')
    expect(rows[0]).toContain('Factor 0.9')
    expect(rows[1]).toContain('Peer adjustment taken away: the group’s score')
    expect(w.text()).toContain(
      'Approving is refused if any of these grades, or the peer evaluation’s form, has changed since.',
    )
    expect(w.text()).toContain('Recorded against version 2 of the form.')
    w.unmount()
  })

  it('shows a peer form proposed as the form it sets', () => {
    const w = mountProposal({
      action_type: 'peer_form.set',
      payload: {
        course_id: 'c1',
        assignment_id: 'a1',
        kind: 'rating',
        criteria: [{ key: 'c1', label: 'Contribution', weight: '2' }],
        scale_min: 1,
        scale_max: 5,
        opens: 'on_hand_in',
        closes_at: '2026-10-20T00:00:00Z',
        weight: 25,
        self_evaluation: false,
        share_with_students: 'own_average',
        enabled: true,
        version: 0,
      },
    })
    const text = w.text()
    expect(text).toContain('Rate on criteria')
    expect(text).toContain('Contribution')
    expect(text).toContain('weight 2')
    expect(text).toContain('1 to 5')
    expect(text).toContain('25% of each member’s grade')
    expect(text).toContain('Their own evaluation, and their own average once it closes')
    w.unmount()
  })
})
