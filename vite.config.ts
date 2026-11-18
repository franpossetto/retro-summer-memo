import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `npm test`: unit tests. `npm run test:integration`: need `supabase start`.
// `npm run test:mcp`: also need `supabase functions serve mcp`.
const scope = process.env.TEST_SCOPE
const integration = scope === 'integration' || scope === 'mcp'
const include =
  scope === 'integration' ? ['src/**/*.integration.test.ts'] : scope === 'mcp' ? ['supabase/functions/**/*.integration.test.ts'] : ['src/**/*.test.ts']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include,
    exclude: integration ? [] : ['src/**/*.integration.test.ts'],
    testTimeout: integration ? 20_000 : 5_000,
    fileParallelism: !integration,
  },
})
