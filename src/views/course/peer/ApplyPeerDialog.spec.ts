import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { VNode } from 'vue'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import ApplyPeerDialog from './ApplyPeerDialog.vue'
import PeerProposal from './PeerProposal.vue'
import { isPeerAction, peerActionTitle, peerFieldsShown, type PeerResults } from './peer'

let writes: { tool: string; args: Record<string, unknown> }[] = []
let answer: unknown
/** What Core answers peer_form.get, for a proposed evaluation's criteria and names. */
let formAnswer: unknown = null
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool !== 'peer_form.get') throw new Error(`no answer for ${tool}`)
      return formAnswer
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (answer instanceof Error) throw answer
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

async function mountDialog(
  r: PeerResults,
  level: 'autonomous' | 'confirm_required' = 'autonomous',
  studentScope: 'all' | 'listed' = 'all',
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { grade_submit: 'autonomous', grade_post: level } as never
  course.membership = { member_id: 'm-tam', role: 'ta', status: 'active', student_scope: studentScope } as never
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

  it('tells a seat that reaches only some students that counting writes every group’s grades, and says why Core refuses it', async () => {
    const all = await mountDialog(results())
    expect(document.querySelector('[data-test="peer-apply-scoped"]')).toBeNull()
    all.unmount()

    // As Core b5d6b43 refuses Tam, a TA listed for Alpha's students, when
    // Beta's grades would change too: denied, and recorded.
    answer = new ApiError({
      status: 403,
      code: 'forbidden',
      message: 'a member whose grade it writes is outside your scope',
      details: { reason: 'student_out_of_scope' },
      actionId: 'act-9',
      actionStatus: 'denied',
    })
    const w = await mountDialog(results(), 'autonomous', 'listed')
    expect(document.querySelector('[data-test="peer-apply-scoped"]')?.textContent).toContain(
      'This lists only the groups whose members are all within your reach.',
    )
    expect(dialogText()).toContain('if any of those is beyond your reach, nothing is written')
    confirm().click()
    await flushPromises()
    expect(writes).toHaveLength(1)
    const shown = vi.mocked(ElNotification).mock.calls[0]?.[0] as { message: VNode }
    const said = ((shown.message.children as VNode[])[0].children as string) ?? ''
    expect(said).toBe(
      'Counting it would change grades of students beyond your reach, in groups not listed here, so nothing was written. Someone who reaches every student can count it.',
    )
    expect(w.emitted('done')).toBeUndefined()
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
  function mountProposal(action: Record<string, unknown>, me = 'm-sato') {
    const pinia = createPinia()
    setActivePinia(pinia)
    const course = useCourseStore()
    course.permsSource = 'exact'
    course.perms = { member_read: 'autonomous', document_read: 'autonomous' } as never
    course.membership = { member_id: me, role: 'instructor', status: 'active' } as never
    course.members = new Map(
      [
        ['m-ken', 'Ken Wong'],
        ['m-mei', 'Mei Chan'],
        ['m-yuki', 'Yuki Tanaka'],
      ].map(([id, name]) => [id, { id, display_name: name, kind: 'person' }]),
    ) as never
    course.membersState = 'loaded'
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

  it('is what an action’s page shows for each action about peer evaluation, in place of their raw fields', () => {
    expect(['grade.apply_peer', 'peer_form.set', 'peer_review.submit'].map((a) => isPeerAction(a))).toEqual([
      true,
      true,
      true,
    ])
    expect(isPeerAction('grade.submit')).toBe(false)
    expect(peerActionTitle('peer_review.submit')).toBe('sheet')
    expect(peerFieldsShown('peer_review.submit')).toEqual(['entries', 'comment'])
  })

  it('shows a student’s evaluation proposed as what it gives each member, by name, with their comments', async () => {
    formAnswer = { form: { kind: 'share', closes_at: '2099-01-01T00:00:00Z', weight: 20 } }
    // As Core b5d6b43 records it: Mei's handing in waits for approval.
    const w = mountProposal({
      action_type: 'peer_review.submit',
      member_id: 'm-mei',
      payload: {
        course_id: 'c1',
        assignment_id: 'a1',
        entries: [
          { share: 80, comment: 'Ken carried us', student_member_id: 'm-ken' },
          { share: 20, student_member_id: 'm-yuki' },
        ],
        comment: 'We met twice',
      },
    })
    await flushPromises()
    const rows = w.findAll('[data-test="peer-proposal-sheet"] tbody tr').map((r) => r.text())
    expect(rows).toEqual(['Ken Wong80 points “Ken carried us”', 'Yuki Tanaka20 points'])
    expect(w.text()).toContain('On the group’s work: “We met twice”')
    expect(w.text()).toContain('no other student reads it')
    expect(w.text()).not.toContain('student_member_id')
    w.unmount()
  })

  it('shows a rating evaluation by each criterion’s label, and a member’s rating of themselves as such', async () => {
    formAnswer = {
      form: {
        kind: 'rating',
        closes_at: '2099-01-01T00:00:00Z',
        weight: 20,
        criteria: [
          { key: 'contribution', label: 'Contribution', weight: 1 },
          { key: 'teamwork', label: 'Teamwork', weight: 1 },
        ],
      },
    }
    const w = mountProposal({
      action_type: 'peer_review.submit',
      member_id: 'm-mei',
      payload: {
        course_id: 'c1',
        assignment_id: 'a1',
        entries: [
          { ratings: { teamwork: 5, contribution: 4 }, student_member_id: 'm-ken' },
          { ratings: { contribution: 3, teamwork: 3 }, student_member_id: 'm-mei' },
        ],
      },
    })
    await flushPromises()
    const rows = w.findAll('[data-test="peer-proposal-sheet"] tbody tr').map((r) => r.text())
    expect(rows).toEqual(['Ken WongContribution 4 · Teamwork 5', 'Mei Chan (self-evaluation)Contribution 3 · Teamwork 3'])
    w.unmount()
  })

  it('names the members to the student who sent it from their group, where the member list is not theirs', async () => {
    formAnswer = {
      form: { kind: 'share', closes_at: '2099-01-01T00:00:00Z', weight: 20 },
      task: {
        group_id: 'g1',
        group_name: 'Alpha',
        circle: [
          { member_id: 'm-ken', display_name: 'Ken Wong' },
          { member_id: 'm-lee', display_name: 'Lee Ho' },
        ],
      },
    }
    const w = mountProposal(
      {
        action_type: 'peer_review.submit',
        member_id: 'm-lee',
        status: 'proposed',
        payload: { course_id: 'c1', assignment_id: 'a1', entries: [{ share: 100, student_member_id: 'm-ken' }] },
      },
      'm-lee',
    )
    await flushPromises()
    expect(w.find('[data-test="peer-proposal-sheet"] tbody tr').text()).toBe('Ken Wong100 points')
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
