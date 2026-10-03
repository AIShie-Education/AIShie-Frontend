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
 * draws it, however it is written: `<el-tag>` or `<ElTag>` (main.ts registers
 * both), or `<component is="el-tag">`.
 */
const ELEMENT_LOOK = {
  'el-tag': {
    allowedIn: ['src/components/AppTag.vue'],
    message:
      'A tag is an AppTag (a state, an identity, a count, or the usual state, quiet) or a StatusTag for Core’s vocabularies, never an el-tag with an effect of its own (docs/CONVENTIONS.md, "Tags").',
  },
  // An explanation (an el-alert of type info, Element Plus's default, or primary, drawn the same) is
  // an AppNote: an alert is a warning, an error or an outcome, and says which where lint can read it.
  'el-alert': {
    allowedIn: [],
    when: (node) => valuesOf(attributeOf(node, 'type')).some((type) => !ALERT_TYPES.has(type)),
    message:
      'An explanation is an AppNote (no icon, the indigo line at its left); an el-alert is a warning, an error or an outcome, and says which in its template: type="warning", "error" or "success", or a choice among them (:type="ok ? \'success\' : \'error\'"), never info, primary, none, or a value only the script knows (docs/CONVENTIONS.md, "Notes and alerts").',
  },
  // A number is typed, its steps at its right end: never Element Plus's − and + on either side.
  'el-input-number': {
    allowedIn: [],
    when: (node) => {
      const position = valuesOf(attributeOf(node, 'controls-position'))
      const controls = attributeOf(node, 'controls')
      const right = position.every((p) => p === 'right')
      const none =
        controls?.directive &&
        controls.value?.expression?.type === 'Literal' &&
        controls.value.expression.value === false
      return !right && !none
    },
    message:
      'A number field has its steps at its right end (controls-position="right") or none (:controls="false"), never − and + on either side (docs/CONVENTIONS.md, "Forms").',
  },
  'el-empty': {
    allowedIn: [],
    message:
      'Nothing to show is an AppEmpty (one line in a card, or the line icon where it fills the page), or AsyncState’s empty-text, never Element Plus’s grey box (docs/CONVENTIONS.md, "Empty places").',
  },
}
/** The types an el-alert may say: a warning, an error, an outcome in green. */
const ALERT_TYPES = new Set(['warning', 'error', 'success'])
/** A component's name as a template may write it, `ElInputNumber` or `el-input-number`, in the second form. */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
/** An element's attribute as a template writes it, bound or not: `type="info"`, `:type="t"`. */
const attributeOf = (node, name) =>
  node.startTag.attributes.find(
    (a) =>
      (!a.directive && a.key.name === name) ||
      (a.directive && a.key.name?.name === 'bind' && a.key.argument?.name === name),
  )
/** Stands for a value lint cannot read: one the script holds. */
const UNKNOWN = Symbol('unknown')
/**
 * What an attribute may be, as far as the template says: its words, a bound
 * string (`:type="'info'"`), each branch of a choice (`a ? 'x' : 'y'`), or
 * nothing where it is not written (undefined); a value from the script is UNKNOWN.
 */
function valuesOf(attribute) {
  if (!attribute) return [undefined]
  if (!attribute.directive) return [attribute.value?.value ?? '']
  const of = (e) => {
    if (!e) return [UNKNOWN]
    if (e.type === 'Literal') return [e.value === null ? undefined : typeof e.value === 'string' ? e.value : UNKNOWN]
    if (e.type === 'TemplateLiteral' && !e.expressions.length) return [e.quasis[0].value.cooked]
    if (e.type === 'Identifier' && e.name === 'undefined') return [undefined]
    if (e.type === 'ConditionalExpression') return [...of(e.consequent), ...of(e.alternate)]
    return [UNKNOWN]
  }
  return of(attribute.value?.expression)
}
/**
 * The component an element draws, by the name ELEMENT_LOOK knows it by:
 * `<ElTag>` and `<el-tag>` alike; `<component is="el-tag">`, `:is="'el-tag'"`
 * and `:is="ElTag"` (an import) as the element they name.
 */
function drawnAs(node) {
  if (node.rawName !== 'component') return [kebab(node.rawName)]
  const is = attributeOf(node, 'is')
  if (!is) return []
  if (is.directive && is.value?.expression?.type === 'Identifier') return [kebab(is.value.expression.name)]
  return valuesOf(is)
    .filter((v) => typeof v === 'string')
    .map((v) => kebab(v.replace(/^vue:/, '')))
}
const elementLook = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.defineTemplateBodyVisitor) return {}
    const file = context.filename.replaceAll('\\', '/')
    return services.defineTemplateBodyVisitor({
      VElement(node) {
        for (const name of drawnAs(node)) {
          const rule = ELEMENT_LOOK[name]
          if (!rule || rule.allowedIn.some((f) => file.endsWith(f))) continue
          if (rule.when && !rule.when(node)) continue
          context.report({ node: node.startTag, message: rule.message })
        }
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
