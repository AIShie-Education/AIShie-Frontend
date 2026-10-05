import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { DocumentSummary } from '@/api/types'
import AssignmentFormDialog from './AssignmentFormDialog.vue'
import type { DocChoice } from './types'

// What Core answers each write with, and every write asked for.
let writes: { tool: string; args: Record<string, unknown> }[] = []
let answers: Record<string, unknown> = {}
let rubrics: DocumentSummary[] = []
let grades: Record<string, unknown>[] = []
let sets: Record<string, unknown>[] = []
let started: Record<string, unknown>[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'document.list') return { documents: rubrics }
      if (tool === 'component.tree') return { components: [] }
      if (tool === 'grade.list') return { grades }
      if (tool === 'group_set.list') return { sets }
      if (tool === 'submission.list') return { submissions: started }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (!(tool in answers)) throw new Error(`no answer for ${tool}`)
      const answer = answers[tool]
      if (answer instanceof real.ApiError) throw answer
      return answer
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const executed = (result: unknown) => ({
  status: 'executed',
  actionId: 'act-x',
  reviewState: 'none',
  result,
  replayed: false,
})
const proposed = { status: 'proposed', actionId: 'act-p', reviewState: 'none', replayed: false }

beforeEach(() => {
  setLocale('en')
  writes = []
  rubrics = []
  grades = []
  sets = []
  started = []
  answers = { 'document.create': executed({ document_id: 'doc-r', version_id: 'ver-r' }) }
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

type Vm = { form: { title: string; points: string; rubric: DocChoice } }

async function mountDialog(assignment?: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(AssignmentFormDialog, {
    props: { courseId: COURSE, visible: true, assignment: assignment as never },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n, ElementPlus],
      stubs: { MarkdownEditor: true, FileDropZone: true },
    },
  })
  await flushPromises()
  return wrapper
}

async function createWithNewRubric(wrapper: Awaited<ReturnType<typeof mountDialog>>) {
  const vm = wrapper.vm as unknown as Vm
  vm.form.title = 'Essay'
  vm.form.points = '10'
  vm.form.rubric = { mode: 'new', title: 'Essay — rubric', body: 'Criteria', files: [], publish: false }
  await flushPromises()
  const create = wrapper.findAll('button').find((b) => b.text() === 'Create')!
  await create.trigger('click')
  await flushPromises()
}

const notified = () => vi.mocked(ElNotification).mock.calls.map(([o]) => (o as { message: string }).message)
const messaged = () => vi.mocked(ElMessage).mock.calls.map(([o]) => (o as { message: string }).message)

describe('AssignmentFormDialog saving', () => {
  it('says once, when the assignment waits for approval, that the rubric written for it exists already', async () => {
    answers['assignment.create'] = proposed
    const wrapper = await mountDialog()
    await createWithNewRubric(wrapper)

    expect(writes.map((w) => w.tool)).toEqual(['document.create', 'assignment.create'])
    expect(notified()).toEqual([
      'Sent for approval: the assignment is saved once someone approves it. “Essay — rubric” was created already and stays in the course even if it is not approved.',
    ])
    expect(messaged()).toEqual([])
    expect(wrapper.emitted('saved')).toEqual([[{ status: 'proposed' }]])
    wrapper.unmount()
  })

  it('says once, when the assignment is created, that its rubric was too', async () => {
    answers['assignment.create'] = executed({ id: 'asg-1' })
    const wrapper = await mountDialog()
    await createWithNewRubric(wrapper)

    expect(messaged()).toEqual(['Assignment created (with its rubric). It is not published yet.'])
    expect(notified()).toEqual([])
    expect(wrapper.emitted('saved')).toEqual([[{ status: 'executed', id: 'asg-1' }]])
    wrapper.unmount()
  })

  it('gives the usual word for a proposal when no document was written here', async () => {
    answers['assignment.create'] = proposed
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.form.title = 'Essay'
    vm.form.points = '10'
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Create')!
      .trigger('click')
    await flushPromises()

    expect(writes.map((w) => w.tool)).toEqual(['assignment.create'])
    expect(notified()).toEqual([i18n.global.t('common.outcome.proposed')])
    expect(messaged()).toEqual([])
    wrapper.unmount()
  })
})

describe('AssignmentFormDialog rubric hints', () => {
  it('does not tie students to publishing an existing rubric, and names grader agents', async () => {
    rubrics = [
      {
        id: 'doc-old',
        kind: 'rubric',
        title: 'Old rubric',
        published_version_id: null,
        sort_order: 0,
        status: 'active',
        created_at: '2026-09-01T00:00:00Z',
      },
    ]
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.form.rubric = { mode: 'existing', id: 'doc-old', title: '', body: '', files: [], publish: false }
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('This rubric has no published version yet, so grader agents cannot read it')
    expect(text).not.toContain('This document has no published version yet: students cannot read it.')
    wrapper.unmount()
  })
})

describe('AssignmentFormDialog, points changed after grading', () => {
  const ESSAY = {
    id: 'asg-e',
    course_id: COURSE,
    title: 'Essay',
    points_possible: 100,
    published_at: null,
    created_at: '2026-09-01T00:00:00Z',
  }
  const grade = (id: string, score: number, state = 'posted') => ({
    id,
    assignment_id: 'asg-e',
    submission_id: `sub-${id}`,
    origin: 'entered',
    state,
    score,
    student_member_id: `s-${id}`,
    grader_member_id: 'me',
    created_at: '2026-09-02T00:00:00Z',
    created_by_action_id: 'a',
  })
  const save = (w: Awaited<ReturnType<typeof mountDialog>>) =>
    w
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click')

  it('asks what becomes of the grades, and sends the choice with the new points', async () => {
    grades = [grade('g1', 85), grade('g2', 30, 'draft'), { ...grade('g0', 90, 'superseded'), superseded_by: 'g1' }]
    answers['assignment.update'] = executed({ ok: true, rescaled: 2, snapshots: 3 })
    const wrapper = await mountDialog(ESSAY)
    const vm = wrapper.vm as unknown as Vm
    vm.form.points = '50'
    await flushPromises()
    // The two standing grades, and an example from the highest.
    expect(wrapper.text()).toContain('2 grades have been entered for it')
    expect(wrapper.text()).toContain('For example, 85/100 becomes 42.5/50')
    // Saving without a choice asks for one, and sends nothing.
    await save(wrapper)
    await flushPromises()
    // A form's error shows after its short debounce.
    await new Promise((r) => setTimeout(r, 150))
    expect(wrapper.text()).toContain('Say what becomes of the grades already entered.')
    expect(writes).toEqual([])

    await wrapper.find('[data-choice="rescale"] input').setValue(true)
    await save(wrapper)
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'assignment.update',
        args: { course_id: COURSE, assignment_id: 'asg-e', points_possible: '50', existing_grades: 'rescale' },
      },
    ])
    expect(messaged()).toEqual(['Saved: 2 grades rescaled, 3 totals written again.'])
    wrapper.unmount()
  })

  it('asks nothing when no grade has been entered', async () => {
    answers['assignment.update'] = executed({ ok: true, rescaled: 0, snapshots: 0 })
    const wrapper = await mountDialog(ESSAY)
    const vm = wrapper.vm as unknown as Vm
    vm.form.points = '50'
    await flushPromises()
    expect(wrapper.find('.existing-grades').exists()).toBe(false)
    await save(wrapper)
    await flushPromises()
    expect(writes[0].args).toEqual({ course_id: COURSE, assignment_id: 'asg-e', points_possible: '50' })
    wrapper.unmount()
  })
})

describe('AssignmentFormDialog, group work', () => {
  const set = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    id,
    name,
    signup: { open: false, joinable: false },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    groups: [
      { id: `${id}-1`, name: 'Alpha', size: 2, full: false, created_at: '2026-09-01T00:00:00Z' },
      { id: `${id}-2`, name: 'Beta', size: 1, full: false, created_at: '2026-09-01T00:00:00Z' },
    ],
    assignments: [],
    ...over,
  })
  const GROUP_ESSAY = {
    id: 'asg-g',
    title: 'Group essay',
    points_possible: 10,
    published_at: '2026-09-02T00:00:00Z',
    group_set_id: 'set-p',
  }
  const press = (w: Awaited<ReturnType<typeof mountDialog>>, label: string) =>
    w
      .findAll('button')
      .find((b) => b.text() === label)!
      .trigger('click')
  const groupField = (w: Awaited<ReturnType<typeof mountDialog>>) => w.find('.assignment-form__group')

  it('makes a new assignment group work of the set chosen, the one set there is chosen already', async () => {
    sets = [set('set-p', 'Project groups')]
    answers['assignment.create'] = executed({ id: 'asg-1' })
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as Vm & { form: { group: boolean; groupSetId: string } }
    vm.form.title = 'Group essay'
    vm.form.points = '10'
    await groupField(wrapper).find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(vm.form.groupSetId).toBe('set-p')
    expect(groupField(wrapper).text()).toContain('a student in no group of it hands nothing in')
    await press(wrapper, 'Create')
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'assignment.create',
        args: expect.objectContaining({ title: 'Group essay', group_set_id: 'set-p' }),
      },
    ])
    wrapper.unmount()
  })

  it('makes it individual work again, while nobody has started on it', async () => {
    sets = [set('set-p', 'Project groups')]
    answers['assignment.update'] = executed({ ok: true, rescaled: 0, snapshots: 0 })
    const wrapper = await mountDialog(GROUP_ESSAY)
    const box = groupField(wrapper).find('input[type="checkbox"]')
    expect((box.element as HTMLInputElement).checked).toBe(true)
    await box.setValue(false)
    await press(wrapper, 'Save')
    await flushPromises()
    expect(writes).toEqual([
      { tool: 'assignment.update', args: { course_id: COURSE, assignment_id: 'asg-g', clear_group_set: true } },
    ])
    wrapper.unmount()
  })

  it('keeps it as it is once anyone has started on it, saying why', async () => {
    sets = [set('set-p', 'Project groups', { archived_at: '2026-09-03T00:00:00Z' }), set('set-l', 'Lab groups')]
    started = [{ id: 'sub-1', assignment_id: 'asg-g', attempt: 1, state: 'draft', revision: 1 }]
    const wrapper = await mountDialog(GROUP_ESSAY)
    const field = groupField(wrapper)
    expect(field.text()).toContain('Someone has started on it, so whether it is group work')
    expect(field.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    // Its set, archived since, is still the one shown.
    expect(field.text()).toContain('Project groups (archived)')
    wrapper.unmount()
  })

  it('says Core’s refusal because someone has started, and locks the field from then on', async () => {
    sets = [set('set-p', 'Project groups'), set('set-l', 'Lab groups')]
    answers['assignment.update'] = new ApiError({
      status: 412,
      code: 'failed_precondition',
      message: 'the assignment has submissions',
      details: { reason: 'assignment_has_work' },
    })
    const wrapper = await mountDialog(GROUP_ESSAY)
    const vm = wrapper.vm as unknown as Vm & { form: { groupSetId: string } }
    vm.form.groupSetId = 'set-l'
    await flushPromises()
    await press(wrapper, 'Save')
    await flushPromises()
    expect(writes.map((w) => w.args)).toEqual([{ course_id: COURSE, assignment_id: 'asg-g', group_set_id: 'set-l' }])
    expect(
      vi
        .mocked(ElMessage)
        .mock.calls.map(([o]) => (o as { message: string }).message)
        .join(' '),
    ).toContain('Someone has started on this assignment (a draft, a hand-in or a record of missing work)')
    expect(groupField(wrapper).text()).toContain('Someone has started on it, so whether it is group work')
    expect(vm.form.groupSetId).toBe('set-p')
    wrapper.unmount()
  })
})
