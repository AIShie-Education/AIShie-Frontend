import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import HostingTag from './HostingTag.vue'

const global = { plugins: [i18n, ElementPlus], components: icons }

const tags = (props: { hosting: string | null | undefined; siteChat?: boolean | null }) =>
  mount(HostingTag, { props, global })
    .findAll('.el-tag')
    .map((t) => t.text())

beforeEach(() => setLocale('en'))

describe('HostingTag', () => {
  it('says how an agent runs', () => {
    expect(tags({ hosting: 'runtime' })).toEqual(['Hosted on AIshie'])
    expect(tags({ hosting: 'mcp' })).toEqual(['MCP access'])
  })

  it('says whether an agent hosted on AIshie can be asked now, when it is told', () => {
    expect(tags({ hosting: 'runtime', siteChat: true })).toEqual(['Hosted on AIshie', 'Can be asked on the site'])
    expect(tags({ hosting: 'runtime', siteChat: false })).toEqual(['Hosted on AIshie', 'Not running'])
    expect(tags({ hosting: 'runtime', siteChat: null })).toEqual(['Hosted on AIshie'])
  })

  it('is neutral, as a kind is: no green for how it runs or for being askable, the amber only for not running', () => {
    const types = (props: { hosting: string; siteChat?: boolean }) =>
      mount(HostingTag, { props, global })
        .findAll('.el-tag')
        .map((t) => ['success', 'warning', 'danger', 'primary', 'info'].find((k) => t.classes(`el-tag--${k}`)))
    expect(types({ hosting: 'runtime', siteChat: true })).toEqual(['info', 'info'])
    expect(types({ hosting: 'mcp' })).toEqual(['info'])
    expect(types({ hosting: 'runtime', siteChat: false })).toEqual(['info', 'warning'])
  })

  it('says nothing of whether one with MCP access runs: nobody asks it here', () => {
    expect(tags({ hosting: 'mcp', siteChat: false })).toEqual(['MCP access'])
  })

  it('shows nothing where no hosting is known', () => {
    expect(mount(HostingTag, { props: { hosting: undefined }, global }).find('.hosting-tag').exists()).toBe(false)
    expect(mount(HostingTag, { props: { hosting: 'external' }, global }).find('.hosting-tag').exists()).toBe(false)
  })

  it('says so in Traditional and Simplified Chinese', () => {
    setLocale('zh-Hant')
    expect(tags({ hosting: 'runtime', siteChat: true })).toEqual(['站內託管', '可在站內提問'])
    expect(tags({ hosting: 'runtime', siteChat: false })).toEqual(['站內託管', '未在執行'])
    expect(tags({ hosting: 'mcp' })).toEqual(['MCP 存取'])
    setLocale('zh-Hans')
    expect(tags({ hosting: 'runtime', siteChat: true })).toEqual(['站内托管', '可在站内提问'])
    expect(tags({ hosting: 'runtime', siteChat: false })).toEqual(['站内托管', '未在运行'])
    expect(tags({ hosting: 'mcp' })).toEqual(['MCP 访问'])
  })
})
