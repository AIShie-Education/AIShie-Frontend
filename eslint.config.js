// The lint rules this app keeps, few and each for a reason docs/CONVENTIONS.md
// gives; formatting is Prettier's (.prettierrc), and types are vue-tsc's.
//
//   npm run lint
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

/** Navigation: the activity bar and the side bar, a course's tabs, its top bar and the grades' tabs. */
const NAVIGATION = ['src/layouts/**/*.{ts,vue}', 'src/components/sidebar/**/*.{ts,vue}']
const FILLED = 'Navigation’s icons are outlined, never filled (docs/CONVENTIONS.md): take the outlined icon, not *Filled.'

export default [
  { ignores: ['dist/**', 'coverage/**', 'src/api/generated/**'] },
  { files: ['**/*.{ts,mts}'], languageOptions: { parser: tseslint.parser } },
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    files: NAVIGATION,
    ignores: ['**/*.spec.ts'],
    rules: {
      // A filled glyph in a row of outlined ones reads as chosen, or as news.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@element-plus/icons-vue'], importNamePattern: 'Filled$', message: FILLED }] },
      ],
      // An icon named, as the globally registered components are (`icon: 'UserFilled'`).
      'no-restricted-syntax': ['error', { selector: 'Literal[value=/Filled$/]', message: FILLED }],
    },
  },
]
