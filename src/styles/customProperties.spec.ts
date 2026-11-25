import { describe, expect, it } from 'vitest'
import { withoutComments } from '../testUtils/sourceText.spec'

// Every one of the app's own custom properties that a style reads is set
// somewhere. A var() of one nobody sets is no error to a browser: the
// declaration falls back to what the element inherits, and nothing says so.
// That is how the notes, the empty places and where data goes lost their
// leading once the type scale renamed `--app-line-height` (design wave 2):
// the shared components, built beside it, still read the old name.

const raw = (files: Record<string, string>) =>
  Object.entries(files).map(([path, text]) => [path.replace(/^\//, ''), text] as const)

// Every style the app has, as written: its style sheets, its components'
// <style> and templates, the CSS and the style objects its scripts write, and
// the loading screen's in index.html.
const sources = [
  ...raw(import.meta.glob<string>('/src/**/*.{css,vue}', { query: '?raw', import: 'default', eager: true })),
  ...raw(
    import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.spec.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
  ...raw(import.meta.glob<string>('/index.html', { query: '?raw', import: 'default', eager: true })),
]

/**
 * The app's custom properties (`--app-…`) the texts read with var() and do
 * not set: in a declaration (`--app-x: …`, a style object's `'--app-x': …`)
 * or with `setProperty('--app-x', …)`. A name built in a script
 * (`var(--app-${tone}-bg)`) is not read here: the text has its stem alone.
 */
function unsetTokens(texts: readonly string[]): string[] {
  const set = new Set<string>()
  const read = new Set<string>()
  for (const text of texts.map(withoutComments)) {
    for (const m of text.matchAll(/(?<![\w-])['"]?(--app-[\w-]+)['"]?\s*:/g)) set.add(m[1]!)
    for (const m of text.matchAll(/setProperty\(\s*['"`](--app-[\w-]+)/g)) set.add(m[1]!)
    for (const m of text.matchAll(/var\(\s*(--app-[\w-]+)/g)) {
      if (!m[1]!.endsWith('-')) read.add(m[1]!)
    }
  }
  return [...read].filter((name) => !set.has(name)).sort()
}

describe('the app’s custom properties', () => {
  it('reads none that no style sets', () => {
    expect(unsetTokens(sources.map(([, text]) => text))).toEqual([])
  })

  it('finds one read and never set, however it is written', () => {
    expect(unsetTokens(['.a { line-height: var(--app-line-height); }'])).toEqual(['--app-line-height'])
    expect(unsetTokens(['.a { color: var( --app-ink-9, red); }'])).toEqual(['--app-ink-9'])
    expect(unsetTokens(['el.style.color = "var(--app-gone)"'])).toEqual(['--app-gone'])
  })

  it('takes a property as set by a declaration, a style object or setProperty, in any of the texts', () => {
    expect(unsetTokens([':root { --app-x: 1px; }', '.a { width: var(--app-x); }'])).toEqual([])
    expect(unsetTokens(['<div :style="{ \'--app-y\': w }" />', '.a { width: var(--app-y) }'])).toEqual([])
    expect(unsetTokens(['el.style.setProperty(\'--app-z\', "2px")', '.a { width: var(--app-z) }'])).toEqual([])
  })

  it('does not take a comment as setting or reading one, nor a name built in a script as read', () => {
    expect(unsetTokens(['/* --app-c: 1px */ .a { width: var(--app-c) }'])).toEqual(['--app-c'])
    expect(unsetTokens(['// --app-c: 1px\n.a { width: var(--app-c) }'])).toEqual(['--app-c'])
    expect(unsetTokens([':root { --app-c: 1px } // was var(--app-c)\n'])).toEqual([])
    expect(unsetTokens(['const glob = "./messages/*/*.ts"\n// --app-c: 1px\n.a { width: var(--app-c) }'])).toEqual([
      '--app-c',
    ])
    expect(unsetTokens(['const url = "https://example.edu/a//b"\n// --app-c: 1px\n.a { width: var(--app-c) }'])).toEqual([
      '--app-c',
    ])
    expect(unsetTokens(['const slashOrStar = /[/*]/; const label = `var(--app-gone)`'])).toEqual(['--app-gone'])
    expect(unsetTokens(['const label = `${ok ? `var(--app-gone)` : ""}`'])).toEqual(['--app-gone'])
    for (const url of ['https://example.com', 'http://example.com', '//example.com']) {
      expect(
        unsetTokens(['<template><p>' + url + '</p><span>{{ `var(--app-gone)` }}</span></template>']),
      ).toEqual(['--app-gone'])
    }
    for (const url of ['https://example.com', 'http://example.com', '//example.com']) {
      expect(
        unsetTokens([`.a { src: url(${url}/font.woff2); } .b { color: var(--app-gone); }`]),
      ).toEqual(['--app-gone'])
      expect(
        unsetTokens([`<style>.a { src: url("${url}/font.woff2"); } .b { color: var(--app-gone); }</style>`]),
      ).toEqual(['--app-gone'])
    }
    expect(unsetTokens(['const c = `var(--app-${tone}-bg)`'])).toEqual([])
  })
})
