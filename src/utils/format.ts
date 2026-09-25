import dayjs from 'dayjs'
import type { Decimal } from '@/api/types'

/** A decimal from Core, shown without float noise: 12.50 → "12.5". */
export function formatDecimal(v: Decimal | null | undefined, maxFraction = 2): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFraction })
}

/** score / points as a percentage, or "—" when either is missing. */
export function formatPercent(score: Decimal | null | undefined, of: Decimal | null | undefined): string {
  const s = Number(score)
  const p = Number(of)
  if (score === null || score === undefined || !Number.isFinite(s) || !Number.isFinite(p) || p === 0) return '—'
  return `${((s / p) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

/** A fraction in [0, 1] (or beyond, with extra credit) as a percentage. */
export function formatFraction(f: Decimal | null | undefined): string {
  if (f === null || f === undefined || f === '') return '—'
  const n = Number(f)
  if (!Number.isFinite(n)) return String(f)
  return `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).format('YYYY-MM-DD HH:mm')
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return '—'
  return dayjs(v).format('YYYY-MM-DD')
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
  return `${v.toLocaleString(undefined, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`
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
