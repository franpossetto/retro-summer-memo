import type { TemplateId } from './templates'

export const fontIds = ['times', 'georgia', 'palatino', 'garamond', 'sans', 'inter'] as const

export type FontId = (typeof fontIds)[number]

export const fonts: { id: FontId; name: string; family: string; kind: 'serif' | 'sans' }[] = [
  { id: 'times', name: 'Times', family: "'Times New Roman', Times, serif", kind: 'serif' },
  { id: 'georgia', name: 'Georgia', family: "Georgia, 'Times New Roman', serif", kind: 'serif' },
  { id: 'palatino', name: 'Palatino', family: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif", kind: 'serif' },
  { id: 'garamond', name: 'Garamond', family: "'EB Garamond Variable', Garamond, 'Times New Roman', serif", kind: 'serif' },
  { id: 'sans', name: 'Sistema', family: "system-ui, -apple-system, 'Segoe UI', sans-serif", kind: 'sans' },
  { id: 'inter', name: 'Inter', family: "'Inter Variable', Inter, system-ui, sans-serif", kind: 'sans' },
]

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && (fontIds as readonly string[]).includes(value)
}

export function fontName(id: FontId) {
  return fonts.find((font) => font.id === id)?.name ?? 'Times'
}

export function defaultFont(templateId: TemplateId): FontId {
  if (templateId === 'modern') return 'inter'
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

/**
 * Accent colors for names, headings and rules. Dark and saturated enough to print well and to
 * read as text on white; the first is "no color".
 */
export const accentColors = [
  { id: '#1f2328', name: 'Grafito' },
  { id: '#1f3a5f', name: 'Azul marino' },
  { id: '#0b5cad', name: 'Azul' },
  { id: '#0f6e6e', name: 'Petróleo' },
  { id: '#1e6b3a', name: 'Verde' },
  { id: '#7a2e3a', name: 'Bordó' },
  { id: '#5b3a8c', name: 'Violeta' },
  { id: '#b4541a', name: 'Terracota' },
] as const

export const DEFAULT_ACCENT = '#1f2328'

export function isAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/** Sections of the CV body (everything but the header) in their default order. */
export const DEFAULT_BODY_ORDER = ['experience', 'education', 'skills']

/**
 * The body sections in display order: those in `order` first, as given, then the rest in their
 * default order (`available` is already in default order).
 */
export function orderSections(available: string[], order: string[] | undefined): string[] {
  if (!order || order.length === 0) return available
  const known = order.filter((id, index) => available.includes(id) && order.indexOf(id) === index)
  return [...known, ...available.filter((id) => !known.includes(id))]
}

export function spacingLabel(value: number) {
  return value === 1 || value === 2 ? value.toFixed(1) : String(value)
}
