import type { ReactNode } from 'react'

/** Line icons for the CV editor, 20×20 on a 1.6 stroke, drawn to sit with the app's other icons. */
type IconProps = { size?: number }

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function ContentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 2.75h7l3 3v11.5H5z" />
      <path d="M12 2.75v3h3M7.5 9.5h5M7.5 12.5h5M7.5 15.5h3" />
    </Svg>
  )
}

export function SectionsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="14" height="4" rx="1.2" />
      <rect x="3" y="9" width="14" height="3.5" rx="1.2" />
      <rect x="3" y="14.5" width="9" height="2.5" rx="1" />
    </Svg>
  )
}

export function DesignIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.75a7.25 7.25 0 1 0 0 14.5c1.1 0 1.6-.8 1.3-1.7-.4-1 .3-2 1.4-2h1.6a2.95 2.95 0 0 0 2.95-2.95C17.25 6 14 2.75 10 2.75z" />
      <circle cx="6.5" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function AnalysisIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 13.5a6.5 6.5 0 1 1 13 0" />
      <path d="M10 13.5l3.2-4" />
      <circle cx="10" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M3 16.75h14" />
    </Svg>
  )
}

export function PostingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.6" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function VersionsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.25 10a6.75 6.75 0 1 0 2-4.8" />
      <path d="M3 3.5v3.25h3.25M10 6.5V10l2.5 1.75" />
    </Svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </Svg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m7 8 3 3 3-3" />
    </Svg>
  )
}

export function UpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 12 4-4 4 4" />
    </Svg>
  )
}

export function DownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 8 4 4 4-4" />
    </Svg>
  )
}

export function EyeIcon({ off = false, ...props }: IconProps & { off?: boolean }) {
  return (
    <Svg {...props}>
      <path d="M2.5 10s2.75-5 7.5-5 7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" />
      <circle cx="10" cy="10" r="2.2" />
      {off ? <path d="M3.5 16.5 16.5 3.5" /> : null}
    </Svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h12M8 5.5V4h4v1.5M5.5 5.5l.75 11h7.5l.75-11" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </Svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5 17.25 16H2.75z" />
      <path d="M10 8.5v3.25" />
      <circle cx="10" cy="13.9" r="0.85" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function CrossCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="m7.5 7.5 5 5M12.5 7.5l-5 5" />
    </Svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4 16h12" />
    </Svg>
  )
}

export function GraphIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="5.5" r="2" />
      <circle cx="15" cy="4.5" r="2" />
      <circle cx="10.5" cy="15" r="2" />
      <path d="M6.6 7.1l3 6M13.9 6.3l-2.6 6.8" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 10h11" />
    </Svg>
  )
}

export function FitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
    </Svg>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.75 11.6 8.4 17.25 10 11.6 11.6 10 17.25 8.4 11.6 2.75 10 8.4 8.4z" />
    </Svg>
  )
}
