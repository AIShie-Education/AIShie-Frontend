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

/**
 * The Date a browser-local datetime picker needs in order to show an instant's
 * wall time in the school's zone. With no school zone this is the usual Date.
 */
export function toPickerDate(v: string, zone = schoolTimeZone.value): Date {
  if (!zone) return new Date(v)
  const p = wallParts(v, zone)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/** Interpret the wall fields a browser-local picker returned as being in the school's zone. */
export function fromPickerDate(date: Date, zone = schoolTimeZone.value): Date {
  if (!zone) return date
  const p = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }
  const wall = asUtc(p)
  // The offset is read again at the answer, which also handles a daylight-saving change.
  const offset = (ms: number) => asUtc(wallParts(ms, zone)) - ms
  let instant = wall - offset(wall)
  instant = wall - offset(instant)
  return new Date(instant)
}

export function pickerDateToISO(date: Date, zone = schoolTimeZone.value): string {
  return fromPickerDate(date, zone).toISOString()
}
