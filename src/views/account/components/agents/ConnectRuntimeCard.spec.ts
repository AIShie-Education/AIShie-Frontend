import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import { CORE_ORIGIN, MCP_ENDPOINT } from '@/api/http'
import ConnectRuntimeCard from './ConnectRuntimeCard.vue'
import AgentTokenRevealDialog from './AgentTokenRevealDialog.vue'
import type { SetupProgress } from './agents'
import { newToken } from './hostingFakes'

const global = { plugins: [createPinia(), i18n, ElementPlus], components: icons }
const ACTOR = '0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b'
/** A live token in Core's shape, anywhere in the page. */
const TOKEN_SHAPE = /ais_[a-z2-7]{12}_[A-Za-z0-9_-]{20,}/

function card(progress: SetupProgress, extra: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(ConnectRuntimeCard, {
    props: { name: 'Study helper', actorId: ACTOR, progress, lastSeenAt: null, seats: 0, ...extra },
    slots,
    global,
  })
}

async function choose(w: VueWrapper, which: 'hosted' | 'tool' | 'runtime') {
  await w.find(`.connect-choice--${which} input`).setValue(true)
  await flushPromises()
}

const choices = (w: VueWrapper) => w.findAll('.connect-choice__title').map((c) => c.text())

beforeEach(() => setLocale('en'))
afterEach(() => setLocale('en'))
enableAutoUnmount(afterEach)

describe('ConnectRuntimeCard: three ways, one brain', () => {
  it('offers hosting on AIShie first, then another AI tool, then the AIShie runtime as the advanced way', () => {
    const w = card({ token: 'todo', connected: 'todo', course: 'todo' }, { hosting: true }, { hosted: '<p class="offer">host</p>' })
    expect(w.text()).toContain('How this agent runs')
    expect(w.text()).toContain('one brain at a time')
    expect(choices(w)).toEqual([
      'Host it on AIshie Recommended',
      'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
      'Run the AIshie runtime yourself (advanced)',
    ])
    // Hosting is chosen, and shows no token, no endpoint and no file.
    expect(w.find('.offer').exists()).toBe(true)
    expect(w.find('.copy-block').exists()).toBe(false)
    expect(w.text()).not.toContain('yaml')
  })

  it('says it in Traditional Chinese too', () => {
    setLocale('zh-Hant')
    const w = card({ token: 'todo', connected: 'todo', course: 'todo' }, { hosting: true })
    expect(choices(w)).toEqual(['交給 AIshie 代管 推薦', '用其他 AI 工具連接（Claude、ChatGPT、代理 SDK…）', '自己架 runtime（進階）'])
  })

  it('without hosting, offers the other two, another AI tool first', () => {
    const w = card({ token: 'todo', connected: 'todo', course: 'todo' }, {}, { hosted: '<p class="offer">host</p>' })
    expect(choices(w)).toEqual([
      'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
      'Run the AIshie runtime yourself (advanced)',
    ])
    expect(w.find('.offer').exists()).toBe(false)
    expect(w.text()).not.toContain('Host it on AIshie')
    expect(w.text()).toContain('MCP endpoint')
  })
})

describe('ConnectRuntimeCard: another AI tool', () => {
  it('gives the MCP endpoint and the header, a New token button, and where they go in Claude', async () => {
    const w = card({ token: 'todo', connected: 'todo', course: 'todo' }, { hosting: true })
    await choose(w, 'tool')
    const blocks = w.findAll('.copy-block__text').map((b) => b.text())
    expect(blocks).toEqual([MCP_ENDPOINT, 'Authorization: Bearer <token>'])
    expect(w.text()).toContain(
      'In Claude: add a custom connector with this URL, choose “No sign-in”, and add a header named authorization with the value Bearer <token>.',
    )
    const issue = w.find('.connect-card__issue')
    expect(issue.text()).toBe('New token')
    await issue.trigger('click')
    expect(w.emitted('issue')).toBeTruthy()
    // No agent file here: that is for someone who runs the AIShie runtime.
    expect(w.text()).not.toContain('token_ref')
    expect(w.text()).not.toMatch(/CORE_MCP_URL|AISHITERU_TOKEN/)
  })

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = card({ token: 'done', connected: 'waiting', course: 'todo' })
    expect(w.text()).toContain('在 Claude 中：用這個網址新增自訂連接器，選擇「No sign-in」')
    expect(w.text()).toContain('它已有一個有效的權杖。')
  })

  it('says whether anything has connected with a token', () => {
    const w = card({ token: 'done', connected: 'waiting', course: 'todo' }, { watching: true })
    expect(w.text()).toContain('It has a token that works.')
    expect(w.text()).toContain('Waiting for it to connect… this page checks every few seconds.')
  })
})

describe('ConnectRuntimeCard: the AIShie runtime, run oneself', () => {
  it('keeps the agent file folded away until asked for, says its model is an example, and never holds a token', async () => {
    const w = card({ token: 'done', connected: 'done', course: 'done' }, { hosting: true })
    await choose(w, 'runtime')
    const file = w.find('details.own-runtime__file')
    expect(file.exists()).toBe(true)
    expect(file.attributes('open')).toBeUndefined()
    const yaml = file.find('.copy-block__text').text()
    expect(yaml).toContain(`base_url: ${CORE_ORIGIN}`)
    expect(yaml).toContain('token_ref: secret://agents/study-helper/core_token')
    expect(yaml).not.toMatch(TOKEN_SHAPE)
    expect(yaml).not.toContain('ais_')
    expect(file.text()).toContain('The model block is only an example: change it to your own provider, model and key.')
    expect(file.text()).toContain('AISHIE_SECRET_AGENTS_STUDY_HELPER_CORE_TOKEN')
    expect(w.text()).toContain('For someone who operates an AIshie Agent Runtime')
    expect(w.html()).not.toMatch(TOKEN_SHAPE)
  })

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = card({ token: 'done', connected: 'done', course: 'done' })
    await choose(w, 'runtime')
    expect(w.text()).toContain('AIshie Agent Runtime 的代理檔案（YAML）')
    expect(w.text()).toContain('model 區塊只是示例')
  })
})

describe('ConnectRuntimeCard: courses', () => {
  it('offers to bring it into a course whatever runs it', async () => {
    const w = card({ token: 'todo', connected: 'todo', course: 'todo' }, { hosting: true })
    expect(w.find('.connect-card__course').text()).toContain('It can do nothing until it is in a course')
    await w.find('.connect-card__course button').trigger('click')
    expect(w.emitted('bring')).toBeTruthy()
    const done = card({ token: 'done', connected: 'done', course: 'done' }, { seats: 2 })
    expect(done.find('.connect-card__course').text()).toBe('In 2 courses.')
  })
})

describe('AgentTokenRevealDialog', () => {
  it('shows a new token once, for another AI tool, with the agent file folded away and free of it', async () => {
    const { token, prefix } = newToken()
    const w = mount(AgentTokenRevealDialog, {
      props: {
        modelValue: true,
        issued: { credential_id: 'cred_1', token, token_prefix: prefix },
        name: 'Study helper',
        actorId: ACTOR,
      },
      global,
      attachTo: document.body,
    })
    await flushPromises()
    const blocks = w.findAll('.copy-block__text').map((b) => b.text())
    expect(blocks).toContain(token)
    expect(blocks).toContain(`Authorization: Bearer ${token}`)
    expect(blocks).toContain(MCP_ENDPOINT)
    expect(w.text()).toContain('In Claude: add a custom connector')
    const file = w.find('details.own-runtime__file')
    expect(file.attributes('open')).toBeUndefined()
    expect(file.text()).not.toContain(token)
    expect(file.text()).not.toMatch(TOKEN_SHAPE)
    w.unmount()
    document.body.innerHTML = ''
  })
})
