import { ref } from 'vue'
import { formatDateTime, timeZoneName } from '@/utils/format'

/** me.get's optional IANA school zone; unset keeps every clock on the reader's, as before. */
export const schoolTimeZone = ref<string | undefined>()
export function setSchoolTimeZone(zone: string | null | undefined): void {
  schoolTimeZone.value = zone || undefined
}

export function readerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export interface ZonedClock {
  time: string
  zone: string
}

/** A cut-off on the school's clock when Core gives one, with the reader's beside it when different. */
export function cutoffTimes(
  v: string,
  school: string | null | undefined = schoolTimeZone.value,
): { primary: ZonedClock; reader?: ZonedClock } {
  const reader = { time: formatDateTime(v), zone: timeZoneName(v) }
  if (!school) return { primary: reader }
  const primary = { time: formatDateTime(v, school), zone: timeZoneName(v, school) }
  return readerTimeZone() === school ? { primary } : { primary, reader }
}

interface WallParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallParts(v: string | number | Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(v))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

const asUtc = (p: WallParts) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
const pad = (n: number) => String(n).padStart(2, '0')
const wallString = (p: WallParts) =>
  `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`

/** An instant's wall fields in the picker's zone, without putting them in a reader-local Date. */
export function toPickerWallTime(v: string, zone = schoolTimeZone.value): string {
  return wallString(wallParts(v, zone ?? readerTimeZone())).slice(0, 16)
}

export type WallTimeProblem = 'nonexistent' | 'ambiguous' | 'invalid'
export class ZonedWallTimeError extends Error {
  constructor(public readonly problem: WallTimeProblem) {
    super(problem)
  }
}

/** Parse a wall timestamp strictly, refusing DST gaps and folds rather than normalising them. */
export function pickerWallTimeToISO(wall: string, zone = schoolTimeZone.value): string {
  const timeZone = zone ?? readerTimeZone()
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall)
  if (!m) throw new ZonedWallTimeError('invalid')
  const p = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
  }
  const wallMs = asUtc(p)
  const check = new Date(wallMs)
  if (
    check.getUTCFullYear() !== p.year ||
    check.getUTCMonth() + 1 !== p.month ||
    check.getUTCDate() !== p.day ||
    check.getUTCHours() !== p.hour ||
    check.getUTCMinutes() !== p.minute ||
    p.second > 59
  ) {
    throw new ZonedWallTimeError('invalid')
  }
  const offsets = new Set<number>()
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const ms = wallMs + hours * 3600_000
    offsets.add(asUtc(wallParts(ms, timeZone)) - ms)
  }
  const candidates = [...offsets]
    .map((offset) => wallMs - offset)
    .filter((ms) => wallString(wallParts(ms, timeZone)) === wallString(p))
  if (!candidates.length) throw new ZonedWallTimeError('nonexistent')
  if (candidates.length > 1) throw new ZonedWallTimeError('ambiguous')
  return new Date(candidates[0]!).toISOString()
}

/** Keep an existing instant when its wall fields are untouched; a changed one must be unambiguous. */
export function pickerInstant(wall: string, original: string | null, zone = schoolTimeZone.value): string {
  if (original && wall === toPickerWallTime(original, zone)) return new Date(original).toISOString()
  return pickerWallTimeToISO(wall, zone)
}

/** Today's date on the picker's own clock. */
export function pickerToday(zone = schoolTimeZone.value): string {
  return toPickerWallTime(new Date().toISOString(), zone).slice(0, 10)
}

/** Disable calendar days before the picker's own today, comparing wall dates rather than reader-local instants. */
export function pickerDateDisabled(date: Date, zone = schoolTimeZone.value): boolean {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return day < pickerToday(zone)
}
