export const templateIds = ['classic', 'timeline', 'sidebar'] as const

export type TemplateId = (typeof templateIds)[number]

export const templates: { id: TemplateId; name: string; detail: string }[] = [
  { id: 'classic', name: 'Classic', detail: 'Single column, centered name' },
  { id: 'timeline', name: 'Timeline', detail: 'Dates in a column' },
  { id: 'sidebar', name: 'Sidebar', detail: 'Skills in a right column' },
]

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (templateIds as readonly string[]).includes(value)
}

export function templateName(id: TemplateId) {
  return templates.find((template) => template.id === id)?.name ?? 'Classic'
}
