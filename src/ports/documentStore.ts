import type { ResumeDocument } from '../domain/model'

/**
 * Folds a change made elsewhere (another tab, Claude through the MCP) into the document the user
 * is editing. Pure, so it is safe to hand to a React state updater.
 */
export type Rebase = (local: ResumeDocument) => ResumeDocument

/** Where the document lives. The UI and the use cases only ever talk to this interface. */
export interface DocumentStore {
  /** Short name for status messages, e.g. "this browser" or "Supabase". */
  readonly label: string
  /** The stored document, or null when nothing has been stored yet. */
  load(): Promise<ResumeDocument | null>
  /**
   * Persists `document`. Implementations may write only what changed since the last load/save.
   * Rejects when nothing was stored, so callers can tell the user and retry.
   */
  save(document: ResumeDocument): Promise<void>
  /** Notifies remote changes. Returns an unsubscribe function. */
  subscribe(onRemote: (rebase: Rebase) => void): () => void
}
