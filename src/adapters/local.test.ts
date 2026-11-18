import { describe, expect, it } from 'vitest'
import { documentStoreContract } from '../ports/documentStore.contract'
import { sampleDocument } from '../test/sample'
import { createLocalStore, readStoredDocument } from './local'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

documentStoreContract('local store', async () => {
  const storage = memoryStorage()
  return { store: createLocalStore(storage), reopen: async () => createLocalStore(storage) }
})

describe('local store', () => {
  it('rejects with a clear message when the browser storage is full', async () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    await expect(createLocalStore(storage).save(sampleDocument())).rejects.toThrow(/storage is full/)
  })

  it('exposes the stored document for importing into another backend', async () => {
    const storage = memoryStorage()
    expect(readStoredDocument(storage)).toBeNull()
    await createLocalStore(storage).save(sampleDocument())
    expect(readStoredDocument(storage)?.profile.name).toBe('Ada Lovelace')
  })
})
