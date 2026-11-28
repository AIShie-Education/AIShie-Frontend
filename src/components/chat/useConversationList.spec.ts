import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { ChatAgent, ChatConversation } from '@/api/runtimeChat'

const core: string[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      core.push(tool)
      throw new Error(`Core chat call: ${tool}`)
    }),
  }
})

let agents: ChatAgent[]
let conversations: ChatConversation[]
const calls: { kind: string; opts?: Record<string, unknown> }[] = []
vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  return {
    ...real,
    runtimeChat: {
      agents: vi.fn(async () => {
        calls.push({ kind: 'agents' })
        return { agents }
      }),
      list: vi.fn(async (_course: string, opts: Record<string, unknown>) => {
        calls.push({ kind: 'list', opts })
        const start = opts.after ? conversations.findIndex((c) => c.id === opts.after) + 1 : 0
        const limit = (opts.limit as number) ?? 100
        const page = conversations.slice(start, start + limit)
        return { conversations: page, next: start + limit < conversations.length ? (page.at(-1)?.id ?? null) : null }
      }),
    },
  }
})

const { useConversationList, useRespondents, LIST_PAGE, LIST_POLL_MS } = await import('./useConversationList')

function agent(id: string, over: Partial<ChatAgent> = {}): ChatAgent {
  return { agent_id: id, display_name: id, is_my_delegate: false, answers_course: true, answer_level: 'autonomous', ...over }
}
function conversation(id: string, at: string, agentId = 'course'): ChatConversation {
  return {
    id,
    course_id: 'k1',
    agent_id: agentId,
    title: id,
    state: 'answered',
    revision: 1,
    created_at: at,
    updated_at: at,
    last_activity_at: at,
  }
}
function scoped<T>(fn: () => T) {
  const scope = effectScope()
  const out = scope.run(fn)!
  return { out, dispose: () => scope.stop() }
}

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  core.length = 0
  agents = [
    agent('z', { display_name: 'Zed', answers_course: true }),
    agent('mine', { display_name: 'A helper', is_my_delegate: true, answers_course: false }),
    agent('a', { display_name: 'Alpha', answers_course: true }),
  ]
  conversations = [
    conversation('new', '2026-11-27T02:00:00Z'),
    conversation('old', '2026-11-27T01:00:00Z'),
  ]
})
afterEach(() => vi.useRealTimers())

describe('AR chat agents and own conversation lists', () => {
  it('offers course agents first, then personal agents, each by name, without Core respondents', async () => {
    const { out, dispose } = scoped(() => useRespondents({ courseId: 'k1' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.items.value.map((a) => [a.member_id, a.display_name])).toEqual([
      ['a', 'Alpha'],
      ['z', 'Zed'],
      ['mine', 'A helper'],
    ])
    expect(out.items.value[2]!.is_my_delegate).toBe(true)
    expect(core).toEqual([])
    dispose()
  })

  it('lists and filters AR conversations by agent, latest activity first', async () => {
    conversations.push(conversation('personal', '2026-11-27T03:00:00Z', 'mine'))
    const { out, dispose } = scoped(() => useConversationList({ courseId: 'k1', as: 'opener', respondent: 'mine' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.items.value.map((c) => [c.id, c.respondent.display_name])).toEqual([['personal', 'A helper']])
    expect(calls.map((c) => c.kind)).toEqual(['agents', 'list'])
    expect(core).toEqual([])
    dispose()
  })

  it('reads another AR cursor page on loadMore, and rereads every page on refresh', async () => {
    conversations = Array.from({ length: LIST_PAGE + 1 }, (_, i) =>
      conversation(`c${i}`, new Date(Date.parse('2026-11-27T00:00:00Z') + i * 1000).toISOString()),
    )
    const { out, dispose } = scoped(() => useConversationList({ courseId: 'k1', as: 'opener' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.items.value).toHaveLength(LIST_PAGE)
    expect(out.hasMore.value).toBe(true)
    await out.loadMore()
    expect(out.items.value).toHaveLength(LIST_PAGE + 1)
    expect(calls.filter((c) => c.kind === 'list').at(-1)?.opts).toEqual({ limit: LIST_PAGE, after: `c${LIST_PAGE - 1}` })
    await out.refresh()
    expect(calls.filter((c) => c.kind === 'list').at(-1)?.opts).toEqual({ limit: LIST_PAGE, after: `c${LIST_PAGE - 1}` })
    dispose()
  })

  it('keeps an AR list fresh on its ordinary polling schedule, never by a Core long poll', async () => {
    const { out, dispose } = scoped(() => useConversationList({ courseId: 'k1', as: 'opener' }))
    await vi.advanceTimersByTimeAsync(0)
    const before = calls.filter((c) => c.kind === 'list').length
    conversations = [conversation('latest', '2026-11-27T04:00:00Z'), ...conversations]
    await vi.advanceTimersByTimeAsync(LIST_POLL_MS)
    expect(out.items.value[0]!.id).toBe('latest')
    expect(calls.filter((c) => c.kind === 'list').length).toBeGreaterThan(before)
    expect(core).toEqual([])
    dispose()
  })
})
