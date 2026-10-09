import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import MyWorkPanel from './MyWorkPanel.vue'

// A group's work, as Core keeps it for this test: Alpha's draft, written by
// Yuki (the reader) and Ken together.
const ME = 'm-yuki'
const MEMBERS = [
  { member_id: 'm-ken', display_name: 'Ken Wong' },
  { member_id: ME, display_name: 'Yuki Tanaka' },
]
interface Draft {
  id: string
  assignment_id: string
  group_id: string
  group_name: string
  members: typeof MEMBERS
  attempt: number
  state: string
  body: string
  revision: number
  revised_at?: string
  revised_by_member_id?: string
  created_at: string
  files: never[]
}
let draft: Draft | null
/** Core's answer to reading the draft once the reader is not one of its group: the draft is not listed for them either. */
let notMine: ApiError | null
let attempts: Record<string, unknown>[]
/** Reads of the attempts, and of the draft, wait for these where set: which of a refresh's reads answers first. */
let listGate: Promise<void> | null
let getGate: Promise<void> | null
let writes: { tool: string; args: Record<string, unknown> }[]
let answers: Record<string, (args: Record<string, unknown>) => unknown>
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'submission.list') {
        if (listGate) await listGate
        return { submissions: draft && !notMine ? [{ ...draft, body: undefined }, ...attempts] : attempts }
      }
      if (tool === 'submission.get') {
        if (getGate) await getGate
        if (notMine) throw notMine
        return { ...draft }
      }
      if (tool === 'grade.list') return { grades: [] }
      if (tool === 'action.list_mine') return { actions: [] }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      const answer = answers[tool]
      if (!answer) throw new Error(`no answer for ${tool}`)
      const out = answer(args)
      if (out instanceof real.ApiError) throw out
      return { status: 'executed', actionId: 'act-1', reviewState: 'none', replayed: false, result: out }
    }),
  }
})
vi.mock('@/utils/clipboard', () => ({ copyText: vi.fn(async () => true) }))
const confirm = vi.fn(async (..._a: unknown[]) => 'confirm')
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: { ...real.ElMessageBox, confirm: (...a: unknown[]) => confirm(...a) },
  }
})

const COURSE = 'c1'
const ASSIGNMENT = {
  id: 'asg-1',
  title: 'Group essay',
  points_possible: 10,
  published_at: '2026-10-01T00:00:00Z',
  group_set_id: 'set-1',
  my_group: { group_id: 'g-alpha', name: 'Alpha' },
}
const SET = {
  id: 'set-1',
  name: 'Project groups',
  signup: { open: false, joinable: false, reason: 'signup_closed' },
  groups: [{ id: 'g-alpha', name: 'Alpha', size: 2, full: false, created_at: '', members: MEMBERS }],
  assignments: [],
  created_at: '',
  updated_at: '',
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setLocale('en')
  writes = []
  attempts = []
  answers = {}
  notMine = null
  listGate = null
  getGate = null
  draft = {
    id: 'sub-1',
    assignment_id: 'asg-1',
    group_id: 'g-alpha',
    group_name: 'Alpha',
    members: MEMBERS,
    attempt: 1,
    state: 'draft',
    body: 'Our first lines.',
    revision: 3,
    revised_at: '2026-10-05T12:00:00Z',
    revised_by_member_id: 'm-ken',
    created_at: '2026-10-05T11:00:00Z',
    files: [],
  }
  confirm.mockClear()
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountPanel(assignment: Record<string, unknown> = ASSIGNMENT, groupSet: unknown = SET) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.membership = { member_id: ME, role: 'student', status: 'active' } as never
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      // Where the attempts link to, once one is handed in.
      { path: '/s/:courseId/:submissionId', name: 'course-submission', component: { render: () => null } },
      { path: '/a/:courseId', name: 'course-my-actions', component: { render: () => null } },
      { path: '/:p(.*)*', name: 'any', component: { render: () => null } },
    ],
  })
  const wrapper = mount(MyWorkPanel, {
    props: { courseId: COURSE, assignment: assignment as never, groupSet: groupSet as never },
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n, ElementPlus],
      components: icons,
      stubs: {
        MarkdownEditor: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<textarea class="editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        FileDropZone: true,
        DocumentFiles: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}
const button = (w: Awaited<ReturnType<typeof mountPanel>>, label: string) =>
  w.findAll('button').find((b) => b.text() === label)!
const messages = () => vi.mocked(ElMessage).mock.calls.map(([o]) => (o as { message: string }).message)

describe('a draft its group writes together', () => {
  it('names the group and its members, and who changed the draft last', async () => {
    const w = await mountPanel()
    expect(w.find('.my-work__group').text()).toContain('Alpha')
    expect(w.find('.my-work__group').text()).toContain('you and Ken Wong')
    expect(w.text()).toContain('Your group’s answer')
    expect(w.find('.my-work__revised').text()).toContain('Last changed by Ken Wong')
    w.unmount()
  })

  it('saves over the revision read, and the next save over the one written', async () => {
    answers['submission.update_draft'] = (args) => {
      draft = { ...draft!, body: args.body as string, revision: draft!.revision + 1 }
      return { ok: true, revision: draft.revision }
    }
    const w = await mountPanel()
    await w.find('textarea.editor').setValue('Our first lines, longer.')
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    await w.find('textarea.editor').setValue('Our first lines, longer still.')
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    expect(writes.map((x) => x.args.base_revision)).toEqual([3, 4])
    w.unmount()
  })

  it('on someone else’s change, keeps what was typed, and lets the reader keep it or load theirs', async () => {
    answers['submission.update_draft'] = (args) =>
      args.base_revision === 3
        ? new ApiError({
            status: 409,
            code: 'conflict',
            message: 'the draft has changed since that revision',
            details: {
              reason: 'draft_changed',
              current_revision: 4,
              revised_at: '2026-10-05T12:05:00Z',
              revised_by_member_id: 'm-ken',
            },
          })
        : ((draft = { ...draft!, body: args.body as string, revision: 5 }), { ok: true, revision: 5 })
    const w = await mountPanel()
    await w.find('textarea.editor').setValue('Mine.')
    // Ken saves meanwhile: the draft, read again, is his.
    draft = { ...draft!, body: 'Ken’s.', revision: 4, revised_at: '2026-10-05T12:05:00Z' }
    await button(w, 'Save draft').trigger('click')
    await flushPromises()

    const conflict = w.find('.my-work__conflict')
    expect(conflict.text()).toContain('Ken Wong changed the draft')
    expect((w.find('textarea.editor').element as HTMLTextAreaElement).value).toBe('Mine.')
    expect(button(w, 'Save draft').attributes('disabled')).toBeDefined()
    await button(w, 'What the draft says now').trigger('click')
    expect(w.find('.my-work__theirs').text()).toContain('Ken’s.')

    await button(w, 'Keep editing mine').trigger('click')
    expect(w.find('.my-work__conflict').exists()).toBe(false)
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    expect(writes.map((x) => [x.args.body, x.args.base_revision])).toEqual([
      ['Mine.', 3],
      ['Mine.', 4],
    ])
    w.unmount()
  })

  it('loading theirs puts their text in place of what was typed', async () => {
    const w = await mountPanel()
    await w.find('textarea.editor').setValue('Mine.')
    draft = { ...draft!, body: 'Ken’s.', revision: 4 }
    // Read again (as every 20 seconds): a conflict, before anything is saved.
    ;(w.vm as unknown as { reload: () => void }).reload()
    await flushPromises()
    await button(w, 'Load it as it is now').trigger('click')
    expect((w.find('textarea.editor').element as HTMLTextAreaElement).value).toBe('Ken’s.')
    expect(w.text()).toContain('All changes saved')
    w.unmount()
  })

  it('hands it in for the members it names, and says whom it left out', async () => {
    draft = { ...draft!, members: [...MEMBERS, { member_id: 'm-mei', display_name: 'Mei Chan' }] }
    answers['submission.submit'] = () => ({
      state: 'submitted',
      submitted_at: '2026-10-05T12:10:00Z',
      members: [ME, 'm-ken'],
      left_out: [{ member_id: 'm-mei' }],
    })
    const w = await mountPanel()
    await button(w, 'Hand in').trigger('click')
    await flushPromises()
    const [message, title] = confirm.mock.calls[0] as [{ children: { children: string }[] }, string]
    expect(title).toBe('Hand in attempt 1 for Alpha?')
    expect(message.children[0]!.children).toBe(
      'It is handed in for you, Ken Wong, and Mei Chan: from then on it is their work, whatever changes in the group afterwards.',
    )
    expect(writes[0]).toEqual({
      tool: 'submission.submit',
      args: expect.objectContaining({ body: 'Our first lines.', members: ['m-ken', ME, 'm-mei'] }),
    })
    expect(messages()).toContain('Handed in for you and Ken Wong.')
    expect(w.find('.my-work__left-out').text()).toContain('Mei Chan was left out of it')
    w.unmount()
  })

  it('hands nothing in that the reader has not seen: a draft changed meanwhile is shown first', async () => {
    const w = await mountPanel()
    draft = { ...draft!, body: 'Ken’s newer lines.', revision: 4 }
    await button(w, 'Hand in').trigger('click')
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect((w.find('textarea.editor').element as HTMLTextAreaElement).value).toBe('Ken’s newer lines.')
    expect(w.text()).toContain('The draft changed before it was handed in: Ken Wong changed it')
    w.unmount()
  })

  it('hands nothing in that the reader has not seen: a file a groupmate attached meanwhile is shown first', async () => {
    const w = await mountPanel()
    // Ken attaches a file: Core counts no new revision for it.
    draft = { ...draft!, files: [{ document_id: 'doc-ken', title: 'kens-notes.txt' }] as never[] }
    await button(w, 'Hand in').trigger('click')
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(w.text()).toContain('The draft’s files changed before it was handed in')
    // The page shows it now; handed in again, it is in what is named.
    answers['submission.submit'] = () => ({
      state: 'submitted',
      submitted_at: '2026-10-05T12:10:00Z',
      members: [ME, 'm-ken'],
    })
    await button(w, 'Hand in').trigger('click')
    await flushPromises()
    expect(writes[0]).toEqual({
      tool: 'submission.submit',
      args: expect.objectContaining({ body: 'Our first lines.', files: ['doc-ken'] }),
    })
    w.unmount()
  })

  it('hands in what the reader saw, the 20-second read waiting while the confirmation is open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let release = () => {}
      confirm.mockImplementationOnce(() => new Promise((r) => (release = () => r('confirm'))))
      // Core hands in only what the draft holds.
      answers['submission.submit'] = (args) =>
        args.body === draft!.body
          ? { state: 'submitted', submitted_at: '2026-10-05T12:10:00Z', members: [ME, 'm-ken'] }
          : new ApiError({
              status: 422,
              code: 'failed_precondition',
              message: 'the draft does not hold what this call says it hands in',
            })
      const w = await mountPanel()
      await button(w, 'Hand in').trigger('click')
      await flushPromises()
      expect(confirm).toHaveBeenCalledTimes(1)
      // Ken saves new text while Yuki's confirmation is open; the 20-second read does not put it behind it.
      draft = { ...draft!, body: 'Ken changed it while the confirmation was open.', revision: 4 }
      await vi.advanceTimersByTimeAsync(25_000)
      await flushPromises()
      expect((editor(w).element as HTMLTextAreaElement).value).toBe('Our first lines.')
      release()
      await flushPromises()
      expect(writes).toEqual([
        { tool: 'submission.submit', args: expect.objectContaining({ body: 'Our first lines.', files: [] }) },
      ])
      // Refused, the draft is read again and shown, and the reader is told why.
      expect((editor(w).element as HTMLTextAreaElement).value).toBe('Ken changed it while the confirmation was open.')
      expect(w.text()).toContain('The draft changed before it was handed in: Ken Wong changed it')
      expect(messages()).not.toContain('Handed in for you and Ken Wong.')
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

/** Core's refusal of the draft to someone who is not one of its group now. */
const outOfScope = () =>
  new ApiError({
    status: 403,
    code: 'forbidden',
    message: 'not permitted',
    details: { reason: 'student_out_of_scope' },
    actionId: 'act-9',
    actionStatus: 'denied',
  })
const editor = (w: Awaited<ReturnType<typeof mountPanel>>) => w.find('textarea.editor')

describe('when the draft stops being the reader’s while it is open', () => {
  it('moved out of the group, a save says so, keeps what was typed, and reads the group again', async () => {
    answers['submission.update_draft'] = outOfScope
    const w = await mountPanel()
    await editor(w).setValue('Mine, not saved yet.')
    // The teacher moves Yuki to Beta: Alpha's draft is not hers to read or list any more.
    notMine = outOfScope()
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('You are no longer in Alpha, so its draft is not yours to change or hand in any more.')
    expect(w.find('.my-work__kept-text').text()).toBe('Mine, not saved yet.')
    expect(w.emitted('groupChanged')).toHaveLength(1)
    expect(editor(w).exists()).toBe(false)
    // Said in words, not as a refusal.
    expect(vi.mocked(ElNotification)).not.toHaveBeenCalled()
    w.unmount()
  })

  it('moved out of the group, the 20-second read finds it, and Hand in is not offered over it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const w = await mountPanel()
      await editor(w).setValue('Mine, not saved yet.')
      notMine = outOfScope()
      await vi.advanceTimersByTimeAsync(20_000)
      await flushPromises()
      expect(w.text()).toContain('You are no longer in Alpha')
      expect(w.find('.my-work__kept-text').text()).toBe('Mine, not saved yet.')
      expect(w.emitted('groupChanged')).toHaveLength(1)
      expect(w.findAll('button').some((b) => b.text() === 'Hand in')).toBe(false)
      expect(writes).toEqual([])
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('handed in by someone else, the 20-second read keeps what was typed to copy, until it is discarded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const w = await mountPanel()
      await editor(w).setValue('A paragraph Yuki has not saved.')
      draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
      await vi.advanceTimersByTimeAsync(20_000)
      await flushPromises()
      expect(w.text()).toContain('Ken Wong has handed the draft in, without the changes you had not saved.')
      expect(editor(w).exists()).toBe(false)
      const kept = w.find('.my-work__kept')
      expect(kept.find('.my-work__kept-text').text()).toBe('A paragraph Yuki has not saved.')
      await button(w, 'Copy').trigger('click')
      await flushPromises()
      expect(button(w, 'Copied')).toBeDefined()
      await button(w, 'Discard it').trigger('click')
      await flushPromises()
      expect(confirm.mock.calls[0]![1]).toBe('Discard what you had not saved?')
      expect(w.find('.my-work__kept').exists()).toBe(false)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('handed in by someone else, a save says who did, and keeps what was typed', async () => {
    answers['submission.update_draft'] = () =>
      new ApiError({ status: 409, code: 'conflict', message: 'the submission is no longer a draft' })
    const w = await mountPanel()
    await editor(w).setValue('Mine, not saved yet.')
    draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Ken Wong has handed the draft in, without the changes you had not saved.')
    expect(w.find('.my-work__kept-text').text()).toBe('Mine, not saved yet.')
    expect(messages().some((m) => m.includes('no longer a draft'))).toBe(false)
    w.unmount()
  })

  it('handed in by someone else with nothing unsaved, says so and keeps nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const w = await mountPanel()
      draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
      await vi.advanceTimersByTimeAsync(20_000)
      await flushPromises()
      expect(w.text()).toContain('Ken Wong has handed the draft in.')
      expect(w.find('.my-work__kept').exists()).toBe(false)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a save refused for another reason says that reason, and keeps the text in the editor', async () => {
    answers['submission.update_draft'] = () =>
      new ApiError({ status: 400, code: 'invalid_argument', message: 'body is too long' })
    const w = await mountPanel()
    await editor(w).setValue('Mine, not saved yet.')
    await button(w, 'Save draft').trigger('click')
    await flushPromises()
    expect(messages().some((m) => m.includes('body is too long'))).toBe(true)
    expect((editor(w).element as HTMLTextAreaElement).value).toBe('Mine, not saved yet.')
    expect(w.find('.my-work__kept').exists()).toBe(false)
    w.unmount()
  })
})

/** A read held back until released: which of a refresh's reads answers first. */
function gate(): { gate: Promise<void>; release: () => void } {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  return { gate: held, release }
}
/** The page's Refresh, which reads the attempts and the draft again side by side. */
const refresh = (w: Awaited<ReturnType<typeof mountPanel>>) => (w.vm as unknown as { reload: () => void }).reload()
const kept = (w: Awaited<ReturnType<typeof mountPanel>>) => w.find('.my-work__kept-text')

describe('when a refresh finds the draft is not the reader’s any more', () => {
  it('moved out of the group, and the attempts read first: keeps what was typed, then says so', async () => {
    const w = await mountPanel()
    await editor(w).setValue('Mine, not saved yet.')
    // The teacher moves Yuki to Beta: Alpha's draft is not hers to read or list any more.
    notMine = outOfScope()
    const held = gate()
    getGate = held.gate
    refresh(w)
    await flushPromises()
    // Her attempts have no draft now: the editor goes, what she typed stays.
    expect(editor(w).exists()).toBe(false)
    expect(kept(w).text()).toBe('Mine, not saved yet.')
    held.release()
    await flushPromises()
    expect(w.text()).toContain('You are no longer in Alpha, so its draft is not yours to change or hand in any more.')
    expect(kept(w).text()).toBe('Mine, not saved yet.')
    expect(w.emitted('groupChanged')).toHaveLength(1)
    expect(vi.mocked(ElNotification)).not.toHaveBeenCalled()
    w.unmount()
  })

  it('moved out of the group, and the draft read first: says so at once, and keeps what was typed', async () => {
    const w = await mountPanel()
    await editor(w).setValue('Mine, not saved yet.')
    notMine = outOfScope()
    const held = gate()
    listGate = held.gate
    refresh(w)
    await flushPromises()
    // Its reading refused: said, not shown as a refusal, the editor as it was until the attempts are read.
    expect(w.text()).toContain('You are no longer in Alpha')
    expect(w.text()).not.toContain('not permitted')
    expect(kept(w).text()).toBe('Mine, not saved yet.')
    expect((editor(w).element as HTMLTextAreaElement).value).toBe('Mine, not saved yet.')
    await editor(w).setValue('Mine, not saved yet, and a little more.')
    held.release()
    await flushPromises()
    expect(editor(w).exists()).toBe(false)
    expect(kept(w).text()).toBe('Mine, not saved yet, and a little more.')
    expect(w.emitted('groupChanged')).toHaveLength(1)
    expect(vi.mocked(ElNotification)).not.toHaveBeenCalled()
    w.unmount()
  })

  it('handed in by someone else, and the attempts read first: keeps what was typed, and says who did', async () => {
    const w = await mountPanel()
    await editor(w).setValue('A paragraph Yuki has not saved.')
    draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
    const held = gate()
    getGate = held.gate
    refresh(w)
    await flushPromises()
    expect(editor(w).exists()).toBe(false)
    expect(kept(w).text()).toBe('A paragraph Yuki has not saved.')
    held.release()
    await flushPromises()
    expect(w.text()).toContain('Ken Wong has handed the draft in, without the changes you had not saved.')
    expect(kept(w).text()).toBe('A paragraph Yuki has not saved.')
    expect(button(w, 'Start attempt 2')).toBeDefined()
    w.unmount()
  })

  it('handed in by someone else, and the draft read first: the same', async () => {
    const w = await mountPanel()
    await editor(w).setValue('A paragraph Yuki has not saved.')
    draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
    const held = gate()
    listGate = held.gate
    refresh(w)
    await flushPromises()
    held.release()
    await flushPromises()
    expect(w.text()).toContain('Ken Wong has handed the draft in, without the changes you had not saved.')
    expect(kept(w).text()).toBe('A paragraph Yuki has not saved.')
    w.unmount()
  })

  it('handed in by someone else with nothing unsaved: says who did, and keeps nothing', async () => {
    const w = await mountPanel()
    draft = { ...draft!, state: 'submitted', submitted_by_member_id: 'm-ken' } as Draft
    const held = gate()
    getGate = held.gate
    refresh(w)
    await flushPromises()
    held.release()
    await flushPromises()
    expect(w.text()).toContain('Ken Wong has handed the draft in.')
    expect(w.find('.my-work__kept').exists()).toBe(false)
    w.unmount()
  })

  it('handed in by the reader here: no news of it, and nothing kept', async () => {
    answers['submission.submit'] = () => {
      draft = { ...draft!, state: 'submitted', submitted_by_member_id: ME } as Draft
      return { state: 'submitted', submitted_at: '2026-10-05T12:10:00Z', members: ['m-ken', ME] }
    }
    const w = await mountPanel()
    await button(w, 'Hand in').trigger('click')
    await flushPromises()
    expect(editor(w).exists()).toBe(false)
    expect(w.text()).not.toContain('has handed the draft in')
    expect(w.find('.my-work__kept').exists()).toBe(false)
    w.unmount()
  })
})

describe('a student in no group of the set', () => {
  it('is told so, with nothing to start, and to ask the teacher while sign-up is closed', async () => {
    draft = null
    const w = await mountPanel({ ...ASSIGNMENT, my_group: null })
    expect(w.text()).toContain('You are in no group yet')
    expect(w.text()).toContain('each group of “Project groups” hands in one piece of work for its members')
    expect(w.text()).toContain('Ask your teacher to place you in a group.')
    expect(w.findAll('button').some((b) => b.text().includes('Start'))).toBe(false)
    w.unmount()
  })

  it('is told until when sign-up is open', async () => {
    draft = null
    const open = { ...SET, signup: { open: true, joinable: true, closes_at: '2026-10-09T15:59:00Z' } }
    const w = await mountPanel({ ...ASSIGNMENT, my_group: null }, open)
    expect(w.text()).toContain('Sign-up is open until')
    expect(w.text()).toContain('choose a group to join')
    w.unmount()
  })
})
