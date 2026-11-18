import { useEffect, useMemo, useRef, useState } from 'react'
import {
  experienceLevels,
  filterExperiencesBank,
  type Experience,
  type ExperienceLevel,
} from '../../domain/experiences'
import type { KnowledgeAnswer } from '../../domain/model'
import { testQuestions, type TestQuestion } from '../../domain/testQuestions'

type ExperienceMasterProps = {
  bank: Experience[]
  answers: KnowledgeAnswer[]
  onAnswer: (id: string, level: ExperienceLevel | null) => void
  onApplyAnswers: (updates: { id: string; level: ExperienceLevel }[]) => void
  onBank: (bank: Experience[]) => void
}

type LevelFilter = 'in-master' | 'unanswered' | 'no-experience'
type RevealDraft = {
  question: TestQuestion
  level: ExperienceLevel
  items: { id: string; included: boolean; level: ExperienceLevel }[]
}

const statusOptions: { id: LevelFilter; label: string }[] = [
  { id: 'in-master', label: 'In master' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'no-experience', label: 'No experience' },
]

export function ExperienceMaster({ bank, answers, onAnswer, onApplyAnswers, onBank }: ExperienceMasterProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [status, setStatus] = useState<LevelFilter | null>(null)
  const [filterMenu, setFilterMenu] = useState<'add' | 'category' | 'status' | null>(null)
  const [test, setTest] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [draftCategory, setDraftCategory] = useState('Custom')
  const filterRef = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(answers.map((answer) => [answer.id, answer.level])), [answers])
  const categories = useMemo(() => {
    const set = new Set(bank.map((item) => item.category))
    return [...set].sort((left, right) => left.localeCompare(right))
  }, [bank])
  const known = useMemo(
    () => bank.filter((item) => (byId.get(item.id) ?? -1) > 0),
    [bank, byId],
  )
  const unanswered = bank.filter((item) => !byId.has(item.id)).length

  const rows = useMemo(() => {
    let list = filterExperiencesBank(query, bank)
    if (category) list = list.filter((item) => item.category === category)
    if (status === 'in-master') list = list.filter((item) => (byId.get(item.id) ?? -1) > 0)
    if (status === 'unanswered') list = list.filter((item) => !byId.has(item.id))
    if (status === 'no-experience') list = list.filter((item) => byId.get(item.id) === 0)
    return list
  }, [bank, query, category, status, byId])

  useEffect(() => {
    if (!filterMenu) return
    function onPointer(event: PointerEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterMenu(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterMenu(null)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [filterMenu])

  if (test) {
    return (
      <ExperienceTest
        bank={bank}
        byId={byId}
        onApplyAnswers={onApplyAnswers}
        onClose={() => setTest(false)}
      />
    )
  }

  function addExperience() {
    const text = draftText.trim()
    if (!text) return
    const id = `custom-${crypto.randomUUID()}`
    onBank([
      ...bank,
      {
        id,
        category: draftCategory.trim() || 'Custom',
        text,
        skills: [],
        aliases: [],
      },
    ])
    onAnswer(id, 1)
    setDraftText('')
  }

  const canAddCategory = !category
  const canAddStatus = !status

  return (
    <div className="home">
      <div className="home-head knowledge-head">
        <div>
          <h1>Experience</h1>
          <p className="knowledge-lede">
            Your master inventory for CVs. Mark levels here, or answer questions to fill it faster.
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setTest(true)}>
          Answer questions
        </button>
      </div>

      <div className="master-stats" aria-label="Master summary">
        <span><strong>{known.length}</strong> in master</span>
        <span><strong>{unanswered}</strong> unanswered</span>
      </div>

      <form
        className="master-add is-top"
        onSubmit={(event) => {
          event.preventDefault()
          addExperience()
        }}
      >
        <label className="field">
          <span className="sr-only">Category</span>
          <input
            value={draftCategory}
            placeholder="Category"
            onChange={(event) => setDraftCategory(event.target.value)}
          />
        </label>
        <label className="field master-add-text">
          <span className="sr-only">Add custom experience</span>
          <input
            value={draftText}
            placeholder="Add custom experience"
            onChange={(event) => setDraftText(event.target.value)}
          />
        </label>
        <button type="submit" className="button" disabled={!draftText.trim()}>
          Add
        </button>
      </form>

      <div className="notion-filters" ref={filterRef}>
        <label className="notion-search">
          <span className="sr-only">Search</span>
          <SearchIcon />
          <input
            value={query}
            placeholder="Search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {category ? (
          <div className="notion-pill-wrap">
            <button type="button" className="notion-pill" onClick={() => setFilterMenu(filterMenu === 'category' ? null : 'category')}>
              <span className="notion-pill-key">Category</span>
              <span className="notion-pill-op">is</span>
              <span className="notion-pill-value">{category}</span>
              <span
                className="notion-pill-x"
                role="button"
                tabIndex={0}
                aria-label="Clear category filter"
                onClick={(event) => {
                  event.stopPropagation()
                  setCategory(null)
                  setFilterMenu(null)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  setCategory(null)
                  setFilterMenu(null)
                }}
              >
                ×
              </span>
            </button>
            {filterMenu === 'category' ? (
              <div className="notion-menu" role="menu">
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitem"
                    className={category === name ? 'is-current' : undefined}
                    onClick={() => {
                      setCategory(name)
                      setFilterMenu(null)
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {status ? (
          <div className="notion-pill-wrap">
            <button type="button" className="notion-pill" onClick={() => setFilterMenu(filterMenu === 'status' ? null : 'status')}>
              <span className="notion-pill-key">Status</span>
              <span className="notion-pill-op">is</span>
              <span className="notion-pill-value">{statusOptions.find((item) => item.id === status)?.label}</span>
              <span
                className="notion-pill-x"
                role="button"
                tabIndex={0}
                aria-label="Clear status filter"
                onClick={(event) => {
                  event.stopPropagation()
                  setStatus(null)
                  setFilterMenu(null)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  setStatus(null)
                  setFilterMenu(null)
                }}
              >
                ×
              </span>
            </button>
            {filterMenu === 'status' ? (
              <div className="notion-menu" role="menu">
                {statusOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={status === option.id ? 'is-current' : undefined}
                    onClick={() => {
                      setStatus(option.id)
                      setFilterMenu(null)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {canAddCategory || canAddStatus ? (
          <div className="notion-add-wrap">
            <button
              type="button"
              className="notion-add"
              aria-expanded={filterMenu === 'add' || (!category && filterMenu === 'category') || (!status && filterMenu === 'status')}
              onClick={() => setFilterMenu(filterMenu === 'add' ? null : 'add')}
            >
              + Filter
            </button>
            {filterMenu === 'add' ? (
              <div className="notion-menu" role="menu">
                {canAddCategory ? (
                  <button type="button" role="menuitem" onClick={() => setFilterMenu('category')}>
                    Category
                  </button>
                ) : null}
                {canAddStatus ? (
                  <button type="button" role="menuitem" onClick={() => setFilterMenu('status')}>
                    Status
                  </button>
                ) : null}
              </div>
            ) : null}
            {!category && filterMenu === 'category' ? (
              <div className="notion-menu" role="menu">
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCategory(name)
                      setFilterMenu(null)
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            {!status && filterMenu === 'status' ? (
              <div className="notion-menu" role="menu">
                {statusOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setStatus(option.id)
                      setFilterMenu(null)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {category || status || query ? (
          <button
            type="button"
            className="notion-clear"
            onClick={() => {
              setQuery('')
              setCategory(null)
              setStatus(null)
              setFilterMenu(null)
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="personal-sheet knowledge-sheet">
        <table className="source-table personal-table knowledge-table master-table">
          <thead>
            <tr>
              <th className="col-index" />
              <th>Experience</th>
              <th className="col-skills">Skills</th>
              <th className="col-mark">Level</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="col-index" />
                <td colSpan={3}>No matches.</td>
              </tr>
            ) : rows.map((item, index) => {
              const level = byId.get(item.id)
              const selected = level === undefined ? null : level
              return (
                <tr key={item.id} className={selected !== null && selected > 0 ? 'is-known' : undefined}>
                  <td className="col-index">{index + 1}</td>
                  <td>
                    <div className="master-exp-text">{item.text}</div>
                    <div className="master-exp-meta">{item.category}</div>
                  </td>
                  <td className="col-skills">
                    {item.skills.length > 0 ? (
                      <div className="master-skill-list">
                        {item.skills.map((skill) => (
                          <span key={skill} className="master-skill-pill">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="master-skill-empty">—</span>
                    )}
                  </td>
                  <td className="col-mark">
                    <LevelMark
                      value={selected}
                      onChange={(next) => onAnswer(item.id, next)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LevelMark({
  value,
  onChange,
}: {
  value: ExperienceLevel | null
  onChange: (level: ExperienceLevel | null) => void
}) {
  const selected = value === null ? '' : String(value)
  return (
    <select
      className={value === null ? 'level-select' : `level-select is-level-${value}`}
      aria-label="Experience level"
      value={selected}
      onChange={(event) => {
        const next = event.target.value
        onChange(next === '' ? null : (Number(next) as ExperienceLevel))
      }}
    >
      <option value="">—</option>
      {experienceLevels.map((choice) => (
        <option key={choice.level} value={choice.level}>
          {choice.label}
        </option>
      ))}
    </select>
  )
}

function ExperienceTest({
  bank,
  byId,
  onApplyAnswers,
  onClose,
}: {
  bank: Experience[]
  byId: Map<string, ExperienceLevel>
  onApplyAnswers: (updates: { id: string; level: ExperienceLevel }[]) => void
  onClose: () => void
}) {
  const bankById = useMemo(() => new Map(bank.map((item) => [item.id, item])), [bank])
  const queue = useMemo(
    () => testQuestions.filter((question) => question.experienceIds.some((id) => bankById.has(id))),
    [bankById],
  )
  const [index, setIndex] = useState(0)
  const [reveal, setReveal] = useState<RevealDraft | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const question = queue[index]
  const done = !question && !reveal

  function startReveal(level: ExperienceLevel) {
    if (!question) return
    const items = question.experienceIds
      .map((id) => bankById.get(id))
      .filter((item): item is Experience => Boolean(item))
      .map((item) => ({
        id: item.id,
        included: true,
        level,
      }))
    setFlash(null)
    setReveal({ question, level, items })
  }

  function confirmReveal() {
    if (!reveal) return
    const updates = reveal.items
      .filter((item) => item.included)
      .map((item) => ({ id: item.id, level: item.level }))
    if (updates.length > 0) onApplyAnswers(updates)
    const toMaster = updates.filter((item) => item.level > 0).length
    const asNone = updates.filter((item) => item.level === 0).length
    if (toMaster > 0 && asNone > 0) setFlash(`Saved ${toMaster} to master, ${asNone} as no experience.`)
    else if (toMaster > 0) setFlash(`Added ${toMaster} to your master.`)
    else if (asNone > 0) setFlash(`Marked ${asNone} as no experience.`)
    else setFlash(null)
    setReveal(null)
    setIndex((current) => current + 1)
  }

  if (done) {
    return (
      <div className="home">
        <div className="test-shell">
          <div className="test-card test-done">
            <p className="test-kicker">Questions</p>
            <h2>That’s enough for now</h2>
            <p className="knowledge-lede">
              Your master reflects what you confirmed. You can answer more questions anytime, or mark rows by hand.
            </p>
            <button type="button" className="button primary" onClick={onClose}>
              Back to experience
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (reveal) {
    const experiences = reveal.items
      .map((item) => ({ ...item, experience: bankById.get(item.id) }))
      .filter((item): item is typeof item & { experience: Experience } => Boolean(item.experience))

    return (
      <div className="home">
        <div className="test-shell">
          <div className="test-card test-reveal is-in">
            <p className="test-kicker">Suggested from your answer</p>
            <h2>
              {reveal.level === 0
                ? 'Mark these as no experience?'
                : `Add to master as ${experienceLevels.find((item) => item.level === reveal.level)?.label}?`}
            </h2>
            <p className="knowledge-lede">
              One answer can cover several experiences. Uncheck anything that does not fit, or change the level.
            </p>
            <ul className="test-suggest-list">
              {experiences.map((item) => (
                <li key={item.id} className={item.included ? 'is-on' : 'is-off'}>
                  <label className="test-suggest">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={() => {
                        setReveal({
                          ...reveal,
                          items: reveal.items.map((row) =>
                            row.id === item.id ? { ...row, included: !row.included } : row,
                          ),
                        })
                      }}
                    />
                    <span className="test-suggest-body">
                      <span className="test-suggest-text">{item.experience.text}</span>
                      <span className="test-suggest-meta">
                        {item.experience.category}
                        {item.experience.skills.length > 0 ? ` · ${item.experience.skills.join(', ')}` : ''}
                        {byId.has(item.id) ? ` · was ${labelFor(byId.get(item.id)!)}` : ' · unanswered'}
                      </span>
                    </span>
                  </label>
                  {item.included ? (
                    <div className="test-suggest-level">
                      <LevelMark
                        value={item.level}
                        onChange={(next) => {
                          if (next === null) {
                            setReveal({
                              ...reveal,
                              items: reveal.items.map((row) =>
                                row.id === item.id ? { ...row, included: false } : row,
                              ),
                            })
                            return
                          }
                          setReveal({
                            ...reveal,
                            items: reveal.items.map((row) =>
                              row.id === item.id ? { ...row, level: next } : row,
                            ),
                          })
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="test-actions">
              <button type="button" className="button" onClick={() => setReveal(null)}>
                Back
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!reveal.items.some((item) => item.included)}
                onClick={confirmReveal}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <div className="test-shell">
        <div className="test-card is-in" key={question.id}>
          <div className="test-progress" aria-hidden="true">
            <span style={{ width: `${((index + 1) / Math.max(queue.length, 1)) * 100}%` }} />
          </div>
          <p className="test-kicker">
            Question {index + 1} of {queue.length}
          </p>
          {flash ? (
            <p className="test-flash" role="status">{flash}</p>
          ) : null}
          <h2>{question.prompt}</h2>
          <p className="knowledge-lede">{question.detail}</p>
          <p className="test-coverage">
            May update {question.experienceIds.filter((id) => bankById.has(id)).length} experiences — you review before saving.
          </p>
          <div className="test-choices" role="group" aria-label="Your answer">
            {experienceLevels.map((choice) => (
              <button
                key={choice.level}
                type="button"
                className={`test-choice is-level-${choice.level}`}
                onClick={() => startReveal(choice.level)}
              >
                <span className="test-choice-label">{choice.prompt}</span>
              </button>
            ))}
          </div>
          <div className="test-actions">
            <button type="button" className="button" onClick={onClose}>
              Exit
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setFlash(null)
                setIndex((current) => current + 1)
              }}
            >
              Skip question
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function labelFor(level: ExperienceLevel) {
  return experienceLevels.find((item) => item.level === level)?.label ?? '—'
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 9.2 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
