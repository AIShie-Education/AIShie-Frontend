import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { AssignmentDeletePreview, DeletionCounts } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import DeleteAssignmentDialog from './DeleteAssignmentDialog.vue'
import { countsGrown, confirmOf, hasWork, isDeletedError, nothingGoes, titleMatches } from './deletion'

// What Core answers: the previews, in turn (the last one again), and the
// deletion; and every write asked for.
let previews: (AssignmentDeletePreview | ApiError)[] = []
let reads = 0
let writes: { tool: string; args: Record<string, unknown> }[] = []
let answer: unknown | ApiError
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool !== 'assignment.delete_preview') throw new Error(`no answer for ${tool}`)
      const p = previews[Math.min(reads++, previews.length - 1)]
      if (p instanceof real.ApiError) throw p
      return p
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (answer instanceof real.ApiError) throw answer
      return answer
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const COURSE = 'c1'
const ASSIGNMENT = { id: 'asg-1', title: 'Quiz 3', instructions_document_id: 'doc-i', rubric_document_id: null }
const NONE: DeletionCounts = {
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
function preview(
  counts: Partial<DeletionCounts> = {},
  over: Partial<AssignmentDeletePreview> = {},
): AssignmentDeletePreview {
  return {
    assignment_id: 'asg-1',
    title: 'Quiz 3',
    published: true,
    in_grade: true,
    counts: { ...NONE, ...counts },
    refusal: null,
    ...over,
  }
}
const WORK: Partial<DeletionCounts> = {
  submissions: 3,
  handed_in: 2,
  drafts: 0,
  missing: 1,
  grades: 2,
  posted: 1,
  files: 4,
  totals: 30,
}
const executed = (result: unknown) => ({
  status: 'executed',
  actionId: 'act-x',
  reviewState: 'none',
  result,
  replayed: false,
})

beforeEach(() => {
  setLocale('en')
  previews = [preview()]
  reads = 0
  writes = []
  answer = executed({
    deleted: true,
    assignment_id: 'asg-1',
    title: 'Quiz 3',
    removed: { submissions: 0, grades: 0, files: 0 },
    proposals_cancelled: 0,
    snapshots: 0,
    files_queued: 0,
  })
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountDialog(level: 'autonomous' | 'confirm_required' = 'autonomous') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { assignment_write: level } as never
  const wrapper = mount(DeleteAssignmentDialog, {
    props: { courseId: COURSE, modelValue: true, assignment: ASSIGNMENT },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return wrapper
}

const dialog = () => document.querySelector('.delete-assignment') as HTMLElement
const lines = () => [...dialog().querySelectorAll('.delete-assignment__lines li')].map((li) => li.textContent?.trim())
const deleteButton = () =>
  [...dialog().querySelectorAll('button')].find((b) => b.textContent?.includes('Delete for good')) as HTMLButtonElement
const titleField = () => dialog().querySelector('input[name="confirm-title"]') as HTMLInputElement | null
const messaged = () => vi.mocked(ElMessage).mock.calls.map(([o]) => (o as { message: string }).message)

async function type(text: string) {
  const input = titleField()!
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
async function press() {
  deleteButton().click()
  await flushPromises()
}

describe('DeleteAssignmentDialog, an assignment nobody has started on', () => {
  it('says only the assignment goes, asks for no title, and sends the counts back as confirm', async () => {
    const wrapper = await mountDialog()
    expect(dialog().textContent).toContain('“Quiz 3” will be deleted for good, with everything listed below.')
    expect(lines()).toEqual([])
    expect(dialog().textContent).toContain('Nobody has started on it: only the assignment itself goes.')
    expect(dialog().textContent).toContain('Its instructions stay in the course as they are.')
    expect(dialog().textContent).toContain('Students can see it now.')
    expect(titleField()).toBeNull()
    expect(deleteButton().disabled).toBe(false)

    await press()
    expect(writes).toEqual([
      { tool: 'assignment.delete', args: { course_id: COURSE, assignment_id: 'asg-1', confirm: NONE } },
    ])
    expect(messaged()).toEqual(['Deleted “Quiz 3”.'])
    expect(wrapper.emitted('deleted')?.[0]?.[0]).toMatchObject({ title: 'Quiz 3' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})

describe('DeleteAssignmentDialog, an assignment with work and grades', () => {
  it('lists only the counts that are not nought, in words', async () => {
    previews = [preview(WORK)]
    const wrapper = await mountDialog()
    expect(lines()).toEqual([
      'Submissions: 3 (2 handed in and 1 recorded as missing)',
      'Grades: 2 (1 posted and 1 not yet posted)',
      'Files: 4, deleted from storage',
      'Totals worked out again: 30 students’ posted totals, with the change recorded',
    ])
    expect(dialog().textContent).not.toContain('Proposals waiting')
    expect(dialog().textContent).not.toContain('Nobody has started on it')
    wrapper.unmount()
  })

  it('keeps Delete off until the title is typed as it is, and then deletes', async () => {
    previews = [preview(WORK)]
    answer = executed({
      deleted: true,
      assignment_id: 'asg-1',
      title: 'Quiz 3',
      removed: { submissions: 3, grades: 2, files: 4 },
      proposals_cancelled: 0,
      snapshots: 30,
      files_queued: 5,
    })
    const wrapper = await mountDialog()
    expect(titleField()).not.toBeNull()
    expect(deleteButton().disabled).toBe(true)

    await type('Quiz')
    expect(deleteButton().disabled).toBe(true)
    titleField()!.dispatchEvent(new FocusEvent('blur'))
    await flushPromises()
    await new Promise((r) => setTimeout(r, 150))
    expect(dialog().textContent).toContain('That is not its title.')

    await type('  Quiz 3 ')
    expect(deleteButton().disabled).toBe(false)
    await press()
    expect(writes[0].args.confirm).toEqual({ ...NONE, ...WORK })
    expect(messaged()).toEqual(['Deleted “Quiz 3”, with 3 submissions, 2 grades, and 4 files.'])
    wrapper.unmount()
  })

  it('counts again when more has come since it was shown, says so, and asks for the title again', async () => {
    previews = [preview(), preview({ submissions: 1, drafts: 1 })]
    answer = new ApiError({
      status: 409,
      code: 'conflict',
      message: 'more would go with the assignment than you were shown',
      details: { reason: 'confirm_stale', current: { ...NONE, submissions: 1, drafts: 1 } },
      actionId: 'act-f',
      actionStatus: 'failed',
    })
    const wrapper = await mountDialog()
    expect(titleField()).toBeNull()
    await press()

    expect(reads).toBe(2)
    expect(dialog().textContent).toContain('Something was added after this was shown. Check what goes with it again.')
    expect(lines()).toEqual(['Submissions: 1 (1 draft)'])
    expect(titleField()).not.toBeNull()
    expect(deleteButton().disabled).toBe(true)
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // Said in the dialog, not in a notification as well.
    expect(vi.mocked(ElNotification)).not.toHaveBeenCalled()

    // Once the title is typed, the new counts go back.
    answer = executed({
      deleted: true,
      assignment_id: 'asg-1',
      title: 'Quiz 3',
      removed: { submissions: 1, grades: 0, files: 0 },
      proposals_cancelled: 0,
      snapshots: 0,
      files_queued: 0,
    })
    await type('Quiz 3')
    await press()
    expect(writes[1].args.confirm).toEqual({ ...NONE, submissions: 1, drafts: 1 })
    expect(messaged()).toEqual(['Deleted “Quiz 3”, with 1 submission.'])
    wrapper.unmount()
  })
})

describe('DeleteAssignmentDialog, refusals and approval', () => {
  it('says what Core would refuse now, and offers nothing to press', async () => {
    previews = [preview(WORK, { refusal: 'student_out_of_scope' })]
    const wrapper = await mountDialog()
    expect(dialog().textContent).toContain('Your seat does not reach every student whose work or total this changes.')
    expect(titleField()).toBeNull()
    expect(deleteButton().disabled).toBe(true)
    wrapper.unmount()
  })

  it('says a refusal of the deletion itself in the dialog, by its reason', async () => {
    answer = new ApiError({
      status: 403,
      code: 'forbidden',
      message: 'an agent does not delete an assignment that has work or grades',
      details: { reason: 'people_only' },
    })
    const wrapper = await mountDialog()
    await press()
    expect(dialog().textContent).toContain(
      'An agent cannot delete an assignment that has work or grades; a person must.',
    )
    expect(wrapper.emitted('deleted')).toBeUndefined()
    wrapper.unmount()
  })

  it('says a deletion waits for approval, and hands the proposal on', async () => {
    answer = { status: 'proposed', actionId: 'act-p', reviewState: 'none', replayed: false }
    const wrapper = await mountDialog('confirm_required')
    expect(dialog().textContent).toContain('Deleting will wait for someone to approve it')
    await press()
    expect(wrapper.emitted('proposed')).toEqual([['act-p']])
    expect(vi.mocked(ElNotification)).toHaveBeenCalledTimes(1)
    expect(messaged()).toEqual([])
    wrapper.unmount()
  })

  it('closes, saying so, when it had been deleted already', async () => {
    previews = [
      new ApiError({
        status: 404,
        code: 'not_found',
        message: 'the assignment was deleted for good',
        details: { reason: 'deleted' },
      }),
    ]
    const wrapper = await mountDialog()
    expect(wrapper.emitted('gone')).toEqual([[]])
    expect(messaged()).toEqual(['This assignment was deleted.'])
    wrapper.unmount()
  })
})

describe('deletion helpers', () => {
  it('tell work, a title typed and counts that grew', () => {
    expect(hasWork({ submissions: 0, grades: 0 })).toBe(false)
    expect(hasWork({ submissions: 1, grades: 0 })).toBe(true)
    expect(nothingGoes(NONE)).toBe(true)
    expect(nothingGoes({ ...NONE, proposals: 1 })).toBe(false)
    expect(titleMatches(' Quiz 3 ', 'Quiz 3')).toBe(true)
    expect(titleMatches('quiz 3', 'Quiz 3')).toBe(false)
    expect(titleMatches('', '')).toBe(false)
    // Smaller is no reason to refuse; larger is.
    expect(countsGrown({ ...NONE, drafts: 2, submissions: 2 }, { ...NONE, drafts: 1, submissions: 1 })).toBe(false)
    expect(countsGrown(NONE, { ...NONE, grades: 1 })).toBe(true)
    expect(confirmOf({ course_id: 'c', confirm: NONE })).toEqual(NONE)
    expect(confirmOf({ confirm: { submissions: 1 } })).toBeNull()
    expect(confirmOf({})).toBeNull()
    expect(
      isDeletedError(new ApiError({ status: 404, code: 'not_found', message: '', details: { reason: 'deleted' } })),
    ).toBe(true)
    expect(isDeletedError(new ApiError({ status: 404, code: 'not_found', message: '' }))).toBe(false)
  })
})
