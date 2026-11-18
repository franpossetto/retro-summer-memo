# CV builder + job applications tracker

Build tailored CVs from a graph of your experience, and track every application you send:
which CV (exact version) went where, what step each process is in, and whether you already
applied to that posting or role before.

## Architecture

```
src/
  domain/     pure model and rules: CV graph, build, matching, applications, parsing
  app/        use cases on top of the ports (e.g. openDocument)
  ports/      interfaces the app depends on: DocumentStore, AuthGateway
  adapters/   implementations: local (localStorage), supabase (Postgres + Auth + Realtime)
  backend.ts  composition root: picks the adapters from the environment
  ui/         React: Root (sign-in, loading), App, components
supabase/     local stack config and SQL migrations (RLS: each user sees only their rows)
```

The UI and the use cases only talk to `ports/`. Swapping the backend means writing another
adapter that passes `ports/documentStore.contract.ts`.

## Run it

```bash
npm install
npm run db:start                      # local Supabase in Docker (first run downloads images)
cp .env.example .env.local            # then paste the publishable key from:
npx supabase status -o env            #   PUBLISHABLE_KEY=...
npm run dev                           # http://localhost:5173
```

Sign in with any email; locally the link arrives in Mailpit at http://127.0.0.1:54324.
On first sign-in, data saved in this browser by the older localStorage version is imported.

Without `VITE_SUPABASE_*` the app runs entirely in the browser, as before.

## Cloud project

`npm run dev` talks to the local stack (`.env.local`); `npm run build` / `npm run preview` use
`.env.production.local` (cloud URL + publishable key, gitignored). The secret key is never needed
by the app: Edge Functions (the MCP) receive it from Supabase itself.

```bash
npx supabase login                                   # once, opens the browser
npx supabase link --project-ref attrxmtjyjzfgopfrgnk
npx supabase db push --remote                        # applies supabase/migrations (without
                                                     # --remote, CLI 3.x targets the local stack)
```

Redirect URLs (Authentication → URL Configuration) must include every origin the app is served
from, or sign-in links bounce to the Site URL. Set: Site URL `https://retro-summer-memo.vercel.app`,
redirects `https://retro-summer-memo.vercel.app` and `http://localhost:4173` (preview).

## Deploy

The frontend is a static build on Vercel (Supabase does not host frontends):
https://retro-summer-memo.vercel.app. `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are set
in the Vercel project (Production); `.vercelignore` keeps local env files out of the upload.

```bash
vercel deploy --prod      # from the repo root (project already linked in .vercel/)
```

Do not `supabase config push` this repo's `config.toml` to the cloud: it holds local-dev values
(email confirmations and MFA off). Run `supabase config diff` first and push only what you mean to.

## MCP (Claude)

`supabase/functions/mcp` is a remote MCP server so Claude can drive the tracker:
`https://attrxmtjyjzfgopfrgnk.supabase.co/functions/v1/mcp`.

- Tools: `get_profile`, `list_experiences`, `list_statuses`, `search_applications`, `get_application`,
  `check_duplicates`, `create_application` (refuses likely duplicates until confirmed),
  `move_application`, `add_note`, `update_application`, `list_cvs`, `attach_cv`; prompt `nuevo-job`.
- Auth: Supabase Auth's OAuth 2.1 server with dynamic client registration. Clients are sent to
  `/oauth/consent` in the app (`src/ui/Consent.tsx`); tools run as the signed-in user, so RLS applies.
  Any client can register: only approve consent requests you started.
- The domain rules (`src/domain/applications.ts`, `applicationFilters.ts`) are shared with the app.

Connect: claude.ai → Settings → Connectors → Add custom connector → the URL above (it then works in
the desktop and mobile apps too). Claude Code: `claude mcp add --transport http cv-tracker <url>`.

```bash
npx supabase functions serve mcp                    # local: http://127.0.0.1:54321/functions/v1/mcp
npm run test:mcp                                    # with the function served
npx supabase functions deploy mcp --remote=attrxmtjyjzfgopfrgnk --no-verify-jwt
```

## Checks

```bash
npm run build              # type-check + production build
npm run lint
npm test                   # unit + contract tests (no network)
npm run test:integration   # against the local Supabase: contract, RLS, live changes
npm run db:reset           # wipe the local database and re-apply migrations
```
