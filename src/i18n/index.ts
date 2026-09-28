// Three languages: Chinese in both scripts, Traditional and Simplified, and
// English. Messages live one file per namespace under
// messages/<locale>/<namespace>.ts, each exporting its messages as default;
// the file name is the namespace, so messages/en/members.ts is t('members.…').
import { createI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { loadFontsFor } from '@/styles/fonts'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

export type Locale = 'zh-Hant' | 'zh-Hans' | 'en'
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'en', label: 'English' },
]

export function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.value === v)
}

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/*/*.ts', { eager: true })
const messages = Object.fromEntries(LOCALES.map((l) => [l.value, {}])) as Record<Locale, Record<string, unknown>>
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\.\/messages\/([^/]+)\/([^/]+)\.ts$/)
  if (!m) continue
  const [, locale, ns] = m as unknown as [string, Locale, string]
  if (!messages[locale]) continue
  messages[locale][ns] = mod.default
}

const STORAGE_KEY = 'aishiteru.locale'

/**
 * The language for a browser that asks for tag (navigator.language): Chinese
 * in the script it names, or else the one its region writes — Traditional in
 * Taiwan, Hong Kong and Macao, Simplified elsewhere, and for a bare zh — and
 * English for anything else.
 */
export function localeForTag(tag: string | null | undefined): Locale {
  const [lang, ...rest] = (tag || '').toLowerCase().split(/[-_]/)
  if (lang !== 'zh') return 'en'
  const script = rest.find((s) => s.length === 4)
  if (script === 'hant') return 'zh-Hant'
  if (script === 'hans') return 'zh-Hans'
  const region = rest.find((s) => s.length === 2 || /^\d{3}$/.test(s))
  return region === 'tw' || region === 'hk' || region === 'mo' ? 'zh-Hant' : 'zh-Hans'
}

/** The language chosen before in this browser, or else the one it asks for. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* no storage: fall through to the browser's preference */
  }
  return localeForTag(typeof navigator !== 'undefined' ? navigator.language : undefined)
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: messages as any,
  missingWarn: false,
  fallbackWarn: false,
})

/** dayjs's name for the language, whose dates and relative times it writes. */
export function dayjsLocale(l: Locale): string {
  return l === 'zh-Hans' ? 'zh-cn' : l === 'zh-Hant' ? 'zh-tw' : 'en'
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
