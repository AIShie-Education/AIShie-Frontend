import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { ConversationView, Respondent } from '@/api/types'

let conversations: ConversationView[] = []
let inbox: () => Promise<unknown>
const calls: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args })
      if (tool === 'conversation.list') {
        // Oldest first by id, paged after an id, as Core lists them.
        const limit = args.limit as number
        const after = args.after as string | undefined
        const rest = conversations.filter((c) => !after || c.id > after)
        const page = rest.slice(0, limit)
        return { conversations: page, next: page.length === limit ? page.at(-1)!.id : undefined }
      }
      if (tool === 'conversation.inbox') return inbox()
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const { useConversationList, useInbox, sortRespondents, LIST_PAGE, LIST_POLL_MS } =
  await import('./useConversationList')
const { ApiError } = await import('@/api/http')

function conv(n: number, lastAt: string | null = null): ConversationView {
  return {
    id: `c${String(n).padStart(4, '0')}`,
    status: 'open',
    state: 'answered',
    created_at: new Date(Date.UTC(2026, 8, 1) + n * 60_000).toISOString(),
    last_message_at: lastAt,
    opener: { member_id: 'o', display_name: 'Opener', kind: 'human' },
    respondent: {
      member_id: 'r',
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

describe('useInbox', () => {
  it('counts what waits for the caller’s answer', async () => {
    inbox = async () => ({ conversations: [conv(1), conv(2)] })
    const { out, dispose } = inScope(() => useInbox({ courseId: 'k' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.count.value).toBe(2)
    expect(out.ids.value.has('c0002')).toBe(true)
    dispose()
  })

  it('counts nothing for a seat that may not answer', async () => {
    inbox = async () => {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'no' })
    }
    const { out, dispose } = inScope(() => useInbox({ courseId: 'k' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.count.value).toBe(0)
    dispose()
  })
})

describe('sortRespondents', () => {
  it('puts the caller’s own agents first, then agents, then people, each by name', () => {
    const r = (name: string, kind: string, mine = false) =>
      ({
        member_id: name,
        display_name: name,
        kind,
        role: 'assistant',
        is_my_delegate: mine,
        answer_level: 'autonomous',
      }) as Respondent
    const out = sortRespondents([
      r('Zed', 'human'),
      r('Tutor B', 'agent'),
      r('Mine', 'agent', true),
      r('Tutor A', 'agent'),
    ])
    expect(out.map((x) => x.display_name)).toEqual(['Mine', 'Tutor A', 'Tutor B', 'Zed'])
  })
})
