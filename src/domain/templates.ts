export const templateIds = ['classic', 'modern', 'timeline', 'sidebar'] as const

export type TemplateId = (typeof templateIds)[number]

export const templates: { id: TemplateId; name: string; detail: string }[] = [
  { id: 'classic', name: 'Clásica', detail: 'Una columna, nombre centrado' },
  { id: 'modern', name: 'Moderna', detail: 'Una columna, nombre a la izquierda y color' },
  { id: 'timeline', name: 'Línea de tiempo', detail: 'Fechas en una columna' },
  { id: 'sidebar', name: 'Lateral', detail: 'Skills en una columna a la derecha' },
]

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (templateIds as readonly string[]).includes(value)
}

/** Single-column layouts: screening software (ATS) reads them in order. */
export function isSingleColumn(id: TemplateId) {
  return id === 'classic' || id === 'modern'
}

export function templateName(id: TemplateId) {
  return templates.find((template) => template.id === id)?.name ?? 'Clásica'
}
