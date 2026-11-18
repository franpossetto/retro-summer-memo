/**
 * The document as the MCP exposes it, and generic edits over it.
 *
 * The app keeps the open CV's graph at the document root; here every CV carries its own graph,
 * so paths are stable (`/cvs/[id=…]/nodes`) regardless of which CV is open in the app.
 */
import { diffTables, toTables } from '../adapters/supabase/rows'
import { rememberGraph, writeProfile } from '../domain/documentOps'
import type { ResumeDocument } from '../domain/model'
import { parseDocument } from '../domain/parse'
import { applyPatch, type PatchOperation } from './jsonPatch'

/** Every editable part of the document, CVs with their own graphs. Patch paths point into this. */
export type EditableDocument = Omit<ResumeDocument, 'nodes' | 'edges'>

export function editable(document: ResumeDocument): EditableDocument {
  const { nodes: _nodes, edges: _edges, ...rest } = document
  return { ...rest, cvs: rememberGraph(document) }
}

export type ViewOptions = {
  /** Parts to include (top-level keys); all when empty. */
  include?: (keyof EditableDocument)[]
  /** Include CV/role graphs and version snapshots (large). */
  graphs?: boolean
}

/** What get_document returns: the editable document, without the heavy graph parts unless asked. */
export function documentView(document: ResumeDocument, options: ViewOptions = {}): Partial<EditableDocument> {
  const full = editable(document)
  const view: Record<string, unknown> = {
    ...full,
    cvs: options.graphs
      ? full.cvs
      : full.cvs.map(({ nodes, edges: _edges, versions, ...cv }) => ({
          ...cv,
          graph: `${nodes.length} nodes (get_document with graphs=true to see them)`,
          versions: versions.map((version) => ({ id: version.id, createdAt: version.createdAt })),
        })),
    roleGraphs: options.graphs ? full.roleGraphs : full.roleGraphs.map((graph) => ({ id: graph.id, nodes: graph.nodes.length })),
  }
  if (!options.include || options.include.length === 0) return view as Partial<EditableDocument>
  return Object.fromEntries(options.include.map((key) => [key, view[key]])) as Partial<EditableDocument>
}

export type PatchResult = {
  document: ResumeDocument
  /** Rows that saving will write, per table. */
  changes: { table: string; upserted: number; deleted: number }[]
  /** Items the app's rules rejected (and dropped), so the caller can fix and retry. */
  warnings: string[]
}

/**
 * Applies JSON Patch operations to the editable document, then normalizes it with the same
 * parser the app uses: missing ids are generated, invalid entries are dropped (and reported),
 * and the profile is copied into every CV.
 */
export function patchDocument(document: ResumeDocument, operations: PatchOperation[], now: Date = new Date()): PatchResult {
  const patched = applyPatch(editable(document), operations)
  if (!isRecord(patched)) throw new Error('The document must stay an object')
  fillMissing(patched, now.toISOString())

  const cvs = Array.isArray(patched.cvs) ? (patched.cvs as Record<string, unknown>[]) : []
  const open = cvs.find((cv) => isRecord(cv) && cv.id === patched.activeCvId) ?? cvs[0]
  const parsed = parseDocument({
    ...patched,
    activeCvId: open?.id ?? '',
    nodes: Array.isArray(open?.nodes) ? open.nodes : [],
    edges: Array.isArray(open?.edges) ? open.edges : [],
  })
  const next = writeProfile(parsed, parsed.profile)

  return {
    document: next,
    changes: diffTables(toTables(document), toTables(next))
      .filter((ops) => ops.upserts.length > 0 || ops.deletes.length > 0)
      .map((ops) => ({ table: ops.table, upserted: ops.upserts.length, deleted: ops.deletes.length })),
    warnings: droppedItems(patched, next),
  }
}

/** Collections checked after a patch; `ids`: items get a generated id when they come without one. */
const collections: { label: string; ids: boolean; read: (doc: Record<string, unknown>) => unknown[] }[] = [
  { ids: true, label: 'profile.fields', read: (doc) => list(record(doc.profile).fields) },
  { ids: true, label: 'profile.jobs', read: (doc) => list(record(doc.profile).jobs) },
  { ids: true, label: 'profile.jobs[].roles', read: (doc) => list(record(doc.profile).jobs).flatMap((job) => list(record(job).roles)) },
  { ids: true, label: 'profile.education', read: (doc) => list(record(doc.profile).education) },
  { ids: true, label: 'bank', read: (doc) => list(doc.bank) },
  { ids: true, label: 'sections', read: (doc) => list(doc.sections) },
  { ids: true, label: 'roleGraphs', read: (doc) => list(doc.roleGraphs) },
  { ids: true, label: 'cvs', read: (doc) => list(doc.cvs) },
  { ids: true, label: 'cvs[].versions', read: (doc) => list(doc.cvs).flatMap((cv) => list(record(cv).versions)) },
  { ids: true, label: 'applications', read: (doc) => list(doc.applications) },
  { ids: true, label: 'applications[].events', read: (doc) => list(doc.applications).flatMap((application) => list(record(application).events)) },
  { ids: true, label: 'applicationStatuses', read: (doc) => list(doc.applicationStatuses) },
  // Levels point at bank items by id: never invent one.
  { label: 'knowledge', ids: false, read: (doc) => list(doc.knowledge) },
]

/** New items usually come without ids or timestamps: fill them like the app would. */
function fillMissing(doc: Record<string, unknown>, now: string) {
  for (const { read } of collections.filter((collection) => collection.ids)) {
    for (const item of read(doc)) {
      if (isRecord(item) && (typeof item.id !== 'string' || item.id === '')) item.id = crypto.randomUUID()
    }
  }
  for (const application of list(doc.applications)) {
    if (!isRecord(application)) continue
    application.createdAt ||= now
    application.updatedAt ||= now
    for (const event of list(application.events)) if (isRecord(event)) event.at ||= now
  }
  for (const cv of list(doc.cvs)) {
    for (const version of list(record(cv).versions)) if (isRecord(version)) version.createdAt ||= now
  }
}

function droppedItems(patched: Record<string, unknown>, next: ResumeDocument): string[] {
  const after = editable(next) as unknown as Record<string, unknown>
  const dropped = collections.flatMap(({ label, read }) => {
    const sent = read(patched).length
    const kept = read(after).length
    return kept < sent ? [`${sent - kept} of ${sent} items in ${label} were invalid and dropped (check required fields and references).`] : []
  })
  return dropped
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
