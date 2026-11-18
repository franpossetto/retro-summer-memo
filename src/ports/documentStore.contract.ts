import { describe, expect, it } from 'vitest'
import { addApplicationNote, removeStatus } from '../domain/applications'
import { sampleDocument, settled } from '../test/sample'
import type { DocumentStore } from './documentStore'

export type StoreHarness = {
  store: DocumentStore
  /** A fresh store over the same data, with nothing cached from `store`. */
  reopen(): Promise<DocumentStore>
}

/** Behaviour every DocumentStore adapter must have. Each call to `makeHarness` starts empty. */
export function documentStoreContract(name: string, makeHarness: () => Promise<StoreHarness>) {
  describe(`${name} — DocumentStore contract`, () => {
    it('loads null when nothing was stored', async () => {
      const { store } = await makeHarness()
      expect(await store.load()).toBeNull()
    })

    it('loads back what it saved', async () => {
      const { store, reopen } = await makeHarness()
      const document = sampleDocument()
      await store.load()
      await store.save(document)
      const loaded = await (await reopen()).load()
      expect(loaded && settled(loaded)).toEqual(settled(document))
    })

    it('persists later edits, additions and deletions', async () => {
      const { store, reopen } = await makeHarness()
      const original = sampleDocument()
      await store.load()
      await store.save(original)

      const [acme, globex] = original.applications
      const withoutTakeHome = removeStatus(original.applicationStatuses, original.applications, 'take-home', 'sent')
      const edited = {
        ...original,
        profile: { ...original.profile, name: 'Augusta Ada King' },
        cvs: original.cvs.filter((cv) => cv.id !== 'cv-2'),
        applications: [addApplicationNote(acme, 'Sent the challenge', new Date('2026-03-08T10:00:00.000Z'))],
        applicationStatuses: withoutTakeHome.statuses,
      }
      expect(globex).toBeDefined()
      await store.save(edited)

      const loaded = await (await reopen()).load()
      expect(loaded && settled(loaded)).toEqual(settled(edited))
    })
  })
}
