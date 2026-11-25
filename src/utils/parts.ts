// What joins words where only a string will do (a title, a label read out,
// an option in a list, a line printed): the language's punctuation, from the
// messages, never written here (docs/CONVENTIONS.md, Text). A template puts
// {{ t('common.sep') }} between its parts itself, and span.app-sep between a
// course's code and its section.
import { i18n } from '@/i18n'
import { cutoffTimes, schoolTimeZone } from '@/utils/schoolTime'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})

/** The parts of one line of facts, those there are, with the language's dot between them: "PDF · 1.2 MB". */
export function joinParts(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p).join(t('common.sep'))
}

/** Whole sentences as the language puts one after another: spaced in English, adjoining in Chinese. */
export function joinSentences(sentences: readonly (string | null | undefined | false)[]): string {
  const kept = sentences.filter((p): p is string => !!p)
  return kept.join(i18n.global.locale.value.startsWith('zh') ? '' : ' ')
}

/** A course's code and its section as one string ("CS101 · A", 「CS101·A」), or its code alone. */
export function courseCodeText(code: string | null | undefined, section?: string | null): string {
  if (!code) return section ?? ''
  return section ? t('common.courseCode', { code, section }) : code
}

/**
 * A cut-off in a sentence (a due date, when a seat or an invitation ends): on
 * the reader's clock with its time zone named, "2026-10-08 23:59 (Hong Kong
 * Standard Time)", 「香港標準時間 2026-10-08 23:59」. A page shows one with
 * <TimeText cutoff />, which gives the exact UTC on hover too.
 */
export function zonedText(
  v: string | null | undefined,
  schoolZone: string | null | undefined = schoolTimeZone.value,
): string {
  if (!v) return '—'
  const { primary, reader } = cutoffTimes(v, schoolZone)
  const school = t('common.time.zoned', { ...primary })
  if (!reader) return school
  return t('common.time.schoolAndReader', {
    school,
    reader: t('common.time.zoned', { ...reader }),
  })
}
