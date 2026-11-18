import type { Cv, CvVersion } from '../../../domain/model'
import { formatDateTime } from '../../format'

export function cvLabel(cv: Cv): string {
  const target = [cv.position, cv.company].filter(Boolean).join(' · ')
  const title = cv.title.trim() || 'Sin título'
  return target && target !== title ? `${title} (${target})` : title
}

export function versionLabel(cv: Cv, version: CvVersion): string {
  const number = cv.versions.indexOf(version) + 1
  const when = formatDateTime(version.createdAt)
  return when ? `Versión ${number} · ${when}` : `Versión ${number}`
}

/** The version an attachment points to; '' means "whatever the latest one is". */
export function resolveVersion(cv: Cv, versionId: string): CvVersion | undefined {
  return (versionId && cv.versions.find((version) => version.id === versionId)) || cv.versions.at(-1)
}
