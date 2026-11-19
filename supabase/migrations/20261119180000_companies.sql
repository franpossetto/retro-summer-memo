-- Companies the user applies to or looks into: what they do, mission, vision, values, and notes
-- with everything learned about them (news, layoffs, hiring, other openings, others' interviews…).
-- Applications belong to the company with the same name (compared ignoring case, accents,
-- punctuation and legal suffixes), so there is no foreign key between them.
create table public.companies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  website text not null default '',
  logo text not null default '', -- image URL; empty: the website's icon or the initials
  about text not null default '',
  mission text not null default '',
  vision text not null default '',
  core_values text[] not null default '{}',
  sort integer not null default 0,
  extra jsonb not null default '{}', -- industry, size, headquarters, funding, stack…
  primary key (user_id, id)
);

create table public.company_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  company_id text not null,
  kind text not null default 'news', -- news, hiring, layoff, role, interview, culture, salary, funding… or any other
  happened_on text not null default '', -- 'yyyy-mm-dd', 'yyyy-mm', 'yyyy' or '' (unknown)
  text text not null default '',
  source text not null default '', -- a link, or who said it
  added_at timestamptz not null default now(),
  extra jsonb not null default '{}',
  primary key (user_id, id),
  foreign key (user_id, company_id) references public.companies (user_id, id) on delete cascade
);

create index company_notes_company on public.company_notes (user_id, company_id);

-- How a step went, told by the user: rating, people, what they asked, what was said and not
-- said, what they liked and their doubts. Set on events of kind 'debrief'.
alter table public.application_events add column debrief jsonb;

do $$
declare
  t text;
begin
  foreach t in array array['companies', 'company_notes']
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
