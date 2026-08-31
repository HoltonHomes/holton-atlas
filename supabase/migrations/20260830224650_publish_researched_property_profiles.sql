alter table public.property_research_profiles
  add column published boolean not null default false;

create policy "public can read published research profiles"
on public.property_research_profiles
for select
to anon
using (published = true);
