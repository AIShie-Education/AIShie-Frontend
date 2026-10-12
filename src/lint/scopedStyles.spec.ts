// @vitest-environment node
// What a component's scoped style says is what Vue draws. In a scoped block, `:global(x) y` is compiled to `x`
// alone: Vue keeps what is in :global() and drops the rest of the selector, so a rule meant for something inside the
// body, while the body has a class, is applied to the body itself (the chat's edge, dragged, once turned the whole
// body navy). Such a rule goes in the component's unscoped block, written as it is meant.
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from 'vue/compiler-sfc'

const sources = import.meta.glob<string>('../**/*.vue', { query: '?raw', import: 'default', eager: true })

describe('the components’ scoped styles', () => {
  it('never put anything after :global(), which Vue drops', () => {
    const offenders: string[] = []
    for (const [file, source] of Object.entries(sources)) {
      for (const block of parse(source, { filename: file }).descriptor.styles) {
        if (!block.scoped) continue
        const css = block.content.replace(/\/\*[\s\S]*?\*\//g, '')
        for (const m of css.matchAll(/:global\(([^)]*)\)([^,{]*)[,{]/g))
          if (m[2]!.trim()) offenders.push(`${file}: :global(${m[1]})${m[2]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keep the chat’s edge navy while it is dragged, and leave the body’s own ground alone', () => {
    const file = Object.keys(sources).find((f) => f.endsWith('/components/chat/ChatPanel.vue'))!
    const { descriptor } = parse(sources[file]!, { filename: file })
    const compiled = descriptor.styles
      .map((block) => compileStyle({ source: block.content, filename: file, id: 'data-v-test', scoped: block.scoped }).code)
      .join('\n')
    // The body, dragged, selects no text and keeps the edge's cursor; it is never painted.
    expect(compiled).not.toMatch(/(^|[\n},])\s*body\.is-dragging-chat\s*\{[^}]*background/)
    expect(compiled).toMatch(/body\.is-dragging-chat \.chat-panel__edge::after \{\s*background: var\(--app-indigo\);/)
  })
})
