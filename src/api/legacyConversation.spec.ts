import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: transport.read, write: transport.write }
})

const { legacyConversation } = await import('./legacyConversation')

beforeEach(() => {
  transport.read.mockReset()
  transport.write.mockReset()
})

describe('legacyConversation Core read boundary', () => {
  it('lists only the caller-readable Core history, following its opaque cursor', async () => {
    const controller = new AbortController()
    transport.read.mockResolvedValue({ conversations: [{ conversation_id: 'old-1' }], next: 'page-3' })

    await expect(
      legacyConversation.list({ courseId: 'course-1', after: 'page-2', limit: 25, signal: controller.signal }),
    ).resolves.toEqual({ conversations: [{ conversation_id: 'old-1' }], next: 'page-3' })

    expect(transport.read).toHaveBeenCalledWith(
      'me.conversations',
      { course_id: 'course-1', after: 'page-2', limit: 25 },
      { signal: controller.signal },
    )
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('uses Core overseer scope for staff logs, never an AR own-conversation list', async () => {
    transport.read.mockResolvedValue({ conversations: [{ id: 'old-staff-1' }], next: 'older-staff-page' })

    await expect(
      legacyConversation.overseerList('course-1', {
        respondentMemberId: 'agent-seat-1',
        after: 'staff-page-1',
        limit: 75,
      }),
    ).resolves.toEqual({ conversations: [{ id: 'old-staff-1' }], next: 'older-staff-page' })

    expect(transport.read).toHaveBeenCalledWith(
      'conversation.list',
      {
        course_id: 'course-1',
        as: 'overseer',
        respondent_member_id: 'agent-seat-1',
        after: 'staff-page-1',
        limit: 75,
      },
      { signal: undefined },
    )
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('reads Core visible_to for the privacy dialog while stripping its live draft', async () => {
    transport.read.mockResolvedValue({
      id: 'old-1',
      state: 'answered',
      visible_to: ['participants', 'overseers', 'audit_export'],
      draft: { text: 'live data that is not reader metadata' },
    })

    const out = await legacyConversation.get('course-1', 'old-1')

    expect(transport.read).toHaveBeenCalledWith(
      'conversation.get',
      { course_id: 'course-1', conversation_id: 'old-1' },
      { signal: undefined },
    )
    expect(out).toEqual({
      conversation: { id: 'old-1', state: 'answered' },
      visibleTo: ['participants', 'overseers', 'audit_export'],
    })
    expect(out.conversation).not.toHaveProperty('draft')
    expect(out.conversation).not.toHaveProperty('visible_to')
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('reads a finite older page without long-poll arguments or exposing a live draft', async () => {
    transport.read.mockResolvedValue({
      conversation: { id: 'old-1', state: 'awaiting_answer' },
      messages: [{ id: 'old-message-1', seq: 4 }],
      more: true,
      draft: { text: 'live data that does not belong in the archive' },
    })

    const out = await legacyConversation.messages('course-1', 'old-1', { beforeSeq: 9, limit: 40 })

    expect(transport.read).toHaveBeenCalledWith(
      'conversation.messages',
      { course_id: 'course-1', conversation_id: 'old-1', before_seq: 9, limit: 40 },
      { signal: undefined },
    )
    const args = transport.read.mock.calls[0]![1] as Record<string, unknown>
    expect(args).not.toHaveProperty('after_seq')
    expect(args).not.toHaveProperty('wait_s')
    expect(args).not.toHaveProperty('seen_state')
    expect(args).not.toHaveProperty('seen_draft_version')
    expect(out).toEqual({
      conversation: { id: 'old-1', state: 'awaiting_answer' },
      messages: [{ id: 'old-message-1', seq: 4 }],
      more: true,
    })
    expect(out).not.toHaveProperty('draft')
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('gets a fresh attachment URL through Core mayRead, with no companion write', async () => {
    transport.read.mockResolvedValue({ id: 'file-1', download_url: 'https://files.example.test/old-file' })

    await expect(legacyConversation.attachment('course-1', 'file-1')).resolves.toMatchObject({ id: 'file-1' })

    expect(transport.read).toHaveBeenCalledWith(
      'conversation.attachment',
      { course_id: 'course-1', attachment_id: 'file-1' },
      { signal: undefined },
    )
    expect(transport.write).not.toHaveBeenCalled()
  })
})
