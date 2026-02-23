# Room Service

A gallery management toolkit that syncs data from [Arternal](https://arternal.com) CRM into Supabase, enriches it with AI (Claude Vision, CLIP embeddings), and provides browse, search, and admin interfaces.

Built with Next.js 15, React 19, Tailwind CSS 4, TypeScript, and Supabase (PostgreSQL + pgvector).

## Features

- **Inventory** -- Browse all artworks with sortable/filterable column headers (title, artist, medium, year, price, status)
- **Artists** -- Artist directory with filtering by name, country, and life dates
- **Contacts** -- CRM contacts with filtering by name, email, company, location, and type
- **Discover** -- Hybrid keyword + semantic search powered by CLIP embeddings. Search by text, image, or find similar artworks
- **Admin** -- Sync dashboard, batch AI processing (Claude Vision analysis, CLIP embeddings), user management
- **AI Enrichment** -- Claude Vision generates artwork descriptions, style/subject/mood tags, and color palettes. Voyage AI generates CLIP embeddings for visual similarity search

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with pgvector enabled
- API keys: Arternal, Anthropic (Claude), Voyage AI

### Setup

```bash
npm install
cp .env.local.example .env.local  # Fill in your keys
```

### Environment Variables

```
ARTERNAL_API_KEY
ARTERNAL_API_BASE_URL=https://api.arternal.com/api/v1
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_DB_URL
VOYAGE_API_KEY
ANTHROPIC_API_KEY
```

### Database

Run the SQL migrations in order against your Supabase database:

```bash
psql $SUPABASE_DB_URL -f supabase/migrations/001_initial_schema.sql
psql $SUPABASE_DB_URL -f supabase/migrations/002_enrichment_tables.sql
psql $SUPABASE_DB_URL -f supabase/migrations/003_auth.sql
psql $SUPABASE_DB_URL -f supabase/migrations/004_search_improvements.sql
psql $SUPABASE_DB_URL -f supabase/migrations/005_artists_contacts_search.sql
psql $SUPABASE_DB_URL -f supabase/migrations/006_search_pagination.sql
```

### Development

```bash
npm run dev
```

Runs on [http://localhost:3002](http://localhost:3002).

### Build

```bash
npm run build
npm start
```

## Architecture

```
Arternal API  -->  Sync Service  -->  Supabase (PostgreSQL + pgvector)
                                          |
                                     Next.js App
                                    /     |      \
                              Browse  Discover   Admin
                                          |
                                   AI Enrichment
                                  (Claude + CLIP)
```

Arternal is the source of truth. Data is pulled via their REST API into Supabase mirror tables, then enriched with AI into separate `_extended` tables. The app never writes back to Arternal without explicit user action.
