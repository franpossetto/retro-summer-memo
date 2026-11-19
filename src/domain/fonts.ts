import type { TemplateId } from './templates'

export const fontIds = ['times', 'georgia', 'palatino', 'sans'] as const

export type FontId = (typeof fontIds)[number]

export const fonts: { id: FontId; name: string; family: string }[] = [
  { id: 'times', name: 'Times', family: "'Times New Roman', Times, serif" },
  { id: 'georgia', name: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
  { id: 'palatino', name: 'Palatino', family: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: 'sans', name: 'Sans', family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
]

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && (fontIds as readonly string[]).includes(value)
}

export function fontName(id: FontId) {
  return fonts.find((font) => font.id === id)?.name ?? 'Times'
}

export function defaultFont(templateId: TemplateId): FontId {
  if (templateId === 'sidebar') return 'sans'
  if (templateId === 'timeline') return 'georgia'
  return 'times'
}

export const fontSizes = [9, 10, 11, 12, 14] as const

export type FontSize = (typeof fontSizes)[number]

export function isFontSize(value: unknown): value is FontSize {
  return typeof value === 'number' && (fontSizes as readonly number[]).includes(value)
}

export function defaultFontSize(templateId: TemplateId): FontSize {
  if (templateId === 'sidebar') return 11
  return 12
}

export const lineSpacings = [1, 1.15, 1.5, 2] as const

export type LineSpacing = (typeof lineSpacings)[number]

export function isLineSpacing(value: unknown): value is LineSpacing {
  return typeof value === 'number' && (lineSpacings as readonly number[]).includes(value)
}

export const pageSizes = [
  { id: 'letter', name: 'Carta', width: 816, height: 1056 },
  { id: 'a4', name: 'A4', width: 794, height: 1123 },
] as const

export type PageSize = (typeof pageSizes)[number]['id']

export function isPageSize(value: unknown): value is PageSize {
  return value === 'letter' || value === 'a4'
}

export function pageSpec(id: PageSize) {
  return pageSizes.find((page) => page.id === id) ?? pageSizes[0]
}

export const margins = [
  { id: 'narrow', name: 'Angostos' },
  { id: 'normal', name: 'Normales' },
  { id: 'wide', name: 'Amplios' },
] as const

export type MarginId = (typeof margins)[number]['id']

export function isMarginId(value: unknown): value is MarginId {
  return value === 'narrow' || value === 'normal' || value === 'wide'
}

export function defaultMargin(_templateId: TemplateId): MarginId {
  return 'normal'
}

export function spacingLabel(value: number) {
  return value === 1 || value === 2 ? value.toFixed(1) : String(value)
}
