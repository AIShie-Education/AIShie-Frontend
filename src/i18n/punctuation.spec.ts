import { describe, expect, it } from 'vitest'

// No punctuation in templates (docs/CONVENTIONS.md, Text): what joins words
// and numbers is the language's, so it is in the messages or Intl, never
// written in a template or a string the code builds. This reads every
// component and module, the code in a template as well as its text (what is
// between {{ }}, and a bound attribute's or a directive's value), and refuses:
//
// - a dot between values, in a template's text or a string ("{{ a }} · {{ b }}",
//   "&middot;", `${a} · ${b}`, a + '·' + b): common.sep, joinParts or
//   courseCodeText (@/utils/parts); a dot that is an element of its own
//   (<span class="app-sep">·</span>, a divider drawn aria-hidden) is a drawing,
//   not words, and is let be;
// - items joined by a comma or a dot written here (.join(', '), `${a}, ${b}`,
//   a + ', ' + b): formatList, or joinParts;
// - a "%" written after a number, with a space or none (`${n}%`, `${n} %`,
//   n + ' %'), or a "$" before one: formatPct, formatMoney;
// - brackets or a colon written around a value ("({{ x }})", `${a} (${b})`,
//   a + ' (' + b + ')', `${a}: ${b}`, a + ': ' + b): common.aside,
//   common.bracketed, common.pair;
// - quotation marks written around a value ("“{{ x }}”", `「${a}」`,
//   '“' + a + '”'): common.quoted, 「」 in Hong Kong's Chinese.
//
// The formatters themselves and the tests are not read. The messages are read
// for what is theirs to get right: no "%" after a placeholder or a figure in
// any language (the number is formatPct's, "%" and all), and in Chinese no
// half-width colon or brackets beside a placeholder (「：」, 「（）」).

const sources = import.meta.glob<string>(['/src/**/*.vue', '/src/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const messageModules = import.meta.glob<{ default: Record<string, unknown> }>('/src/i18n/messages/*/*.ts', {
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

/** Every character but a line's end made a space, so that what is left keeps its lines. */
const blank = (s: string) => s.replace(/[^\n]/g, ' ')

/** The code of a source with its comments blanked out, lines kept where they were. */
function withoutComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, before: string) => before + ' '.repeat(m.length - before.length))
}

/**
 * The code in a template, each piece where it was and the rest blanked: what
 * is between {{ }}, and the value of a bound attribute (:title, v-bind:title),
 * a directive (v-if, v-for, v-model) or a handler (@click). A :style's or a
 * :class's value is how the page is drawn, not words, and is left out.
 */
function templateCode(template: string): string {
  const out = blank(template).split('')
  const keep = (from: number, code: string) => {
    for (let i = 0; i < code.length; i++) out[from + i] = code[i]
  }
  for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) keep(m.index + 2, m[1])
  for (const m of template.matchAll(/(?<=\s)([:@#]|v-)([^\s=>"'/]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
    const name = m[1] === 'v-' ? `v-${m[2]}` : `${m[1]}${m[2]}`
    if (/^(?::|v-bind:)(?:style|class)$/.test(name)) continue
    const value = m[3]
    keep(m.index + m[0].length - value.length + 1, value.slice(1, -1))
  }
  return out.join('')
}

/** A .vue file's template, its code, and the rest (its scripts); a .ts file is all script. */
function parts(path: string, text: string): { template: string; code: string; script: string } {
  if (!path.endsWith('.vue')) return { template: '', code: '', script: text }
  const template = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, blank)
    // The dot written as an entity is the dot.
    .replace(/&middot;|&#183;|&#x0*b7;/gi, '·')
  const script = text.replace(/<template>[\s\S]*<\/template>|<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, blank)
  return { template, code: templateCode(template), script }
}

/** What a template may not write in its text: each with what to use instead. */
const IN_TEMPLATE: [string, RegExp][] = [
  // A dot that is not an element of its own: "}} · {{", "</span> ·", a line of its own.
  ['a dot between values: common.sep', /(?<!>)·|·(?!<)/],
  ['a "%" after a number: formatPct', /\}\}\s*%/],
  ['a "$" before a number, or beside a field of dollars: formatMoney, USD_SIGN', /\$\s*\{\{|>\s*\$\s*</],
  ['brackets around a value: common.bracketed or common.aside', /\(\s*\{\{|\}\}\s*\)|\(\s*<[A-Za-z]|\/>\s*\)/],
  ['a colon between values: common.pair', /\}\}\s*:\s*(\{\{|<[A-Za-z])/],
  ['quotation marks around a value: common.quoted', /[“‘「『"]\s*\{\{|\}\}\s*[”’」』"]/],
]

/** A quote of any kind, as the start of a string the code writes. */
const Q = `(['"\`])`
/** What may stand between a string's quotes on one line. */
const IN_Q = `[^'"\`\\n]`
/** A "+" that adds to a string, before it ("a + '%'") or after it ("' (' + b"); never "c++", nor a "+" in a string. */
const ADDED = `(?<=^|[\\s\\w)\\]])\\+(?!\\+)\\s*`
const ADDS = `\\s*\\+(?!\\+)`
/**
 * A line that seeks a string in another (`problem.includes(`(${r})`)`) or
 * fails with words a programmer reads, in English (new Error(`${a}: ${b}`)):
 * what it builds is not words for the page.
 */
const NOT_WORDS = `^(?!.*(?:new Error\\(|\\.(?:includes|indexOf|startsWith|endsWith)\\())`

/** What code may not build into a string, in a module, a script or a template's code. */
const IN_CODE: [string, RegExp][] = [
  // (A comma alone joins a file's fields, a CSV's, not words.)
  [
    'items joined by a comma or a dot: formatList or joinParts',
    // .join(', '); `${a}, ${b}`, never the arguments of a call drawn in CSS (`rgb(${r}, ${g}, ${b})`); a + ', ' + b.
    new RegExp(
      [
        `\\.join\\(\\s*${Q}(\\s*,\\s+|\\s*[·、，；]\\s*|; )\\1\\s*\\)`,
        `(?<!\\([^)\`]*)\\$\\{[^}]+\\}(?:, |，|、)\\$\\{`,
        `${Q}(?:, |，|、)\\3${ADDS}|${ADDED}${Q}(?:, |，|、)`,
      ].join('|'),
    ),
  ],
  [
    'a dot between values: common.sep or joinParts',
    // " · " in a string, a dot beside a placeholder or added to a string, or written as an escape;
    // a dot alone in a list of glyphs (a spinner's frames) is a drawing, and is let be.
    new RegExp(
      [
        `${Q}${IN_Q}*\\s·\\s${IN_Q}*\\1`,
        `\\}\\s*·|·\\s*\\$\\{|\\$\\{\\s*${Q}·`,
        `${ADDED}${Q}${IN_Q}*·`,
        `${Q}${IN_Q}*·${IN_Q}*\\4${ADDS}`,
        `\\\\u00b7|\\\\xb7|\\\\u\\{b7\\}`,
      ].join('|'),
      'i',
    ),
  ],
  [
    'a "%" after a number: formatPct',
    new RegExp(
      `^(?!.*(?:width|height|style|translate|inset|left|top)).*(?:\\$\\{[^}]+\\}\\s*%|${ADDED}${Q}\\s*%)`,
      'i',
    ),
  ],
  ['a "$" before a number: formatMoney', new RegExp(`\\$\\$\\{|${Q}\\$\\s*\\1${ADDS}`)],
  [
    'brackets around a value: common.aside',
    // `${a} (${b})`, `(${b})`, never a call drawn in CSS (`rgb(${c})`); or a + ' (' + b + ')'.
    new RegExp(`${NOT_WORDS}.*(?:(?<![\\w$-])[(（]\\$\\{[^}]+\\}[)）]|${Q}(?:${IN_Q}*\\s)?[(（]\\1${ADDS})`),
  ],
  [
    'quotation marks around a value: common.quoted',
    // `“${a}”`, `「${a}」`, '“' + a + '”'; a string's own quotes are not words, and are let be.
    new RegExp(`[“‘「『]\\$\\{|\\}[”’」』]|${Q}[“‘「『]\\1${ADDS}|${ADDED}${Q}[”’」』]`),
  ],
  [
    'a colon between values: common.pair',
    // `${a}: ${b}`, a + ': ' + b; never a key, "source:id", or a clock, "1:05", with no space after the colon.
    new RegExp(
      `${NOT_WORDS}.*(?:${[
        `\\$\\{[^}]+\\}(?:: |：)\\s*\\$\\{`,
        `${Q}${IN_Q}*(?:: |：)\\s*\\1${ADDS}`,
        `${ADDED}${Q}\\s*(?:: |：)`,
      ].join('|')})`,
    ),
  ],
]

/** Each line that breaks a rule, as `path:line: rule`. */
function offences(path: string, text: string): string[] {
  const { template, code, script } = parts(path, withoutComments(text))
  const out: string[] = []
  const scan = (lines: string, rules: [string, RegExp][]) =>
    lines.split('\n').forEach((line, i) => {
      for (const [rule, re] of rules) if (re.test(line)) out.push(`${path.slice(1)}:${i + 1}: ${rule}`)
    })
  scan(template, IN_TEMPLATE)
  scan(code, IN_CODE)
  scan(script, IN_CODE)
  return out
}

/** What a message may not write: in every language, and in Chinese. */
const IN_MESSAGES: [string, RegExp][] = [
  ['a "%" after a number, which is formatPct’s: give the number as it writes it', /\}\s*%|\d\s*%/],
]
const IN_CHINESE: [string, RegExp][] = [
  ['a half-width colon beside a placeholder: 「：」', /\}\s*:(?!\/\/)|:\s*\{/],
  ['half-width brackets around a placeholder: 「（」「）」', /\(\s*\{|\}\s*\)/],
]

/** Each message that breaks a rule, as `locale:namespace.key: rule`. */
function messageOffences(name: string, text: string): string[] {
  const rules = /^zh-/.test(name) ? [...IN_MESSAGES, ...IN_CHINESE] : IN_MESSAGES
  return rules.filter(([, re]) => re.test(text)).map(([rule]) => `${name}: ${rule}`)
}

/** Each message, as `<locale>:<namespace>.<path>` and its text. */
function messages(): [string, string][] {
  const out: [string, string][] = []
  const walk = (prefix: string, v: unknown) => {
    if (typeof v === 'string') out.push([prefix, v])
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${prefix}.${k}`, x)
  }
  for (const [path, mod] of Object.entries(messageModules)) {
    const m = path.match(/\/messages\/([^/]+)\/([^/]+)\.ts$/)
    if (m) walk(`${m[1]}:${m[2]}`, mod.default)
  }
  return out
}

describe('punctuation between values', () => {
  const files = Object.entries(sources).filter(([p]) => !SKIP.some((re) => re.test(p)))

  it('reads every component and module, and every message', () => {
    expect(files.length).toBeGreaterThan(300)
    expect(messages().length).toBeGreaterThan(5000)
  })

  it('is the language’s, from the messages or Intl, never written in a template or code', () => {
    expect(files.flatMap(([p, text]) => offences(p, text))).toEqual([])
  })

  it('is right in the messages: no "%" after a number, and in Chinese no half-width colon or brackets', () => {
    expect(messages().flatMap(([name, text]) => messageOffences(name, text))).toEqual([])
  })

  const vue = (template: string, script = '') =>
    offences('/src/X.vue', `<script setup lang="ts">\n${script}\n</script>\n<template>\n${template}\n</template>`)

  it.each([
    // In a template's text.
    '<span>{{ a }} · {{ b }}</span>',
    '<span>{{ a }} &middot; {{ b }}</span>',
    '<span>{{ a }} &#183; {{ b }}</span>',
    '<span>{{ a }}</span> ·',
    '<p>\n  ·\n</p>',
    '<span>{{ n }}%</span>',
    '<span>{{ n }} %</span>',
    '<span>${{ usd }}</span>',
    '<el-input><template #prepend>$</template></el-input>',
    '<span>({{ name }})</span>',
    '<span>(<TimeText :value="at" relative />)</span>',
    '<span>{{ a }}: {{ b }}</span>',
    // In a template's code: what main's SsoTestReport did, and its like.
    '<span v-if="s.values.length">{{ s.values.join(\', \') }}</span>',
    "<span>{{ list.join(', ') }}</span>",
    "<span>{{ a + ' · ' + b }}</span>",
    "<span>{{ a + '·' + b }}</span>",
    '<span>{{ `${n}%` }}</span>',
    '<span>{{ `${n} %` }}</span>',
    "<span>{{ n + '%' }}</span>",
    '<span>{{ n + "%" }}</span>',
    "<span>{{ '$' + usd }}</span>",
    "<span>{{ a + ' (' + b + ')' }}</span>",
    "<span>{{ a + ': ' + b }}</span>",
    '<span :title="`${a} (${b})`">x</span>',
    '<span :title="`${a}: ${b}`">x</span>',
    '<span :aria-label="`${n}%`">x</span>',
    '<span v-bind:aria-label="`${a} · ${b}`">x</span>',
    '<el-option :label="`${code} (${section})`" />',
    '<button @click="copy(a + \': \' + b)">x</button>',
    '<span\n  :title="\n    names.join(\', \')\n  "\n>x</span>',
    // What main's ActionTarget wrote around a question, and its like.
    '<span class="q">“{{ excerpt(p.body) }}”</span>',
    '<span>\n  “{{ reason }}”\n</span>',
    '<span>「{{ reason }}」</span>',
    '<span>"{{ reason }}"</span>',
  ])('catches %s in a template', (template) => {
    expect(vue(template)).not.toEqual([])
  })

  it.each([
    "const s = names.join(', ')",
    'const s = names.join(", ")',
    "const s = parts.join(' · ')",
    "const s = parts.join('、')",
    'const s = `${a} · ${b}`',
    "const s = a + '·' + b",
    "const s = a + ' · ' + b",
    "const s = `${a}${'·'}${b}`",
    "const s = a + '\\u00b7' + b",
    'const s = `${a}, ${b}`',
    "const s = a + ', ' + b",
    "const s = a + '、' + b",
    'const s = `${n}%`',
    'const s = `${n} %`',
    "const s = n + '%'",
    "const s = n + ' %'",
    'const s = n + "%"',
    'const s = n + `%`',
    'const s = `$${usd}`',
    "const s = '$' + usd",
    'const s = "$" + usd',
    'const s = `${name} (${by})`',
    'const s = `(${n})`',
    'const s = `${name}（${by}）`',
    "const s = a + ' (' + b + ')'",
    "const s = a + '（' + b + '）'",
    'const s = `${label}: ${value}`',
    'const s = `${label}：${value}`',
    "const s = label + ': ' + value",
    "const s = label + '：' + value",
    'const s = `“${q}”`',
    'const s = `「${q}」`',
    "const s = '“' + q + '”'",
  ])('catches %s in code', (script) => {
    expect(vue('', script)).not.toEqual([])
    expect(offences('/src/x.ts', script)).not.toEqual([])
  })

  it('lets a dot of its own be, and what is not words', () => {
    expect(vue('<span>{{ code }}<span class="app-sep">·</span>{{ section }}</span>')).toEqual([])
    expect(vue('<span>{{ code }}<span class="app-sep">&middot;</span>{{ section }}</span>')).toEqual([])
    expect(vue('<span class="x__dot" aria-hidden="true">·</span>')).toEqual([])
    expect(vue("<span>{{ a }}{{ t('common.sep') }}{{ b }}</span>")).toEqual([])
    expect(vue('<span :title="joinParts([a, b])">{{ formatList(names, \'or\') }}</span>')).toEqual([])
    expect(vue('<!-- {{ a }} · {{ b }} -->')).toEqual([])
    expect(vue('<div :style="{ width: `${share * 100}%` }" />')).toEqual([])
    expect(vue('<div :style="`--share: ${share * 100}%`" />')).toEqual([])
    expect(vue('<li v-for="(item, i) in items" :key="`${item.source}:${item.id}`" @click="open(item)" />')).toEqual([])
    expect(vue('', "// a · b, joined with .join(', ')\nconst s = joinParts([a, b])")).toEqual([])
    expect(vue('', "const s = lines.join(' ')")).toEqual([])
    expect(vue('', "const csv = cells.join(',')")).toEqual([])
    expect(vue('', 'const key = `${o.source}:${o.id}`')).toEqual([])
    expect(vue('', "const key = o.source + ':' + o.id")).toEqual([])
    expect(vue('', 'const clock = `${h}:${pad(m)}`')).toEqual([])
    expect(vue('', 'const style = { width: `${share * 100}%` }')).toEqual([])
    expect(vue('', 'const color = `rgb(${r}, ${g}, ${b})`')).toEqual([])
    expect(vue('', 'const fill = `var(${name})`')).toEqual([])
    expect(vue('', "const fill = 'rgba(' + c + ')'")).toEqual([])
    expect(vue('', 'throw new Error(`${what}: ${why}`)')).toEqual([])
    expect(vue('', 'const re = /[\\s·・]+/u')).toEqual([])
    expect(vue('', "const FRAMES = ['·', '✢', '✳']")).toEqual([])
    expect(vue('', "const ext = { 'text/x-c++src': 'cpp' }")).toEqual([])
    expect(vue('', 'const n = more ? `${count}+` : count')).toEqual([])
    expect(vue('', 'const kept = problem.includes(`(${reason})`)')).toEqual([])
    expect(vue("<span>{{ t('common.quoted', { text: q }) }}</span>")).toEqual([])
    expect(vue('<span :class="{ on }">{{ q }}</span>')).toEqual([])
    expect(vue('', 'const s = "it\'s" + q')).toEqual([])
  })

  it.each([
    ['en:common.zzPct', '{n} %'],
    ['en:common.zzPct', '{n}%'],
    ['en:common.zzPct', '47 %'],
    ['zh-Hant:common.zzPct', '{n} %'],
    ['zh-Hans:common.zzPct', '{n}%'],
    ['zh-Hant:common.zzPair', '{label}: {value}'],
    ['zh-Hans:common.zzPair', '{label}:{value}'],
    ['zh-Hant:common.zzAside', '{text} ({aside})'],
    ['zh-Hans:common.zzAside', '{text}({aside})'],
  ])('catches the message %s, %s', (name, text) => {
    expect(messageOffences(name, text)).not.toEqual([])
  })

  it('lets a message be that writes it as the language does', () => {
    expect(messageOffences('en:common.pair', '{label}: {value}')).toEqual([])
    expect(messageOffences('en:common.aside', '{text} ({aside})')).toEqual([])
    expect(messageOffences('en:classbook.total', '{name} (%)')).toEqual([])
    expect(messageOffences('zh-Hant:classbook.total', '{name}（%）')).toEqual([])
    expect(messageOffences('zh-Hant:common.pair', '{label}：{value}')).toEqual([])
    expect(messageOffences('zh-Hant:common.aside', '{text}（{aside}）')).toEqual([])
    expect(messageOffences('zh-Hant:x.link', '前往 https://{host}/join')).toEqual([])
  })
})
