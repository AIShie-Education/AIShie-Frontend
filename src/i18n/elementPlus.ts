// Element Plus in the page's language, switching with it (App.vue hands this
// to <el-config-provider>): its zh-cn for Simplified Chinese, its zh-tw for
// Traditional. Its own zh-TW leaves the labels it gives screen readers on
// tables in English ("Sort by 名稱"): those are taken from layout.elementPlus
// instead, in every language, so nothing is read out mixed and each reads as
// the app's own messages do.
import type { Language } from 'element-plus/es/locale'
import en from 'element-plus/es/locale/lang/en'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import { i18n, type Locale } from '.'

const BASE: Record<Locale, Language> = { 'zh-Hans': zhCn, 'zh-Hant': zhTw, en }

const TABLE_LABELS = [
  'sortLabel',
  'filterLabel',
  'selectAllLabel',
  'selectRowLabel',
  'expandRowLabel',
  'collapseRowLabel',
] as const

export function elementLocale(locale: Locale): Language {
  const base = BASE[locale] ?? en
  const table: Record<string, string> = { ...(base.el.table as Record<string, string>) }
  for (const key of TABLE_LABELS) {
    // Element Plus fills in {column} itself: it is handed on as it is.
    table[key] = i18n.global.t(`layout.elementPlus.${key}`, { column: '{column}' }, { locale })
  }
  return { ...base, el: { ...base.el, table } }
}
