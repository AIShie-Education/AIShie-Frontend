import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import type { DocumentSummary } from '@/api/types'
import AssignmentFormDialog from './AssignmentFormDialog.vue'
import type { DocChoice } from './types'

// What Core answers each write with, and every write asked for.
let writes: { tool: string; args: Record<string, unknown> }[] = []
let answers: Record<string, unknown> = {}
let rubrics: DocumentSummary[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'document.list') return { documents: rubrics }
      if (tool === 'component.tree') return { components: [] }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (!(tool in answers)) throw new Error(`no answer for ${tool}`)
      return answers[tool]
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
  answers = { 'document.create': executed({ document_id: 'doc-r', version_id: 'ver-r' }) }
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

type Vm = { form: { title: string; points: string; rubric: DocChoice } }

async function mountDialog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(AssignmentFormDialog, {
    props: { courseId: COURSE, visible: true },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n, ElementPlus],
      stubs: { MarkdownEditor: true, FileUploader: true },
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
