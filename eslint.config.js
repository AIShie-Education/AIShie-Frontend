// The lint rules this app keeps, few and each for a reason docs/CONVENTIONS.md
// gives; formatting is Prettier's (.prettierrc), and types are vue-tsc's.
//
//   npm run lint
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

/** Navigation: the activity bar and the side bar, a course's tabs, its top bar and the grades' tabs. */
const NAVIGATION = ['src/layouts/**/*.{ts,vue}', 'src/components/sidebar/**/*.{ts,vue}']
const FILLED =
  'Navigation’s icons are outlined, never filled (docs/CONVENTIONS.md): take an outlined icon, not *Filled, Stamp, List, Grid or Menu.'
/**
 * Element Plus's filled icons: every *Filled one, and those solid by design
 * whose names do not say so (Stamp, List, Grid, Menu: a stamp, a clipboard,
 * a grid and four squares, all filled).
 */
const SOLID = /^(?:.*Filled|Stamp|List|Grid|Menu)$/
const SOLID_SOURCE = '^(?:.*Filled|Stamp|List|Grid|Menu)$'
/** An icon's name as a template writes it, `<StarFilled />` or `<star-filled />`, as its component's name. */
const pascal = (tag) => tag.replace(/(?:^|-)([a-z0-9])/g, (_, c) => c.toUpperCase())

/**
 * The icons a template names, as the globally registered components are
 * (`<el-icon><StarFilled /></el-icon>`), which neither rule below sees.
 */
const solidIconInTemplate = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.defineTemplateBodyVisitor) return {}
    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (SOLID.test(pascal(node.rawName))) context.report({ node, message: FILLED })
      },
    })
  },
}

/**
 * Element Plus's own look, which the app draws through its shared components
 * instead (docs/CONVENTIONS.md, "Tags", "Notes and alerts"): a template that
 * writes one of these is refused, wherever it is but in the component that
 * draws it.
 */
const ELEMENT_LOOK = {
  'el-tag': {
    allowedIn: ['src/components/AppTag.vue'],
    message:
      'A tag is an AppTag (a state, an identity, a count, or the usual state, quiet) or a StatusTag for Core’s vocabularies, never an el-tag with an effect of its own (docs/CONVENTIONS.md, "Tags").',
  },
}
/** An element's attribute as a template writes it, bound or not: `type="info"`, `:type="t"`. */
const attributeOf = (node, name) =>
  node.startTag.attributes.find(
    (a) =>
      (!a.directive && a.key.name === name) ||
      (a.directive && a.key.name?.name === 'bind' && a.key.argument?.name === name),
  )
const elementLook = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.defineTemplateBodyVisitor) return {}
    const file = context.filename.replaceAll('\\', '/')
    return services.defineTemplateBodyVisitor({
      VElement(node) {
        const rule = ELEMENT_LOOK[node.rawName]
        if (!rule || rule.allowedIn.some((f) => file.endsWith(f))) return
        if (rule.when && !rule.when(node)) return
        context.report({ node: node.startTag, message: rule.message })
      },
    })
  },
}

export default [
  { ignores: ['dist/**', 'coverage/**', 'src/api/generated/**'] },
  { files: ['**/*.{ts,mts}'], languageOptions: { parser: tseslint.parser } },
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    files: ['src/**/*.vue'],
    plugins: { app: { rules: { 'element-look': elementLook } } },
    rules: { 'app/element-look': 'error' },
  },
  {
    files: NAVIGATION,
    ignores: ['**/*.spec.ts'],
    plugins: { aishie: { rules: { 'no-solid-icon-in-template': solidIconInTemplate } } },
    rules: {
      // A filled glyph in a row of outlined ones reads as chosen, or as news.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@element-plus/icons-vue'], importNamePattern: SOLID_SOURCE, message: FILLED }] },
      ],
      // An icon named in a script, as the globally registered components are (`icon: 'UserFilled'`).
      'no-restricted-syntax': ['error', { selector: `Literal[value=/${SOLID_SOURCE}/]`, message: FILLED }],
      // An icon named in a template (`<UserFilled />`).
      'aishie/no-solid-icon-in-template': 'error',
    },
  },
]
