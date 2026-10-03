// @vitest-environment node
// The lint rule that keeps Element Plus's own look out of the templates
// (eslint.config.js, ELEMENT_LOOK): each element it refuses is refused
// wherever a page or a component writes it, and allowed in the one
// component that draws it.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

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
})
