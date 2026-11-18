import data from './experiences.json'
import { readExtra, withExtra, type Extra } from './extra'

export type ExperienceLevel = 0 | 1 | 2

export type Experience = {
  id: string
  category: string
  text: string
  skills: string[]
  aliases: string[]
  /** Anything else: dates, metrics, links… */
  extra?: Extra
}

export const experienceLevels: {
  level: ExperienceLevel
  /** Compact label for list cells */
  label: string
  /** Full sentence for the test */
  prompt: string
}[] = [
  { level: 0, label: 'Sin experiencia', prompt: 'No tengo experiencia' },
  { level: 1, label: 'Personal', prompt: 'La usé en proyectos personales' },
  { level: 2, label: 'Profesional', prompt: 'Tengo experiencia profesional' },
]

/** Seed bank shipped with the app. Documents keep an editable copy. */
export const seedExperiences: Experience[] = readExperiences(data)

/** @deprecated Prefer document.bank — kept for callers that still import the seed. */
export const experiences = seedExperiences

const seedById = new Map(seedExperiences.map((item) => [item.id, item]))

export function isExperienceId(value: string) {
  return seedById.has(value)
}

export function cloneSeedBank(): Experience[] {
  return seedExperiences.map((item) => ({
    ...item,
    skills: [...item.skills],
    aliases: [...item.aliases],
  }))
}

const stopWords = new Set([
  'i', 'me', 'my', 'a', 'an', 'the', 'with', 'for', 'of', 'to', 'in', 'on', 'and', 'or',
  'have', 'has', 'had', 'using', 'use', 'used', 'experience', 'experienced',
  'build', 'building', 'built', 'design', 'designing', 'ship', 'shipping',
])

export function filterExperiencesBank(query: string, bank: Experience[] = seedExperiences): Experience[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return bank
  return bank.filter((item) => {
    const haystack = [item.text, item.category, ...item.skills, ...item.aliases].join(' ').toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export function findExperience(phrase: string, bank: Experience[] = seedExperiences): Experience | undefined {
  const asked = tokens(phrase)
  if (asked.length === 0) return undefined
  let best: Experience | undefined
  let bestScore = 1
  for (const item of bank) {
    for (const source of [item.text, ...item.aliases]) {
      const wanted = tokens(source)
      if (wanted.length < 2) continue
      const score = wanted.filter((token) => asked.some((askedToken) => tokenClose(token, askedToken))).length
      if (score === wanted.length && score > bestScore) {
        best = item
        bestScore = score
      }
    }
  }
  return best
}

/** Rank bank items against a job posting (local keyword match, no LLM). */
export function matchExperiencesToPosting(posting: string, bank: Experience[]): { item: Experience; score: number }[] {
  const hay = normalizePhrase(posting)
  if (!hay) return bank.map((item) => ({ item, score: 0 }))
  return bank
    .map((item) => ({ item, score: scoreAgainstPosting(hay, item) }))
    .sort((left, right) => right.score - left.score || left.item.text.localeCompare(right.item.text))
}

export function scoreAgainstPosting(postingNormalized: string, item: Experience): number {
  let score = 0
  for (const skill of item.skills) {
    const needle = normalizePhrase(skill)
    if (needle && postingNormalized.includes(needle)) score += 3
  }
  for (const alias of item.aliases) {
    const needle = normalizePhrase(alias)
    if (needle.length > 3 && postingNormalized.includes(needle)) score += 4
  }
  for (const token of tokens(item.text)) {
    if (postingNormalized.includes(token)) score += 1
  }
  return score
}

export const EXAMPLE_POSTING = `Software Engineer — Platform

We're hiring a Software Engineer to build and run services that power our product.

What you'll do
- Design and ship REST APIs used by our web and mobile clients
- Build React interfaces for internal tools and customer-facing flows
- Write unit and integration tests; own CI pipelines
- Deploy containerized services to the cloud and improve observability
- Partner with product and design; mentor engineers through code review

Requirements
- Experience with TypeScript / Node.js or similar backend languages
- Strong SQL and relational schema design
- Comfortable with Docker, cloud deploys, and production debugging
- Clear written communication and technical documentation

Nice to have
- GraphQL, clean architecture, domain modeling
- Mentoring and leading reviews
`

export function normalizePhrase(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return normalizePhrase(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token))
}

function tokenClose(left: string, right: string) {
  if (left === right) return true
  if (left.length < 3 || right.length < 3) return false
  if (left.startsWith(right) || right.startsWith(left)) return true
  return editDistance(left, right) <= 1
}

function editDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index])
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      rows[row][column] = Math.min(rows[row - 1][column] + 1, rows[row][column - 1] + 1, rows[row - 1][column - 1] + cost)
    }
  }
  return rows[left.length][right.length]
}

export function readExperiences(value: unknown): Experience[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const items: Experience[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || seen.has(entry.id)) continue
    const text = readString(entry.text)
    if (!text) continue
    seen.add(entry.id)
    items.push(withExtra({
      id: entry.id,
      category: readString(entry.category) || 'Custom',
      text,
      skills: readStrings(entry.skills),
      aliases: readStrings(entry.aliases),
    }, readExtra(entry, ['id', 'category', 'text', 'skills', 'aliases'])))
  }
  return items
}

function readStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
