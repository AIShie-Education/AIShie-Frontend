import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatApproval, ChatMessage, ChatSnapshot } from '@/api/runtimeChat'
import { RuntimeError } from '@/api/runtime'
import { i18n, setLocale } from '@/i18n'
import ArApprovalsSection from './ArApprovalsSection.vue'
import type { ArApprovalDetail } from './arApprovals'

const api = vi.hoisted(() => ({
  approvals: vi.fn(),
  approval: vi.fn(),
  decide: vi.fn(),
  review: vi.fn(),
  key: vi.fn(),
  download: vi.fn(),
  ownerDownload: vi.fn(),
  coreRead: vi.fn(),
  coreWrite: vi.fn(),
}))
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: api.coreRead,
  write: api.coreWrite,
}))
vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  return {
    ...real,
    runtimeChat: {
      ...real.runtimeChat,
      approvals: api.approvals,
      approval: api.approval,
      decide: api.decide,
      review: api.review,
    },
    downloadChatApprovalAttachmentBytes: api.download,
    downloadChatAttachmentBytes: api.ownerDownload,
    chatIdempotencyKey: () => api.key(),
  }
})

const COURSE = 'course-1'
const EMPTY = { approvals: [], next: null }

function fixture(id: string, status: 'pending' | 'posted' = 'pending'): ArApprovalDetail {
  const messageId = `answer-${id}`
  const approval: ChatApproval = {
    id,
    course_id: COURSE,
    conversation_id: `conversation-${id}`,
    subject: 'answer',
    message_id: messageId,
    state: 'pending',
    created_at: '2026-11-27T08:00:00Z',
  }
  const question: ChatMessage = {
    id: `question-${id}`,
    conversation_id: approval.conversation_id,
    seq: 1,
    role: 'user',
    status: 'posted',
    body: `How does binary search work? (${id})`,
    created_at: '2026-11-27T07:59:00Z',
    attachments: [{ id: `attachment-${id}`, filename: `notes-${id}.txt`, media_type: 'text/plain', size: 128 }],
  }
  const answer: ChatMessage = {
    id: messageId,
    conversation_id: approval.conversation_id,
    seq: 2,
    role: 'assistant',
    status,
    body: `Compare the **middle** element first. (${id})`,
    created_at: '2026-11-27T08:00:00Z',
    sources: [{ document_id: `private-document-${id}`, version_id: 'v1', file_id: 'f1', page: 2 }],
    sources_stated: true,
  }
  const snapshot: ChatSnapshot = {
    conversation: {
      id: approval.conversation_id,
      course_id: COURSE,
      agent_id: 'agent-1',
      title: `Searching (${id})`,
      state: status === 'pending' ? 'reply_pending_approval' : 'answered',
      revision: 2,
      created_at: question.created_at,
      updated_at: answer.created_at,
      last_activity_at: answer.created_at,
    },
    messages: [question, answer],
    more: false,
    draft: null,
  }
  return { approval, snapshot }
}

function decided(source: ArApprovalDetail, state: ChatApproval['state'], status: 'pending' | 'posted' = 'posted') {
  return {
    approval: { ...source.approval, state, decided_at: '2026-11-27T08:01:00Z' },
    snapshot: {
      ...source.snapshot,
      messages: source.snapshot.messages.map((m) => (m.id === source.approval.message_id ? { ...m, status } : m)),
    },
  } satisfies ArApprovalDetail
}

/** One initial queue page, then an empty read after a successful action. */
function queue(details: ArApprovalDetail[], emptyAfter = false) {
  if (emptyAfter) api.approvals.mockResolvedValueOnce({ approvals: details.map((d) => d.approval), next: null }).mockResolvedValue(EMPTY)
  else api.approvals.mockResolvedValue({ approvals: details.map((d) => d.approval), next: null })
  api.approval.mockImplementation(async (id: string) => {
    const detail = details.find((d) => d.approval.id === id)
    if (!detail) throw new Error(`unexpected approval ${id}`)
    return detail
  })
}

async function mountSection() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/courses/:courseId/documents/:documentId', name: 'course-document', component: { render: () => null } },
    ],
  })
  await router.push('/')
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(ArApprovalsSection, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        i18n,
        ElementPlus,
        router,
        { install: (app) => Object.entries(Icons).forEach(([name, component]) => app.component(name, component)) },
      ],
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  for (const mock of Object.values(api)) mock.mockReset()
  api.approvals.mockResolvedValue(EMPTY)
  let n = 0
  api.key.mockImplementation(() => `intent-${++n}`)
  api.download.mockResolvedValue({ blob: new Blob(['reviewer']), filename: 'review.txt', contentType: 'text/plain' })
  api.ownerDownload.mockResolvedValue({ blob: new Blob(['owner']), filename: 'owner.txt', contentType: 'text/plain' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})
enableAutoUnmount(afterEach)

describe('ArApprovalsSection list and detail', () => {
  it('reads AR only and shows the question, attachments, pending answer and sources', async () => {
    const detail = fixture('a1')
    queue([detail])
    const w = await mountSection()

    expect(api.approvals).toHaveBeenCalledWith(COURSE, {
      state: 'pending',
      limit: 50,
      after: undefined,
      signal: expect.any(AbortSignal),
    })
    expect(api.approval).toHaveBeenCalledWith('a1', { signal: expect.any(AbortSignal) })
    expect(w.text()).toContain('How does binary search work? (a1)')
    expect(w.text()).toContain('notes-a1.txt')
    expect(w.text()).toContain('Compare the middle element first. (a1)')
    expect(w.text()).toContain('Course material · page 2')
    expect(w.text()).toContain('The person who asked cannot see this answer unless it is approved.')
    expect(w.find('[data-action="approve"]').exists()).toBe(true)
    expect(w.find('[data-action="review"]').exists()).toBe(false)
    // A source location is useful without exposing its private document id.
    expect(w.text()).not.toContain('private-document-a1')
    expect(api.coreRead).not.toHaveBeenCalled()
    expect(api.coreWrite).not.toHaveBeenCalled()
  })

  it('uses only the reviewer attachment route, with no owner-route fallback after not_found', async () => {
    queue([fixture('a1')])
    api.download.mockRejectedValue(
      new RuntimeError({ status: 404, code: 'not_found', reason: 'not_found', message: 'non-reviewer detail' }),
    )
    const w = await mountSection()
    await w.get('[data-action="download"]').trigger('click')
    await flushPromises()

    expect(api.download).toHaveBeenCalledWith('a1', 'attachment-a1', { filename: 'notes-a1.txt' })
    expect(api.ownerDownload).not.toHaveBeenCalled()
    expect(api.coreRead).not.toHaveBeenCalled()
    expect(api.coreWrite).not.toHaveBeenCalled()
    expect(w.find('.ar-approval-card__error').text()).toContain('The attachment could not be downloaded')
    expect(w.text()).not.toContain('non-reviewer detail')
  })

  it('puts a posted target in post-review and offers review, not another approval', async () => {
    queue([fixture('review-1', 'posted')])
    const w = await mountSection()
    expect(w.text()).toContain('Posted chat awaiting review')
    expect(w.find('[data-action="review"]').exists()).toBe(true)
    expect(w.find('[data-action="approve"]').exists()).toBe(false)
    expect(w.text()).toContain('it changes nothing sent')
  })

  it('omits detail AR refuses with not_found, without showing its error or anyone else’s content', async () => {
    const visible = fixture('visible')
    queue([fixture('private'), visible])
    api.approval.mockImplementation(async (id: string) => {
      if (id === 'private') throw new RuntimeError({ status: 404, code: 'not_found', reason: 'not_found', message: 'private provider detail' })
      return visible
    })
    const w = await mountSection()
    expect(w.findAll('.ar-approval-card')).toHaveLength(1)
    expect(w.text()).toContain('(visible)')
    expect(w.text()).not.toContain('private provider detail')
    expect(w.find('.ar-approvals__error').exists()).toBe(false)
  })

  it('hides the whole queue on an authorization refusal', async () => {
    api.approvals.mockRejectedValue(
      new RuntimeError({ status: 403, code: 'forbidden', reason: 'forbidden', message: 'private refusal' }),
    )
    const w = await mountSection()
    expect(w.find('.ar-approvals').exists()).toBe(false)
    expect(w.text()).not.toContain('private refusal')
  })

  it('uses a safe list error and can retry it', async () => {
    api.approvals
      .mockRejectedValueOnce(
        new RuntimeError({ status: 503, code: 'internal', reason: 'internal', message: 'provider api_key=secret' }),
      )
      .mockResolvedValueOnce(EMPTY)
    const w = await mountSection()
    expect(w.text()).toContain('Chat approvals could not be loaded')
    expect(w.text()).not.toContain('provider')
    expect(w.text()).not.toContain('secret')
    await w.get('[data-action="retry-list"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('No chat questions or answers are waiting')
  })
})

describe('ArApprovalsSection decisions', () => {
  it('treats approval and a pending-to-posted answer snapshot as success, then refreshes', async () => {
    const detail = fixture('a1')
    queue([detail], true)
    api.decide.mockResolvedValue(decided(detail, 'approved', 'posted'))
    const w = await mountSection()

    await w.get('[data-action="approve"]').trigger('click')
    await flushPromises()
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()

    expect(api.decide).toHaveBeenCalledWith('a1', {
      decision: 'approve',
      reason: undefined,
      idempotency_key: 'intent-1',
    })
    expect(api.approvals).toHaveBeenCalledTimes(2)
    expect(w.find('.ar-approvals__notice').text()).toContain('Approved. The answer is now visible')
    expect(w.find('.ar-approval-card__error').exists()).toBe(false)
    expect(w.find('.ar-approval-card').exists()).toBe(false)
    expect(api.coreWrite).not.toHaveBeenCalled()
  })

  it('records rejection as a successful explicit decision', async () => {
    const detail = fixture('a1')
    queue([detail], true)
    api.decide.mockResolvedValue(decided(detail, 'rejected'))
    const w = await mountSection()
    await w.get('[data-action="reject"]').trigger('click')
    await flushPromises()
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(api.decide).toHaveBeenCalledWith('a1', expect.objectContaining({ decision: 'reject', reason: undefined }))
    expect(w.find('.ar-approvals__notice').text()).toContain('Rejected. Nothing was posted.')
    expect(w.find('.ar-approval-card__error').exists()).toBe(false)
  })

  it('requires a changes reason, trims it, and sends the canonical changes_requested decision', async () => {
    const detail = fixture('a1')
    queue([detail], true)
    api.decide.mockResolvedValue(decided(detail, 'changes_requested'))
    const w = await mountSection()
    await w.get('[data-action="changes_requested"]').trigger('click')
    await flushPromises()
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(api.decide).not.toHaveBeenCalled()
    expect(w.text()).toContain('Say what should change before sending this back.')

    await w.get('textarea').setValue('  Add the course citation.  ')
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(api.decide).toHaveBeenCalledWith('a1', {
      decision: 'changes_requested',
      reason: 'Add the course citation.',
      idempotency_key: 'intent-1',
    })
    expect(w.find('.ar-approvals__notice').text()).toContain('Changes requested. Nothing was posted.')
  })

  it('replays one exact intention under the same key after a lost answer, without leaking its error', async () => {
    const detail = fixture('a1')
    queue([detail], true)
    api.decide
      .mockRejectedValueOnce(
        new RuntimeError({ status: 0, code: 'network', reason: 'network', message: 'openrouter provider secret' }),
      )
      .mockResolvedValueOnce(decided(detail, 'changes_requested'))
    const w = await mountSection()
    await w.get('[data-action="changes_requested"]').trigger('click')
    await flushPromises()
    await w.get('textarea').setValue('Keep this exact reason')
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(w.find('.ar-approval-card__error').text()).toContain('The decision was not recorded')
    expect(w.text()).not.toContain('openrouter')
    expect(w.text()).not.toContain('secret')

    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(api.decide.mock.calls.map((call) => call[1])).toEqual([
      { decision: 'changes_requested', reason: 'Keep this exact reason', idempotency_key: 'intent-1' },
      { decision: 'changes_requested', reason: 'Keep this exact reason', idempotency_key: 'intent-1' },
    ])
    expect(api.key).toHaveBeenCalledTimes(1)
    expect(w.find('.ar-approvals__notice').text()).toContain('Changes requested')
  })

  it('explains reviewer_confirmation_required as a refusal, never as a successful proposal', async () => {
    const detail = fixture('a1')
    queue([detail])
    api.decide.mockRejectedValue(
      new RuntimeError({
        status: 422,
        code: 'failed_precondition',
        reason: 'reviewer_confirmation_required',
        message: 'provider internals must not appear',
        details: { reason: 'reviewer_confirmation_required' },
      }),
    )
    const w = await mountSection()
    await w.get('[data-action="approve"]').trigger('click')
    await flushPromises()
    await w.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(w.find('.ar-approval-card__error').text()).toContain('Your seat requires someone else to confirm decisions')
    expect(w.text()).toContain('Nothing was executed or recorded')
    expect(w.text()).not.toContain('provider internals')
    expect(w.find('.ar-approvals__notice').exists()).toBe(false)
    expect(api.approvals).toHaveBeenCalledTimes(1)
  })
})

describe('ArApprovalsSection post-review', () => {
  it('marks a posted answer reviewed with one stable key and reports success', async () => {
    const detail = fixture('r1', 'posted')
    queue([detail], true)
    api.review.mockResolvedValue(decided(detail, 'reviewed', 'posted'))
    const w = await mountSection()
    await w.get('[data-action="review"]').trigger('click')
    await flushPromises()
    expect(api.review).toHaveBeenCalledWith('r1', { idempotency_key: 'intent-1' })
    expect(w.find('.ar-approvals__notice').text()).toContain('Marked as reviewed')
    expect(w.find('.ar-approval-card__error').exists()).toBe(false)
    expect(api.approvals).toHaveBeenCalledTimes(2)
  })

  it('keeps the review key on retry and shows only safe failure words', async () => {
    const detail = fixture('r1', 'posted')
    queue([detail], true)
    api.review
      .mockRejectedValueOnce(new RuntimeError({ status: 500, code: 'internal', reason: 'internal', message: 'raw provider failure' }))
      .mockResolvedValueOnce(decided(detail, 'reviewed', 'posted'))
    const w = await mountSection()
    await w.get('[data-action="review"]').trigger('click')
    await flushPromises()
    expect(w.find('.ar-approval-card__error').text()).toContain('The review was not recorded')
    expect(w.text()).not.toContain('raw provider failure')
    await w.get('[data-action="review"]').trigger('click')
    await flushPromises()
    expect(api.review.mock.calls.map((call) => call[1])).toEqual([
      { idempotency_key: 'intent-1' },
      { idempotency_key: 'intent-1' },
    ])
    expect(api.key).toHaveBeenCalledTimes(1)
    expect(w.find('.ar-approvals__notice').text()).toContain('Marked as reviewed')
  })
})

describe('ArApprovalsSection translations', () => {
  it.each([
    ['en', 'AI chat approvals'],
    ['zh-Hant', 'AI 對話審批'],
    ['zh-Hans', 'AI 对话审批'],
  ] as const)('has the section copy in %s', async (locale, title) => {
    setLocale(locale)
    const w = await mountSection()
    expect(w.find('.ar-approvals__head').text()).toContain(title)
    expect(w.text()).toContain(i18n.global.t('actions.arApprovals.empty'))
  })
})
