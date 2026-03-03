# Prospect Research Tool — Design

## Purpose

A tool under `/tools/prospects` where gallery staff enter a list of potential prospects (via text or image), the system parses names, then researches each person using Claude + web search. Results include contact info, photos, collecting profile, art world connections, and artwork matching — helping the gallery qualify, prepare outreach for, and match inventory to new leads.

## Key Decisions

- **Standalone from CRM**: Prospects live in their own table, no auto-push to Arternal. Future "Add to CRM" button is out of scope for v1.
- **Claude + web search**: Same AI provider as collector/artist enrichment. Swap to Gemini later if search quality for contact info proves weak.
- **Batch-oriented**: Prospects are grouped into batches (e.g. "Frieze LA 2025 VIP List"). Typical batch is 15-50 names.
- **Input flexibility**: Text (pasted names), images (photos of guest lists, directories, handwritten notes), or both.
- **Disambiguation**: Batch name and any parsed context (company, title) are fed to the prompt. Ambiguous/common names get low confidence.

## Data Model

### `prospect_batches`

```sql
CREATE TABLE prospect_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN ('text', 'image')),
  source_content  text,                              -- raw pasted text (null for images)
  source_images   jsonb DEFAULT '[]',                -- base64 images array (null for text)
  prospect_count  int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### `prospects`

```sql
CREATE TABLE prospects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            uuid NOT NULL REFERENCES prospect_batches(id) ON DELETE CASCADE,
  input_name          text NOT NULL,
  first_name          text,
  last_name           text,
  display_name        text,

  -- Contact info (found via research)
  email               text,
  phone               text,
  website             text,
  company             text,
  title               text,
  location            text,
  photo_url           text,

  -- Social media
  linkedin            text,
  instagram           text,
  other_socials       text[] DEFAULT '{}',

  -- Research output
  research_brief      jsonb,
  research_summary    text,
  confidence          text CHECK (confidence IN ('high', 'medium', 'low')),

  -- Collecting profile (extracted for matching)
  style_preferences   text[] DEFAULT '{}',
  subject_preferences text[] DEFAULT '{}',
  mood_preferences    text[] DEFAULT '{}',
  known_artists       text[] DEFAULT '{}',
  engagement_level    text,

  -- Art world connections
  board_memberships   text[] DEFAULT '{}',
  collection_mentions text[] DEFAULT '{}',
  art_events          text[] DEFAULT '{}',
  advisory_roles      text[] DEFAULT '{}',

  -- Philanthropy
  foundations         text[] DEFAULT '{}',
  notable_giving      text[] DEFAULT '{}',

  -- Sources
  sources             jsonb DEFAULT '[]',

  -- Lifecycle
  status              text NOT NULL DEFAULT 'parsed'
                      CHECK (status IN ('parsed', 'researching', 'done', 'error', 'skipped')),
  error_message       text,

  -- Audit
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_batch_id ON prospects(batch_id);
CREATE INDEX idx_prospects_status ON prospects(status);
```

RLS: Staff+ can read/write, same pattern as staged_contacts.

## Workflow

1. **Input** — User creates a new batch with a name (e.g. "Basel VIP 2025"), pastes text or uploads images.
2. **Parse** — Claude extracts names + any visible context (company, title, location). Returns structured list. User can edit, remove, add rows.
3. **Research** — User clicks "Start Research". Each prospect gets a Claude + web search call (max_uses: 15). Sequential with ~2s delay. UI shows per-row status.
4. **Review** — Card grid showing photo, name, summary, contact info, tag pills. Click to expand full detail. Re-run failed ones.

## Enrichment Prompt

The prompt differs from collector enrichment in that it starts from just a name (+ optional context) rather than a known CRM contact. It instructs Claude to:

1. **Identify** — Confirm who this person is. Use batch context and any parsed details to disambiguate common names.
2. **Find contact info** — Email, phone, LinkedIn, Instagram, website, other socials.
3. **Find a photo** — Headshot or profile photo URL (LinkedIn, company page, press).
4. **Profile** — Professional background, art world connections, board memberships, collecting activity, philanthropy.
5. **Assess collecting taste** — Known artists collected, style/subject/mood preferences (canonical tag vocabularies), engagement level.
6. **Source everything** — Numbered inline citations [1][2] like artist enrichment.

If the person cannot be reliably identified, mark confidence as "low" and note the ambiguity.

### Output Shape (ProspectEnrichment interface)

```typescript
interface ProspectEnrichment {
  display_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  linkedin: string | null;
  instagram: string | null;
  other_socials: string[];
  summary: string;
  professional: {
    current_role: string;
    career_highlights: string[];
    industry: string;
  };
  art_world: {
    board_memberships: string[];
    collection_mentions: string[];
    art_events: string[];
    advisory_roles: string[];
    known_artists: string[];
  };
  philanthropy: {
    foundations: string[];
    notable_giving: string[];
  };
  collection_profile: {
    style_preferences: string[];
    subject_preferences: string[];
    mood_preferences: string[];
    engagement_level: "active_collector" | "casual_buyer" | "institutional" | "unknown";
  };
  sources: Array<{ url: string; title: string; relevance: string }>;
  confidence: "high" | "medium" | "low";
  notes: string;
}
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/prospects/parse` | POST | Accept text or images, return parsed name list via Claude |
| `/api/prospects/batch` | POST | Create batch + prospect rows from parsed list |
| `/api/prospects/batch` | GET | List batches for current user |
| `/api/prospects/research/[id]` | POST | Research a single prospect |

## File Structure

```
src/app/tools/prospects/
  page.tsx                    -- server component, fetches batches
  ProspectsDashboard.tsx      -- client component, batch list + new research flow
  [batchId]/
    page.tsx                  -- server component, fetches prospects for batch
    BatchDetail.tsx           -- client component, card grid + research controls
src/app/api/prospects/
  parse/route.ts
  batch/route.ts
  research/[id]/route.ts
src/lib/prospects.ts          -- parseProspectList()
src/lib/enrichment.ts         -- add enrichProspect()
supabase/migrations/009_prospects.sql
```

## UI

### Batch list (`/tools/prospects`)
- Table of previous batches: name, date, count, status summary
- "New Research" button

### New Research flow
- Batch name input
- Toggle: text vs image input
- Text: large textarea ("paste names, one per line")
- Image: drag-and-drop, multiple images
- "Parse" button → parsed list table

### Parsed list
- Editable table: checkbox, name, company/title, context
- Remove row, add row, skip row
- "Start Research" button

### Research results (card grid)
- Photo (or silhouette placeholder), name, title/company, location
- Confidence badge
- 2-3 line summary
- Contact icons (email, LinkedIn, Instagram, website — greyed if not found)
- Style/subject/mood tag pills
- Click → expand full detail panel
- Status filter: All / Done / Errors / Skipped
- Sticky progress bar during research with pause/resume
