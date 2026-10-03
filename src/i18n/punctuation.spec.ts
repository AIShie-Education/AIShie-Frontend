import { describe, expect, it } from 'vitest'

// No punctuation in templates (docs/CONVENTIONS.md, Text): what joins words
// and numbers is the language's, so it is in the messages or Intl, never
// written in a template or a string the code builds. This reads every
// component and module and refuses:
//
// - a dot between values, in a template's text or a string ("{{ a }} · {{ b }}",
//   `${a} · ${b}`): common.sep, joinParts or courseCodeText (@/utils/parts);
//   a dot that is an element of its own (<span class="app-sep">·</span>, a
//   divider drawn aria-hidden) is a drawing, not words, and is let be;
// - items joined by a comma or a dot written here (.join(', ')): formatList, or
//   joinParts;
// - a "%" written after a number, or a "$" before one: formatPct, formatMoney;
// - brackets or a colon written around a value ("({{ x }})", `${a}: ${b}`):
//   common.aside, common.bracketed, common.pair.
//
// The messages, the formatters themselves and the tests are not read.

const sources = import.meta.glob<string>(['/src/**/*.vue', '/src/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const SKIP = [
  /^\/src\/i18n\/messages\//,
  /\.spec\.ts$/,
  /Fakes?\.ts$/,
  /^\/src\/api\/generated\//,
  // The formatters: what they join with is Intl's, or the messages'.
  /^\/src\/utils\/format\.ts$/,
  /^\/src\/utils\/parts\.ts$/,
]

/** The code of a source with its comments blanked out, lines kept where they were. */
function withoutComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, before: string) => before + ' '.repeat(m.length - before.length))
}

/** A .vue file's template, and the rest (its scripts); a .ts file is all script. */
function parts(path: string, text: string): { template: string; script: string } {
  if (!path.endsWith('.vue')) return { template: '', script: text }
  const template = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '))
  const script = text.replace(/<template>[\s\S]*<\/template>|<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '))
  return { template, script }
}

/** What a template may not write in its text: each with what to use instead. */
const IN_TEMPLATE: [string, RegExp][] = [
  // A dot that is not an element of its own: "}} · {{", "</span> ·", a line of its own.
  ['a dot between values: common.sep', /(?<!>)·|·(?!<)/],
  ['a "%" after a number: formatPct', /\}\}\s*%/],
  ['a "$" before a number, or beside a field of dollars: formatMoney, USD_SIGN', /\$\s*\{\{|>\s*\$\s*</],
  ['brackets around a value: common.bracketed or common.aside', /\(\s*\{\{|\}\}\s*\)|\(\s*<[A-Za-z]|\/>\s*\)/],
  ['a colon between values: common.pair', /\}\}\s*:\s*(\{\{|<[A-Za-z])/],
]

/** What code may not build into a string. */
const IN_SCRIPT: [string, RegExp][] = [
  // (A comma alone joins a file's fields, a CSV's, not words.)
  ['items joined by a comma or a dot: formatList or joinParts', /\.join\(\s*(['"`])(, |\s·\s|·|、|，|; )\1\s*\)/],
  ['a dot between values: common.sep or joinParts', /['"`][^'"`\n]*\s·\s[^'"`\n]*['"`]|\}\s*·|·\s*\$\{/],
  [
    'a "%" after a number: formatPct',
    /^(?!.*(?:width|height|style|translate|inset|left|top)).*(?:\$\{[^}]+\}%|\+\s*'%')/i,
  ],
  ['a "$" before a number: formatMoney', /`\$\$\{|'\$'\s*\+/],
  ['brackets around a value: common.aside', /`[^`\n]*\$\{[^}]+\}\s*\(\$\{[^}]+\}\)[^`\n]*`/],
  // (A key, "source:id", or a clock, "1:05", has no space after its colon; nor is an Error a
  // programmer reads, in English, words for the page.)
  ['a colon between values: common.pair', /^(?!.*new Error\().*`[^`\n]*\$\{[^}]+\}: \$\{[^}]+\}[^`\n]*`/],
]

/** Each line that breaks a rule, as `path:line: rule`. */
function offences(path: string, text: string): string[] {
  const { template, script } = parts(path, withoutComments(text))
  const out: string[] = []
  const scan = (code: string, rules: [string, RegExp][]) =>
    code.split('\n').forEach((line, i) => {
      for (const [rule, re] of rules) if (re.test(line)) out.push(`${path.slice(1)}:${i + 1}: ${rule}`)
    })
  scan(template, IN_TEMPLATE)
  scan(script, IN_SCRIPT)
  return out
}

describe('punctuation between values', () => {
  const files = Object.entries(sources).filter(([p]) => !SKIP.some((re) => re.test(p)))

  it('reads every component and module', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  it('is the language’s, from the messages or Intl, never written in a template or code', () => {
    expect(files.flatMap(([p, text]) => offences(p, text))).toEqual([])
  })

  it('catches what it is for, and lets a dot of its own be', () => {
    const vue = (template: string, script = '') =>
      offences('/src/X.vue', `<script setup lang="ts">\n${script}\n</script>\n<template>\n${template}\n</template>`)
    for (const caught of [
      vue('<span>{{ a }} · {{ b }}</span>'),
      vue('<span>{{ a }}</span> ·'),
      vue('<p>\n  ·\n</p>'),
      vue('<span>{{ n }}%</span>'),
      vue('<span>${{ usd }}</span>'),
      vue('<el-input><template #prepend>$</template></el-input>'),
      vue('<span>({{ name }})</span>'),
      vue('<span>(<TimeText :value="at" relative />)</span>'),
      vue('<span>{{ a }}: {{ b }}</span>'),
      vue('', "const s = names.join(', ')"),
      vue('', "const s = parts.join(' · ')"),
      vue('', 'const s = `${a} · ${b}`'),
      vue('', 'const s = `${n}%`'),
      vue('', 'const s = `$${usd}`'),
      vue('', 'const s = `${name} (${by})`'),
      vue('', 'const s = `${label}: ${value}`'),
    ])
      expect(caught).not.toEqual([])

    expect(vue('<span>{{ code }}<span class="app-sep">·</span>{{ section }}</span>')).toEqual([])
    expect(vue('<span class="x__dot" aria-hidden="true">·</span>')).toEqual([])
    expect(vue("<span>{{ a }}{{ t('common.sep') }}{{ b }}</span>")).toEqual([])
    expect(vue('<!-- {{ a }} · {{ b }} -->')).toEqual([])
    expect(vue('', "// a · b, joined with .join(', ')\nconst s = joinParts([a, b])")).toEqual([])
    expect(vue('', "const s = lines.join(' ')")).toEqual([])
    expect(vue('', "const csv = cells.join(',')")).toEqual([])
    expect(vue('', 'const key = `${o.source}:${o.id}`')).toEqual([])
    expect(vue('', 'const clock = `${h}:${pad(m)}`')).toEqual([])
    expect(vue('', 'const style = { width: `${share * 100}%` }')).toEqual([])
  })
})
