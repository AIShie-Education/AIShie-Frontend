import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import ExistingGradesChoice from './ExistingGradesChoice.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  setLocale('en')
})

function mountChoice(props: {
  scores: string[] | null
  from: string | number
  to: string
  modelValue?: '' | 'rescale' | 'keep_scores'
}) {
  const w = mount(ExistingGradesChoice, {
    props: { modelValue: '', ...props },
    global: {
      plugins: [
        i18n,
        ElementPlus,
        { install: (app) => Object.entries(Icons).forEach(([n, c]) => app.component(n, c)) },
      ],
    },
  })
  mounted.push(w)
  return w
}
const option = (w: ReturnType<typeof mountChoice>, choice: string) => w.find(`[data-choice="${choice}"]`)

describe('ExistingGradesChoice', () => {
  it('explains each choice with the actual numbers', () => {
    const w = mountChoice({ scores: ['85', '40'], from: 100, to: '200' })
    expect(w.text()).toContain('2 grades have been entered for it')
    expect(w.text()).toContain('Its points change from 100 to 200.')
    expect(option(w, 'rescale').text()).toContain('For example, 85/100 becomes 170/200 (85% either way).')
    expect(option(w, 'keep_scores').text()).toContain('For example, 85/100 (85%) becomes 85/200 (42.5%).')
  })

  it('greys out keeping the scores when one would be above the new points, saying why', () => {
    const w = mountChoice({ scores: ['85', '30'], from: 100, to: '50' })
    const keep = option(w, 'keep_scores')
    expect(keep.classes()).toContain('is-disabled')
    expect(keep.text()).toContain('1 score would be above 50, what the work is now worth')
    expect(option(w, 'rescale').classes()).not.toContain('is-disabled')
    expect(option(w, 'rescale').text()).toContain('85/100 becomes 42.5/50')
  })

  it('greys out rescaling work that was worth nothing', () => {
    const w = mountChoice({ scores: ['0'], from: 0, to: '10' })
    expect(option(w, 'rescale').classes()).toContain('is-disabled')
    expect(option(w, 'rescale').text()).toContain('nothing to rescale from')
  })

  it('takes back a choice that has become refused', async () => {
    const w = mountChoice({ scores: ['85'], from: 100, to: '200', modelValue: 'keep_scores' })
    await w.setProps({ to: '50' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('says it in Traditional Chinese', () => {
    setLocale('zh-Hant')
    const w = mountChoice({ scores: ['85'], from: 100, to: '50' })
    expect(w.text()).toContain('已輸入1份成績')
    expect(option(w, 'rescale').text()).toContain('例如85/100會變成42.5/50')
  })
})
