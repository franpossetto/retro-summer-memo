import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { CatalogSection, EducationEntry, Snapshot, SnapshotBlock } from '../../domain/model'
import { pageSpec, type FontId, type FontSize, type LineSpacing, type MarginId, type PageSize } from '../../domain/fonts'
import type { TemplateId } from '../../domain/templates'

type ResumePreviewProps = {
  snapshot: Snapshot | null
  templateId: TemplateId
  fontId: FontId
  fontSize: FontSize
  lineHeight: LineSpacing
  marginId: MarginId
  pageSize: PageSize
  skillsFormat?: 'list' | 'comma'
  enabledSections: string[]
  sections: CatalogSection[]
  blocks: SnapshotBlock[]
  highlightId?: string
}

type BlockSection = 'header' | 'skills' | 'experience' | 'education' | 'extra' | 'pending'

type Block = {
  key: string
  section: BlockSection
  heading: boolean
  width: number
  node: ReactNode
}

const pads = {
  narrow: { v: 40, h: 44 },
  normal: { v: 56, h: 52 },
  wide: { v: 72, h: 68 },
}

const minZoom = 0.62
const maxZoom = 1.2

export function ResumePreview({
  snapshot,
  templateId,
  fontId,
  fontSize,
  lineHeight,
  marginId,
  pageSize,
  skillsFormat = 'list',
  enabledSections,
  sections,
  blocks: extraBlocks,
  highlightId = '',
}: ResumePreviewProps) {
  const paper = pageSpec(pageSize)
  const pad = pads[marginId]
  const innerWidth = paper.width - pad.h * 2
  const innerHeight = paper.height - pad.v * 2
  const pageClass = `resume-page is-${templateId} is-font-${fontId} is-margin-${marginId}`
  const pageStyle: CSSProperties = { fontSize: `${fontSize}pt`, lineHeight }
  const sheetStyle: CSSProperties = { ...pageStyle, width: paper.width, minHeight: paper.height }
  const blocks = useMemo(
    () => previewBlocks(snapshot, templateId, innerWidth, enabledSections, sections, extraBlocks, highlightId, skillsFormat),
    [snapshot, templateId, innerWidth, enabledSections, sections, extraBlocks, highlightId, skillsFormat],
  )
  const rail = templateId === 'sidebar' && blocks.some((block) => block.section === 'skills') && blocks.some((block) => block.section === 'experience')
  const measureRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number[][]>(() => [blocks.map((_, index) => index)])
  const [zoom, setZoom] = useState<{ scale: number; height: number }>({ scale: 1, height: paper.height })
  const ready = pages.flat().length === blocks.length
  const shown = ready ? pages : [blocks.map((_, index) => index)]

  useEffect(() => {
    if (!highlightId || snapshot?.placeholder) return
    document.querySelector(`.is-sheet .is-hit`)?.scrollIntoView({ block: 'nearest' })
  }, [highlightId, pages, snapshot])

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const heights = Array.from(root.children).map((child) => outerHeight(child as HTMLElement))
    const next = packSheets(blocks, heights, innerHeight, rail)
    setPages((current) => (samePages(current, next) ? current : next))
  }, [blocks, rail, templateId, fontId, fontSize, lineHeight, marginId, pageSize, innerHeight])

  useLayoutEffect(() => {
    const frame = frameRef.current
    const pane = frame?.parentElement
    if (!frame || !pane) return
    const fit = () => {
      const styles = getComputedStyle(pane)
      const pad = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      const available = pane.clientWidth - pad
      const raw = available / paper.width
      const scale = Math.round(Math.min(maxZoom, Math.max(minZoom, raw)) * 100) / 100
      const stack = frame.querySelector('.sheet-stack')
      const height = Math.ceil((stack instanceof HTMLElement ? stack.offsetHeight : paper.height) * scale)
      setZoom((current) => (current.scale === scale && current.height === height ? current : { scale, height }))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [paper.width, paper.height, pages, blocks])

  return (
    <div ref={frameRef} className="sheet-zoom" style={{ width: paper.width * zoom.scale, height: zoom.height }}>
    <div className="sheet-stack" style={{ width: paper.width, transform: `scale(${zoom.scale})` }}>
      <div ref={measureRef} className={`${pageClass} sheet-measure-root`} style={pageStyle} aria-hidden="true">
        {blocks.map((block) => (
          <div key={block.key} className="sheet-measure" style={{ width: block.width }}>
            {cloneElement(block.node as ReactElement)}
          </div>
        ))}
      </div>
      {shown.map((indexes, pageIndex) => (
        <article key={pageIndex} className={`${pageClass} is-sheet`} style={sheetStyle}>
          <SheetBody indexes={indexes} blocks={blocks} rail={rail} />
          {shown.length > 1 ? <div className="sheet-number">{pageIndex + 1}</div> : null}
        </article>
      ))}
    </div>
    </div>
  )
}

function previewBlocks(
  snapshot: Snapshot | null,
  templateId: TemplateId,
  innerWidth: number,
  enabledSections: string[],
  sections: CatalogSection[],
  extraBlocks: SnapshotBlock[],
  highlightId: string,
  skillsFormat: 'list' | 'comma',
): Block[] {
  const enabled = new Set(enabledSections)
  const side = 168
  const placeholder = snapshot?.placeholder === true
  const skills = !placeholder && snapshot && enabled.has('skills') ? pageSkills(snapshot) : []
  const showExperience = !placeholder && Boolean(snapshot && enabled.has('experience') && snapshot.roles.length > 0)
  const beside = templateId === 'sidebar' && (placeholder
    ? enabled.has('skills') && enabled.has('experience')
    : skills.length > 0 && showExperience)
  const mainWidth = Math.max(220, innerWidth - side - 28)
  const widthFor = (section: BlockSection) => {
    if (!beside) return innerWidth
    if (section === 'header' || section === 'pending' || section === 'extra') return innerWidth
    if (section === 'skills') return side
    return mainWidth
  }
  const block = (key: string, section: BlockSection, heading: boolean, node: ReactNode): Block => ({
    key,
    section,
    heading,
    width: widthFor(section),
    node,
  })

  if (!snapshot) return [emptyLinkBlock(block)]

  const blocks: Block[] = []
  const showPersonal = enabled.has('personal')
  const name = showPersonal ? snapshot.profile.name.trim() : ''
  const contact = showPersonal ? snapshot.profile.fields.filter((field) => field.value.trim()) : []
  const summary = snapshot.summary.trim()
  if (showPersonal && (name || contact.length > 0 || summary)) {
    blocks.push(block(
      'header',
      'header',
      false,
      <header className="resume-head">
        {name ? <h1 className="resume-name">{name}</h1> : null}
        {contact.length > 0 ? (
          <p className="resume-contact">
            {contact.map((field) => (
              <span key={field.id}>{field.value.trim()}</span>
            ))}
          </p>
        ) : null}
        {summary ? <p className="resume-summary">{summary}</p> : null}
      </header>,
    ))
  }

  if (snapshot.placeholder) return [...blocks, emptyLinkBlock(block)]

  const education = enabled.has('education') ? snapshot.education?.filter(hasStudy) ?? [] : []
  if (showExperience) {
    blocks.push(headingBlock(block, 'experience', sectionLabel(sections, 'experience', 'Experience')))
    const companies = new Map<string, Snapshot['roles']>()
    snapshot.roles.forEach((role) => {
      const key = role.company.trim().toLocaleLowerCase() || role.id
      const group = companies.get(key) ?? []
      group.push(role)
      companies.set(key, group)
    })
    companies.forEach((roles) => blocks.push(companyBlock(block, roles, templateId, highlightId)))
  }
  if (education.length > 0) {
    blocks.push(headingBlock(block, 'education', sectionLabel(sections, 'education', 'Education')))
    education.forEach((entry) => blocks.push(studyBlock(block, entry, templateId)))
  }
  if (skills.length > 0) blocks.push(skillsBlock(block, skills, sectionLabel(sections, 'skills', 'Skills'), skillsFormat))
  for (const extra of extraBlocks) {
    if (!enabled.has(extra.id) || extra.entries.length === 0) continue
    blocks.push(extraBlock(block, extra))
  }

  if (!showExperience && education.length === 0 && skills.length === 0 && !blocks.some((item) => item.section === 'extra')) {
    blocks.push(emptyLinkBlock(block))
  }
  return blocks.length > 0 ? blocks : [emptyLinkBlock(block)]
}

function EmptyLink() {
  return (
    <div className="empty-link">
      <div className="empty-link-preview" aria-hidden="true">
        <span className="empty-link-card">Experiencia laboral</span>
        <span className="empty-link-join" />
        <span className="empty-link-card">Skill</span>
      </div>
      <p className="empty-link-title">Todavía no hay nada conectado</p>
      <p className="empty-link-copy">Agregá experiencia laboral, conectá una skill y generá.</p>
    </div>
  )
}

function emptyLinkBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
): Block {
  return block('empty-link', 'pending', false, <EmptyLink />)
}

function sectionLabel(sections: CatalogSection[], id: string, fallback: string) {
  return sections.find((section) => section.id === id)?.name.trim() || fallback
}

function skillsBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
  skills: string[],
  label: string,
  format: 'list' | 'comma',
) {
  return block(
    'skills',
    'skills',
    false,
    <section className="resume-section resume-skills">
      <h2 className="section-label">{label}</h2>
      {format === 'comma' ? <p className="skill-list-comma">{skills.join(', ')}</p> : (
        <ul className="skill-list">
          {skills.map((skill) => <li key={skill}>{skill}</li>)}
        </ul>
      )}
    </section>,
  )
}

function extraBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
  extra: SnapshotBlock,
) {
  return block(
    extra.id,
    'extra',
    false,
    <section className="resume-section">
      <h2 className="section-label">{extra.name}</h2>
      <ul className="resume-bullets">
        {extra.entries.map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ul>
    </section>,
  )
}

function headingBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
  section: 'experience' | 'education',
  label: string,
) {
  return block(
    `${section}-heading`,
    section,
    true,
    <section className={`resume-section resume-${section}`}>
      <h2 className="section-label">{label}</h2>
    </section>,
  )
}

function companyBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
  roles: Snapshot['roles'],
  templateId: TemplateId,
  highlightId: string,
) {
  const company = roles[0]?.company.toLocaleUpperCase() ?? ''
  return block(
    `company-${roles.map((role) => role.id).join('-')}`,
    'experience',
    false,
    <div className="resume-role">
      {company ? <div className="role-title">{company}</div> : null}
      {roles.map((role) => {
        const dates = formatRange(role.start, role.end)
        const bullets = role.bullets.filter((bullet) => bullet.text)
        return (
          <div className="company-role" key={role.id}>
            <div className="role-head">
              {templateId === 'timeline' ? <div className="role-dates">{dates}</div> : null}
              <div>
                {role.title ? <div className="role-title">{role.title}</div> : null}
                {role.location ? <div className="role-company">{role.location}</div> : null}
              </div>
              {templateId !== 'timeline' && dates ? <div className="role-dates">{dates}</div> : null}
            </div>
            {bullets.length > 0 ? (
              <ul className="resume-bullets">
                {bullets.map((bullet) => (
                  <li key={bullet.id} className={bullet.id === highlightId ? 'is-hit' : undefined}>{bullet.text}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>,
  )
}

function studyBlock(
  block: (key: string, section: BlockSection, heading: boolean, node: ReactNode) => Block,
  entry: EducationEntry,
  templateId: TemplateId,
) {
  const dates = formatRange(entry.start, entry.end)
  return block(
    entry.id,
    'education',
    false,
    <div className="resume-role">
      <div className="role-head">
        {templateId === 'timeline' ? <div className="role-dates">{dates}</div> : null}
        <div>
          {entry.school ? <div className="role-title">{entry.school}</div> : null}
          {entry.degree ? <div className="role-company">{entry.degree}</div> : null}
        </div>
        {templateId !== 'timeline' && dates ? <div className="role-dates">{dates}</div> : null}
      </div>
    </div>,
  )
}

function pageSkills(snapshot: Snapshot) {
  if (snapshot.skills) return snapshot.skills
  const seen = new Set<string>()
  const skills: string[] = []
  for (const group of snapshot.skillGroups) {
    for (const skill of group.skills) {
      const key = skill.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      skills.push(skill)
    }
  }
  return skills
}

function hasStudy(entry: EducationEntry) {
  return Boolean(entry.school.trim() || entry.degree.trim() || entry.start.trim() || entry.end.trim())
}

function formatRange(start: string, end: string) {
  if (start && end) return `${start} – ${end}`
  return start || end
}

function SheetBody({ indexes, blocks, rail }: { indexes: number[]; blocks: Block[]; rail: boolean }) {
  const skills = indexes.filter((index) => blocks[index]?.section === 'skills')
  const experience = indexes.filter((index) => blocks[index]?.section === 'experience')
  if (!rail || skills.length === 0 || experience.length === 0) {
    return indexes.map((index) => placed(blocks[index]))
  }
  const main = indexes.filter((index) => blocks[index]?.section === 'experience' || blocks[index]?.section === 'education')
  const leading = indexes.filter((index) => {
    const section = blocks[index]?.section
    return section === 'header' || section === 'pending'
  })
  const trailing = indexes.filter((index) => blocks[index]?.section === 'extra')
  return (
    <>
      {leading.map((index) => placed(blocks[index]))}
      <div className="sheet-beside">
        <div className="sheet-main">{main.map((index) => placed(blocks[index]))}</div>
        <div className="sheet-side">{skills.map((index) => placed(blocks[index]))}</div>
      </div>
      {trailing.map((index) => placed(blocks[index]))}
    </>
  )
}

function packSheets(blocks: Block[], heights: number[], limit: number, rail: boolean) {
  const skill = blocks.findIndex((block) => block.section === 'skills')
  const experience = blocks.map((block, index) => (block.section === 'experience' ? index : -1)).filter((index) => index >= 0)
  if (!rail || skill < 0 || experience.length === 0) return packIndexes(blocks.map((_, index) => index), heights, blocks, limit)

  const before = blocks.map((_, index) => (index < experience[0] && index !== skill ? index : -1)).filter((index) => index >= 0)
  const after = blocks.map((block, index) => (index > experience[0] && block.section !== 'experience' && index !== skill ? index : -1)).filter((index) => index >= 0)
  const page: number[] = []
  let used = 0
  for (const index of before) {
    page.push(index)
    used += heights[index] ?? 0
  }

  const experienceOnPage: number[] = []
  let experienceHeight = 0
  let cursor = 0
  while (cursor < experience.length) {
    const index = experience[cursor]
    const next = experience[cursor + 1]
    const keep = blocks[index]?.heading && next !== undefined ? (heights[index] ?? 0) + (heights[next] ?? 0) : heights[index] ?? 0
    if (experienceOnPage.length > 0 && used + keep > limit + 0.5) break
    experienceOnPage.push(index)
    experienceHeight += heights[index] ?? 0
    used += heights[index] ?? 0
    cursor += 1
  }

  const skillHeight = heights[skill] ?? 0
  const head = used - experienceHeight
  let left = experienceHeight
  const educationOnPage: number[] = []
  let afterCursor = 0
  while (afterCursor < after.length && blocks[after[afterCursor]]?.section === 'education') {
    const index = after[afterCursor]
    const next = after[afterCursor + 1]
    const keep = blocks[index]?.heading && next !== undefined && blocks[next]?.section === 'education'
      ? (heights[index] ?? 0) + (heights[next] ?? 0)
      : heights[index] ?? 0
    const nextUsed = head + Math.max(left + keep, skillHeight)
    if (nextUsed > limit + 0.5 && (educationOnPage.length > 0 || experienceOnPage.length > 0)) break
    educationOnPage.push(index)
    left += heights[index] ?? 0
    afterCursor += 1
  }

  let trail = head + Math.max(left, skillHeight)
  const extrasOnPage: number[] = []
  while (afterCursor < after.length && blocks[after[afterCursor]]?.section === 'extra') {
    const index = after[afterCursor]
    const height = heights[index] ?? 0
    if (trail + height > limit + 0.5) break
    extrasOnPage.push(index)
    trail += height
    afterCursor += 1
  }

  page.push(...experienceOnPage, ...educationOnPage, skill, ...extrasOnPage)
  const rest = [...experience.slice(cursor), ...after.slice(afterCursor)]
  const restPages = packIndexes(rest, heights, blocks, limit)
  return [page, ...restPages].filter((entry) => entry.length > 0)
}

function outerHeight(element: HTMLElement) {
  const target = (element.firstElementChild as HTMLElement | null) ?? element
  const style = getComputedStyle(target)
  return target.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)
}

function packIndexes(indexes: number[], heights: number[], blocks: { heading: boolean }[], limit: number) {
  const pages: number[][] = []
  let page: number[] = []
  let used = 0
  for (let cursor = 0; cursor < indexes.length; cursor += 1) {
    const index = indexes[cursor]
    const next = indexes[cursor + 1]
    const keep = blocks[index]?.heading && next !== undefined ? heights[index] + heights[next] : heights[index]
    if (page.length > 0 && used + keep > limit + 0.5) {
      pages.push(page)
      page = []
      used = 0
    }
    page.push(index)
    used += heights[index] ?? 0
  }
  if (page.length > 0) pages.push(page)
  return pages
}

function samePages(left: number[][], right: number[][]) {
  return left.length === right.length && left.every((page, index) => page.length === right[index].length && page.every((value, item) => value === right[index][item]))
}

function placed(block: Block) {
  return cloneElement(block.node as ReactElement, { key: block.key })
}
