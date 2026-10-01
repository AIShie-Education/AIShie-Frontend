import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { ref } from 'vue'
import type { ConversationView, Respondent } from '@/api/types'

let conversations: ConversationView[] = []
let respondents: Respondent[] = []
const calls: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      if (tool === 'conversation.list') {
        // Oldest first by id, paged after an id, as Core lists them; one agent's, when asked.
        const limit = args.limit as number
        const after = args.after as string | undefined
        const only = args.respondent_member_id as string | undefined
        const rest = conversations.filter((c) => (!after || c.id > after) && (!only || c.respondent.member_id === only))
        const page = rest.slice(0, limit)
        return { conversations: page, next: page.length === limit ? page.at(-1)!.id : undefined }
      }
      if (tool === 'conversation.respondents') return { respondents }
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const {
  useConversationList,
  useRespondents,
  sortRespondents,
  LIST_PAGE,
  LIST_POLL_MS,
  RESPONDENTS_POLL_MS,
} = await import('./useConversationList')

function conv(n: number, lastAt: string | null = null, respondent = 'r'): ConversationView {
  return {
    id: `c${String(n).padStart(4, '0')}`,
    status: 'open',
    state: 'answered',
    created_at: new Date(Date.UTC(2026, 8, 1) + n * 60_000).toISOString(),
    last_message_at: lastAt,
    opener: { member_id: 'o', display_name: 'Opener', kind: 'human' },
    respondent: {
      member_id: respondent,
      display_name: 'Tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
  }
}

function inScope<T>(make: () => T) {
  const scope = effectScope()
  return { out: scope.run(make)!, dispose: () => scope.stop() }
}

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  conversations = []
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('useConversationList', () => {
  it('lists the caller’s part with the latest activity first', async () => {
    conversations = [conv(1, '2026-09-20T00:00:00Z'), conv(2), conv(3, '2026-09-25T00:00:00Z')]
    const { out, dispose } = inScope(() => useConversationList({ courseId: 'k', as: 'opener' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls[0]!.args).toMatchObject({ course_id: 'k', as: 'opener', limit: LIST_PAGE })
    expect(out.items.value.map((c) => c.id)).toEqual(['c0003', 'c0001', 'c0002'])
    expect(out.hasMore.value).toBe(false)
    dispose()
  })

  it('loads more pages, and reads them all again on refresh without emptying the list', async () => {
    conversations = Array.from({ length: LIST_PAGE + 10 }, (_, i) => conv(i + 1))
    const { out, dispose } = inScope(() => useConversationList({ courseId: 'k', as: 'respondent' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.items.value).toHaveLength(LIST_PAGE)
    expect(out.hasMore.value).toBe(true)
    await out.loadMore()
    expect(out.items.value).toHaveLength(LIST_PAGE + 10)
    expect(out.hasMore.value).toBe(false)
    conversations.push(conv(999, '2026-09-26T00:00:00Z'))
    calls.length = 0
    const refreshing = out.refresh()
    expect(out.items.value).toHaveLength(LIST_PAGE + 10) // still shown while read again
    await refreshing
    expect(calls).toHaveLength(2)
    expect(out.items.value[0]!.id).toBe('c0999')
    expect(out.loading.value).toBe(false)
    dispose()
  })

  it('lists one agent’s conversations when given its seat, asking Core for those alone, and reads afresh for another', async () => {
    conversations = [conv(1, null, 'tutor'), conv(2, null, 'helper'), conv(3, '2026-09-26T00:00:00Z', 'tutor')]
    const agent = ref<string | null>('tutor')
    const { out, dispose } = inScope(() => useConversationList({ courseId: 'k', as: 'overseer', respondent: agent }))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.args)).toEqual([
      { course_id: 'k', as: 'overseer', limit: LIST_PAGE, respondent_member_id: 'tutor' },
    ])
    expect(out.items.value.map((c) => c.id)).toEqual(['c0003', 'c0001'])

    calls.length = 0
    agent.value = 'helper'
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.args.respondent_member_id)).toEqual(['helper'])
    expect(out.items.value.map((c) => c.id)).toEqual(['c0002'])

    // No agent: nothing is asked, and nothing listed (never every agent's).
    calls.length = 0
    agent.value = null
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(0)
    expect(out.items.value).toEqual([])
    dispose()
  })

  it('keeps itself fresh while enabled', async () => {
    conversations = [conv(1)]
    const { out, dispose } = inScope(() => useConversationList({ courseId: 'k', as: 'overseer' }))
    await vi.advanceTimersByTimeAsync(0)
    conversations.push(conv(2, '2026-09-26T00:00:00Z'))
    await vi.advanceTimersByTimeAsync(LIST_POLL_MS)
    expect(out.items.value.map((c) => c.id)).toEqual(['c0002', 'c0001'])
    dispose()
  })
})

describe('sortRespondents', () => {
  it('puts the course’s agents first, then the caller’s own, each by name', () => {
    const r = (name: string, kind: string, mine = false) =>
      ({
        member_id: name,
        display_name: name,
        kind,
        role: 'assistant',
        is_my_delegate: mine,
        answer_level: 'autonomous',
      }) as Respondent
    const out = sortRespondents([r('Tutor B', 'agent'), r('Mine', 'agent', true), r('Tutor A', 'agent')])
    expect(out.map((x) => x.display_name)).toEqual(['Tutor A', 'Tutor B', 'Mine'])
  })
})

describe('useRespondents', () => {
  it('reads at once, or, lazy, only once first enabled', async () => {
    respondents = []
    const eager = inScope(() => useRespondents({ courseId: 'k' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.filter((c) => c.tool === 'conversation.respondents')).toHaveLength(1)
    eager.dispose()

    calls.length = 0
    const on = ref(false)
    const lazy = inScope(() => useRespondents({ courseId: 'k', lazy: true, enabled: on }))
    await lazy.out.refresh()
    await vi.advanceTimersByTimeAsync(RESPONDENTS_POLL_MS)
    expect(calls).toHaveLength(0)
    on.value = true
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.tool)).toEqual(['conversation.respondents'])
    expect(lazy.out.loaded.value).toBe(true)
    lazy.dispose()
  })
})

