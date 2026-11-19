/** Date formatting for the app chrome (the CV itself formats its own dates). */

const LOCALE = 'es-AR'
const dayFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/** `yyyy-mm-dd` (a calendar day) or an ISO timestamp (its local day) → "18 nov 2026". */
export function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) return dayFormat.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const time = Date.parse(value)
  return Number.isNaN(time) ? '' : dayFormat.format(time)
}

/** ISO timestamp → "18 nov, 14:30". */
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '' : dateTimeFormat.format(time)
}

/** Today in the user's time zone, as `yyyy-mm-dd`. */
export function todayYmd(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Calendar days between a date (ISO or `yyyy-mm-dd`) and today, in the user's time zone. */
export function calendarDaysAgo(value: string, now: Date = new Date()): number | null {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const start = (moment: Date) => new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime()
  return Math.round((start(now) - start(date)) / 86_400_000)
}

/** "hoy", "ayer", "hace 5 días", "hace 3 semanas", "hace 2 meses"… */
export function relativeTime(value: string, now: Date = new Date()): string {
  const days = calendarDaysAgo(value, now)
  if (days === null) return ''
  if (days < 14) return relativeFormat.format(-days, 'day')
  if (days < 60) return relativeFormat.format(-Math.round(days / 7), 'week')
  if (days < 365) return relativeFormat.format(-Math.round(days / 30), 'month')
  return relativeFormat.format(-Math.round(days / 365), 'year')
}

const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' })

/** A note's date at whatever precision it has: "2026", "mar 2026" or "14 mar 2026". */
export function formatPartialDate(value: string): string {
  if (/^\d{4}$/.test(value)) return value
  const month = /^(\d{4})-(\d{2})$/.exec(value)
  if (month) return monthFormat.format(new Date(Number(month[1]), Number(month[2]) - 1, 1))
  return formatDay(value)
}
