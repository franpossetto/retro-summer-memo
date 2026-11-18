import { useEffect, useRef, useState } from 'react'
import type { Experience } from '../../domain/experiences'
import type { CatalogSection, Job, RoleGraph } from '../../domain/model'
import { RoleGraphs } from './RoleGraphs'

type LibraryProps = {
  sections: CatalogSection[]
  roleGraphs: RoleGraph[]
  bank: Experience[]
  jobs: Job[]
  onChange: (update: (sections: CatalogSection[]) => CatalogSection[]) => void
  onChangeRoles: (graphs: RoleGraph[]) => void
}

type LibraryPage = 'cards' | 'sections' | 'roles'

export function Library({ sections, roleGraphs, bank, jobs, onChange, onChangeRoles }: LibraryProps) {
  const [page, setPage] = useState<LibraryPage>('cards')
  const [draftId, setDraftId] = useState<string | null>(null)
  const draftRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!draftId) return
    draftRef.current?.focus()
  }, [draftId, sections])

  function patch(id: string, next: Partial<Pick<CatalogSection, 'name' | 'description' | 'active'>>) {
    onChange((current) => current.map((section) => (section.id === id ? { ...section, ...next } : section)))
  }

  function addSection() {
    const id = crypto.randomUUID()
    setDraftId(id)
    onChange((current) => [...current, { id, name: '', description: '', active: true, builtIn: false }])
  }

  if (page === 'cards') {
    return (
      <div className="home">
        <div className="home-head">
          <h1>Biblioteca</h1>
        </div>
        <ul className="project-grid">
          <li>
            <button type="button" className="project-card library-card" onClick={() => setPage('sections')}>
              <span className="project-title">Secciones</span>
              <span className="project-meta">{countLabel(sections.length, 'sección', 'secciones')}</span>
            </button>
          </li>
          <li>
            <button type="button" className="project-card library-card" onClick={() => setPage('roles')}>
              <span className="project-title">Puestos</span>
              <span className="project-meta">{countLabel(roleGraphs.length, 'puesto', 'puestos')}</span>
            </button>
          </li>
        </ul>
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home-head">
        <button type="button" className="library-back" onClick={() => setPage('cards')}>
          Biblioteca
        </button>
        <h1>{page === 'sections' ? 'Secciones' : 'Puestos'}</h1>
      </div>
      {page === 'roles' ? <RoleGraphs graphs={roleGraphs} bank={bank} jobs={jobs} onChange={onChangeRoles} /> : (
      <>
      <div className="personal-sheet">
        <table className="source-table personal-table">
          <thead>
            <tr>
              <th className="col-index" />
              <th>Sección</th>
              <th>Descripción</th>
              <th className="col-active">Activa</th>
              <th className="col-remove" />
            </tr>
          </thead>
          <tbody>
            {sections.map((section, index) => {
              const name = section.name.trim() || 'sección'
              return (
                <tr key={section.id}>
                  <td className="col-index">{index + 1}</td>
                  <td>
                    <input
                      ref={section.id === draftId ? draftRef : undefined}
                      aria-label={`Sección ${index + 1}`}
                      value={section.name}
                      placeholder="Premios"
                      onChange={(event) => patch(section.id, { name: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Descripción ${index + 1}`}
                      value={section.description}
                      placeholder="Descripción"
                      onChange={(event) => patch(section.id, { description: event.target.value })}
                    />
                  </td>
                  <td className="col-active">
                    <input
                      type="checkbox"
                      aria-label={`Activa: ${name}`}
                      checked={section.active}
                      onChange={(event) => patch(section.id, { active: event.target.checked })}
                    />
                  </td>
                  <td className="col-remove">
                    {section.builtIn ? null : (
                      <button
                        type="button"
                        className="row-remove"
                        aria-label={`Eliminar ${name}`}
                        onClick={() => onChange((current) => current.filter((item) => item.id !== section.id))}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="button personal-add" onClick={addSection}>
        Nueva sección
      </button>
      </>
      )}
    </div>
  )
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}
