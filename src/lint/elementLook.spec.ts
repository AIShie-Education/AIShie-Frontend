// @vitest-environment node
// The lint rule that keeps Element Plus's own look out of the templates
// (eslint.config.js, ELEMENT_LOOK): each element it refuses is refused
// wherever a page or a component writes it, and allowed in the one
// component that draws it.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

// Node's fs and the lint config itself, imported by names the app's types (the browser's) do not resolve.
interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string
}
const NODE_FS: string = 'node:fs'
const CONFIG: string = '../../eslint.config.js'
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as Fs
const { LOOK_PENDING } = (await import(/* @vite-ignore */ CONFIG)) as { LOOK_PENDING: string[] }

const eslint = new ESLint()
async function problems(template: string, file = 'src/views/course/SomeView.vue') {
  const [result] = await eslint.lintText(`<template>${template}</template>\n`, { filePath: file })
  return result!.messages.filter((m) => m.ruleId === 'app/element-look').map((m) => m.message)
}

describe('the element-look lint rule', () => {
  it('refuses an el-tag in a view or a component, whatever its effect, and points to AppTag', async () => {
    for (const tag of ['<el-tag effect="dark">3</el-tag>', '<el-tag type="info" effect="plain">x</el-tag>', '<el-tag>x</el-tag>'])
      expect(await problems(tag)).toEqual([expect.stringContaining('AppTag')])
    expect(await problems('<el-tag>x</el-tag>', 'src/components/SomeBadge.vue')).toHaveLength(1)
  })

  it('refuses Element Plus’s empty box anywhere, and points to AppEmpty', async () => {
    expect(await problems('<el-empty description="Nothing" :image-size="64" />')).toEqual([
      expect.stringContaining('AppEmpty'),
    ])
    expect(await problems('<el-empty />', 'src/components/AsyncState.vue')).toHaveLength(1)
  })

  it('refuses Element Plus’s result anywhere but AppResult, whatever its icon, and points to AppResult', async () => {
    for (const result of [
      '<el-result icon="warning" title="Not found" />',
      '<el-result icon="error" :title="t(\'x\')"><template #extra><el-button>Retry</el-button></template></el-result>',
      '<ElResult title="Done" />',
    ])
      expect(await problems(result), result).toEqual([expect.stringContaining('AppResult')])
    expect(await problems('<el-result title="x" />', 'src/components/AsyncState.vue')).toHaveLength(1)
    expect(await problems('<el-result :sub-title="subTitle"><template #title>x</template></el-result>', 'src/components/AppResult.vue')).toEqual([])
  })

  it('refuses an explanation in an el-alert, of type info or none, and points to AppNote; lets a warning or an error be one', async () => {
    for (const alert of ['<el-alert type="info" title="x" />', '<el-alert title="x" :closable="false" show-icon />'])
      expect(await problems(alert)).toEqual([expect.stringContaining('AppNote')])
    for (const alert of [
      '<el-alert type="warning" title="x" />',
      '<el-alert type="error" title="x" />',
      '<el-alert type="success" title="x" />',
      '<el-alert :type="ok ? \'success\' : \'error\'" title="x" />',
    ])
      expect(await problems(alert)).toEqual([])
  })

  it('refuses a number field with a step on either side, and lets one with its steps at its right end or none', async () => {
    expect(await problems('<el-input-number v-model="n" :min="0" />')).toEqual([expect.stringContaining('controls-position')])
    expect(await problems('<el-input-number v-model="n" controls-position="right" />')).toEqual([])
    expect(await problems('<el-input-number v-model="n" :controls="false" />')).toEqual([])
  })

  it('knows each however a template names it: in either case, or as a dynamic component', async () => {
    // main.ts registers Element Plus's components under both names (app.use(ElementPlus)).
    expect(await problems('<ElTag effect="dark" type="success">3</ElTag>')).toEqual([expect.stringContaining('AppTag')])
    expect(await problems('<ElAlert title="An explanation" />')).toEqual([expect.stringContaining('AppNote')])
    expect(await problems('<ElEmpty description="None" />')).toEqual([expect.stringContaining('AppEmpty')])
    expect(await problems('<ElInputNumber v-model="n" />')).toEqual([expect.stringContaining('controls-position')])
    for (const tag of [
      '<component is="el-tag">x</component>',
      '<component is="ElTag">x</component>',
      '<component is="vue:el-tag">x</component>',
      '<component :is="\'el-tag\'">x</component>',
      '<component :is="wide ? \'el-tag\' : \'span\'">x</component>',
      '<component :is="ElTag">x</component>',
    ])
      expect(await problems(tag), tag).toEqual([expect.stringContaining('AppTag')])
    for (const allowed of [
      '<ElAlert type="warning" title="x" />',
      '<ElInputNumber v-model="n" controls-position="right" />',
      '<component is="span">x</component>',
      '<component :is="AppTag">x</component>',
      '<component :is="icon" />',
    ])
      expect(await problems(allowed), allowed).toEqual([])
    expect(await problems('<ElTag>x</ElTag>', 'src/components/AppTag.vue')).toEqual([])
  })

  it('reads an el-alert’s type where a template binds it, and refuses one it cannot read', async () => {
    for (const alert of [
      // Element Plus draws primary as it draws info: the large ⓘ.
      '<el-alert type="primary" title="x" />',
      '<el-alert :type="\'info\'" title="x" />',
      '<el-alert :type="`info`" title="x" />',
      '<el-alert :type="ok ? \'success\' : \'info\'" title="x" />',
      '<el-alert :type="ok ? \'success\' : undefined" title="x" />',
      '<el-alert :type="ok ? \'error\' : null" title="x" />',
      // A value the script holds may be info, as an outcome's and a document's readers' were.
      '<el-alert :type="note.type" title="x" />',
      '<el-alert :type="TONE[result]" title="x" />',
      '<el-alert :type="view.type as \'success\' | \'info\'" title="x" />',
    ])
      expect(await problems(alert), alert).toEqual([expect.stringContaining('AppNote')])
    for (const alert of [
      '<el-alert :type="\'warning\'" title="x" />',
      '<el-alert :type="a ? \'success\' : b ? \'error\' : \'warning\'" title="x" />',
    ])
      expect(await problems(alert), alert).toEqual([])
  })

  it('lets AppTag, which draws every tag, use one', async () => {
    expect(await problems('<el-tag>x</el-tag>', 'src/components/AppTag.vue')).toEqual([])
    expect(await problems('<AppTag tone="wait">x</AppTag>')).toEqual([])
  })

  it('refuses an outlined, pill or round button, written or bound, and lets a solid one or words be', async () => {
    for (const button of [
      '<el-button plain>x</el-button>',
      '<el-button type="danger" plain size="small">Revoke</el-button>',
      '<el-button type="primary" :plain="true">x</el-button>',
      '<el-button round>x</el-button>',
      '<el-button text circle aria-label="More"><el-icon /></el-button>',
      '<ElButton circle aria-label="Next" />',
      '<component is="el-button" plain>x</component>',
    ])
      expect(await problems(button), button).toEqual([expect.stringContaining('text button')])
    for (const button of [
      '<el-button type="primary">Publish</el-button>',
      '<el-button>Cancel</el-button>',
      '<el-button type="primary" text>Approve</el-button>',
      '<el-button type="danger" text>Archive</el-button>',
      '<el-button link type="primary">Details</el-button>',
      '<el-button text aria-label="More"><el-icon /></el-button>',
      '<el-button :plain="false">x</el-button>',
    ])
      expect(await problems(button), button).toEqual([])
  })

  it('refuses a bordered checkbox or radio, and an el-card, anywhere', async () => {
    expect(await problems('<el-checkbox v-model="on" label="Show archived" border />')).toEqual([
      expect.stringContaining('checkbox'),
    ])
    expect(await problems('<el-radio value="a" border>A</el-radio>')).toEqual([expect.stringContaining('radio')])
    expect(await problems('<ElRadio value="a" :border="wide">A</ElRadio>')).toHaveLength(1)
    expect(await problems('<el-checkbox v-model="on" label="Show archived" />')).toEqual([])
    expect(await problems('<el-radio value="a">A</el-radio>')).toEqual([])
    expect(await problems('<el-card>x</el-card>')).toEqual([expect.stringContaining('.app-card')])
    expect(await problems('<el-card>x</el-card>', 'src/components/SomeCard.vue')).toHaveLength(1)
  })

  it('lets the files another part of the wave sweeps keep their buttons only while they still write them', async () => {
    // A file listed as pending is let through; once its look is gone it leaves the list, which only shrinks.
    for (const file of LOOK_PENDING) {
      expect(await problems('<el-button plain>x</el-button>', file), file).toEqual([])
      const eslint2 = new ESLint()
      const [result] = await eslint2.lintText(readFileSync(file, 'utf8'), { filePath: 'src/views/Pending.vue' })
      const looks = result!.messages.filter((m) => m.ruleId === 'app/element-look')
      expect(looks.length, `${file} no longer writes an outlined or round button: take it off LOOK_PENDING`).toBeGreaterThan(0)
    }
  })
})
