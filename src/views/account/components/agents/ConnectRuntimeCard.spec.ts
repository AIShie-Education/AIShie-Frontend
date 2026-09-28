import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { CORE_ORIGIN, MCP_ENDPOINT } from '@/api/http'
import ConnectRuntimeCard from './ConnectRuntimeCard.vue'
import type { SetupProgress } from './agents'

const global = { plugins: [i18n, ElementPlus], components: icons }
const ACTOR = '0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b'

function card(progress: SetupProgress) {
  return mount(ConnectRuntimeCard, {
    props: { name: 'Study helper', actorId: ACTOR, progress, lastSeenAt: null, seats: 0 },
    global,
  })
}

beforeEach(() => setLocale('en'))
afterEach(() => setLocale('en'))
enableAutoUnmount(afterEach)

describe('ConnectRuntimeCard', () => {
  it('tells how to run the AIShie runtime oneself: the agent file, and where the token goes', () => {
    const w = card({ token: 'done', connected: 'waiting', course: 'todo' })
    const blocks = w.findAll('.copy-block__text').map((b) => b.text())
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain(`base_url: ${CORE_ORIGIN}`)
    expect(blocks[0]).toContain('token_ref: secret://agents/study-helper/core_token')
    expect(blocks[1]).toBe(MCP_ENDPOINT)
    const text = w.text()
    expect(text).toContain('agents/study-helper/core_token')
    expect(text).toContain('AISHIE_SECRET_AGENTS_STUDY_HELPER_CORE_TOKEN')
    // Nothing the runtime does not read.
    expect(text).not.toMatch(/CORE_MCP_URL|AISHITERU_TOKEN/)
  })

  it('says it in Traditional Chinese too', () => {
    setLocale('zh-Hant')
    const w = card({ token: 'done', connected: 'waiting', course: 'todo' })
    expect(w.text()).toContain('AIShie Agent Runtime 的代理檔案')
    expect(w.text()).toContain('AISHIE_SECRET_AGENTS_STUDY_HELPER_CORE_TOKEN')
    expect(w.text()).not.toMatch(/CORE_MCP_URL|AISHITERU_TOKEN/)
  })

  it('keeps the settings to hand once the runtime has connected', () => {
    const w = card({ token: 'done', connected: 'done', course: 'done' })
    const again = w.find('.connect-card__again')
    expect(again.exists()).toBe(true)
    expect(again.text()).toContain('token_ref: secret://agents/study-helper/core_token')
    expect(again.text()).toContain(MCP_ENDPOINT)
  })
})
