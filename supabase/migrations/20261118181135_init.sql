-- CV builder + job applications tracker.
--
-- Every row belongs to one user (user_id) and row level security limits each user to their own
-- rows, for the web app and for the MCP server alike. Ids are client-generated text (seed ids
-- like 'rest-api' repeat across users), so primary keys are (user_id, id).

-- Personal data: name, contact fields, education, work history. One row per user (id = 'me').
create table public.profiles (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null default 'me',
  data jsonb not null,
  primary key (user_id, id)
);

-- Experience bank ("master"), with how much experience the user has with each one.
create table public.experiences (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  category text not null default 'Custom',
  text text not null,
  skills text[] not null default '{}',
  aliases text[] not null default '{}',
  level smallint check (level between 0 and 2), -- null: not answered yet
  sort integer not null default 0,
  primary key (user_id, id)
);

-- CV sections catalog (built-in and custom).
create table public.sections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  description text not null default '',
  active boolean not null default true,
  built_in boolean not null default false,
  sort integer not null default 0,
  primary key (user_id, id)
);

-- Reusable role graphs (a role plus its experiences) to drop into CVs.
create table public.role_templates (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  graph jsonb not null,
  sort integer not null default 0,
  primary key (user_id, id)
);

-- CVs: metadata, style and the editable graph.
create table public.cvs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  target_role text not null default '',
  target_company text not null default '',
  posting text not null default '',
  summary text not null default '',
  style jsonb not null default '{}',
  enabled_sections text[] not null default '{}',
  graph jsonb not null default '{"nodes": [], "edges": []}',
  sort integer not null default 0,
  primary key (user_id, id)
);

-- Built CV versions. Immutable: an application can point at exactly what was sent.
create table public.cv_versions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  cv_id text not null,
  created_at timestamptz,
  snapshot jsonb not null,
  sort integer not null default 0,
  primary key (user_id, id),
  foreign key (user_id, cv_id) references public.cvs (user_id, id) on delete cascade
);

create index cv_versions_cv on public.cv_versions (user_id, cv_id);

-- Pipeline steps the user defines (CV enviado, Call con RRHH, Challenge técnico, ...).
create table public.application_statuses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  color text not null default '#6e7781',
  kind text not null default 'active' check (kind in ('active', 'offer', 'rejected', 'withdrawn')),
  sort integer not null default 0,
  primary key (user_id, id)
);

-- Job applications.
create table public.applications (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  company text not null default '',
  title text not null default '',
  url text not null default '',
  posting_key text not null default '', -- normalized posting identity, e.g. 'linkedin:4012345678'
  posting text not null default '',
  location text not null default '',
  applied_on date,
  status_id text not null,
  attachment jsonb, -- {kind:'cv', cvId, versionId} | {kind:'file', path, name}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index applications_posting_key on public.applications (user_id, posting_key) where posting_key <> '';

-- History of each application: status changes and notes added at each step.
create table public.application_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  application_id text not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('status', 'note')),
  status_id text not null,
  text text not null default '',
  primary key (user_id, id),
  foreign key (user_id, application_id) references public.applications (user_id, id) on delete cascade
);

create index application_events_application on public.application_events (user_id, application_id);

-- Access: owners only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'experiences', 'sections', 'role_templates', 'cvs', 'cv_versions',
    'application_statuses', 'applications', 'application_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owners manage their rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;
