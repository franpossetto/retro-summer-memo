import { useId } from 'react'
import '@fontsource-variable/fraunces/soft.css'
import './brand.css'

/**
 * The brand: Retro Summer Memo, whose first syllables spell RE·SU·ME. The mark is a memo (a CV
 * page with a folded corner) with a retro striped sun on the horizon. public/favicon.svg is the
 * same drawing; keep them in sync.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc53d" />
          <stop offset="0.55" stopColor="#ff7b45" />
          <stop offset="1" stopColor="#f0476f" />
        </linearGradient>
        <mask id={`${id}-stripes`}>
          <rect x="0" y="0" width="64" height="64" fill="#fff" />
          <rect x="0" y="39.6" width="64" height="1.3" fill="#000" />
          <rect x="0" y="43" width="64" height="1.8" fill="#000" />
          <rect x="0" y="46.4" width="64" height="2.4" fill="#000" />
        </mask>
      </defs>
      <path d="M16 5h26l13 13v36a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5z" fill="#fff8ec" />
      <path d="M16 50a17 17 0 0 1 34 0z" fill={`url(#${id}-sun)`} mask={`url(#${id}-stripes)`} />
      <path
        d="M16 5h26l13 13v36a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5zM42 5v9a4 4 0 0 0 4 4h9"
        fill="none"
        stroke="#1f2328"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M19 16h14M19 23h20" stroke="#1f2328" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M14.5 50h37" stroke="#1f2328" strokeWidth="3" strokeLinecap="round" />
      <path d="M25 55h16" stroke="#f0476f" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** "Retro Summer Memo" with Re·Su·Me standing out. Read aloud it is the product's name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={['wordmark', className].filter(Boolean).join(' ')} aria-label="ReSuMe · Retro Summer Memo">
      <span aria-hidden="true">
        <b>Re</b>
        <i>tro</i> <b>Su</b>
        <i>mmer</i> <b>Me</b>
        <i>mo</i>
      </span>
    </span>
  )
}

/** Mark + wordmark, side by side. */
export function Brand({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={['brand', className].filter(Boolean).join(' ')}>
      <LogoMark size={size} />
      <Wordmark />
    </span>
  )
}
