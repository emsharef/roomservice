# Contact Lists Filter — Design (ON HOLD)

**Status:** On hold — ID migration completed 2026-04-02, ready to resume
**Date:** 2026-03-27

## Context

Arternal released new Contact Lists API endpoints. We explored them and planned a filter feature for the contacts page, but discovered that Arternal has changed all entity IDs from numeric to string format. Our DB uses `bigint` IDs, so the sync is broken and we can't match list members to our contacts.

## Arternal Contact Lists API

Base: `https://api.arternal.com/api/v1`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contact-lists` | List all contact lists |
| POST | `/contact-lists` | Create a contact list |
| GET | `/contact-lists/{listId}` | Get single list |
| PUT | `/contact-lists/{listId}` | Update list name/description |
| DELETE | `/contact-lists/{listId}` | Soft delete list |
| GET | `/contact-lists/{listId}/contacts` | List contacts in a list |
| POST | `/contact-lists/{listId}/contacts` | Add contacts to list |
| DELETE | `/contact-lists/{listId}/contacts` | Remove contacts from list |

### GET /contact-lists
**Params:** `limit` (1-100, default 10), `offset`, `sort` (name|created_at|updated_at|contact_count), `order` (asc/desc), `search` (by list name)

**Response data item:**
- `id` (string) — 8-char alphanumeric
- `name` (string)
- `description` (string, nullable)
- `live` (boolean) — dynamic list flag
- `private` (boolean)
- `contact_count` (integer) — unreliable, can be negative
- `created_at` (datetime) — currently returns empty `{}`
- `updated_at` (datetime) — currently returns empty `{}`

Pagination: `total` is a **string** (same quirk as other endpoints).

### GET /contact-lists/{listId}/contacts
**Params:** `listId` (path), `limit` (1-100), `offset`

Returns slimmed-down contacts: `id`, `first_name`, `last_name`, `email`, `phone`, `company`, `type`

### POST/DELETE /contact-lists/{listId}/contacts
**Body:** `{ "contact_ids": ["id1", "id2", ...] }` (required, min 1 item)

### POST /contact-lists
**Body:** `{ "name": "..." (required, max 255), "description": "..." (optional, max 1000) }`

### PUT /contact-lists/{listId}
**Body:** `{ "name": "...", "description": "..." }` (both optional)

## Current Data (as of 2026-03-27)

- **69 contact lists** total
- 5 are `live: true` (dynamic) — **API returns INTERNAL_ERROR when fetching their members**
- Several "selection cart" lists are system-generated junk
- Biggest lists: Institutions (595), Yeni Mao Frieze Preview (500), VIP Preview (455)
- `contact_count` is unreliable: two lists show negative counts (-3, -217), one with -217 actually has 79 members

## Planned Design (pre-hold)

### API Routes
1. **`GET /api/contact-lists`** — Proxy to Arternal, filter out `live:true` and "selection cart" lists, sort by name
2. **`GET /api/contact-lists/[listId]/contacts`** — Fetch all member contact IDs (paginate internally)

These routes double as future MCP tools for the chat system.

### Contacts Page Changes
- Dropdown above the table to select a contact list
- `filter_list=<listId>` URL param
- Server component fetches member IDs, passes to `search_contacts` RPC

### Database
- New `filter_contact_ids` param on `search_contacts` RPC
- `WHERE id = ANY(filter_contact_ids)` when non-null

## Blocker: ID Format Migration

Arternal changed all entity IDs from numeric (bigint) to 8-char alphanumeric strings. **Migration completed 2026-04-02** — all ID columns migrated from `bigint` to `text`, all TypeScript types updated, all RPC functions recreated. This blocker is resolved.
