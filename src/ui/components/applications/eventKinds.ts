/** How the app names the kinds of history events it knows; any other kind is shown as written. */
const eventKindLabels: Record<string, string> = {
  interview: 'Entrevista',
  call: 'Llamada',
  meeting: 'Reunión',
  email: 'Mail',
  task: 'Tarea',
  challenge: 'Challenge',
  offer: 'Oferta',
}

export function eventKindLabel(kind: string) {
  return eventKindLabels[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/[-_]+/g, ' ')
}
