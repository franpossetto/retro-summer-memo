import { defineConfig } from 'vite'

// Bundles src/mcp (and the domain + Supabase store it reuses) into one ES module for the Deno
// Edge Function. The MCP SDK and zod stay external: Deno resolves them through
// supabase/functions/mcp/deno.json.
export default defineConfig({
  build: {
    lib: { entry: 'src/mcp/index.ts', formats: ['es'], fileName: () => 'mcp.js' },
    outDir: 'supabase/functions/mcp/generated',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    copyPublicDir: false,
    rolldownOptions: { external: ['@modelcontextprotocol/server', 'zod', '@supabase/supabase-js'] },
  },
})
