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
    prompt: 'Have you designed or shipped APIs?',
    detail: 'HTTP services clients depend on — contracts, auth, GraphQL or REST.',
    experienceIds: ['rest-api', 'api-auth', 'api-contract', 'graphql-api'],
  },
  {
    id: 'architecture',
    prompt: 'Have you shaped how an application is structured?',
    detail: 'Boundaries, domain rules, clean or modular design.',
    experienceIds: ['clean-architecture', 'module-boundaries', 'domain-model'],
  },
  {
    id: 'data',
    prompt: 'Have you worked with relational data in a real product?',
    detail: 'SQL, schemas, slow queries, reporting.',
    experienceIds: ['sql', 'schema-design', 'slow-query', 'reporting-dashboard'],
  },
  {
    id: 'frontend',
    prompt: 'Have you built user interfaces for the web?',
    detail: 'React, client state, accessibility.',
    experienceIds: ['react-ui', 'client-state', 'accessible-ui'],
  },
  {
    id: 'quality',
    prompt: 'Have you owned quality before code reaches users?',
    detail: 'Tests, reviews, CI, production debugging.',
    experienceIds: ['unit-tests', 'integration-tests', 'code-review', 'lead-reviews', 'ci-pipeline', 'production-debug'],
  },
  {
    id: 'delivery',
    prompt: 'Have you been responsible for getting work out the door?',
    detail: 'Shipping, mentoring, estimates, docs, cross-team delivery.',
    experienceIds: ['ship-production', 'mentor', 'estimate', 'documentation', 'cross-team'],
  },
  {
    id: 'platform',
    prompt: 'Have you run services on a platform — containers, cloud, ops?',
    detail: 'Node or C# services, Docker, cloud deploys, observability.',
    experienceIds: ['csharp-service', 'node-service', 'containers', 'cloud-deploy', 'observability'],
  },
  {
    id: 'domain-bim',
    prompt: 'Have you worked in BIM or Revit tooling?',
    detail: 'Revit API integrations and automated BIM workflows.',
    experienceIds: ['revit-api', 'bim-automation'],
  },
]
