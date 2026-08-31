create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_property_research_profiles_updated_at
before update on public.property_research_profiles
for each row execute function public.set_updated_at();
