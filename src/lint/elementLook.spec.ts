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

  it('lets AppTag, which draws every tag, use one', async () => {
    expect(await problems('<el-tag>x</el-tag>', 'src/components/AppTag.vue')).toEqual([])
    expect(await problems('<AppTag tone="wait">x</AppTag>')).toEqual([])
  })
})
