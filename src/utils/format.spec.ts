import { describe, expect, it } from 'vitest'
import { downloadName } from './format'

describe('downloadName', () => {
  it('keeps a name that has an extension', () => {
    expect(downloadName('converter.py', 'text/x-python')).toBe('converter.py')
    expect(downloadName('server.log', 'text/plain')).toBe('server.log')
  })
  it('adds the usual extension for the type where the name has none', () => {
    expect(downloadName('Week 1 slides', 'application/pdf')).toBe('Week 1 slides.pdf')
    expect(downloadName('Syllabus v2.1', 'text/markdown; charset=utf-8')).toBe('Syllabus v2.1.md')
  })
  it('leaves a name alone when the type is not known', () => {
    expect(downloadName('data', 'application/octet-stream')).toBe('data')
    expect(downloadName('data', null)).toBe('data')
  })
  it('replaces what a file system does not take, and never gives an empty name', () => {
    expect(downloadName('a/b: c?', 'text/plain')).toBe('a_b_ c_.txt')
    expect(downloadName('', undefined)).toBe('download')
  })
})
