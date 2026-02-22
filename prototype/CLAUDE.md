# Arternal Gallery Browser

## Project Overview

A Next.js 16 app (React 19, Tailwind CSS 4, TypeScript) that browses gallery data from the Arternal API. Runs on `http://localhost:3002`.

**Start dev server:** `npm run dev -- -p 3002`

## Project Structure

```
src/
  lib/arternal.ts          # API client: types, fetch functions
  app/
    layout.tsx             # Root layout with nav header (Inventory, Artists, Contacts)
    page.tsx               # Inventory list (server component)
    InventoryTable.tsx     # Inventory table (client component)
    inventory/[id]/
      page.tsx             # Inventory detail view
      ImageGallery.tsx     # Image gallery component
    artists/
      page.tsx             # Artists list (server component)
      ArtistsTable.tsx     # Artists table (client component)
      [id]/page.tsx        # Artist detail + works table
    contacts/
      page.tsx             # Contacts list (server component)
      ContactsTable.tsx    # Contacts table (client component)
      [id]/page.tsx        # Contact detail view
    api/arternal/inventory/
      route.ts             # API proxy route
```

## App Capabilities

### Inventory
- Paginated list with search, status filter (available/sold/hold)
- Clickable rows navigate to detail view
- Detail view shows ALL fields (em-dash for empty): ID, catalog #, year, medium, dimensions (text + cm), edition, price, currency, status, type, height/width/depth, created/updated dates
- Image gallery with primary + alternate views
- Artist names link to artist detail pages

### Artists
- Paginated list with search
- Responsive table: mobile shows name with country/works inline; wider screens add columns
- Detail view shows ALL fields: ID, first/last name, display name, alias, birth/death year, life dates, country, saved, created/updated
- Biography section with preserved line breaks
- Statistics section: inventory counts and sets counts by type
- Works table below with links to inventory detail

### Contacts
- Paginated list with search
- Responsive table: mobile shows name with email inline; wider screens add columns
- Clickable rows navigate to detail view
- Detail view shows ALL fields in sections:
  - Contact info: ID, first/last name, display name, email (mailto), phone, mobile, type, website (link), company
  - Primary address: street, city, state, ZIP, country, formatted address
  - Tags (as chips)
  - Notes
  - Recent transactions (table: title, status, total, date)
  - Recent activity (list: type badge, text, date)

### Responsive Design
- All tables collapse columns progressively on smaller screens
- Mobile: single primary column with secondary info tucked beneath
- sm (640px+): key secondary columns appear
- md (768px+): more columns
- lg (1024px+): full column set

## Arternal API Reference

**Base URL:** `https://api.arternal.com/api/v1`
**Auth:** `X-API-Key` header (stored in `.env.local` as `ARTERNAL_API_KEY`)
**Docs:** `https://api.arternal.com/api/v1/docs/` (Swagger UI)

### Rate Limits
- Standard: 1,000 req / 15 min
- Write: 200 req / 15 min
- Search: 500 req / 15 min

### Endpoints

#### Inventory
| Method | Path | Params |
|--------|------|--------|
| GET | `/inventory` | search, status (`available`/`sold`/`hold`/`nfs`/`n/a`), type (`inventory`/`edition`/`master edition`/`installation`/`doc`), artist_id, min_price, max_price, sort, limit, offset |
| GET | `/inventory/{id}` | - |
| POST | `/inventory` | body: title (required), year, medium, dimensions, edition, inventory_id, price, price_currency, status, type, artist_ids |
| PUT | `/inventory/{id}` | same body fields as POST |
| DELETE | `/inventory/{id}` | - |
| POST | `/inventory/{id}/images` | image upload |

**List item fields:** id, catalog_number, title, year, medium, dimensions, edition, price, price_currency, work_status, status, type, height, width, depth, primary_image_url, url, created_at, updated_at, artists[], image_base_url

**Detail adds:** images[] (id, url, title, type, is_primary)

**Status param note:** The `status` query param does NOT accept values with spaces (like `on consignment`). Valid filter values: `available`, `sold`, `hold`, `nfs`, `n/a`. The `status` field on items can contain other values like `on consignment` that just can't be filtered on.

**Price currencies:** USD, EUR, GBP, JPY, AUD, CAD

#### Artists
| Method | Path | Params |
|--------|------|--------|
| GET | `/artists` | search, saved, sort, limit, offset |
| GET | `/artists/{id}` | - |
| GET | `/artists/{id}/works` | type, status, limit, offset |
| POST | `/artists` | body fields |
| PUT | `/artists/{id}` | body fields |
| DELETE | `/artists/{id}` | - |

**List item fields:** id, first_name, last_name, alias, display_name, birth_year, death_year, bio, country, work_count, catalog_count, life_dates, saved, created_at, updated_at

**Detail fields:** id, first_name, last_name, alias, display_name, birth_year, death_year, bio, country, life_dates, saved, statistics { inventory: { type: count }, sets: { type: count } }, created_at, updated_at

**Works fields:** id, catalog_number, title, year, medium, dimensions, edition, price, price_currency, status, type, primary_image_url, created_at

#### Contacts
| Method | Path | Params |
|--------|------|--------|
| GET | `/contacts` | search, type, tag, sort, limit, offset |
| GET | `/contacts/{id}` | - |
| POST | `/contacts` | body fields |
| PUT | `/contacts/{id}` | body fields |
| DELETE | `/contacts/{id}` | - |

**List item fields:** id, first_name, last_name, email, website, company, primary_street, primary_state, primary_city, primary_zip, primary_country, phone, phone_mobile, type, extra, display_name, primary_address { street, city, state, zip, country, formatted }

**Detail adds:** tags[], notes[], recent_transactions[] (id, title, status, total_price, created_at), recent_activities[] (type, text, created_at)

### Pagination
All list endpoints return:
```json
{
  "pagination": {
    "total": "244",       // string, not number
    "count": 20,
    "per_page": 20,
    "current_page": 1,
    "total_pages": 13,
    "has_more": true
  }
}
```

**Note:** `total` is returned as a string, not a number. Use `parseInt()` when displaying.

## Environment

- `.env.local` contains `ARTERNAL_API_KEY` and `ARTERNAL_API_BASE_URL` — gitignored
- Next.js images configured to allow `www.inventory.gallery` domain
