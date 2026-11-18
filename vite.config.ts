import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `npm test` runs unit tests; `npm run test:integration` runs the ones that need `supabase start`.
const integration = process.env.TEST_SCOPE === 'integration'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: integration ? ['src/**/*.integration.test.ts'] : ['src/**/*.test.ts'],
    exclude: integration ? [] : ['src/**/*.integration.test.ts'],
    testTimeout: integration ? 20_000 : 5_000,
    fileParallelism: !integration,
  },
})
