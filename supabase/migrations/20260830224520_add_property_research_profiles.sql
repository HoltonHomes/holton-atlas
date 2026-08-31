create table public.property_research_profiles (
  id uuid primary key default gen_random_uuid(),
  normalized_address text not null unique,
  display_address text not null,
  county text,
  parcel_number text,
  facts jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz not null default now(),
  review_status text not null default 'researched' check (review_status in ('researched', 'needs_review', 'stale')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_research_profiles enable row level security;
