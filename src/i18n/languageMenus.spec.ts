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

/** Each start tag repeated for each of LOCALES, with the name its v-for gives a language. */
function languageOptions(html: string): { tag: string; name: string }[] {
  return [...html.matchAll(/v-for="\(?\s*(\w+)[^"]*\bin\s+LOCALES\s*"/g)].map((m) => ({
    tag: startTag(html, m.index!),
    name: m[1]!,
  }))
}

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
  })

  it.each(menus)('%s says which language each option is in', (_, { tag, name }) => {
    expect(tag).toContain(`:lang="${name}.value"`)
  })

  it('a menu that does not is caught', () => {
    const [bare] = languageOptions('<el-option v-for="l in LOCALES" :key="l.value" :label="l.label" />')
    expect(bare!.tag).not.toContain(':lang="l.value"')
    const [arrow] = languageOptions('<li v-for="(l, i) in LOCALES" :lang="l.value" @click="() => pick(i)">x</li>')
    expect(arrow).toEqual({ tag: '<li v-for="(l, i) in LOCALES" :lang="l.value" @click="() => pick(i)">', name: 'l' })
  })
})
