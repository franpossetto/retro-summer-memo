import { createSeedDocument, type ResumeDocument } from '../domain/model'
import type { DocumentStore } from '../ports/documentStore'

export type OpenedDocument = {
  document: ResumeDocument
  /** How an empty store was filled: copied from `importFrom`, or a fresh seed. Null if it already had data. */
  created: 'imported' | 'seeded' | null
}

/**
 * Loads the document from `store`. A store with nothing in it (a new account) is filled with
 * `importFrom()` when that returns a document — e.g. data from the browser — or a fresh seed.
 */
export async function openDocument(
  store: DocumentStore,
  importFrom?: () => ResumeDocument | null,
): Promise<OpenedDocument> {
  const existing = await store.load()
  if (existing) return { document: existing, created: null }
  const imported = importFrom?.() ?? null
  const document = imported ?? createSeedDocument()
  await store.save(document)
  return { document, created: imported ? 'imported' : 'seeded' }
}
