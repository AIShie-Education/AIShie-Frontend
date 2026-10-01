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
const { default: CreateAgentDialog } = await import('./CreateAgentDialog.vue')

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
  const w = mount(CreateAgentDialog, { props: { modelValue: true, counted: 0 }, global, attachTo: document.body })
  await flushPromises()
  return w
}

async function name(w: VueWrapper, v: string) {
  await w.find('input[type=text], input:not([type])').setValue(v)
}

function options(w: VueWrapper) {
  return w.findAll('.hosting-choice__option')
}

async function submit(w: VueWrapper) {
  const button = w.findAll('.el-dialog__footer .el-button').find((b) => b.text() === 'Create agent')!
  await button.trigger('click')
  await flushPromises()
  await new Promise((r) => setTimeout(r, 0))
  await flushPromises()
}

describe('CreateAgentDialog', () => {
  it('asks how the agent runs, with both ways said and neither chosen, and says it cannot be changed after', async () => {
    const w = await open()
    const [runtime, mcp] = options(w)
    expect(runtime.text()).toContain('Hosted on AIshie')
    expect(runtime.text()).toContain('AIshie runs it; members of its courses can ask it on the site.')
    expect(mcp.text()).toContain('MCP access')
    expect(mcp.text()).toContain('Claude Desktop')
    expect(mcp.text()).toContain('nobody can ask it on the site')
    expect(w.findAll('.hosting-choice__option.is-checked')).toHaveLength(0)
    expect(w.find('.hosting-choice__fixed').text()).toBe('This cannot be changed after it is created.')
    // Nothing is said of what comes next until a way is chosen.
    expect(w.find('.create-agent__next').exists()).toBe(false)
  })

  it('creates nothing until a way is chosen', async () => {
    const w = await open()
    await name(w, 'Study helper')
    await submit(w)
    expect(writes).toEqual([])
    expect(w.emitted('created')).toBeUndefined()
  })

  it('creates a runtime agent, says what comes next for it, and tells the page how it runs', async () => {
    const w = await open()
    await name(w, '  Study helper ')
    await options(w)[0].find('input').setValue(true)
    expect(w.find('.create-agent__next').text()).toContain('host it on AIshie')
    expect(w.find('.create-agent__next').text()).not.toContain('token, and connect')
    await submit(w)
    expect(writes).toEqual([{ tool: 'agent.create', args: { display_name: 'Study helper', hosting: 'runtime' } }])
    expect(w.emitted('created')).toEqual([['0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b', 'Study helper', 'runtime']])
  })

  it('creates an mcp agent, and says a token for one’s own tool comes next', async () => {
    const w = await open()
    await name(w, 'Desk notes')
    await options(w)[1].find('input').setValue(true)
    expect(w.find('.create-agent__next').text()).toContain('give it a token')
    await submit(w)
    expect(writes).toEqual([{ tool: 'agent.create', args: { display_name: 'Desk notes', hosting: 'mcp' } }])
  })

  it('offers the two ways in Traditional and Simplified Chinese', async () => {
    setLocale('zh-Hant')
    let w = await open()
    expect(options(w).map((o) => o.text().replace(/\s+/g, ''))).toEqual([
      '站內託管由AIshie執行；課程成員可在站內向它提問',
      'MCP存取由你自己的工具，例如ClaudeDesktop、編輯器，透過MCP使用；站內無法向它提問',
    ])
    expect(w.find('.hosting-choice__fixed').text()).toBe('建立後不能更改')
    w.unmount()
    setLocale('zh-Hans')
    w = await open()
    expect(options(w).map((o) => o.text().replace(/\s+/g, ''))).toEqual([
      '站内托管由AIshie运行；课程成员可在站内向它提问',
      'MCP访问由你自己的工具，例如ClaudeDesktop、编辑器，通过MCP使用；站内无法向它提问',
    ])
    expect(w.find('.hosting-choice__fixed').text()).toBe('创建后不能更改')
  })
})
