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
