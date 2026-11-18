/** Date formatting for the app chrome (the CV itself formats its own dates). */

const LOCALE = 'es-AR'
const dayFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/** `yyyy-mm-dd` → "18 nov 2026". */
export function formatDay(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ''
  return dayFormat.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
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
