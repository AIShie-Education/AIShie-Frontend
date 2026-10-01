import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'

const writes: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    // No directory to compare names with, and no owners to find.
    read: vi.fn(async () => ({ actors: [], next: null })),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        result: { actor_id: '0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b' },
        replayed: false,
      }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: RegisterActorDialog } = await import('./RegisterActorDialog.vue')

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
  const w = mount(RegisterActorDialog, { props: { modelValue: true }, global, attachTo: document.body })
  await flushPromises()
  return w
}

async function asAgent(w: VueWrapper, name: string) {
  await w.findAll('.el-radio-button input').at(1)!.setValue(true)
  await w.find('input[maxlength="200"]').setValue(name)
}

async function submit(w: VueWrapper) {
  const button = w.findAll('.el-dialog__footer .el-button').find((b) => b.text() === 'Register')!
  await button.trigger('click')
  await flushPromises()
  await new Promise((r) => setTimeout(r, 0))
  await flushPromises()
}

describe('RegisterActorDialog: an agent', () => {
  it('asks a person nothing of hosting', async () => {
    const w = await open()
    expect(w.find('.hosting-choice').exists()).toBe(false)
    await w.find('input[maxlength="200"]').setValue('Chan Tai Man')
    await submit(w)
    expect(writes).toHaveLength(1)
    expect(writes[0].args.hosting).toBeUndefined()
    expect(writes[0].args.kind).toBe('human')
  })

  it('asks how an agent runs, chooses nothing for the administrator, and registers nothing until they do', async () => {
    const w = await open()
    await asAgent(w, 'grader-v3')
    expect(w.findAll('.hosting-choice__option').map((o) => o.find('.hosting-choice__title').text())).toEqual([
      'Hosted on AIshie',
      'MCP access',
    ])
    expect(w.findAll('.hosting-choice__option.is-checked')).toHaveLength(0)
    expect(w.text()).toContain('This cannot be changed after it is created.')
    await submit(w)
    expect(writes).toEqual([])
  })

  it('registers a runtime agent with its hosting, saying nobody is issued its token here', async () => {
    const w = await open()
    await asAgent(w, 'lab-runner')
    await w.findAll('.hosting-choice__option input').at(0)!.setValue(true)
    expect(w.text()).toContain('The site’s agent runtime alone is issued its token')
    await submit(w)
    expect(writes).toEqual([
      { tool: 'actor.register', args: { kind: 'agent', display_name: 'lab-runner', hosting: 'runtime' } },
    ])
    expect(w.emitted('registered')![0][0]).toMatchObject({ kind: 'agent', hosting: 'runtime' })
  })

  it('registers an mcp agent with its hosting, saying its tokens are issued on its page', async () => {
    const w = await open()
    await asAgent(w, 'grader-v3')
    await w.findAll('.hosting-choice__option input').at(1)!.setValue(true)
    expect(w.text()).toContain('Issue it API tokens on its page')
    await submit(w)
    expect(writes).toEqual([
      { tool: 'actor.register', args: { kind: 'agent', display_name: 'grader-v3', hosting: 'mcp' } },
    ])
  })
})
