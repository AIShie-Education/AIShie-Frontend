import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { read } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import type { Assignment, Grade, GradeSummary, Submission } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import AdjustGradeDialog from '@/views/course/grades/components/AdjustGradeDialog.vue'
import RegradeDialog from '@/views/course/grades/components/RegradeDialog.vue'
import GradeView from '@/views/course/grades/GradeView.vue'
import CorrectMembersDialog from './CorrectMembersDialog.vue'
import GradePanel from './GradePanel.vue'
import GroupGrades from './GroupGrades.vue'
import GroupWorkMembers from './GroupWorkMembers.vue'

// Grading a group's work, as the pages do it: what each write sends, and
// what a member of the group is shown of the grades.
let writes: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return { status: 'executed', actionId: 'act', reviewState: 'none', replayed: false, result: answers[tool] ?? {} }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: { ...real.ElMessageBox, confirm: vi.fn(async () => 'confirm') },
  }
})
let answers: Record<string, unknown> = {}

const COURSE = 'c1'
const SUB: Submission = {
  id: 's1',
  assignment_id: 'a1',
  attempt: 1,
  state: 'submitted',
  created_at: '2026-10-05T10:00:00Z',
  submitted_at: '2026-10-05T11:00:00Z',
  revision: 1,
  group_id: 'gA',
  group_name: 'Team A',
  members: [
    { member_id: 'ana', display_name: 'Ana Chan' },
    { member_id: 'ben', display_name: 'Ben Ho' },
    { member_id: 'cai', display_name: 'Cai Lam' },
  ],
  submitted_by_member_id: 'ben',
} as Submission
const ASSIGNMENT = {
  id: 'a1',
  title: 'Group project',
  points_possible: 100,
  rubric_document_id: null,
} as unknown as Assignment

function grade(over: Partial<GradeSummary>): GradeSummary {
  return {
    id: 'g',
    student_member_id: 'ana',
    submission_id: 's1',
    assignment_id: 'a1',
    origin: 'entered',
    score: 80,
    state: 'draft',
    grader_member_id: 't',
    created_by_action_id: 'act',
    created_at: '2026-10-05T12:00:00Z',
    group: { group_grade_id: 'gg1', group_id: 'gA', group_name: 'Team A', score: 80 },
    ...over,
  } as GradeSummary
}

function setUp(perms: Record<string, string>, me = 't', listed?: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = perms as never
  course.membership = { member_id: me, student_scope: listed ? 'listed' : 'all' } as never
  // A TA listed for some students, as their seat (member.get) says.
  if (listed) course.seat = { id: me, student_scope: 'listed', listed_students: listed } as never
  return { pinia }
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  setLocale('en')
  writes = []
  answers = {}
  vi.mocked(ElMessageBox.confirm).mockClear()
  vi.mocked(read).mockImplementation(async (tool: string) => {
    throw new Error(`no answer for ${tool}`)
  })
})
afterEach(() => {
  document.body.innerHTML = ''
})

const stubs = { RouterLink: { template: '<a><slot /></a>' }, 'router-link': { template: '<a><slot /></a>' } }

describe('grading a group’s work', () => {
  it('sends the group’s score, every member’s line as shown, and whose work it is', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_read: 'autonomous', rubric_read: 'autonomous' })
    answers['grade.submit'] = { group_grade_id: 'gg2', member_grades: [] }
    const wrapper = mount(GradePanel, {
      props: {
        courseId: COURSE,
        submission: SUB,
        assignment: ASSIGNMENT,
        // Cai's draft carries an adjustment: his line starts from it.
        liveDraft: grade({ id: 'd-cai', student_member_id: 'cai', score: 70 }),
        workGrades: [
          grade({ id: 'd-ana' }),
          grade({ id: 'd-ben', student_member_id: 'ben' }),
          grade({
            id: 'd-cai',
            student_member_id: 'cai',
            score: 70,
            group: {
              group_grade_id: 'gg1',
              score: 80,
              group_name: 'Team A',
              adjustment: { kind: 'delta', points: -10, reason: 'Missed two meetings', by_member_id: 't' },
            },
          }),
        ],
      },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Group score')
    // The draft's note gives the group's score, not a member's.
    expect(wrapper.text()).toContain('This work has a draft group grade (80 / 100)')
    const lines = wrapper.findAll('.group-adjust__item')
    expect(lines.map((l) => l.find('.group-adjust__name').text())).toEqual(['Ana Chan', 'Ben Ho', 'Cai Lam'])
    expect((lines[2].find('input[aria-label="Reason (the member reads it)"]').element as HTMLInputElement).value).toBe(
      'Missed two meetings',
    )
    await wrapper.find('input[placeholder="e.g. 8.5"]').setValue('84')
    expect(lines[2].text()).toContain('Comes to 74 / 100')
    expect(lines[0].text()).toContain('Comes to 84 / 100')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0].tool).toBe('grade.submit')
    expect(writes[0].args).toMatchObject({
      submission_id: 's1',
      score: '84',
      members: ['ana', 'ben', 'cai'],
      adjustments: [
        { student_member_id: 'ana', kind: 'none' },
        { student_member_id: 'ben', kind: 'none' },
        { student_member_id: 'cai', kind: 'delta', points: '-10', reason: 'Missed two meetings' },
      ],
    })
    // Replacing a group's drafts is said as such.
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'This replaces the group’s draft grade, and every member’s draft from it. Continue?',
    )
  })

  it('saves nothing while a member set apart has no reason', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_read: 'autonomous', rubric_read: 'autonomous' })
    const wrapper = mount(GradePanel, {
      props: { courseId: COURSE, submission: SUB, assignment: ASSIGNMENT, workGrades: [] },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    await wrapper.find('input[placeholder="e.g. 8.5"]').setValue('80')
    const ben = wrapper.findAll('.group-adjust__item')[1]
    // The line's choice, as the select would set it.
    const select = ben.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', 'replace')
    await flushPromises()
    await ben.find('input[aria-label="Their score"]').setValue('95')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(0)
    expect(ben.find('[role="alert"]').text()).toBe('Say why: the member reads it.')
  })

  it('offers no form once a member’s grade from it is posted', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_read: 'autonomous' })
    const posted = grade({ id: 'p-ana', state: 'posted' })
    const wrapper = mount(GradePanel, {
      props: { courseId: COURSE, submission: SUB, assignment: ASSIGNMENT, livePosted: posted, workGrades: [posted] },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('The group’s grade is posted.')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

describe('a grader whose seat does not reach every member of the work', () => {
  // Team A is Ana, Ben and Cai; the TA is listed for Ana and Ben. Core shows the TA the work, the grades of Ana and
  // Ben alone, and the group's members and history of Ana and Ben alone; it grades the work, and corrects its members
  // and lateness, only for a seat that reaches all three.
  const PERMS = {
    grade_submit: 'autonomous',
    grade_read: 'autonomous',
    member_read: 'autonomous',
    rubric_read: 'autonomous',
  }
  const mounting = { attachTo: document.body }

  it('is offered no grading form, and told why', async () => {
    const { pinia } = setUp(PERMS, 't', ['ana', 'ben'])
    const wrapper = mount(GradePanel, {
      props: {
        courseId: COURSE,
        submission: SUB,
        assignment: ASSIGNMENT,
        liveDraft: grade({ id: 'd-ana' }),
        workGrades: [grade({ id: 'd-ana' }), grade({ id: 'd-ben', student_member_id: 'ben' })],
        reach: 'some',
      },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Some members of this work are outside the students your seat reaches.')
    expect(writes).toEqual([])
  })

  it('is told a member outside its reach is, never that they have no grade', async () => {
    const { pinia } = setUp(PERMS, 't', ['ana', 'ben'])
    const wrapper = mount(GroupGrades, {
      props: {
        courseId: COURSE,
        submission: SUB,
        grades: [grade({ id: 'd-ana' }), grade({ id: 'd-ben', student_member_id: 'ben' })],
        pointsPossible: 100,
        reach: 'some',
      },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const cai = wrapper.findAll('.group-grades__item')[2]
    expect(cai.text()).toContain('Cai Lam')
    expect(cai.text()).toContain('Outside the students your seat reaches: their grade is not shown to you')
    expect(wrapper.text()).not.toContain('No grade from this work yet')
    expect(wrapper.text()).not.toContain('A member with no grade was added')
    // Adjusting one member within reach is Core's to allow (grade.adjust reaches that member alone).
    expect(wrapper.findAll('.group-grades__item')[0].text()).toContain('Adjust')
  })

  it('is told only that no grade is shown where whom it reaches is not known', async () => {
    const { pinia } = setUp(PERMS)
    useCourseStore().membership = { member_id: 't', student_scope: 'listed' } as never
    const wrapper = mount(GroupGrades, {
      props: { courseId: COURSE, submission: SUB, grades: [grade({ id: 'd-ana' })], pointsPossible: 100 },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.findAll('.group-grades__item')[2].text()).toContain('No grade of theirs is shown to you')
    expect(wrapper.text()).not.toContain('No grade from this work yet')
  })

  it('sees whose work it is with those outside its reach marked so, and is offered no correction', async () => {
    const { pinia } = setUp(PERMS, 't', ['ana', 'ben'])
    vi.mocked(read).mockImplementation(async (tool: string) => {
      if (tool !== 'group_set.get') throw new Error(`no answer for ${tool}`)
      // Cai is in Team A still; Core leaves him out, as it does his stays.
      return {
        id: 'set1',
        groups: [
          {
            id: 'gA',
            name: 'Team A',
            members: [
              { member_id: 'ana', display_name: 'Ana Chan', joined_at: '2026-10-01T00:00:00Z' },
              { member_id: 'ben', display_name: 'Ben Ho', joined_at: '2026-10-01T00:00:00Z' },
            ],
          },
        ],
        history: [
          { member_id: 'ana', group_id: 'gA', joined_at: '2026-10-01T00:00:00Z' },
          { member_id: 'ben', group_id: 'gA', joined_at: '2026-10-01T00:00:00Z' },
        ],
      } as never
    })
    const wrapper = mount(GroupWorkMembers, {
      props: {
        courseId: COURSE,
        submission: SUB,
        assignment: { ...ASSIGNMENT, group_set_id: 'set1' } as Assignment,
        grades: [grade({ id: 'd-ana' }), grade({ id: 'd-ben', student_member_id: 'ben' })],
        reach: 'some',
      },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const cai = wrapper.findAll('.group-work__item')[2]
    expect(cai.text()).toContain('Cai Lam')
    expect(cai.text()).toContain('Outside the students your seat reaches')
    expect(wrapper.text()).not.toContain('Not in the group')
    expect(wrapper.text()).toContain('whether they are in the group now is not shown to you')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Correct members'))).toBe(false)
  })

  /** Team A's grades posted, as Core lists them to the TA: Ana's and Ben's alone (Cai's, 70 after -10, left out). */
  function answerPosted() {
    vi.mocked(read).mockImplementation(async (tool: string) => {
      if (tool === 'submission.get') return SUB as never
      if (tool === 'grade.get') return grade({ id: 'p-ana', state: 'posted' }) as never
      if (tool === 'component.tree') return { components: [] } as never
      if (tool === 'grade.list') {
        return {
          grades: [
            grade({ id: 'p-ana', state: 'posted' }),
            grade({ id: 'p-ben', student_member_id: 'ben', state: 'posted' }),
          ],
        } as never
      }
      throw new Error(`no answer for ${tool}`)
    })
  }

  it('is offered no regrade of the group on a member’s posted grade, and told why; adjusting the member stays', async () => {
    const { pinia } = setUp({ ...PERMS, grade_post: 'autonomous' }, 't', ['ana', 'ben'])
    answerPosted()
    const wrapper = mount(GradeView, {
      props: { courseId: COURSE, gradeId: 'p-ana' },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.find('.group-grade').exists()).toBe(true)
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons).not.toContain('Regrade the group')
    expect(buttons).toContain('Adjust')
    expect(wrapper.find('.group-grade').text()).toContain(
      'Some members of this work are outside the students your seat reaches. The group is regraded by someone whose seat reaches them all.',
    )
  })

  it('is offered the group’s regrade where its seat reaches every member', async () => {
    const { pinia } = setUp({ ...PERMS, grade_post: 'autonomous' }, 't', ['ana', 'ben', 'cai'])
    answerPosted()
    const wrapper = mount(GradeView, {
      props: { courseId: COURSE, gradeId: 'p-ana' },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('Regrade the group')
    expect(wrapper.text()).not.toContain('outside the students your seat reaches')
  })

  it('is told the group is regraded by someone who reaches them all, shown no member’s line, and has nothing to save', async () => {
    const { pinia } = setUp({ ...PERMS, grade_post: 'autonomous' }, 't', ['ana', 'ben'])
    answerPosted()
    const wrapper = mount(RegradeDialog, {
      props: {
        courseId: COURSE,
        modelValue: false,
        grade: grade({ id: 'p-ana', state: 'posted' }) as unknown as Grade,
        outOf: 100,
        what: 'Group project',
      },
      ...mounting,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    // Opened from the grade's page.
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    const dialog = document.body.querySelector('.el-dialog')!
    expect(dialog.textContent).toContain(
      'Some members of this work are outside the students your seat reaches. The group is regraded by someone whose seat reaches them all.',
    )
    // Cai's grade was not read: no line for him, nor any, as though his were the group's score.
    expect(dialog.querySelectorAll('.group-adjust__item')).toHaveLength(0)
    expect(dialog.textContent).not.toContain('Cai Lam')
    expect(dialog.textContent).not.toContain('The group’s score')
    expect(dialog.textContent).not.toContain('Each member’s line is as their grade is now')
    expect(dialog.querySelector('form')).toBeNull()
    const footer = Array.from(dialog.querySelectorAll('.el-dialog__footer button')).map((b) => b.textContent?.trim())
    expect(footer).toEqual(['Close'])
  })
})

describe('grading a group’s work whose grades cannot be read', () => {
  it('keeps each member’s line as their grade has it, sending only a line the grader sets', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_read: 'denied', rubric_read: 'autonomous' })
    answers['grade.submit'] = { group_grade_id: 'gg2', member_grades: [] }
    const wrapper = mount(GradePanel, {
      props: { courseId: COURSE, submission: SUB, assignment: ASSIGNMENT, gradesHidden: true, workGrades: [] },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const lines = wrapper.findAll('.group-adjust__item')
    expect(lines).toHaveLength(3)
    for (const l of lines) expect(l.text()).toContain('As their grade has it now')
    expect(wrapper.text()).toContain('each member’s line keeps what their grade has now')
    expect(wrapper.text()).not.toContain('Comes to the group’s score')
    await wrapper.find('input[placeholder="e.g. 8.5"]').setValue('85')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0].args).toMatchObject({ score: '85', members: ['ana', 'ben', 'cai'] })
    // Nothing is said of any member's adjustment: Core carries each, Cai's -10 among them.
    expect(writes[0].args.adjustments).toBeUndefined()

    // A line the grader sets is sent, and it alone.
    const ben = wrapper.findAll('.group-adjust__item')[1]
    ben.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'replace')
    await flushPromises()
    await ben.find('input[aria-label="Their score"]').setValue('90')
    await ben.find('input[aria-label="Reason (the member reads it)"]').setValue('Ran the load tests')
    await wrapper.find('input[placeholder="e.g. 8.5"]').setValue('85')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(2)
    expect(writes[1].args.adjustments).toEqual([
      { student_member_id: 'ben', kind: 'replace', points: '90', reason: 'Ran the load tests' },
    ])
  })
})

describe('the grades for a group’s work', () => {
  const grades = [
    grade({ id: 'p-ana', state: 'posted' }),
    grade({ id: 'd-ben', student_member_id: 'ben' }),
    grade({
      id: 'p-cai',
      student_member_id: 'cai',
      state: 'posted',
      score: 70,
      group: {
        group_grade_id: 'gg1',
        score: 80,
        adjustment: { kind: 'delta', points: -10, reason: 'Missed two meetings', by_member_id: 't' },
      },
    }),
  ]

  it('lets a TA adjust a draft, and not a posted grade, which is a regrade', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_post: 'denied', grade_read: 'autonomous' })
    const wrapper = mount(GroupGrades, {
      props: { courseId: COURSE, submission: SUB, grades, pointsPossible: 100 },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const items = wrapper.findAll('.group-grades__item')
    expect(items.map((i) => i.find('.group-grades__name').text())).toEqual(['Ana Chan', 'Ben Ho', 'Cai Lam'])
    expect(items.map((i) => i.findAll('button').some((b) => b.text() === 'Adjust'))).toEqual([false, true, false])
    expect(items[2].text()).toContain('The group’s score minus 10')
    expect(items[2].text()).toContain('Reason: Missed two meetings')
  })

  it('shows a member their own grade alone, with its reason and not who set it', async () => {
    const { pinia } = setUp({ grade_read: 'autonomous' }, 'cai')
    // Core gives a member their own grade alone.
    const wrapper = mount(GroupGrades, {
      props: {
        courseId: COURSE,
        submission: SUB,
        grades: [
          {
            ...grades[2],
            group: { ...grades[2].group!, adjustment: { kind: 'delta', points: -10, reason: 'Missed two meetings' } },
          },
        ],
        pointsPossible: 100,
        own: true,
      },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const items = wrapper.findAll('.group-grades__item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('Your grade')
    expect(items[0].text()).toContain('Reason: Missed two meetings')
    expect(wrapper.text()).not.toContain('Set by')
    expect(wrapper.text()).not.toContain('Ana Chan')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('adjusting one member', () => {
  it('opens on the member’s adjustment as it is, and sends the one chosen', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous', grade_post: 'autonomous' })
    answers['grade.adjust'] = { grade_id: 'g2', changed: true, score: 90, snapshots: 0 }
    const wrapper = mount(AdjustGradeDialog, {
      props: {
        courseId: COURSE,
        modelValue: true,
        name: 'Cai Lam',
        pointsPossible: 100,
        grade: grade({
          id: 'p-cai',
          student_member_id: 'cai',
          state: 'posted',
          score: 70,
          group: {
            group_grade_id: 'gg1',
            score: 80,
            adjustment: { kind: 'delta', points: -10, reason: 'Missed two meetings' },
          },
        }),
      },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const dialog = document.body.querySelector('.el-dialog')!
    expect(dialog.textContent).toContain('A new posted grade takes this one’s place at once')
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement
    expect(reason.value).toBe('Missed two meetings')
    const points = dialog.querySelector('input[inputmode="decimal"]') as HTMLInputElement
    expect(points.value).toBe('-10')
    points.value = '-5'
    points.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(dialog.textContent).toContain('Their score will be 75 / 100')
    ;(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'grade.adjust',
        args: { course_id: COURSE, grade_id: 'p-cai', kind: 'delta', points: '-5', reason: 'Missed two meetings' },
      },
    ])
    expect(wrapper.emitted('done')).toHaveLength(1)
  })
})

describe('correcting whose work it is', () => {
  it('keeps a graded member, and sends whom it adds and takes off', async () => {
    const { pinia } = setUp({ grade_submit: 'autonomous' })
    answers['submission.set_members'] = { members: ['ana', 'ben', 'cai', 'fay'] }
    mount(CorrectMembersDialog, {
      props: {
        courseId: COURSE,
        modelValue: true,
        submission: SUB,
        grades: [grade({ student_member_id: 'cai' })],
        candidates: ['fay'],
        nameOf: (id: string) => ({ ana: 'Ana Chan', ben: 'Ben Ho', cai: 'Cai Lam', fay: 'Fay Yip' })[id] ?? null,
      },
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons, stubs },
    })
    await flushPromises()
    const dialog = document.body.querySelector('.el-dialog')!
    const boxes = Array.from(dialog.querySelectorAll('.el-checkbox')) as HTMLElement[]
    expect(boxes.map((b) => b.classList.contains('is-disabled'))).toEqual([false, false, true])
    expect(dialog.textContent).toContain('Has a grade on this work, which stays theirs')
    // Fay, in the group now: offered first.
    ;(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.includes('Fay Yip')) as HTMLButtonElement
    ).click()
    ;(boxes[0].querySelector('input') as HTMLInputElement).click()
    await flushPromises()
    expect(dialog.textContent).toContain('Adds Fay Yip')
    expect(dialog.textContent).toContain('Takes Ana Chan off')
    ;(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'submission.set_members',
        args: { course_id: COURSE, submission_id: 's1', add: ['fay'], remove: ['ana'] },
      },
    ])
  })
})
