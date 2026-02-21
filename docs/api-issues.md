# Arternal API Issues

Documented 2026-02-20. API base: `https://api.arternal.com/api/v1`

## Contacts Endpoints - All Broken

### `GET /contacts` - 500 Internal Server Error

The list endpoint fails with a database column error:

```
column "phone_work" does not exist
```

Full query attempted by the server:
```sql
SELECT "id", "first_name", "last_name", "email", "website", "company",
       "primary_street", "primary_state", "primary_city", "primary_zip",
       "primary_country", "phone_home" AS "phone", "phone_mobile", "phone_work",
       "type", "tags", "created_at", "updated_at", "extra"
FROM "contact"
WHERE "organization_id" = $1 AND "deleted" = $2
ORDER BY "created_at" DESC LIMIT $3
```

**Root cause:** The API code references a `phone_work` column that doesn't exist in the `contact` table.

**Impact:** All contacts endpoints (`GET /contacts`, `GET /contacts/:id`, etc.) are likely affected since they presumably query the same table.

---

## Artists Endpoints - Partial Functionality

### `GET /artists` (list) - WORKS

Returns paginated list of artists. Supports `limit`, `offset`, and `search` parameters.

Example response fields: `id`, `first_name`, `last_name`, `alias`, `title`, `birth_year`, `death_year`, `bio`, `country`, `work_count`, `catalog_count`, `saved`, `created_at`, `updated_at`, `display_name`, `life_dates`.

### `GET /artists/:id` (detail) - 500 Internal Server Error

```
column artist.website does not exist
```

Full query attempted:
```sql
SELECT "artist"."id", "artist"."first_name", "artist"."last_name",
       "artist"."alias", "artist"."birth_year", "artist"."death_year",
       "artist"."bio", "artist"."country", "artist"."website",
       "artist"."saved", "artist"."created_at", "artist"."updated_at"
FROM "artist"
INNER JOIN "permission" ON "artist"."id" = "permission"."artist_id"
INNER JOIN "group_x_user" ON "group_x_user"."group_id" = "permission"."group_id"
WHERE "artist"."id" = $1 AND "group_x_user"."user_id" = $2 AND "artist"."deleted" = $3
LIMIT $4
```

**Root cause:** The detail endpoint query references `artist.website` which doesn't exist in the `artist` table. The list endpoint doesn't select this column, which is why it works.

### `GET /artists/:id/works` - 500 Internal Server Error

```
column reference "id" is ambiguous
```

Full query attempted:
```sql
SELECT "id" FROM "artist"
INNER JOIN "permission" ON "artist"."id" = "permission"."artist_id"
INNER JOIN "group_x_user" ON "group_x_user"."group_id" = "permission"."group_id"
WHERE "artist"."id" = $1 AND "group_x_user"."user_id" = $2 AND "artist"."deleted" = $3
LIMIT $4
```

**Root cause:** The query selects unqualified `"id"` which is ambiguous across the joined tables (`artist`, `permission`, `group_x_user`). Should be `"artist"."id"`.

---

## Workarounds

- **Artist detail:** Use data from the `GET /artists` list endpoint (contains most fields except `website`).
- **Artist works:** Use `GET /inventory?artist_id=:id&type=inventory` to fetch an artist's works via the inventory endpoint.
- **Contacts:** No workaround available. Endpoint needs a server-side fix.

## Contact

Support: support@arternal.com
