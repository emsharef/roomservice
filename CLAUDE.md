# Room Service

## Project Overview

A Next.js 15 app (React 19, Tailwind CSS 4, TypeScript) that syncs gallery data from the Arternal CRM API into Supabase, adds AI enrichment (Claude Vision, CLIP embeddings), and provides browse/search/admin interfaces.

**Dev server:** `npm run dev -- -p 3002` (runs on `http://localhost:3002`)

## Architecture

```
Arternal API  -->  Sync Service  -->  Supabase (PostgreSQL + pgvector)
                                          |
                                     Next.js App
                                    /     |      \
                              Browse   Search   Admin
                                          |
                                   AI Enrichment
                                  (Claude + CLIP)
```

**Data flow:** Arternal is the source of truth. We pull data via their REST API into Supabase mirror tables, then enrich with AI into separate `_extended` tables. The app never writes back to Arternal without explicit user action.

## Project Structure

```
src/
  components/
    Nav.tsx                    # Top nav bar with auth state
  lib/
    arternal.ts              # Arternal API client: types, fetch functions, pagination helper
    sync.ts                  # Sync service: full/incremental sync with detail fetching
    vision.ts                # Claude Vision artwork analysis
    embeddings.ts            # Voyage AI multimodal embedding service
    search.ts                # Semantic + text search logic
    supabase/
      client.ts              # Browser Supabase client
      server.ts              # Server Supabase client (cookie-based auth)
      admin.ts               # Admin Supabase client (service role key)
  app/
    layout.tsx               # Root layout with nav (Inventory, Artists, Contacts, Search, Admin)
    page.tsx                 # Home/inventory redirect
    login/page.tsx           # Auth login page
    inventory/
      page.tsx               # Inventory list (server component)
      InventoryList.tsx       # List component with search/filters
      [id]/page.tsx          # Artwork detail: images gallery, fields, AI analysis
    artists/
      page.tsx               # Artists list
      ArtistsList.tsx         # List component
      [id]/page.tsx          # Artist detail: bio, statistics, works
    contacts/
      page.tsx               # Contacts list
      ContactsList.tsx        # List component
      [id]/page.tsx          # Contact detail: info, tags, transactions, activities, notes
    search/page.tsx          # Semantic + text search UI
    admin/
      layout.tsx             # Admin layout with sub-nav
      page.tsx               # Admin dashboard
      sync/
        page.tsx             # Sync page (server: fetches counts + logs)
        SyncDashboard.tsx    # Sync UI: mode toggle, trigger buttons, SSE progress, log table
      batch/page.tsx         # Batch processing UI (vision analysis, embeddings)
      users/
        page.tsx             # User management page
        UserManagement.tsx   # Invite users, manage roles
    api/
      sync/route.ts          # Single entity sync API (SSE streaming)
      sync/all/route.ts      # Sync-all API (SSE streaming)
      analyze/route.ts       # Claude Vision analysis endpoint
      embed/route.ts         # CLIP embedding endpoint
      search/route.ts        # Search API
      admin/users/route.ts   # User CRUD
      admin/users/invite/route.ts  # User invitation
  middleware.ts              # Auth middleware (protects all routes except /login and /api/trigger)
scripts/
  run-detail-sync.ts         # Standalone detail sync runner (bypasses API auth)
```

## Database Schema (Supabase)

### Mirror Tables (synced from Arternal)

**artworks** — id (PK, from Arternal), catalog_number, title (nullable), year, medium, dimensions, edition, price, price_currency, work_status, status, type, height, width, depth, primary_image_url, url, artist_ids[], images (jsonb, from detail endpoint), arternal_created_at, arternal_updated_at, synced_at, detail_synced_at

**artists** — id (PK), first_name, last_name, alias, display_name, birth_year, death_year, bio, country, life_dates, work_count, catalog_count, saved, statistics (jsonb, from detail endpoint), arternal_created_at, arternal_updated_at, synced_at, detail_synced_at

**contacts** — id (PK), first_name, last_name, display_name, email, phone, phone_mobile, type, website, company, primary_street, primary_city, primary_state, primary_zip, primary_country, primary_address_formatted, tags (text[]), notes (text[]), recent_transactions (jsonb), recent_activities (jsonb), arternal_created_at, arternal_updated_at, synced_at, detail_synced_at

**artwork_artists** — artwork_id, artist_id, display_name (junction table)

### Extended Tables (AI enrichment, app-owned)

**artworks_extended** — artwork_id (FK), clip_embedding vector(1024), ai_description, style_tags[], color_palette, subject_tags[], mood_tags[], description_embedding vector(1024), comparable_sales, price_history, clip_generated_at, vision_analyzed_at, enrichment_status, enrichment_error

**artists_extended** — artist_id (FK), enrichment_brief, formatted_bio, market_context, related_artist_ids[], enrichment_status, enrichment_error, reviewed_by, reviewed_at, written_back_at

**contacts_extended** — contact_id (FK), taste_embedding vector(1024), collector_brief, inferred_preferences, enrichment_status, enrichment_error, reviewed_by, reviewed_at, written_back_at

### System Tables

**sync_log** — id, entity_type, direction, status (running/completed/error), records_processed, records_created, records_updated, error (stores count + first 10 error messages), started_at, completed_at, triggered_by

**user_profiles** — id, email, display_name, role (admin/staff/viewer), created_at, updated_at

## Sync Service (`src/lib/sync.ts`)

### Modes
- **Full sync:** Fetches all records sorted by `updated_at asc`. Resumable via offset on failure.
- **Incremental sync:** Fetches records sorted by `updated_at desc`, stops early when hitting records older than the last sync timestamp.

### Phases
Each sync runs through phases reported via SSE:
1. **fetching** — Paginating through Arternal list endpoint
2. **upserting** — Writing records to Supabase (upsert on `id`)
3. **detailing** — Fetching individual record details from Arternal detail endpoints
4. **done** — Complete

### Detail Sync
After the upsert phase, the sync fetches individual record details:
- **Contacts:** tags, notes, recent_transactions, recent_activities (from `GET /contacts/:id`)
- **Artworks:** images array with all image URLs (from `GET /inventory/:id`)
- **Artists:** statistics with inventory/sets counts (from `GET /artists/:id`)

Detail sync runs on:
- All items processed in the current upsert phase
- Any records where `detail_synced_at` is null (previous failures, auto-retry)

### Rate Limiting
Arternal API: 1,000 requests per 15 minutes.
- Detail fetching uses concurrency of 2 with 1-second delay between batches (~2 req/sec)
- Failed requests retry up to 6 times with exponential backoff (5s, 10s, 20s, 40s, 80s, 160s)
- Errors are logged in sync_log and failed records keep `detail_synced_at = null` for auto-retry on next sync

### Standalone Sync Script
For running syncs outside the API (bypasses auth):
```bash
npx tsx --env-file=.env.local scripts/run-detail-sync.ts
```

### API Routes
- `POST /api/sync` — Single entity sync. Body: `{ entity: "artworks"|"artists"|"contacts", mode: "full"|"incremental" }`
- `POST /api/sync/all` — Sync all entities sequentially. Body: `{ mode: "full"|"incremental" }`

Both return SSE streams with progress events and heartbeats.

## Arternal API Reference

**Base URL:** `https://api.arternal.com/api/v1`
**Auth:** `X-API-Key` header
**Docs:** `https://api.arternal.com/api/v1/docs/`

### Rate Limits
- Standard: 1,000 req / 15 min
- Write: 200 req / 15 min
- Search: 500 req / 15 min

### Key Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/inventory` | search, status, type, artist_id, sort, limit, offset |
| GET | `/inventory/{id}` | Adds: images[] |
| GET | `/artists` | search, saved, sort, limit, offset |
| GET | `/artists/{id}` | Adds: statistics |
| GET | `/artists/{id}/works` | type, status, limit, offset |
| GET | `/contacts` | search, type, tag, sort, limit, offset |
| GET | `/contacts/{id}` | Adds: tags[], notes[], recent_transactions[], recent_activities[] |

### List vs Detail Field Differences
- **Artworks list-only:** `primary_image_url`, `image_base_url`, `work_status`
- **Artists list-only:** `work_count`, `catalog_count`, `title`
- **Contacts list-only:** `extra`
- All list-only fields are already captured during the upsert phase

### Pagination
All list endpoints support `sort`, `order` (asc/desc), `limit`, `offset`. The API does NOT support `updated_since` filtering — incremental sync is implemented client-side by sorting by `updated_at desc` and stopping early.

Pagination response `total` field is a **string**, not number.

### Important Notes
- The `status` query param only accepts: `available`, `sold`, `hold`, `nfs`, `n/a` (no spaces)
- Arternal API returns 3,981 contacts via API but the website shows ~3,818 — the API includes archived/hidden contacts
- Sort param supports `updated_at` for incremental sync
- Supabase default row limit is 1000 — always use `.limit(10000)` when querying for missing detail records
- Some artworks have null titles — this is valid data, do not substitute with "Untitled"

## Environment Variables (`.env.local`)

```
ARTERNAL_API_KEY          # Arternal API key
ARTERNAL_API_BASE_URL     # https://api.arternal.com/api/v1
NEXT_PUBLIC_SUPABASE_URL  # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  # Public anon key
SUPABASE_SECRET_KEY       # Service role key (server-side only)
SUPABASE_DB_URL           # PostgreSQL connection string (for psql)
VOYAGE_API_KEY            # Voyage AI multimodal embeddings
ANTHROPIC_API_KEY         # Claude Vision & enrichment
```

## Key Decisions & Terminology

- **"Detailing"** = fetching individual record details from Arternal API. NOT "enrichment".
- **"Enrichment"** = AI-generated data (Claude Vision analysis, CLIP embeddings, etc.). Stored in `_extended` tables.
- Mirror tables use Arternal IDs as primary keys. Upsert on `id` ensures idempotency.
- `synced_at` = when the record was last upserted from bulk list endpoint
- `detail_synced_at` = when individual detail was last successfully fetched. Null = needs (re)fetch.
- SSE streaming used for long-running sync to prevent serverless timeout (maxDuration = 300s)
- Auth: Supabase Auth with email/password. Roles: admin, staff, viewer. RLS policies enforce access.
- Supabase PostgREST cannot do column-to-column comparisons in filters (e.g., `detail_synced_at.lt.synced_at` treats `synced_at` as a literal string)

## Push Notifications

For long-running operations, use the Moshi webhook:
```bash
curl -X POST https://api.getmoshi.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"token": "6vFtVgUWzKlv2T2Rf9xj7lDHdCJmuv27", "title": "Done", "message": "Brief summary"}'
```

## Current Data Counts
- Artworks: 2,236 (2,233 with detail, 2,226 with images)
- Artists: 244 (all with detail)
- Contacts: 3,981 (3,979 with detail; 105 with tags, 478 with transactions, 2,990 with activities)
