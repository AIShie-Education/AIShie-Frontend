import { describe, expect, it } from 'vitest'

// A menu of the app's languages names each in itself ("繁體中文", "简体中文",
// "English", LOCALES), so each option says which language it is in (lang): a
// screen reader reads "English" in English on a Chinese page, and 「简体中文」 in
// Mandarin on an English one, and a browser takes the script's own glyphs for
// what the page's fonts do not have. Every element of a template that is
// repeated for each of LOCALES binds :lang to its language.

// The components as written.
const templates = Object.entries(
  import.meta.glob<string>('/src/**/*.vue', { query: '?raw', import: 'default', eager: true }),
).map(([path, html]) => [path.replace(/^\/src\//, ''), html] as const)

/** The start tag around a position in a template: from its `<` to the `>` that ends it, outside quotes. */
function startTag(html: string, at: number): string {
  const open = html.lastIndexOf('<', at)
  let quote = ''
  for (let i = open; i < html.length; i++) {
    const c = html[i]!
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return html.slice(open, i + 1)
  }
  return html.slice(open)
}

const LOOP = /\b(?:in|of)\s+LOCALES\b/

/** The expression that holds an option's language tag, from any v-for head. */
function languageExpression(head: string): string {
  const lhs = head.slice(0, LOOP.exec(head)?.index).replace(/^\s*\(\s*/, '').trim()
  const object = /^\{([^}]*)\}/.exec(lhs)
  if (object) {
    for (const part of object[1]!.split(',')) {
      const p = part.trim()
      if (p === 'value') return 'value'
      const renamed = /^value\s*:\s*([$\w]+)/.exec(p)
      if (renamed) return renamed[1]!
    }
  }
  const name = /^([$\w]+)/.exec(lhs)?.[1] ?? ''
  return `${name}.value`
}

/** Each start tag repeated for each of LOCALES, with the expression its :lang must bind. */
function languageOptions(html: string): { tag: string; lang: string }[] {
  return [...html.matchAll(/\bv-for\s*=\s*(["'])([\s\S]*?)\1/g)]
    .filter((m) => LOOP.test(m[2]!))
    .map((m) => ({ tag: startTag(html, m.index!), lang: languageExpression(m[2]!) }))
}

/** Any other attribute that mentions LOCALES: a menu this guard must not silently miss. */
function unexaminedLocaleAttributes(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/([:@\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    if (!/\bLOCALES\b/.test(m[3]!)) continue
    if (m[1] === 'v-for' && LOOP.test(m[3]!)) continue
    out.push(startTag(html, m.index!))
  }
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasLanguage = (tag: string, lang: string) =>
  new RegExp(`:lang\\s*=\\s*(["'])${escape(lang)}\\1`).test(tag)

describe('the language menus', () => {
  const menus = templates.flatMap(([file, html]) => languageOptions(html).map((o) => [file, o] as const))

  it('are found: the account menu’s, and the selects of the pages before the app', () => {
    expect(menus.map(([file]) => file).sort()).toEqual([
      'components/sidebar/AccountMenu.vue',
      'views/auth/ChangePasswordView.vue',
      'views/auth/LoginView.vue',
      'views/auth/WelcomeView.vue',
      'views/join/JoinView.vue',
    ])
    expect(templates.flatMap(([, html]) => unexaminedLocaleAttributes(html))).toEqual([])
  })

  it.each(menus)('%s says which language each option is in', (_, { tag, lang }) => {
    expect(hasLanguage(tag, lang), tag).toBe(true)
  })

  it('finds in or of, either quote, and a destructured loop head', () => {
    const [of] = languageOptions("<li v-for='l of LOCALES' :lang='l.value'>x</li>")
    expect(of).toEqual({ tag: "<li v-for='l of LOCALES' :lang='l.value'>", lang: 'l.value' })
    const [destructured] = languageOptions('<li v-for="({ value }, i) of LOCALES" :lang="value">x</li>')
    expect(destructured!.lang).toBe('value')
    expect(hasLanguage(destructured!.tag, destructured!.lang)).toBe(true)
  })

  it('a menu that does not is caught, and no other use of LOCALES is ignored', () => {
    const [bare] = languageOptions('<el-option v-for="l in LOCALES" :key="l.value" :label="l.label" />')
    expect(hasLanguage(bare!.tag, bare!.lang)).toBe(false)
    const [arrow] = languageOptions('<li v-for="(l, i) in LOCALES" :lang="l.value" @click="() => pick(i)">x</li>')
    expect(arrow).toEqual({
      tag: '<li v-for="(l, i) in LOCALES" :lang="l.value" @click="() => pick(i)">',
      lang: 'l.value',
    })
    expect(unexaminedLocaleAttributes('<LanguageSelect :options="LOCALES" />')).toEqual([
      '<LanguageSelect :options="LOCALES" />',
    ])
    expect(unexaminedLocaleAttributes('<li v-for="l of LOCALES" :lang="l.value" />')).toEqual([])
  })
})
