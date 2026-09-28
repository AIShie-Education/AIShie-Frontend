// Two languages: Traditional Chinese and English. Messages live one file per
// namespace under messages/<locale>/<namespace>.ts, each exporting its
// messages as default; the file name is the namespace, so
// messages/en/members.ts is t('members.…').
import { createI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-tw'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { loadFontsFor } from '@/styles/fonts'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

export type Locale = 'zh-Hant' | 'en'
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
]

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/*/*.ts', { eager: true })
const messages: Record<Locale, Record<string, unknown>> = { 'zh-Hant': {}, en: {} }
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\.\/messages\/([^/]+)\/([^/]+)\.ts$/)
  if (!m) continue
  const [, locale, ns] = m as unknown as [string, Locale, string]
  if (!messages[locale]) continue
  messages[locale][ns] = mod.default
}

const STORAGE_KEY = 'aishiteru.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh-Hant' || saved === 'en') return saved
  } catch {
    /* no storage: fall through to the browser's preference */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en'
  return nav.toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: messages as any,
  missingWarn: false,
  fallbackWarn: false,
})

export function dayjsLocale(l: Locale): string {
  return l === 'zh-Hant' ? 'zh-tw' : 'en'
}

export function setLocale(l: Locale) {
  i18n.global.locale.value = l
  dayjs.locale(dayjsLocale(l))
  // <html lang> chooses the typefaces too (styles/tokens.css); those it names are loaded.
  document.documentElement.lang = l
  loadFontsFor(l)
  try {
    localStorage.setItem(STORAGE_KEY, l)
  } catch {
    /* the choice lasts for this page only */
  }
}

setLocale(i18n.global.locale.value as Locale)
