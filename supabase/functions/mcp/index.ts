/**
 * MCP server: lets Claude (or any MCP client) read and update the user's job-search tracker.
 * Clients sign in through Supabase Auth's OAuth 2.1 server; every tool runs as that user, so RLS
 * keeps each person to their own rows. Deployed at /functions/v1/mcp with verify_jwt = false
 * (the discovery request has no token; withSupabase checks it).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { pipeline } from '@supabase/middleware'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import { INSTRUCTIONS, registerTools } from './tools.ts'

Deno.serve(
  pipeline([withOAuthProtectedResource(), withSupabase({ auth: 'user' })], async (req, { supabase }) => {
    // Edge Functions are stateless: a fresh server per request.
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'cv-tracker', version: '0.1.0' }, { instructions: INSTRUCTIONS })
      registerTools(server, supabase)
      return server
    })
    return handler.fetch(req)
  }),
)
