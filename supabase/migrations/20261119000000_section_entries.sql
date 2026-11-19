-- Sections become data: any section (projects, certifications, languages…) holds its own entries,
-- and each experience can say where it happened: an entry of any section (for Experience and
-- Education, entries are the profile's roles and education).
alter table public.sections add column entries jsonb not null default '[]';
alter table public.experiences add column entry_id text;
