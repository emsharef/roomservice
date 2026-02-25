-- Staged contacts table for business card scanner workflow
create table staged_contacts (
  id uuid primary key default gen_random_uuid(),

  -- Contact fields (mirrors Arternal contact schema)
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  phone_mobile text,
  type text,              -- job title from OCR
  website text,
  company text,
  primary_street text,
  primary_city text,
  primary_state text,
  primary_zip text,
  primary_country text,

  -- User-added fields (not from OCR)
  tags text[] default '{}',
  notes text[] default '{}',

  -- OCR metadata
  source_images jsonb not null default '[]',    -- array of base64 strings
  ocr_raw_response jsonb,
  ocr_confidence text check (ocr_confidence in ('high', 'medium', 'low')),

  -- Duplicate detection
  duplicate_candidates jsonb default '[]',       -- array of {id, display_name, email, company, match_reason, score}

  -- Lifecycle
  status text not null default 'draft' check (status in ('draft', 'approved', 'written', 'error')),
  arternal_contact_id integer,                   -- set after successful write to Arternal
  error_message text,

  -- Audit
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for listing by status and user
create index idx_staged_contacts_status on staged_contacts(status);
create index idx_staged_contacts_created_by on staged_contacts(created_by);

-- RLS
alter table staged_contacts enable row level security;

create policy "Staff+ can read staged_contacts"
  on staged_contacts for select to authenticated
  using (public.get_user_role() in ('admin', 'staff'));

create policy "Staff+ can write staged_contacts"
  on staged_contacts for all to authenticated
  using (public.get_user_role() in ('admin', 'staff'))
  with check (public.get_user_role() in ('admin', 'staff'));
