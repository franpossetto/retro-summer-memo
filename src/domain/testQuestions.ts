export type TestQuestion = {
  id: string
  prompt: string
  detail: string
  experienceIds: string[]
}

/** Broader prompts that can map to several bank experiences. */
export const testQuestions: TestQuestion[] = [
  {
    id: 'apis',
    prompt: '¿Diseñaste o lanzaste APIs?',
    detail: 'Servicios HTTP de los que dependen los clientes — contratos, autenticación, GraphQL o REST.',
    experienceIds: ['rest-api', 'api-auth', 'api-contract', 'graphql-api'],
  },
  {
    id: 'architecture',
    prompt: '¿Definiste cómo se estructura una aplicación?',
    detail: 'Límites, reglas de dominio, diseño limpio o modular.',
    experienceIds: ['clean-architecture', 'module-boundaries', 'domain-model'],
  },
  {
    id: 'data',
    prompt: '¿Trabajaste con datos relacionales en un producto real?',
    detail: 'SQL, esquemas, consultas lentas, reportes.',
    experienceIds: ['sql', 'schema-design', 'slow-query', 'reporting-dashboard'],
  },
  {
    id: 'frontend',
    prompt: '¿Construiste interfaces de usuario para la web?',
    detail: 'React, estado del cliente, accesibilidad.',
    experienceIds: ['react-ui', 'client-state', 'accessible-ui'],
  },
  {
    id: 'quality',
    prompt: '¿Fuiste responsable de la calidad antes de que el código llegue a los usuarios?',
    detail: 'Tests, revisiones de código, CI, debugging en producción.',
    experienceIds: ['unit-tests', 'integration-tests', 'code-review', 'lead-reviews', 'ci-pipeline', 'production-debug'],
  },
  {
    id: 'delivery',
    prompt: '¿Fuiste responsable de entregar el trabajo?',
    detail: 'Lanzamientos, mentoría, estimaciones, documentación, entregas entre equipos.',
    experienceIds: ['ship-production', 'mentor', 'estimate', 'documentation', 'cross-team'],
  },
  {
    id: 'platform',
    prompt: '¿Operaste servicios en una plataforma — contenedores, nube, ops?',
    detail: 'Servicios en Node o C#, Docker, deploys en la nube, observabilidad.',
    experienceIds: ['csharp-service', 'node-service', 'containers', 'cloud-deploy', 'observability'],
  },
  {
    id: 'domain-bim',
    prompt: '¿Trabajaste con herramientas de BIM o Revit?',
    detail: 'Integraciones con la API de Revit y flujos de BIM automatizados.',
    experienceIds: ['revit-api', 'bim-automation'],
  },
]
