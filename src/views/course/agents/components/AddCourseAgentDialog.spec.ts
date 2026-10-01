import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'

const writes: { tool: string; args: Record<string, unknown> }[] = []

const AGENTS = [
  {
    actor_id: 'mcp-1',
    display_name: 'Desk notes',
    hosting: 'mcp',
    status: 'active',
    suspended_by_me: false,
    created_at: '2026-09-01T00:00:00Z',
    site_chat: false,
    live_seats: 0,
    pending_requests: 0,
  },
]

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'agent.list') return { agents: AGENTS, limit: 5, self_service: true }
      if (tool === 'member.delegate_defaults')
        return { perms: {}, student_scope: 'all', assignment_scope: 'all', level: 'autonomous', expires_at: null }
      throw new Error(`no read ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      const result = tool === 'agent.create' ? { actor_id: 'new-1' } : { member_id: 'm-1' }
      return { status: 'executed', actionId: 'a1', reviewState: 'none', result, replayed: false }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: AddCourseAgentDialog } = await import('./AddCourseAgentDialog.vue')

const pinia = createPinia()
setActivePinia(pinia)
const global = { plugins: [pinia, i18n, ElementPlus], components: icons }

beforeEach(() => {
  setLocale('en')
  writes.length = 0
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

async function open() {
  const w = mount(AddCourseAgentDialog, {
    props: { modelValue: false, courseId: 'c-1', seatedActorIds: new Set<string>() },
    global,
    attachTo: document.body,
  })
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}

const inDialog = () => document.querySelector('.add-agent')!

function submitButton() {
  return [...inDialog().querySelectorAll<HTMLButtonElement>('.el-dialog__footer .el-button')].find((b) =>
    /Add course agent|Request to add/.test(b.textContent ?? ''),
  )!
}

async function newAgent(w: VueWrapper, name: string) {
  const create = [...inDialog().querySelectorAll<HTMLInputElement>('.el-radio-button input')][1]
  create.checked = true
  create.dispatchEvent(new Event('change'))
  await flushPromises()
  const input = inDialog().querySelector<HTMLInputElement>('#add-agent-name')!
  input.value = name
  input.dispatchEvent(new Event('input'))
  await flushPromises()
  void w
}

async function choose(i: number) {
  const radio = [...inDialog().querySelectorAll<HTMLInputElement>('.hosting-choice__option input')][i]
  radio.checked = true
  radio.dispatchEvent(new Event('change'))
  await flushPromises()
}

async function submit() {
  submitButton().click()
  await flushPromises()
  await flushPromises()
}

describe('AddCourseAgentDialog: a new agent', () => {
  it('asks how it runs, with neither chosen, and adds nothing until one is', async () => {
    const w = await open()
    await newAgent(w, 'COMP1010 tutor')
    expect(inDialog().querySelectorAll('.hosting-choice__option')).toHaveLength(2)
    expect(inDialog().querySelectorAll('.hosting-choice__option.is-checked')).toHaveLength(0)
    expect(inDialog().textContent).toContain('Students ask a course agent on the site only when it is hosted on AIshie')
    expect(submitButton().disabled).toBe(true)
    await submit()
    expect(writes).toEqual([])
  })

  it('makes a runtime agent and seats it as a course agent', async () => {
    const w = await open()
    await newAgent(w, 'COMP1010 tutor')
    await choose(0)
    expect(submitButton().disabled).toBe(false)
    expect(inDialog().querySelector('.add-agent__mcp')).toBeNull()
    await submit()
    expect(writes.map((x) => x.tool)).toEqual(['agent.create', 'member.add_delegate'])
    expect(writes[0].args).toEqual({ display_name: 'COMP1010 tutor', hosting: 'runtime' })
    expect(writes[1].args).toMatchObject({ actor_id: 'new-1', answers_course: true })
  })

  it('says students cannot ask a new agent with MCP access on the site, and makes it so if asked', async () => {
    const w = await open()
    await newAgent(w, 'Marking helper')
    await choose(1)
    expect(inDialog().querySelector('.add-agent__mcp')?.textContent).toContain(
      'Students cannot ask Marking helper on the site: it has MCP access',
    )
    await submit()
    expect(writes[0].args).toEqual({ display_name: 'Marking helper', hosting: 'mcp' })
  })
})
