/**
 * Every entity accepts data the model does not define (salary, recruiter, a job's stack…).
 * It lives under `extra` and is kept through parsing and storage instead of being dropped.
 */

export type Extra = Record<string, unknown>

/** `entry.extra` plus any property of `entry` outside `known`; undefined when there is none. */
export function readExtra(entry: Record<string, unknown>, known: readonly string[]): Extra | undefined {
  const extra: Extra = isRecord(entry.extra) ? { ...entry.extra } : {}
  for (const [key, value] of Object.entries(entry)) {
    if (key !== 'extra' && !known.includes(key) && value !== undefined) extra[key] = value
  }
  return Object.keys(extra).length > 0 ? extra : undefined
}

/** `item` with `extra` set when there is any. */
export function withExtra<T extends object>(item: T, extra: Extra | undefined): T & { extra?: Extra } {
  return extra ? { ...item, extra } : item
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
