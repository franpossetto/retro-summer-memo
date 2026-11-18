import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ResumeDocument } from '../domain/model'
import type { DocumentStore } from '../ports/documentStore'

export type SaveStatus =
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'error'; message: string }

const SAVE_DELAY_MS = 500
const RETRY_DELAY_MS = 5000

/**
 * The document being edited, kept in sync with `store`: changes are saved shortly after the user
 * stops editing, failures are shown and retried, and remote changes are merged in as they arrive.
 */
export function useDocumentSync(store: DocumentStore, initial: ResumeDocument): {
  doc: ResumeDocument
  setDoc: Dispatch<SetStateAction<ResumeDocument>>
  status: SaveStatus
  retry: () => void
} {
  const [doc, setDoc] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const dirty = doc !== saved

  useEffect(() => store.subscribe((rebase) => setDoc(rebase)), [store])

  useEffect(() => {
    if (!dirty) return
    let current = true
    const timer = window.setTimeout(() => {
      store.save(doc).then(
        () => {
          if (!current) return
          setSaved(doc)
          setError(null)
        },
        (reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : String(reason))
        },
      )
    }, SAVE_DELAY_MS)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [doc, dirty, store, attempt])

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setAttempt((count) => count + 1), RETRY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [error, attempt])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const status: SaveStatus = error ? { state: 'error', message: error } : dirty ? { state: 'saving' } : { state: 'saved' }
  return { doc, setDoc, status, retry: () => setAttempt((count) => count + 1) }
}
