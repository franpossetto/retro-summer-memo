/**
 * The CV's report card for the editor: a score, a few numbers and a checklist the user can act
 * on, each check pointing at what to fix (achievements, roles) and where (which panel). Built on
 * the same rules as `reviewCv`, the review the assistant gets. Pure functions only.
 */
import { LONG_ACHIEVEMENT, estimatePages, hasResult, hasWeakOpening, keywordMatch } from './cvReview'
import type { Experience } from './experiences'
import type { Cv, Snapshot } from './model'
import { isSingleColumn } from './templates'

export type CheckStatus = 'pass' | 'warn' | 'fail'

/** The editor panel where a check gets fixed. */
export type CheckArea = 'content' | 'posting' | 'design'

export type AnalysisCheck = {
  id: string
  status: CheckStatus
  title: string
  detail: string
  area: CheckArea
  /** What to look at: achievement or role ids of the open CV. */
  refs: string[]
  /** How much it counts in the score. */
  weight: number
}

export type Grade = { label: string; tone: 'great' | 'good' | 'fair' | 'poor' }

export type CvAnalysis = {
  /** 0–100. */
  score: number
  grade: Grade
  metrics: {
    pages: number
    achievements: number
    withResults: number
    summaryLength: number
    skills: number
    keywords?: { covered: number; total: number }
  }
  checks: AnalysisCheck[]
  keywords?: { covered: string[]; backedButMissing: string[]; notInExperience: string[] }
}

const statusValue: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 }

export function gradeFor(score: number): Grade {
  if (score >= 85) return { label: 'Excelente', tone: 'great' }
  if (score >= 70) return { label: 'Muy bueno', tone: 'good' }
  if (score >= 50) return { label: 'Para pulir', tone: 'fair' }
  return { label: 'Necesita trabajo', tone: 'poor' }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * Checks what the CV shows (only enabled sections count). `pages` is the real page count when
 * the caller rendered it; otherwise it is estimated from the text.
 */
export function analyzeCv(cv: Cv, snapshot: Snapshot, bank: Experience[], options: { pages?: number } = {}): CvAnalysis {
  const enabled = new Set(cv.enabledSections)
  const roles = enabled.has('experience') ? snapshot.roles : []
  const achievements = roles.flatMap((role) => role.bullets.filter((bullet) => bullet.text.trim()))
  const sectionBullets = (snapshot.blocks ?? []).filter((block) => enabled.has(block.id)).flatMap((block) => block.entries.flatMap((entry) => entry.bullets ?? []))
  const allTexts = [...achievements.map((bullet) => bullet.text), ...sectionBullets]
  const summary = enabled.has('personal') ? snapshot.summary.trim() : ''
  const skills = enabled.has('skills') ? snapshot.skills ?? [] : []
  const pages = options.pages ?? estimatePages(snapshot)
  const checks: AnalysisCheck[] = []
  const add = (check: AnalysisCheck) => checks.push(check)

  // Header
  const fields = enabled.has('personal') ? snapshot.profile.fields.filter((field) => field.value.trim()) : []
  const hasName = enabled.has('personal') && Boolean(snapshot.profile.name.trim())
  const hasEmail = fields.some((field) => field.kind === 'email')
  const hasReach = fields.some((field) => field.kind === 'phone' || field.kind === 'link')
  add({
    id: 'contact',
    weight: 10,
    area: 'content',
    refs: [],
    ...(!hasName || !hasEmail
      ? { status: 'fail', title: 'Faltan datos de contacto', detail: !hasName ? 'El CV no muestra tu nombre.' : 'Agregá un email: es lo primero que buscan para contactarte.' }
      : !hasReach
        ? { status: 'warn', title: 'Contacto incompleto', detail: 'Sumá un teléfono o tu LinkedIn además del email.' }
        : { status: 'pass', title: 'Contacto completo', detail: 'Nombre, email y otra forma de contactarte.' }),
  })

  // Summary
  add({
    id: 'summary',
    weight: 12,
    area: 'content',
    refs: [],
    ...(!summary
      ? { status: 'fail', title: 'Sin resumen', detail: 'Escribí 2 a 4 líneas para este puesto: años, especialidad, 2 o 3 fortalezas que pide el aviso y un resultado.' }
      : summary.length < 120
        ? { status: 'warn', title: 'Resumen muy corto', detail: 'Contá en 2 a 4 líneas tu especialidad, tus fortalezas para este puesto y un resultado concreto.' }
        : summary.length > 600
          ? { status: 'warn', title: 'Resumen largo', detail: `Tiene ${summary.length} caracteres: dejalo en 2 a 4 líneas (unos 300 a 500).` }
          : { status: 'pass', title: 'Buen resumen', detail: 'Corto y al principio, donde se lee primero.' }),
  })

  // Length
  add({
    id: 'length',
    weight: 10,
    area: 'content',
    refs: [],
    ...(pages > 2
      ? { status: 'fail', title: `${formatPages(pages)} páginas`, detail: 'Dejalo en 1 o 2: sacá roles viejos o poco relevantes y los logros menos fuertes.' }
      : { status: 'pass', title: `${formatPages(pages)} ${pages > 1 ? 'páginas' : 'página'}`, detail: 'Un largo que se lee entero.' }),
  })

  // Experience
  const emptyRecent = roles.slice(0, 2).filter((role) => role.bullets.length < 2)
  add({
    id: 'experience',
    weight: 10,
    area: 'content',
    refs: emptyRecent.map((role) => role.id),
    ...(roles.length === 0
      ? { status: 'fail', title: 'Sin experiencia', detail: 'El CV no muestra ningún rol: activá la sección o sumá tus trabajos.' }
      : emptyRecent.length > 0
        ? {
            status: 'warn',
            title: 'Roles recientes con pocos logros',
            detail: `${emptyRecent.map((role) => role.title || role.company).join(' y ')} ${emptyRecent.length === 1 ? 'tiene' : 'tienen'} menos de 2 logros: sumá 3 a 5.`,
          }
        : { status: 'pass', title: 'Experiencia con logros', detail: 'Tus roles más recientes cuentan qué lograste.' }),
  })

  // Measurable results
  const withoutResults = achievements.filter((bullet) => !hasResult(bullet.text))
  const resultsCount = allTexts.filter(hasResult).length
  const ratio = allTexts.length > 0 ? resultsCount / allTexts.length : 0
  add({
    id: 'results',
    weight: 16,
    area: 'content',
    refs: withoutResults.map((bullet) => bullet.id),
    ...(allTexts.length === 0
      ? { status: 'fail', title: 'Sin logros', detail: 'Cada rol necesita logros concretos: qué hiciste y qué cambió.' }
      : ratio >= 0.6
        ? { status: 'pass', title: 'Logros con resultados', detail: `${resultsCount} de ${allTexts.length} muestran un número, un % o una escala.` }
        : {
            status: ratio >= 0.3 ? 'warn' : 'fail',
            title: 'Faltan resultados medibles',
            detail: `Solo ${resultsCount} de ${allTexts.length} logros tienen un número. Sumá cifras reales: %, tiempo, plata, usuarios.`,
          }),
  })

  // Wording
  const weak = achievements.filter((bullet) => hasWeakOpening(bullet.text))
  add({
    id: 'wording',
    weight: 10,
    area: 'content',
    refs: weak.map((bullet) => bullet.id),
    ...(weak.length > 0
      ? { status: 'warn', title: 'Verbos débiles', detail: `${plural(weak.length, 'logro arranca', 'logros arrancan')} con una tarea ("Responsable de…"). Empezá con un verbo de acción y el resultado.` }
      : { status: 'pass', title: 'Redacción con verbos de acción', detail: 'Los logros arrancan por lo que hiciste.' }),
  })

  // Conciseness
  const long = achievements.filter((bullet) => bullet.text.length > LONG_ACHIEVEMENT)
  const crowded = roles.filter((role) => role.bullets.length > 6)
  add({
    id: 'concise',
    weight: 6,
    area: 'content',
    refs: [...long.map((bullet) => bullet.id), ...crowded.map((role) => role.id)],
    ...(long.length > 0 || crowded.length > 0
      ? {
          status: 'warn',
          title: 'Se puede ajustar',
          detail: [
            long.length > 0 ? `${plural(long.length, 'logro ocupa', 'logros ocupan')} más de dos líneas` : '',
            crowded.length > 0 ? `${plural(crowded.length, 'rol tiene', 'roles tienen')} más de 6 logros` : '',
          ].filter(Boolean).join(' y ') + '.',
        }
      : { status: 'pass', title: 'Conciso', detail: 'Logros de una o dos líneas, hasta 6 por rol.' }),
  })

  // Posting keywords
  const keywords = keywordMatch(snapshot, bank, cv.posting)
  const total = keywords ? keywords.covered.length + keywords.backedButMissing.length + keywords.notInExperience.length : 0
  const coverage = keywords && total > 0 ? keywords.covered.length / total : 0
  add({
    id: 'keywords',
    weight: 16,
    area: 'posting',
    refs: [],
    ...(!keywords
      ? { status: 'warn', title: 'Sin aviso', detail: 'Pegá el aviso para ver qué palabras clave pide y cuáles muestra tu CV.' }
      : total === 0
        ? { status: 'pass', title: 'Aviso sin términos técnicos', detail: 'No encontramos tecnologías ni habilidades conocidas en el aviso.' }
        : coverage >= 0.7
          ? { status: 'pass', title: 'Coincide con el aviso', detail: `Muestra ${keywords.covered.length} de ${total} términos que pide.` }
          : {
              status: coverage >= 0.4 ? 'warn' : 'fail',
              title: 'Faltan palabras clave del aviso',
              detail:
                keywords.backedButMissing.length > 0
                  ? `Tenés experiencia con ${keywords.backedButMissing.slice(0, 4).join(', ')} pero este CV no lo muestra.`
                  : `Muestra ${keywords.covered.length} de ${total} términos que pide el aviso.`,
            }),
  })

  // Layout for screening software
  add({
    id: 'ats',
    weight: 6,
    area: 'design',
    refs: [],
    ...(isSingleColumn(cv.templateId)
      ? { status: 'pass', title: 'Legible para ATS', detail: 'Una columna: los filtros automáticos lo leen en orden.' }
      : { status: 'warn', title: 'Diseño en columnas', detail: 'Algunos filtros automáticos (ATS) leen las columnas desordenadas. Clásica o Moderna son las más seguras.' }),
  })

  // Skills
  const listFormat = (cv.skillsFormat ?? 'list') === 'list'
  add({
    id: 'skills',
    weight: 4,
    area: skills.length > 8 && listFormat ? 'design' : 'content',
    refs: [],
    ...(skills.length === 0
      ? { status: 'warn', title: 'Sin skills', detail: 'Mostrá las tecnologías y habilidades que respaldan tus logros.' }
      : skills.length > 25
        ? { status: 'warn', title: `${skills.length} skills`, detail: 'Son muchas: dejá las que pide el puesto y las que más usaste.' }
        : skills.length > 8 && listFormat
          ? { status: 'warn', title: 'Skills en lista', detail: `${skills.length} skills una debajo de otra ocupan mucho: mostralas separadas por comas.` }
          : { status: 'pass', title: `${skills.length} skills`, detail: 'Una cantidad que se lee de un vistazo.' }),
  })

  const weightTotal = checks.reduce((sum, check) => sum + check.weight, 0)
  const score = Math.round((checks.reduce((sum, check) => sum + check.weight * statusValue[check.status], 0) / weightTotal) * 100)
  return {
    score,
    grade: gradeFor(score),
    metrics: {
      pages,
      achievements: allTexts.length,
      withResults: resultsCount,
      summaryLength: summary.length,
      skills: skills.length,
      ...(keywords ? { keywords: { covered: keywords.covered.length, total } } : {}),
    },
    checks,
    ...(keywords ? { keywords } : {}),
  }
}

function formatPages(pages: number) {
  return Number.isInteger(pages) ? String(pages) : pages.toFixed(1).replace('.', ',')
}
