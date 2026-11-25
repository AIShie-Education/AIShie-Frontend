import { i18n } from '@/i18n'

const HAN = /\p{Script=Han}/u

/**
 * The language to put on a piece of data whose script is not necessarily the
 * page's. Han on an English page uses Traditional Chinese, the script the app
 * loads for mixed English text; on a Chinese page it keeps the page's script.
 * Latin and other scripts need no override: the Latin alias faces cover them.
 */
export function scriptLanguage(text: string | null | undefined): 'zh-Hant' | 'zh-Hans' | undefined {
  if (!text || !HAN.test(text)) return undefined
  return i18n.global.locale.value === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant'
}
