/**
 * Checks a generated CV against what makes CVs pass screening (ATS and AI filters) and land with
 * recruiters: length, a tailored summary, achievements with results, the posting's keywords backed
 * by experience, a parser-friendly layout. Findings are hints for whoever builds the CV (the user's
 * assistant), not rules: it decides, and never invents to satisfy them.
 */
import { experienceCatalog } from './catalog'
import { normalizePhrase, seedExperiences, type Experience } from './experiences'
import type { Cv, Snapshot } from './model'

export type CvFinding = { kind: string; message: string }

export type CvReview = {
  estimatedPages: number
  findings: CvFinding[]
  keywords?: {
    /** Terms from the posting already on the CV. */
    covered: string[]
    /** In the posting and in the user's experience bank, but not on this CV: worth adding if relevant. */
    backedButMissing: string[]
    /** In the posting but nowhere in the user's experience: do not add unless the user confirms it. */
    notInExperience: string[]
  }
}

const commonTerms = [
  'TypeScript', 'JavaScript', 'React', 'React Native', 'Next.js', 'Vue', 'Angular', 'Node.js', 'NestJS', 'Express',
  'Python', 'Django', 'FastAPI', 'Go', 'Java', 'Kotlin', 'Spring', 'C#', '.NET', 'Ruby', 'Rails', 'PHP', 'Rust', 'Swift',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'RabbitMQ', 'Elasticsearch', 'GraphQL', 'REST', 'gRPC',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Microservices', 'Serverless',
  'LLM', 'Machine Learning', 'Data pipelines', 'Observability', 'Security', 'System design', 'Distributed systems',
  'Leadership', 'Mentoring', 'Agile', 'Scrum', 'Product', 'Fintech', 'Payments', 'B2B', 'SaaS', 'Mobile', 'Testing',
]

const weakOpenings = /^(responsible for|in charge of|worked on|helped|participated|was part of|responsable de|encargad[oa] de|particip[eé]|trabaj[eé] en|ayud[eé]|fui parte)/i
const hasResult = /\d|%|\$|€|£|x\b/i

function vocabulary(bank: Experience[]): string[] {
  const terms = new Map<string, string>()
  for (const term of [
    ...commonTerms,
    ...bank.flatMap((item) => item.skills),
    ...seedExperiences.flatMap((item) => item.skills),
    ...experienceCatalog.flatMap((item) => item.skills),
  ]) {
    const key = normalizePhrase(term)
    if (key.length >= 2 && !terms.has(key)) terms.set(key, term)
  }
  return [...terms.values()]
}

function mentions(haystack: string, term: string): boolean {
  const needle = normalizePhrase(term)
  if (!needle) return false
  // Whole words only, so "Go" does not match "good" nor "React" match "reactive".
  return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack)
}

export function reviewCv(cv: Cv, snapshot: Snapshot, bank: Experience[], posting = cv.posting): CvReview {
  const findings: CvFinding[] = []
  const bullets = snapshot.roles.flatMap((role) => role.bullets.map((bullet) => bullet.text))
  const blocks = snapshot.blocks ?? []
  const blockBullets = blocks.flatMap((block) => block.entries.flatMap((entry) => entry.bullets ?? []))

  // Length: roughly 46 lines per page.
  const lineCount = (text: string, width = 95) => Math.max(1, Math.ceil(text.length / width))
  const lines =
    5 +
    (snapshot.summary ? lineCount(snapshot.summary) + 1 : 0) +
    snapshot.roles.reduce((total, role) => total + 2 + role.bullets.reduce((sum, bullet) => sum + lineCount(bullet.text), 0), 0) +
    (snapshot.education?.length ?? 0) * 2 +
    blocks.reduce((total, block) => total + 2 + block.entries.reduce((sum, entry) => sum + 1 + (entry.bullets ?? []).reduce((acc, text) => acc + lineCount(text), 0), 0), 0) +
    3
  const estimatedPages = Math.round((lines / 46) * 10) / 10
  if (estimatedPages > 2) findings.push({ kind: 'length', message: `About ${estimatedPages} pages: keep it to 1–2. Cut older or less relevant roles and experiences.` })

  if (!snapshot.summary) {
    findings.push({ kind: 'summary', message: 'No summary: add 2–4 lines for this role and company (years, specialty, 2–3 strengths from the posting, one standout result). It is the first thing read.' })
  } else if (snapshot.summary.length > 600) {
    findings.push({ kind: 'summary', message: 'Summary is long: keep it to 2–4 lines.' })
  }

  snapshot.roles.slice(0, 2).forEach((role) => {
    if (role.bullets.length === 0) findings.push({ kind: 'recent-role', message: `"${role.title}" at ${role.company} is recent but has no achievements: add 3–5.` })
  })
  for (const role of snapshot.roles) {
    if (role.bullets.length > 6) findings.push({ kind: 'too-many', message: `"${role.title}" has ${role.bullets.length} achievements: keep the 3–6 most relevant to this job.` })
  }

  const noResult = [...bullets, ...blockBullets].filter((text) => !hasResult.test(text))
  if (noResult.length > 0) {
    findings.push({
      kind: 'results',
      message: `${noResult.length} achievement(s) without a measurable result (number, %, scale). Add one if it is true, e.g. ${noResult.slice(0, 3).map((text) => `"${text}"`).join(', ')}.`,
    })
  }
  const weak = [...bullets, ...blockBullets].filter((text) => weakOpenings.test(text.trim()))
  if (weak.length > 0) findings.push({ kind: 'wording', message: `Start with a strong action verb and the outcome instead of duties: ${weak.slice(0, 3).map((text) => `"${text}"`).join(', ')}.` })
  const long = [...bullets, ...blockBullets].filter((text) => text.length > 220)
  if (long.length > 0) findings.push({ kind: 'wording', message: `${long.length} achievement(s) longer than two lines: tighten them.` })

  if ((cv.skillsFormat ?? 'list') === 'list' && (snapshot.skills?.length ?? 0) > 8) {
    findings.push({ kind: 'length', message: `${snapshot.skills?.length} skills as a vertical list take a lot of space: use skills_format "comma" (update_cv).` })
  }
  if (cv.templateId !== 'classic') findings.push({ kind: 'ats', message: `The "${cv.templateId}" template uses columns; some screening software reads them out of order. "classic" (single column) is the safest.` })
  const contact = snapshot.profile.fields.filter((field) => field.value.trim())
  if (!snapshot.profile.name || !contact.some((field) => field.kind === 'email')) findings.push({ kind: 'contact', message: 'Missing name or email in the header.' })

  let keywords: CvReview['keywords']
  const postingText = normalizePhrase(posting ?? '')
  if (postingText) {
    const cvText = normalizePhrase(
      [snapshot.summary, ...snapshot.roles.map((role) => role.title), ...bullets, ...blockBullets, ...(snapshot.skills ?? []), ...snapshot.roles.flatMap((role) => role.bullets.flatMap((bullet) => bullet.skills))].join(' \n '),
    )
    const bankText = normalizePhrase(bank.flatMap((item) => [item.text, ...item.skills]).join(' \n '))
    const asked = vocabulary(bank).filter((term) => mentions(postingText, term))
    keywords = {
      covered: asked.filter((term) => mentions(cvText, term)),
      backedButMissing: asked.filter((term) => !mentions(cvText, term) && mentions(bankText, term)),
      notInExperience: asked.filter((term) => !mentions(cvText, term) && !mentions(bankText, term)),
    }
    if (keywords.backedButMissing.length > 0) {
      findings.push({ kind: 'keywords', message: `The posting asks for ${keywords.backedButMissing.join(', ')} and the bank has experience with it, but this CV does not show it.` })
    }
  } else {
    findings.push({ kind: 'keywords', message: 'No posting text on this CV: pass it (posting) to check keywords against it.' })
  }

  return { estimatedPages, findings, ...(keywords ? { keywords } : {}) }
}
