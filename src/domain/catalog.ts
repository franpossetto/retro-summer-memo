export type ExperiencePreset = {
  id: string
  category: string
  text: string
  skills: string[]
}

export const experienceCatalog: ExperiencePreset[] = [
  {
    id: 'revit-api',
    category: 'Engineering',
    text: 'Build Revit integrations using Revit API and C#',
    skills: ['Revit API', 'C#'],
  },
  {
    id: 'rest-api',
    category: 'Engineering',
    text: 'Design and ship REST APIs for internal tools',
    skills: ['REST', 'C#', 'API design'],
  },
  {
    id: 'pipelines',
    category: 'Engineering',
    text: 'Automate build and test pipelines',
    skills: ['CI/CD', 'Git'],
  },
  {
    id: 'dashboards',
    category: 'Reporting',
    text: 'Build dashboards for project reporting',
    skills: ['SQL', 'Data visualization'],
  },
  {
    id: 'reviews',
    category: 'Collaboration',
    text: 'Lead code reviews and mentor engineers',
    skills: ['Code review', 'Mentoring'],
  },
  {
    id: 'coordination',
    category: 'Collaboration',
    text: 'Coordinate delivery with architects and project managers',
    skills: ['Coordination', 'Documentation'],
  },
]

export function filterExperiences(query: string): ExperiencePreset[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return experienceCatalog
  return experienceCatalog.filter((preset) => {
    const haystack = [preset.text, preset.category, ...preset.skills].join(' ').toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
