import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' })

async function lookOffences(template: string): Promise<string[]> {
  const [result] = await eslint.lintText(`<template>${template}</template>`, { filePath: 'src/Planted.vue' })
  return (result?.messages ?? []).map((m) => m.ruleId).filter((id): id is string => !!id)
}

describe('the app’s own lint rules', () => {
  it('reads each branch of a conditional component :is', async () => {
    expect(await lookOffences('<component :is="ok ? ElTag : \'span\'" />')).toContain('app/element-look')
    expect(await lookOffences('<component :is="ok ? ElAlert : \'div\'" type="info" />')).toContain('app/element-look')
  })

  it('still reads a direct imported component, and lets an ordinary element be', async () => {
    expect(await lookOffences('<component :is="ElTag" />')).toContain('app/element-look')
    expect(await lookOffences('<component :is="ok ? \'span\' : \'div\'" />')).toEqual([])
  })
})
