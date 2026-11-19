/** The everyday requests: what the user types to their assistant to drive Resume. */
export const prompts = {
  updateInfo: 'Actualizá mi info en Resume',
  buildCv: 'Armemos el CV para <link del aviso>',
  news: (company: string, next?: string) =>
    `Me confirmaron de ${company || '<empresa>'}, ${next ? `pasé a ${next}` : 'pasé a la siguiente etapa'}, es el <fecha>`,
}
