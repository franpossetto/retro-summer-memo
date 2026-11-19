import { useState, type CSSProperties } from 'react'
import { initials, logoSources, type Company } from '../../../domain/companies'

const tints = ['#0969da', '#8250df', '#bf8700', '#bc4c00', '#1b7c83', '#bf3989', '#1a7f37', '#cf222e']

function tintFor(name: string): string {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return tints[hash % tints.length]
}

/**
 * The company's logo: the image saved for it, else its website's icon, else its initials. Icons
 * smaller than 32px (what the icon service returns when a site has none) count as missing.
 */
export function CompanyLogo({ name, company, size = 40 }: { name: string; company?: Pick<Company, 'logo' | 'website'>; size?: number }) {
  const sources = company ? logoSources(company) : []
  // Remount when the sources change, so a new logo URL gets tried from the start.
  return <LogoImage key={sources.join('|')} name={name} sources={sources} size={size} />
}

function LogoImage({ name, sources, size }: { name: string; sources: string[]; size: number }) {
  const [index, setIndex] = useState(0)
  const style = { '--logo-size': `${size}px`, '--logo-tint': tintFor(name) } as CSSProperties
  const source = sources[index]
  if (!source) {
    return (
      <span className="company-logo is-initials" style={style} aria-hidden="true">
        {initials(name)}
      </span>
    )
  }
  return (
    <span className="company-logo" style={style} aria-hidden="true">
      <img
        src={source}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setIndex((current) => current + 1)}
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth < 32) setIndex((current) => current + 1)
        }}
      />
    </span>
  )
}
