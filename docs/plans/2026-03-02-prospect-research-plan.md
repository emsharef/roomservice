# Prospect Research Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a prospect research tool under `/tools/prospects` where gallery staff enter a list of names (text or image), the system parses them, researches each via Claude + web search, and displays rich profiles with contact info, photos, and collecting preferences.

**Architecture:** New `prospect_batches` and `prospects` tables. Parse via Claude Vision (for images) or Claude text (for pasted names). Research via Claude + web search, same pattern as artist/collector enrichment. Client-side batch processing loop (same as card scanner and batch dashboard).

**Tech Stack:** Next.js 15, Supabase, Anthropic SDK (Claude Sonnet + web_search tool), Tailwind CSS, TypeScript.

**Design doc:** `docs/plans/2026-03-02-prospect-research-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/009_prospects.sql`

**Step 1: Write migration**

```sql
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
```

**Step 2: Run migration**

```bash
source .env.local && psql "$SUPABASE_DB_URL" -f supabase/migrations/009_prospects.sql
```

**Step 3: Verify**

```bash
source .env.local && psql "$SUPABASE_DB_URL" -c "\d prospects" && psql "$SUPABASE_DB_URL" -c "\d prospect_batches"
```

**Step 4: Commit**

```bash
git add supabase/migrations/009_prospects.sql
git commit -m "Add prospect_batches and prospects tables"
```

---

### Task 2: Parse Function & API Route

**Files:**
- Create: `src/lib/prospects.ts`
- Create: `src/app/api/prospects/parse/route.ts`

**Step 1: Create `src/lib/prospects.ts`**

This file contains `parseProspectList()` which takes either text or base64 images and uses Claude to extract a structured list of names with any visible context.

For **text input**: Claude parses lines into `{name, company?, title?, context?}` objects. Handle various formats (one name per line, "Name - Company", "Name, Title at Company", comma-separated, etc.).

For **image input**: Claude Vision reads the image(s) and extracts the same structured data. Use the same image handling pattern as the business card scanner (`scanBusinessCard` in `src/lib/vision.ts`).

The prompt should be simple — no web search needed, just extraction:
```
Parse the following into a list of people. For each person, extract:
- name (required)
- company (if visible)
- title/role (if visible)
- any other context (location, affiliation, etc.)

Return JSON array: [{"name": "...", "company": "...", "title": "...", "context": "..."}]

Input:
{text or "see attached image(s)"}
```

For images, use the Anthropic SDK's vision capability (base64 image content blocks), same pattern as `scanBusinessCard` in `src/lib/vision.ts`.

**Step 2: Create `/api/prospects/parse` route**

Mirror the auth pattern from `src/app/api/scan/ocr/route.ts`:
- Auth check (user + staff/admin role)
- Accept `{ text?: string, images?: string[], mediaType?: string }` in body
- Validate: must have either text or images, not both empty
- Call `parseProspectList()`
- Return `{ success: true, parsed: [...] }`

No `maxDuration` needed — parsing is fast (no web search).

**Step 3: Verify `tsc --noEmit` passes**

**Step 4: Commit**

```bash
git add src/lib/prospects.ts src/app/api/prospects/parse/route.ts
git commit -m "Add prospect list parsing via Claude"
```

---

### Task 3: Batch Creation API Route

**Files:**
- Create: `src/app/api/prospects/batch/route.ts`

**Step 1: Create the route with GET and POST handlers**

**POST** — Create a new batch + prospect rows:
- Auth check (staff/admin)
- Accept `{ name: string, sourceType: "text" | "image", sourceContent?: string, sourceImages?: string[], prospects: Array<{name, company?, title?, context?}> }`
- Insert into `prospect_batches` with `prospect_count = prospects.length`
- Insert each prospect into `prospects` with `status: "parsed"`, `input_name`, and any parsed fields (`company`, `title` → also set `display_name` = name)
- Return `{ success: true, batchId: "...", count: N }`

**GET** — List batches:
- Auth check (staff/admin)
- Query `prospect_batches` ordered by `created_at desc`
- For each batch, include a status summary (count by status from `prospects` table)
- Return `{ batches: [...] }`

Use the admin client for all DB operations (same pattern as other API routes).

**Step 2: Verify `tsc --noEmit` passes**

**Step 3: Commit**

```bash
git add src/app/api/prospects/batch/route.ts
git commit -m "Add prospect batch creation and listing API"
```

---

### Task 4: Prospect Research Enrichment Function

**Files:**
- Modify: `src/lib/enrichment.ts` — add `ProspectEnrichment` interface, `buildProspectPrompt()`, `enrichProspect()`

**Step 1: Add `ProspectEnrichment` interface**

Add after the existing `ArtistEnrichment` interface. Shape matches the design doc:

```typescript
export interface ProspectEnrichment {
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

**Step 2: Add `buildProspectPrompt()`**

Takes: `prospect: { input_name, company?, title?, location?, context? }, batchName: string, galleryArtists: string[]`

The prompt is similar to collector enrichment but tuned for unknown people:

```
You are a research assistant for an art gallery called "${GALLERY_NAME}".
Your task is to research a potential prospect and compile a comprehensive profile.

## What We Know
- **Name:** ${input_name}
- **Company:** ${company || "Unknown"}
- **Title/Role:** ${title || "Unknown"}
- **Context:** ${context || "None"} (from: ${batchName})

## Gallery Context
${GALLERY_NAME} represents these artists: ${galleryArtists.join(", ")}

## Research Instructions
Search for publicly available information about this person. Your goals:

1. **Identify** — Confirm who this person is. If the name is common, use the context above to disambiguate. If you cannot confidently identify a single person, set confidence to "low" and explain in notes.
2. **Contact info** — Find email, phone, LinkedIn URL, Instagram handle, website, other social profiles.
3. **Photo** — Find a headshot or profile photo URL (LinkedIn, company page, press photo). Return the direct image URL.
4. **Professional profile** — Current role, career highlights, industry.
5. **Art world connections** — Museum/gallery board memberships, collection mentions, art fair attendance, advisory roles, artists they're known to collect.
6. **Philanthropy** — Foundations, notable giving.
7. **Collecting taste** — Style/subject/mood preferences based on what you find about their collection or art interests. Use ONLY from these canonical tags: [include tag lists]

**Source grounding:**
- ONLY write about things found in your web search results
- Use numbered inline citations [1], [2] corresponding to your sources array
- The highest citation [N] must not exceed your sources array length
- If information is limited, say so explicitly

**Privacy rules:**
- Only use publicly available information
- Do not speculate about private wealth or net worth
- If limited information is available, say so — do not fabricate
```

Output format section mirrors the `ProspectEnrichment` interface as JSON.

**Step 3: Add `enrichProspect()` function**

Pattern mirrors `enrichArtist()`:
- Accept `prospectId: string` (UUID)
- Fetch prospect row from `prospects` table
- Fetch batch name from `prospect_batches`
- Fetch gallery artists via `getGalleryArtists()`
- Build prompt, call Claude with `web_search` tool (max_uses: 15, max_tokens: 8192)
- Extract JSON from response, parse
- Strip orphaned citations (same `stripOrphanedCitations` pattern)
- Validate style/subject/mood tags against canonical vocabularies (same null-safe filter)
- Return `ProspectEnrichment`

**Step 4: Verify `tsc --noEmit` passes**

**Step 5: Commit**

```bash
git add src/lib/enrichment.ts
git commit -m "Add prospect enrichment via Claude web search"
```

---

### Task 5: Research API Route

**Files:**
- Create: `src/app/api/prospects/research/[id]/route.ts`

**Step 1: Create the route**

Mirror the pattern from `src/app/api/enrich/artist/route.ts`:
- `maxDuration = 120`
- Auth check (staff/admin)
- Accept prospect ID from URL params
- Set status to "researching" on the prospect row
- Call `enrichProspect(id)`
- Extract fields into dedicated columns on the `prospects` table:
  - `first_name`, `last_name`, `display_name` from enrichment (overwrite parsed values with researched values)
  - `email`, `phone`, `website`, `company`, `title`, `location`, `photo_url`
  - `linkedin`, `instagram`, `other_socials`
  - `research_summary` ← enrichment.summary
  - `confidence` ← enrichment.confidence
  - `style_preferences`, `subject_preferences`, `mood_preferences` (validated)
  - `known_artists`, `engagement_level`
  - `board_memberships`, `collection_mentions`, `art_events`, `advisory_roles`
  - `foundations`, `notable_giving`
  - `sources` ← enrichment.sources
- Store remaining blob in `research_brief` (strip extracted fields to avoid duplication — same pattern as artist enrichment)
- Set status to "done"
- On error: set status to "error" with message

**Step 2: Verify `tsc --noEmit` passes**

**Step 3: Commit**

```bash
git add src/app/api/prospects/research/[id]/route.ts
git commit -m "Add prospect research API route"
```

---

### Task 6: Test Enrichment End-to-End

**Files:** None (manual test via script)

**Step 1: Run migration if not already done**

**Step 2: Create a test batch and prospect manually**

```bash
npx tsx --env-file=.env.local -e "
const { createAdminClient } = require('./src/lib/supabase/admin');
async function run() {
  const admin = createAdminClient();
  const { data: batch } = await admin.from('prospect_batches').insert({
    name: 'Test Batch',
    source_type: 'text',
    source_content: 'Larry Gagosian',
    prospect_count: 1,
  }).select().single();
  console.log('Batch:', batch.id);
  const { data: prospect } = await admin.from('prospects').insert({
    batch_id: batch.id,
    input_name: 'Larry Gagosian',
    display_name: 'Larry Gagosian',
    status: 'parsed',
  }).select().single();
  console.log('Prospect:', prospect.id);
}
run();
"
```

**Step 3: Run enrichment on the test prospect**

```bash
npx tsx --env-file=.env.local -e "
const { enrichProspect } = require('./src/lib/enrichment');
const { createAdminClient } = require('./src/lib/supabase/admin');
async function run() {
  const admin = createAdminClient();
  const { data: prospect } = await admin.from('prospects').select('id').eq('input_name', 'Larry Gagosian').single();
  console.log('Enriching prospect:', prospect.id);
  const result = await enrichProspect(prospect.id);
  console.log('Confidence:', result.confidence);
  console.log('Email:', result.email);
  console.log('LinkedIn:', result.linkedin);
  console.log('Photo:', result.photo_url);
  console.log('Summary:', result.summary?.substring(0, 200));
  console.log('Sources:', result.sources?.length);
}
run();
"
```

Verify: confidence should be high, should find contact info, photo, extensive art world connections.

**Step 4: Commit (no code changes — just verification)**

---

### Task 7: Tools Layout — Add Prospects Tab

**Files:**
- Modify: `src/app/tools/layout.tsx` — add "Prospect Research" tab

**Step 1: Add the tab**

In `src/app/tools/layout.tsx`, add a second `<ToolsTab>` after the Card Scanner one:

```tsx
<ToolsTab href="/tools/scan">Card Scanner</ToolsTab>
<ToolsTab href="/tools/prospects">Prospect Research</ToolsTab>
```

**Step 2: Verify `tsc --noEmit` passes**

**Step 3: Commit**

```bash
git add src/app/tools/layout.tsx
git commit -m "Add Prospect Research tab to tools nav"
```

---

### Task 8: Prospects Dashboard Page (Batch List + New Research)

**Files:**
- Create: `src/app/tools/prospects/page.tsx` — server component
- Create: `src/app/tools/prospects/ProspectsDashboard.tsx` — client component

**Step 1: Create server page**

`page.tsx` — Fetch batches from `prospect_batches` with status summary counts from `prospects` (group by batch_id, status). Pass to `ProspectsDashboard`.

**Step 2: Create client dashboard**

`ProspectsDashboard.tsx` — Two main states:

**State A: Batch list (default)**
- Table: batch name, date, prospect count, status summary (e.g. "12 done, 2 errors, 1 pending")
- Each row links to `/tools/prospects/[batchId]`
- "New Research" button top right

**State B: New research flow (inline, triggered by button)**
- Batch name input
- Toggle buttons: "Text" / "Image"
- Text mode: large textarea with placeholder "Paste names, one per line. You can include company or context after the name."
- Image mode: drag-and-drop zone (reuse pattern from ScanDashboard's image upload)
- "Parse" button → calls `/api/prospects/parse` → shows loading spinner
- After parse: editable table of parsed names with columns: Name, Company/Title, Context, Actions (remove button)
- "Add Row" button at bottom of table
- "Start Research" button → calls `/api/prospects/batch` to create batch + rows, then redirects to `/tools/prospects/[batchId]`

**Step 3: Verify `tsc --noEmit` passes**

**Step 4: Commit**

```bash
git add src/app/tools/prospects/page.tsx src/app/tools/prospects/ProspectsDashboard.tsx
git commit -m "Add prospects dashboard with batch list and new research flow"
```

---

### Task 9: Batch Detail Page (Card Grid + Research Controls)

**Files:**
- Create: `src/app/tools/prospects/[batchId]/page.tsx` — server component
- Create: `src/app/tools/prospects/[batchId]/BatchDetail.tsx` — client component

**Step 1: Create server page**

`page.tsx` — Fetch batch info + all prospects for this batch. Pass to `BatchDetail`.

**Step 2: Create client component**

`BatchDetail.tsx` — Main sections:

**Header:**
- Batch name, date, count
- Back link to `/tools/prospects`
- "Start Research" / "Pause" / "Resume" button (same pattern as batch dashboard enrichment)
- "Retry Failed" button (if any errors)
- Status filter tabs: All / Done (count) / Errors (count) / Parsed (count)

**Progress bar (during research):**
- Sticky at top: "Researching 7 / 23..." with pause/resume
- Same pattern as batch dashboard

**Research loop:**
- `runResearch()` — iterates through prospects with status "parsed", calls `/api/prospects/research/[id]` for each with 2s delay
- Updates prospect status in local state optimistically
- Pause/resume via ref

**Card grid:**
- Each prospect is a card:
  - Photo (or gray silhouette placeholder SVG if no photo_url)
  - Name (bold), title @ company, location
  - Confidence badge (green/yellow/red pill)
  - 2-3 line summary (truncated)
  - Contact icons row: email (envelope), LinkedIn (LI), Instagram (IG), website (globe), phone (phone) — each greyed out if null, colored + clickable if found
  - Style/subject/mood tag pills (same color scheme as artist/contact pages: violet, sky, amber, rose)
  - Status badge for non-done states (researching spinner, error red, parsed gray, skipped strikethrough)
- Click card → expand inline detail panel below the card (or side panel) showing:
  - Full summary
  - Professional section (role, career highlights, industry)
  - Art world connections (board memberships, collection mentions, events, advisory roles, known artists)
  - Philanthropy (foundations, notable giving)
  - Sources (numbered list with clickable links)
  - Notes/caveats

**Step 3: Verify `tsc --noEmit` passes**

**Step 4: Commit**

```bash
git add src/app/tools/prospects/[batchId]/page.tsx src/app/tools/prospects/[batchId]/BatchDetail.tsx
git commit -m "Add batch detail page with prospect card grid and research controls"
```

---

### Task 10: Integration Test & Polish

**Step 1: Full end-to-end test**

- Navigate to `/tools/prospects`
- Create a new batch with 3-5 known names (mix of well-known collectors and lesser-known people)
- Verify parsing works for text input
- Start research, verify progress UI
- Review results — check photo URLs load, contact info is populated, tag pills display correctly
- Test retry on any failures
- Test image input with a photo of a list (if available)

**Step 2: Fix any issues found during testing**

**Step 3: Verify `tsc --noEmit` passes**

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "Polish prospect research tool"
git push
```

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/009_prospects.sql` | Create |
| `src/lib/prospects.ts` | Create |
| `src/lib/enrichment.ts` | Modify — add ProspectEnrichment, buildProspectPrompt(), enrichProspect() |
| `src/app/api/prospects/parse/route.ts` | Create |
| `src/app/api/prospects/batch/route.ts` | Create |
| `src/app/api/prospects/research/[id]/route.ts` | Create |
| `src/app/tools/layout.tsx` | Modify — add Prospects tab |
| `src/app/tools/prospects/page.tsx` | Create |
| `src/app/tools/prospects/ProspectsDashboard.tsx` | Create |
| `src/app/tools/prospects/[batchId]/page.tsx` | Create |
| `src/app/tools/prospects/[batchId]/BatchDetail.tsx` | Create |
