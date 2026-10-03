// What an upload is doing, in words: the line under a file in a drop zone's
// list (FileDropZone), and the chat composer's chips. Waiting, starting,
// how much is sent at what speed and how long is left, trying again, done,
// cancelled, or why it failed: too large (with both sizes, where the limit
// is known), or Core's refusal in the words of the place that met it.
import { toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorMessage, type ReasonScopes } from '@/composables/useErrors'
import type { UploadItem } from '@/composables/useUploadQueue'
import { formatBytes, formatPct } from '@/utils/format'
import { joinParts } from '@/utils/parts'

export interface UploadTextOptions extends ReasonScopes {
  /** The largest file Core takes, where known, for a file refused as too large without saying. */
  maxBytes?: MaybeRefOrGetter<number | null | undefined>
  /** One version's files: how many a version holds, for a file there was no room for. */
  maxFiles?: MaybeRefOrGetter<number | null | undefined>
  /** One version's files: how much they may come to together, for a file there was no room for. */
  maxVersionBytes?: MaybeRefOrGetter<number | null | undefined>
}

export function useUploadText(opts: UploadTextOptions = {}) {
  const { t } = useI18n()

  const percent = (item: UploadItem) => Math.floor(item.fraction * 100)
  /** How much of it is sent, as the language writes a percentage: "47%". */
  const percentText = (item: UploadItem) => formatPct(percent(item) / 100, 0)

  function leftText(s: number): string {
    if (s < 60) return t('common.upload.left.seconds', { n: Math.max(1, s) })
    if (s < 3600) return t('common.upload.left.minutes', { n: Math.ceil(s / 60) })
    return t('common.upload.left.hours', { h: Math.floor(s / 3600), m: Math.ceil((s % 3600) / 60) })
  }

  /**
   * Why an item failed: too large, with both sizes where they are known; no
   * room for it among a version's files, by their count or their size; or
   * the refusal's words.
   */
  function failText(item: UploadItem): string {
    if (item.overLimit === 'files') {
      const max = toValue(opts.maxFiles)
      return max ? t('common.upload.overFiles', { max }, max) : t('common.upload.overFilesUnknown')
    }
    if (item.overLimit === 'bytes') {
      const max = toValue(opts.maxVersionBytes)
      return max ? t('common.upload.overBytes', { max: formatBytes(max) }) : t('common.upload.overBytesUnknown')
    }
    if (item.tooLarge) {
      const details = (item.error as { details?: { max_bytes?: number } } | null)?.details
      const max = details?.max_bytes ?? toValue(opts.maxBytes)
      return max
        ? t('common.upload.tooLarge', { size: formatBytes(item.size), max: formatBytes(max) })
        : t('common.upload.tooLargeUnknown', { size: formatBytes(item.size) })
    }
    return errorMessage(item.error, { reasons: opts.reasons })
  }

  /** What an item is doing, in words. */
  function statusText(item: UploadItem): string {
    switch (item.status) {
      case 'queued':
        return t('common.upload.status.queued')
      case 'uploading': {
        if (item.retrying) {
          return item.retrying.offline
            ? t('common.upload.status.offline')
            : t('common.upload.status.retrying', { attempt: item.attempt })
        }
        if (item.phase === 'preparing') return t('common.upload.status.preparing')
        if (item.phase === 'finishing') return t('common.upload.status.finishing')
        const parts = [
          percentText(item),
          t('common.upload.of', { loaded: formatBytes(item.loaded), total: formatBytes(item.size) }),
        ]
        if (item.bytesPerSecond !== null)
          parts.push(t('common.upload.speed', { speed: formatBytes(item.bytesPerSecond) }))
        if (item.secondsLeft !== null) parts.push(leftText(item.secondsLeft))
        return joinParts(parts)
      }
      case 'done':
        return t('common.upload.status.done')
      case 'cancelled':
        return t('common.upload.status.cancelled')
      case 'failed':
        return failText(item)
    }
  }

  return { percent, percentText, statusText, failText }
}
