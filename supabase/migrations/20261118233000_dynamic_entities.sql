-- Entities accept data the model does not define (kept under `extra`), and the kinds of statuses
-- and history events are open: the app gives meaning to the ones it knows and accepts any other.
alter table public.experiences add column extra jsonb not null default '{}';
alter table public.sections add column extra jsonb not null default '{}';
alter table public.cvs add column extra jsonb not null default '{}';
alter table public.application_statuses add column extra jsonb not null default '{}';
alter table public.applications add column extra jsonb not null default '{}';
alter table public.application_events add column extra jsonb not null default '{}';

alter table public.application_statuses drop constraint application_statuses_kind_check;
alter table public.application_events drop constraint application_events_kind_check;
