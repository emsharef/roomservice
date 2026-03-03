-- Prospect research tables
CREATE TABLE prospect_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN ('text', 'image')),
  source_content  text,
  source_images   jsonb DEFAULT '[]',
  prospect_count  int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prospects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            uuid NOT NULL REFERENCES prospect_batches(id) ON DELETE CASCADE,
  input_name          text NOT NULL,
  first_name          text,
  last_name           text,
  display_name        text,
  email               text,
  phone               text,
  website             text,
  company             text,
  title               text,
  location            text,
  photo_url           text,
  linkedin            text,
  instagram           text,
  other_socials       text[] DEFAULT '{}',
  research_brief      jsonb,
  research_summary    text,
  confidence          text CHECK (confidence IN ('high', 'medium', 'low')),
  style_preferences   text[] DEFAULT '{}',
  subject_preferences text[] DEFAULT '{}',
  mood_preferences    text[] DEFAULT '{}',
  known_artists       text[] DEFAULT '{}',
  engagement_level    text,
  board_memberships   text[] DEFAULT '{}',
  collection_mentions text[] DEFAULT '{}',
  art_events          text[] DEFAULT '{}',
  advisory_roles      text[] DEFAULT '{}',
  foundations         text[] DEFAULT '{}',
  notable_giving      text[] DEFAULT '{}',
  sources             jsonb DEFAULT '[]',
  status              text NOT NULL DEFAULT 'parsed'
                      CHECK (status IN ('parsed', 'researching', 'done', 'error', 'skipped')),
  error_message       text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_batch_id ON prospects(batch_id);
CREATE INDEX idx_prospects_status ON prospects(status);

-- RLS
ALTER TABLE prospect_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff+ can read prospect_batches"
  ON prospect_batches FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'staff'));

CREATE POLICY "Staff+ can write prospect_batches"
  ON prospect_batches FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'staff'))
  WITH CHECK (public.get_user_role() IN ('admin', 'staff'));

CREATE POLICY "Staff+ can read prospects"
  ON prospects FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'staff'));

CREATE POLICY "Staff+ can write prospects"
  ON prospects FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'staff'))
  WITH CHECK (public.get_user_role() IN ('admin', 'staff'));
