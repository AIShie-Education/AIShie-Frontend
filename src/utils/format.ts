import dayjs from 'dayjs'
import type { Decimal } from '@/api/types'

// Numbers, and the names of time zones, are written as the page's language
// writes them, as dates are: i18n's setLocale gives the language as Intl
// names it (zh-CN, zh-TW, en).
let numberLocale: string | undefined

export function setNumberLocale(tag: string | undefined): void {
  numberLocale = tag
}

/** n with at most maxFraction decimals, in the page's language. */
export function formatNumber(n: number, maxFraction: number): string {
  return n.toLocaleString(numberLocale, { maximumFractionDigits: maxFraction })
}

/** A decimal from Core, shown without float noise: 12.50 → "12.5". */
export function formatDecimal(v: Decimal | null | undefined, maxFraction = 2): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return formatNumber(n, maxFraction)
}

/**
 * A fraction (0.8846) as a percentage the page's language writes ("88.5%"),
 * with at most maxFraction decimals: every percentage the app shows goes
 * through here, never a "%" written after a number.
 */
export function formatPct(fraction: number, maxFraction = 1): string {
  return new Intl.NumberFormat(numberLocale, { style: 'percent', maximumFractionDigits: maxFraction }).format(fraction)
}

/** score / points as a percentage, or "—" when either is missing. */
export function formatPercent(score: Decimal | null | undefined, of: Decimal | null | undefined): string {
  const s = Number(score)
  const p = Number(of)
  if (score === null || score === undefined || !Number.isFinite(s) || !Number.isFinite(p) || p === 0) return '—'
  return formatPct(s / p)
}

/** A fraction in [0, 1] (or beyond, with extra credit) as a percentage. */
export function formatFraction(f: Decimal | null | undefined): string {
  if (f === null || f === undefined || f === '') return '—'
  const n = Number(f)
  if (!Number.isFinite(n)) return String(f)
  return formatPct(n)
}

/**
 * US dollars as the page's language writes them, always "US$" (a "$" alone
 * reads as Hong Kong's in Hong Kong): to the cent from a dollar up, and below
 * it to three significant figures (US$0.0184 a call, not US$0.02 nor
 * US$0.018400). Core's decimals ("0.018400") are taken as they come; "—"
 * for none.
 */
export function formatMoney(usd: Decimal | null | undefined): string {
  if (usd === null || usd === undefined || usd === '') return '—'
  const n = Number(usd)
  if (!Number.isFinite(n)) return String(usd)
  const cents = n === 0 || Math.abs(n) >= 1
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'code',
    ...(cents
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumSignificantDigits: 2, maximumSignificantDigits: 3 }),
  }
  return new Intl.NumberFormat(numberLocale, options)
    .formatToParts(n)
    .map((p) => (p.type === 'currency' ? 'US$' : p.type === 'literal' && /^\s+$/.test(p.value) ? '' : p.value))
    .join('')
}

/**
 * Items as a list in the page's language: "a, b, and c" in English,
 * 「甲、乙和丙」 in Chinese, never items joined by a comma written here.
 */
export function formatList(items: readonly string[]): string {
  try {
    return new Intl.ListFormat(numberLocale, { type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).format('YYYY-MM-DD HH:mm')
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).format('YYYY-MM-DD')
}

/** The time of day v is on the reader's clock: "08:00". */
export function formatTime(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).format('HH:mm')
}

/** v exactly, in UTC, whatever the reader's time zone: "2026-10-02 00:00 UTC". */
export function formatUtc(v: string | null | undefined): string {
  const ms = v ? Date.parse(v) : NaN
  if (!Number.isFinite(ms)) return '—'
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/**
 * The reader's time zone as it is at v, named in the page's language
 * ("Hong Kong Standard Time", 「香港標準時間」, "Pacific Daylight Time"),
 * or, where the browser cannot name it, its offset then ("UTC+08:00").
 */
export function timeZoneName(v: string): string {
  try {
    const name = new Intl.DateTimeFormat(numberLocale, { timeZoneName: 'long' })
      .formatToParts(new Date(v))
      .find((p) => p.type === 'timeZoneName')?.value
    if (name) return name
  } catch {
    /* an engine without time zones' names: the offset alone */
  }
  return `UTC${dayjs(v).format('Z')}`
}

export function fromNow(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).fromNow()
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${formatNumber(v, i ? 1 : 0)} ${units[i]}`
}

/**
 * A short form of an id for showing, not for finding things by. Core's ids
 * are UUIDv7, whose first characters are a timestamp shared by everything
 * made in the same moment, so the short form is taken from the random end.
 */
export function shortId(id: string | null | undefined): string {
  return id ? id.replace(/-/g, '').slice(-8) : '—'
}

/** Is s a decimal Core will take? (Its schema's pattern, less the exponent.) */
export function isDecimal(s: string | number | null | undefined): boolean {
  if (s === null || s === undefined) return false
  return /^[-+]?(\d{1,40}(\.\d{0,40})?|\.\d{1,40})$/.test(String(s).trim())
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(s: string | null | undefined): boolean {
  return !!s && UUID_RE.test(s.trim())
}

/**
 * The UUID just before id in the order Postgres sorts UUIDs (byte by byte,
 * which is the order of the hex digits as one big number).
 */
export function uuidPredecessor(id: string): string | null {
  const hex = id.trim().replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  const n = BigInt('0x' + hex)
  if (n === 0n) return null
  const p = (n - 1n).toString(16).padStart(32, '0')
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-${p.slice(12, 16)}-${p.slice(16, 20)}-${p.slice(20)}`
}

// The usual extension for the types a course's files mostly come in, for
// naming a download whose name has none.
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/json': 'json',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/x-python': 'py',
  'text/x-c': 'c',
  'text/x-java-source': 'java',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

/**
 * A name to save a file under: the name given, with the usual extension for
 * its content type added when it has none ("Week 1 slides" as a PDF →
 * "Week 1 slides.pdf"). Characters no file system takes are replaced.
 */
export function downloadName(name: string | null | undefined, contentType?: string | null): string {
  let n = (name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'download'
  const ext = contentType ? EXTENSIONS[contentType.split(';')[0].trim().toLowerCase()] : undefined
  // "notes.log" has one; "Syllabus v2.1" does not.
  if (ext && !/\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(n)) n = `${n}.${ext}`
  return n
}

/**
 * A title for what a file becomes: its name without its extension ("Week 3 —
 * Loops.pdf" → "Week 3 — Loops"), which a download puts back from the file's
 * type (downloadName). A name that is only an extension stays as it is.
 */
export function titleFromFileName(name: string): string {
  const n = name.trim()
  return n.replace(/\.[A-Za-z][A-Za-z0-9]{0,7}$/, '').trim() || n
}
