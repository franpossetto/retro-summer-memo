/** The everyday requests: what the user types to their assistant to drive Resume. */
export const prompts = {
  updateInfo: 'Actualizá mi info en Resume',
  buildCv: 'Armemos el CV para <link del aviso>',
  news: (company: string, next?: string) =>
    `Me confirmaron de ${company || '<empresa>'}, ${next ? `pasé a ${next}` : 'pasé a la siguiente etapa'}, es el <fecha>`,
  debrief: (company: string, stage: string) =>
    `Te cuento cómo me fue en ${stage || 'la entrevista'} con ${company || '<empresa>'}: me preguntaron…`,
  research: (company: string) => `Investigá ${company || '<empresa>'} y guardá lo importante en Resume`,
  prepare: (company: string) => `Preparame para la próxima etapa con ${company || '<empresa>'}`,
}
