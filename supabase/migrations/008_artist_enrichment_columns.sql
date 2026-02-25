-- Add extracted searchable columns to artists_extended for enrichment
-- Matches the pattern used for contacts_extended (style/subject/mood tags)

ALTER TABLE artists_extended
  ADD COLUMN IF NOT EXISTS primary_mediums text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subject_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mood_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enrichment_confidence text;
