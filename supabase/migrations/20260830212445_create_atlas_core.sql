create table public.properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  normalized_address text,
  latitude double precision,
  longitude double precision,
  county text,
  township text,
  parcel_id text,
  reported_acres numeric(12,4),
  parcel_geometry extensions.geometry(MultiPolygon, 4326),
  source_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_parcel_geometry_gix
  on public.properties using gist (parcel_geometry);

create index properties_parcel_id_idx
  on public.properties (parcel_id);

create table public.property_sources (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  source_url text,
  record_date date,
  checked_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);

create index property_sources_property_id_idx
  on public.property_sources (property_id);

create table public.property_findings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null,
  finding_key text not null,
  label text not null,
  status text not null check (status in ('verified', 'likely', 'requires_verification', 'problem')),
  summary text,
  evidence jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (property_id, finding_key)
);

create index property_findings_property_id_idx
  on public.property_findings (property_id);

alter table public.properties enable row level security;
alter table public.property_sources enable row level security;
alter table public.property_findings enable row level security;
