/**
 * Whole-document operations shared by the app (UI) and the MCP server, so both change the
 * document the same way. Pure functions: ids and timestamps come in as arguments when callers
 * need to know them.
 */
import type { Experience } from './experiences'
import { defaultFontSize, defaultMargin, type FontId } from './fonts'
import {
  applyProfile,
  buildResume,
  emptySnapshot,
  graphFromSelection,
  type Cv,
  type CvVersion,
  type Profile,
  type ResumeDocument,
} from './model'
import type { TemplateId } from './templates'

export type CvDraft = {
  title: string
  position: string
  company: string
  posting: string
  templateId: TemplateId
  fontId: FontId
  experienceIds: string[]
}

/** Sets the profile and copies it into every CV's person node. */
export function writeProfile(document: ResumeDocument, profile: Profile): ResumeDocument {
  return {
    ...document,
    profile,
    nodes: applyProfile(document.nodes, profile),
    cvs: document.cvs.map((cv) => ({ ...cv, nodes: applyProfile(cv.nodes, profile) })),
  }
}

/** CVs with the open CV's graph (kept at the document root while editing) written back into it. */
export function rememberGraph(document: ResumeDocument): Cv[] {
  return document.cvs.map((cv) => (cv.id === document.activeCvId ? { ...cv, nodes: document.nodes, edges: document.edges } : cv))
}

/** Opens `cvId` in the workspace: its graph moves to the document root. */
export function openCvGraph(document: ResumeDocument, cvId: string): ResumeDocument {
  if (document.activeCvId === cvId) return document
  const cvs = rememberGraph(document)
  const next = cvs.find((cv) => cv.id === cvId)
  if (!next) return document
  return { ...document, cvs, activeCvId: cvId, nodes: next.nodes, edges: next.edges }
}

/** A new CV from bank experiences, opened in the workspace. */
export function createCv(
  document: ResumeDocument,
  draft: CvDraft,
  ids: { id?: string; versionId?: string; now?: Date } = {},
): { document: ResumeDocument; cvId: string; versionId: string } {
  const id = ids.id ?? crypto.randomUUID()
  const versionId = ids.versionId ?? crypto.randomUUID()
  const version: CvVersion = { id: versionId, createdAt: (ids.now ?? new Date()).toISOString(), snapshot: emptySnapshot() }
  const selected = draft.experienceIds
    .map((experienceId) => document.bank.find((item) => item.id === experienceId))
    .filter((item): item is Experience => Boolean(item))
  const graph = graphFromSelection(document.profile, { title: draft.position || draft.title, company: draft.company }, selected)
  const cv: Cv = {
    id,
    title: draft.title.trim() || 'Sin título',
    position: draft.position.trim(),
    company: draft.company.trim(),
    posting: draft.posting,
    summary: '',
    templateId: draft.templateId,
    fontId: draft.fontId,
    fontSize: defaultFontSize(draft.templateId),
    lineHeight: 1.15,
    marginId: defaultMargin(draft.templateId),
    pageSize: 'letter',
    enabledSections: selected.length > 0 ? ['personal', 'experience', 'skills'] : ['personal'],
    versions: [version],
    nodes: graph.nodes,
    edges: graph.edges,
  }
  return {
    document: { ...document, cvs: [...rememberGraph(document), cv], activeCvId: id, nodes: graph.nodes, edges: graph.edges },
    cvId: id,
    versionId,
  }
}

/**
 * Removes a CV (applications that had it attached forget it); if it was open, the first remaining
 * one opens instead.
 */
export function deleteCv(document: ResumeDocument, cvId: string): ResumeDocument {
  const cvs = document.cvs.filter((cv) => cv.id !== cvId)
  const applications = document.applications.map((application) =>
    application.attachment?.kind === 'cv' && application.attachment.cvId === cvId ? { ...application, attachment: null } : application,
  )
  if (document.activeCvId !== cvId) return { ...document, cvs, applications }
  const next = cvs[0]
  return { ...document, cvs, applications, activeCvId: next?.id ?? '', nodes: next?.nodes ?? [], edges: next?.edges ?? [] }
}

/** "Generar": saves a new version of a CV built from its current graph. */
export function buildCvVersion(
  document: ResumeDocument,
  cvId: string,
  ids: { versionId?: string; now?: Date } = {},
): { document: ResumeDocument; versionId: string } {
  const cvs = rememberGraph(document)
  const cv = cvs.find((item) => item.id === cvId)
  if (!cv) throw new Error(`No CV with id ${cvId}`)
  const versionId = ids.versionId ?? crypto.randomUUID()
  const version: CvVersion = {
    id: versionId,
    createdAt: (ids.now ?? new Date()).toISOString(),
    snapshot: buildResume(cv.nodes, cv.edges, cv.summary, { sections: document.sections, bank: document.bank }),
  }
  return {
    document: { ...document, cvs: document.cvs.map((item) => (item.id === cvId ? { ...item, versions: [...item.versions, version] } : item)) },
    versionId,
  }
}
