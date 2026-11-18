import type { ResumeDocument } from '../domain/model'
import { parseDocument } from '../domain/parse'
import type { DocumentStore } from '../ports/documentStore'

export const LOCAL_STORAGE_KEY = 'resume.v1'

/** Document kept in this browser's localStorage (the app's original storage). */
export function createLocalStore(storage: Storage = window.localStorage, key = LOCAL_STORAGE_KEY): DocumentStore {
  return {
    label: 'this browser',
    async load() {
      return readStoredDocument(storage, key)
    },
    async save(document) {
      try {
        storage.setItem(key, JSON.stringify(document))
      } catch (error) {
        throw new Error(
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? 'Browser storage is full. Delete old CV versions or move to Supabase.'
            : 'Browser storage is unavailable.',
          { cause: error },
        )
      }
    },
    subscribe() {
      return () => {}
    },
  }
}

/** The document saved in this browser, if any — used to import it into another backend. */
export function readStoredDocument(storage: Storage = window.localStorage, key = LOCAL_STORAGE_KEY): ResumeDocument | null {
  try {
    const raw = storage.getItem(key)
    return raw ? parseDocument(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
