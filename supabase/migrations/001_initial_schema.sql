-- Enable pgvector
create extension if not exists vector with schema extensions;

-- ============================================
-- MIRROR TABLES (synced from Arternal)
-- ============================================

create table artworks (
  id bigint primary key,
  catalog_number text,
  title text not null,
  year text,
  medium text,
  dimensions text,
  edition text,
  price numeric,
  price_currency text,
  work_status text,
  status text,
  type text,
  height numeric,
  width numeric,
  depth numeric,
  primary_image_url text,
  url text,
  artist_ids bigint[] default '{}',
  arternal_created_at timestamptz,
  arternal_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table artists (
  id bigint primary key,
  first_name text,
  last_name text,
  alias text,
  display_name text not null,
  birth_year text,
  death_year text,
  bio text,
  country text,
  life_dates text,
  work_count int,
  catalog_count int,
  saved boolean default false,
  arternal_created_at timestamptz,
  arternal_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table contacts (
  id bigint primary key,
  first_name text,
  last_name text,
  display_name text not null,
  email text,
  phone text,
  phone_mobile text,
  type text,
  website text,
  company text,
  primary_street text,
  primary_city text,
  primary_state text,
  primary_zip text,
  primary_country text,
  primary_address_formatted text,
  tags text[] default '{}',
  arternal_created_at timestamptz,
  arternal_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table artwork_artists (
  artwork_id bigint references artworks(id) on delete cascade,
  artist_id bigint references artists(id) on delete cascade,
  display_name text,
  primary key (artwork_id, artist_id)
);

-- ============================================
-- EXTENDED TABLES (AI-generated, toolkit-owned)
-- ============================================

create table artworks_extended (
  artwork_id bigint primary key references artworks(id) on delete cascade,
  clip_embedding vector(768),
  ai_description text,
  style_tags text[] default '{}',
  color_palette jsonb,
  subject_tags text[] default '{}',
  mood_tags text[] default '{}',
  description_embedding vector(768),
  comparable_sales jsonb,
  price_history jsonb,
  clip_generated_at timestamptz,
  vision_analyzed_at timestamptz,
  enrichment_status text default 'pending'
    check (enrichment_status in ('pending', 'processing', 'complete', 'error')),
  enrichment_error text,
  updated_at timestamptz not null default now()
);

create table artists_extended (
  artist_id bigint primary key references artists(id) on delete cascade,
  enrichment_brief jsonb,
  formatted_bio text,
  market_context text,
  related_artist_ids bigint[] default '{}',
  enrichment_status text default 'pending'
    check (enrichment_status in ('pending', 'researching', 'draft', 'approved', 'written_back', 'error')),
  enrichment_error text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  written_back_at timestamptz,
  updated_at timestamptz not null default now()
);

create table contacts_extended (
  contact_id bigint primary key references contacts(id) on delete cascade,
  taste_embedding vector(768),
  collector_brief jsonb,
  inferred_preferences jsonb,
  enrichment_status text default 'pending'
    check (enrichment_status in ('pending', 'researching', 'draft', 'approved', 'written_back', 'error')),
  enrichment_error text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  written_back_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================
-- SYNC TRACKING
-- ============================================

create table sync_log (
  id bigserial primary key,
  entity_type text not null,
  direction text not null default 'pull',
  records_processed int default 0,
  records_created int default 0,
  records_updated int default 0,
  status text not null default 'running'
    check (status in ('running', 'completed', 'error')),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  triggered_by uuid
);

-- ============================================
-- USER PROFILES (extends Supabase auth.users)
-- ============================================

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'viewer'
    check (role in ('admin', 'staff', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_artworks_status on artworks(status);
create index idx_artworks_type on artworks(type);
create index idx_artworks_updated on artworks(arternal_updated_at);
create index idx_artworks_artist_ids on artworks using gin(artist_ids);
create index idx_artists_updated on artists(arternal_updated_at);
create index idx_contacts_updated on contacts(arternal_updated_at);
create index idx_artwork_artists_artist on artwork_artists(artist_id);
create index idx_contacts_tags on contacts using gin(tags);

create index idx_artworks_title_search on artworks using gin(to_tsvector('english', coalesce(title, '')));
create index idx_artists_name_search on artists using gin(to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')));
create index idx_contacts_name_search on contacts using gin(to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(company, '')));

create index idx_artworks_ext_style on artworks_extended using gin(style_tags);
create index idx_artworks_ext_subject on artworks_extended using gin(subject_tags);
create index idx_artworks_ext_mood on artworks_extended using gin(mood_tags);
create index idx_artworks_ext_status on artworks_extended(enrichment_status);
create index idx_artists_ext_status on artists_extended(enrichment_status);
create index idx_contacts_ext_status on contacts_extended(enrichment_status);
