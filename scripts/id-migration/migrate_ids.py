#!/usr/bin/env python3
"""
Migrate entity IDs from bigint to text (Arternal string IDs).

This script:
1. Snapshots row counts for verification
2. Deletes unmatched records (empty contacts, deleted artworks)
3. Loads mapping into temp tables
4. Drops FK constraints
5. Alters all ID columns from bigint to text
6. Applies ID mappings via UPDATE ... FROM temp table
7. Updates array columns (artist_ids, related_artist_ids)
8. Re-adds FK constraints
9. Recreates all RPC functions with text types
10. Verifies row counts and FK integrity

Everything runs in a single transaction — any failure rolls back completely.
"""

import csv
import os
import sys
import psycopg2

DB_URL = "postgresql://postgres.agjcvtmfrqklaitvxnzb:OVERLOOK5sheriff%21maybe1nephew@aws-0-us-west-2.pooler.supabase.com:6543/postgres"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_mapping(filename):
    """Load a mapping CSV into list of (old_id, new_id) tuples."""
    path = os.path.join(SCRIPT_DIR, filename)
    rows = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            rows.append((row["old_id"], row["new_id"]))
    return rows


def main():
    artist_map = load_mapping("mapping_artists.csv")
    artwork_map = load_mapping("mapping_artworks.csv")
    contact_map = load_mapping("mapping_contacts.csv")

    print(f"Loaded mappings: {len(artist_map)} artists, {len(artwork_map)} artworks, {len(contact_map)} contacts")

    # Unmatched records to delete
    unmatched_contacts = ["1786024", "1796459", "1798055", "1832941", "2254800", "2338807"]
    unmatched_artworks = ["2683647", "2683649"]

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # =====================================================================
        # STEP 1: Snapshot row counts
        # =====================================================================
        print("\n=== STEP 1: Snapshot row counts ===")
        counts_before = {}
        for table in ["artists", "artworks", "contacts", "artwork_artists",
                       "artists_extended", "artworks_extended", "contacts_extended",
                       "staged_contacts"]:
            cur.execute(f"SELECT count(*) FROM {table}")
            counts_before[table] = cur.fetchone()[0]
            print(f"  {table}: {counts_before[table]}")

        # =====================================================================
        # STEP 2: Delete unmatched records
        # =====================================================================
        print("\n=== STEP 2: Delete unmatched records ===")

        # Contacts: delete from extended first (FK), then main
        cur.execute("DELETE FROM contacts_extended WHERE contact_id = ANY(%s::bigint[])",
                    (unmatched_contacts,))
        print(f"  Deleted {cur.rowcount} contacts_extended rows")

        cur.execute("DELETE FROM contacts WHERE id = ANY(%s::bigint[])",
                    (unmatched_contacts,))
        print(f"  Deleted {cur.rowcount} contacts rows")

        # Artworks: delete from extended, artwork_artists, then main
        cur.execute("DELETE FROM artworks_extended WHERE artwork_id = ANY(%s::bigint[])",
                    (unmatched_artworks,))
        print(f"  Deleted {cur.rowcount} artworks_extended rows")

        cur.execute("DELETE FROM artwork_artists WHERE artwork_id = ANY(%s::bigint[])",
                    (unmatched_artworks,))
        print(f"  Deleted {cur.rowcount} artwork_artists rows")

        cur.execute("DELETE FROM artworks WHERE id = ANY(%s::bigint[])",
                    (unmatched_artworks,))
        print(f"  Deleted {cur.rowcount} artworks rows")

        # =====================================================================
        # STEP 3: Create temp mapping tables and load data
        # =====================================================================
        print("\n=== STEP 3: Load mappings into temp tables ===")

        cur.execute("""
            CREATE TEMP TABLE _map_artists (old_id text NOT NULL, new_id text NOT NULL);
            CREATE TEMP TABLE _map_artworks (old_id text NOT NULL, new_id text NOT NULL);
            CREATE TEMP TABLE _map_contacts (old_id text NOT NULL, new_id text NOT NULL);
        """)

        for old_id, new_id in artist_map:
            cur.execute("INSERT INTO _map_artists VALUES (%s, %s)", (old_id, new_id))
        print(f"  Loaded {len(artist_map)} artist mappings")

        for old_id, new_id in artwork_map:
            cur.execute("INSERT INTO _map_artworks VALUES (%s, %s)", (old_id, new_id))
        print(f"  Loaded {len(artwork_map)} artwork mappings")

        for old_id, new_id in contact_map:
            cur.execute("INSERT INTO _map_contacts VALUES (%s, %s)", (old_id, new_id))
        print(f"  Loaded {len(contact_map)} contact mappings")

        # Verify no duplicate new_ids
        for tbl in ["_map_artists", "_map_artworks", "_map_contacts"]:
            cur.execute(f"SELECT new_id, count(*) FROM {tbl} GROUP BY new_id HAVING count(*) > 1")
            dupes = cur.fetchall()
            if dupes:
                raise RuntimeError(f"DUPLICATE new_ids in {tbl}: {dupes}")
        print("  No duplicate new_ids in any mapping table")

        # Verify all existing IDs have mappings (after deleting unmatched)
        cur.execute("SELECT count(*) FROM artists WHERE id::text NOT IN (SELECT old_id FROM _map_artists)")
        unmapped = cur.fetchone()[0]
        if unmapped > 0:
            cur.execute("SELECT id FROM artists WHERE id::text NOT IN (SELECT old_id FROM _map_artists) LIMIT 5")
            raise RuntimeError(f"UNMAPPED artists: {unmapped} rows, e.g. {cur.fetchall()}")

        cur.execute("SELECT count(*) FROM artworks WHERE id::text NOT IN (SELECT old_id FROM _map_artworks)")
        unmapped = cur.fetchone()[0]
        if unmapped > 0:
            cur.execute("SELECT id FROM artworks WHERE id::text NOT IN (SELECT old_id FROM _map_artworks) LIMIT 5")
            raise RuntimeError(f"UNMAPPED artworks: {unmapped} rows, e.g. {cur.fetchall()}")

        cur.execute("SELECT count(*) FROM contacts WHERE id::text NOT IN (SELECT old_id FROM _map_contacts)")
        unmapped = cur.fetchone()[0]
        if unmapped > 0:
            cur.execute("SELECT id FROM contacts WHERE id::text NOT IN (SELECT old_id FROM _map_contacts) LIMIT 5")
            raise RuntimeError(f"UNMAPPED contacts: {unmapped} rows, e.g. {cur.fetchall()}")

        print("  All remaining records have mappings")

        # =====================================================================
        # STEP 4: Drop FK constraints
        # =====================================================================
        print("\n=== STEP 4: Drop FK constraints ===")
        fk_constraints = [
            ("artists_extended", "artists_extended_artist_id_fkey"),
            ("artwork_artists", "artwork_artists_artwork_id_fkey"),
            ("artwork_artists", "artwork_artists_artist_id_fkey"),
            ("artworks_extended", "artworks_extended_artwork_id_fkey"),
            ("contacts_extended", "contacts_extended_contact_id_fkey"),
        ]
        for table, constraint in fk_constraints:
            cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT {constraint}")
            print(f"  Dropped {constraint}")

        # =====================================================================
        # STEP 5: Alter column types to text
        # =====================================================================
        print("\n=== STEP 5: Alter column types to text ===")
        alter_columns = [
            # Main PKs
            ("artists", "id", "text"),
            ("artworks", "id", "text"),
            ("contacts", "id", "text"),
            # FK columns
            ("artwork_artists", "artwork_id", "text"),
            ("artwork_artists", "artist_id", "text"),
            ("artworks_extended", "artwork_id", "text"),
            ("artists_extended", "artist_id", "text"),
            ("contacts_extended", "contact_id", "text"),
            # Array columns
            ("artworks", "artist_ids", "text[]"),
            ("artists_extended", "related_artist_ids", "text[]"),
            # staged_contacts
            ("staged_contacts", "arternal_contact_id", "text"),
        ]
        for table, column, new_type in alter_columns:
            using_clause = f"USING {column}::text" if new_type == "text" else f"USING {column}::text[]"
            cur.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {new_type} {using_clause}")
            print(f"  {table}.{column} -> {new_type}")

        # =====================================================================
        # STEP 6: Apply ID mappings
        # =====================================================================
        print("\n=== STEP 6: Apply ID mappings ===")

        # --- Artists ---
        cur.execute("""
            UPDATE artists SET id = m.new_id
            FROM _map_artists m WHERE artists.id = m.old_id
        """)
        print(f"  artists.id: {cur.rowcount} rows updated")

        cur.execute("""
            UPDATE artists_extended SET artist_id = m.new_id
            FROM _map_artists m WHERE artists_extended.artist_id = m.old_id
        """)
        print(f"  artists_extended.artist_id: {cur.rowcount} rows updated")

        cur.execute("""
            UPDATE artwork_artists SET artist_id = m.new_id
            FROM _map_artists m WHERE artwork_artists.artist_id = m.old_id
        """)
        print(f"  artwork_artists.artist_id: {cur.rowcount} rows updated")

        # --- Artworks ---
        cur.execute("""
            UPDATE artworks SET id = m.new_id
            FROM _map_artworks m WHERE artworks.id = m.old_id
        """)
        print(f"  artworks.id: {cur.rowcount} rows updated")

        cur.execute("""
            UPDATE artworks_extended SET artwork_id = m.new_id
            FROM _map_artworks m WHERE artworks_extended.artwork_id = m.old_id
        """)
        print(f"  artworks_extended.artwork_id: {cur.rowcount} rows updated")

        cur.execute("""
            UPDATE artwork_artists SET artwork_id = m.new_id
            FROM _map_artworks m WHERE artwork_artists.artwork_id = m.old_id
        """)
        print(f"  artwork_artists.artwork_id: {cur.rowcount} rows updated")

        # --- Contacts ---
        cur.execute("""
            UPDATE contacts SET id = m.new_id
            FROM _map_contacts m WHERE contacts.id = m.old_id
        """)
        print(f"  contacts.id: {cur.rowcount} rows updated")

        cur.execute("""
            UPDATE contacts_extended SET contact_id = m.new_id
            FROM _map_contacts m WHERE contacts_extended.contact_id = m.old_id
        """)
        print(f"  contacts_extended.contact_id: {cur.rowcount} rows updated")

        # --- staged_contacts ---
        cur.execute("""
            UPDATE staged_contacts SET arternal_contact_id = m.new_id
            FROM _map_contacts m WHERE staged_contacts.arternal_contact_id = m.old_id
        """)
        print(f"  staged_contacts.arternal_contact_id: {cur.rowcount} rows updated")

        # --- Array columns ---
        # artworks.artist_ids: replace each element
        cur.execute("""
            UPDATE artworks SET artist_ids = (
                SELECT array_agg(COALESCE(m.new_id, elem))
                FROM unnest(artworks.artist_ids) AS elem
                LEFT JOIN _map_artists m ON m.old_id = elem
            )
            WHERE array_length(artist_ids, 1) > 0
        """)
        print(f"  artworks.artist_ids: {cur.rowcount} rows updated")

        # artists_extended.related_artist_ids: replace each element
        cur.execute("""
            UPDATE artists_extended SET related_artist_ids = (
                SELECT array_agg(COALESCE(m.new_id, elem))
                FROM unnest(artists_extended.related_artist_ids) AS elem
                LEFT JOIN _map_artists m ON m.old_id = elem
            )
            WHERE array_length(related_artist_ids, 1) > 0
        """)
        print(f"  artists_extended.related_artist_ids: {cur.rowcount} rows updated")

        # =====================================================================
        # STEP 7: Re-add FK constraints
        # =====================================================================
        print("\n=== STEP 7: Re-add FK constraints ===")
        fk_defs = [
            ("artists_extended", "artists_extended_artist_id_fkey",
             "FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE"),
            ("artwork_artists", "artwork_artists_artwork_id_fkey",
             "FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE"),
            ("artwork_artists", "artwork_artists_artist_id_fkey",
             "FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE"),
            ("artworks_extended", "artworks_extended_artwork_id_fkey",
             "FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE"),
            ("contacts_extended", "contacts_extended_contact_id_fkey",
             "FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE"),
        ]
        for table, name, fk_def in fk_defs:
            cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} {fk_def}")
            print(f"  Added {name}")

        # =====================================================================
        # STEP 8: Recreate RPC functions with text types
        # =====================================================================
        print("\n=== STEP 8: Recreate RPC functions ===")

        # Drop existing overloaded functions first
        cur.execute("DROP FUNCTION IF EXISTS search_artworks(vector, text, int, text, numeric, numeric, text, bigint)")
        cur.execute("DROP FUNCTION IF EXISTS search_artworks(vector, text, int, int, text, numeric, numeric, text, bigint)")
        cur.execute("DROP FUNCTION IF EXISTS keyword_search_artworks(text, int, text, numeric, numeric, text, bigint)")
        cur.execute("DROP FUNCTION IF EXISTS keyword_search_artworks(text, int, int, text, numeric, numeric, text, bigint)")
        cur.execute("DROP FUNCTION IF EXISTS search_inventory(text, text, text, text, text, text, text, text, int, int)")
        cur.execute("DROP FUNCTION IF EXISTS search_artists(text, text, text, text, text, int, int)")
        cur.execute("DROP FUNCTION IF EXISTS search_contacts(text, text, text, text, text, text, text, int, int)")
        print("  Dropped old function signatures")

        # search_inventory
        cur.execute("""
            CREATE OR REPLACE FUNCTION search_inventory(
                filter_title text DEFAULT null,
                filter_artist text DEFAULT null,
                filter_catalog text DEFAULT null,
                filter_medium text DEFAULT null,
                filter_year text DEFAULT null,
                filter_status text DEFAULT null,
                sort_column text DEFAULT 'arternal_updated_at',
                sort_direction text DEFAULT 'desc',
                page_size int DEFAULT 20,
                page_offset int DEFAULT 0
            )
            RETURNS TABLE (
                id text,
                title text,
                catalog_number text,
                year text,
                medium text,
                price numeric,
                price_currency text,
                status text,
                primary_image_url text,
                artist_names text,
                total_count bigint
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    a.id,
                    a.title,
                    a.catalog_number,
                    a.year,
                    a.medium,
                    a.price,
                    a.price_currency,
                    a.status,
                    a.primary_image_url,
                    (SELECT string_agg(aa.display_name, ', ') FROM artwork_artists aa WHERE aa.artwork_id = a.id) as artist_names,
                    COUNT(*) OVER() as total_count
                FROM artworks a
                WHERE
                    (filter_title IS NULL OR a.title ILIKE '%' || filter_title || '%')
                    AND (filter_catalog IS NULL OR a.catalog_number ILIKE '%' || filter_catalog || '%')
                    AND (filter_medium IS NULL OR a.medium ILIKE '%' || filter_medium || '%')
                    AND (filter_year IS NULL OR a.year ILIKE '%' || filter_year || '%')
                    AND (filter_status IS NULL OR a.status = filter_status)
                    AND (filter_artist IS NULL OR EXISTS (
                        SELECT 1 FROM artwork_artists aa
                        WHERE aa.artwork_id = a.id
                        AND aa.display_name ILIKE '%' || filter_artist || '%'
                    ))
                ORDER BY
                    CASE WHEN sort_column = 'title' AND sort_direction = 'asc' THEN a.title END asc nulls last,
                    CASE WHEN sort_column = 'title' AND sort_direction = 'desc' THEN a.title END desc nulls last,
                    CASE WHEN sort_column = 'artist' AND sort_direction = 'asc' THEN (SELECT string_agg(aa.display_name, ', ') FROM artwork_artists aa WHERE aa.artwork_id = a.id) END asc nulls last,
                    CASE WHEN sort_column = 'artist' AND sort_direction = 'desc' THEN (SELECT string_agg(aa.display_name, ', ') FROM artwork_artists aa WHERE aa.artwork_id = a.id) END desc nulls last,
                    CASE WHEN sort_column = 'medium' AND sort_direction = 'asc' THEN a.medium END asc nulls last,
                    CASE WHEN sort_column = 'medium' AND sort_direction = 'desc' THEN a.medium END desc nulls last,
                    CASE WHEN sort_column = 'year' AND sort_direction = 'asc' THEN a.year END asc nulls last,
                    CASE WHEN sort_column = 'year' AND sort_direction = 'desc' THEN a.year END desc nulls last,
                    CASE WHEN sort_column = 'price' AND sort_direction = 'asc' THEN a.price END asc nulls last,
                    CASE WHEN sort_column = 'price' AND sort_direction = 'desc' THEN a.price END desc nulls last,
                    CASE WHEN sort_column = 'status' AND sort_direction = 'asc' THEN a.status END asc nulls last,
                    CASE WHEN sort_column = 'status' AND sort_direction = 'desc' THEN a.status END desc nulls last,
                    CASE WHEN sort_column = 'arternal_updated_at' AND sort_direction = 'asc' THEN a.arternal_updated_at END asc nulls last,
                    CASE WHEN sort_column = 'arternal_updated_at' AND sort_direction = 'desc' THEN a.arternal_updated_at END desc nulls last
                LIMIT page_size
                OFFSET page_offset;
            END;
            $$
        """)
        print("  Created search_inventory")

        # search_artists
        cur.execute("""
            CREATE OR REPLACE FUNCTION search_artists(
                filter_name text DEFAULT null,
                filter_country text DEFAULT null,
                filter_life_dates text DEFAULT null,
                sort_column text DEFAULT 'display_name',
                sort_direction text DEFAULT 'asc',
                page_size int DEFAULT 20,
                page_offset int DEFAULT 0
            )
            RETURNS TABLE (
                id text,
                display_name text,
                first_name text,
                last_name text,
                country text,
                work_count int,
                bio text,
                life_dates text,
                total_count bigint
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    a.id,
                    a.display_name,
                    a.first_name,
                    a.last_name,
                    a.country,
                    a.work_count,
                    a.bio,
                    a.life_dates,
                    COUNT(*) OVER() as total_count
                FROM artists a
                WHERE
                    (filter_name IS NULL OR (
                        a.display_name ILIKE '%' || filter_name || '%'
                        OR a.first_name ILIKE '%' || filter_name || '%'
                        OR a.last_name ILIKE '%' || filter_name || '%'
                    ))
                    AND (filter_country IS NULL OR a.country ILIKE '%' || filter_country || '%')
                    AND (filter_life_dates IS NULL OR a.life_dates ILIKE '%' || filter_life_dates || '%')
                ORDER BY
                    CASE WHEN sort_column = 'name' AND sort_direction = 'asc' THEN a.display_name END asc nulls last,
                    CASE WHEN sort_column = 'name' AND sort_direction = 'desc' THEN a.display_name END desc nulls last,
                    CASE WHEN sort_column = 'country' AND sort_direction = 'asc' THEN a.country END asc nulls last,
                    CASE WHEN sort_column = 'country' AND sort_direction = 'desc' THEN a.country END desc nulls last,
                    CASE WHEN sort_column = 'works' AND sort_direction = 'asc' THEN a.work_count END asc nulls last,
                    CASE WHEN sort_column = 'works' AND sort_direction = 'desc' THEN a.work_count END desc nulls last,
                    CASE WHEN sort_column = 'life_dates' AND sort_direction = 'asc' THEN a.life_dates END asc nulls last,
                    CASE WHEN sort_column = 'life_dates' AND sort_direction = 'desc' THEN a.life_dates END desc nulls last,
                    CASE WHEN sort_column = 'display_name' AND sort_direction = 'asc' THEN a.display_name END asc nulls last,
                    CASE WHEN sort_column = 'display_name' AND sort_direction = 'desc' THEN a.display_name END desc nulls last
                LIMIT page_size
                OFFSET page_offset;
            END;
            $$
        """)
        print("  Created search_artists")

        # search_contacts
        cur.execute("""
            CREATE OR REPLACE FUNCTION search_contacts(
                filter_name text DEFAULT null,
                filter_email text DEFAULT null,
                filter_company text DEFAULT null,
                filter_location text DEFAULT null,
                filter_type text DEFAULT null,
                sort_column text DEFAULT 'display_name',
                sort_direction text DEFAULT 'asc',
                page_size int DEFAULT 20,
                page_offset int DEFAULT 0
            )
            RETURNS TABLE (
                id text,
                display_name text,
                first_name text,
                last_name text,
                email text,
                company text,
                phone text,
                phone_mobile text,
                type text,
                primary_city text,
                primary_state text,
                primary_country text,
                total_count bigint
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    c.id,
                    c.display_name,
                    c.first_name,
                    c.last_name,
                    c.email,
                    c.company,
                    c.phone,
                    c.phone_mobile,
                    c.type,
                    c.primary_city,
                    c.primary_state,
                    c.primary_country,
                    COUNT(*) OVER() as total_count
                FROM contacts c
                WHERE
                    (filter_name IS NULL OR (
                        c.display_name ILIKE '%' || filter_name || '%'
                        OR c.first_name ILIKE '%' || filter_name || '%'
                        OR c.last_name ILIKE '%' || filter_name || '%'
                    ))
                    AND (filter_email IS NULL OR c.email ILIKE '%' || filter_email || '%')
                    AND (filter_company IS NULL OR c.company ILIKE '%' || filter_company || '%')
                    AND (filter_location IS NULL OR (
                        c.primary_city ILIKE '%' || filter_location || '%'
                        OR c.primary_state ILIKE '%' || filter_location || '%'
                        OR c.primary_country ILIKE '%' || filter_location || '%'
                    ))
                    AND (filter_type IS NULL OR c.type ILIKE '%' || filter_type || '%')
                ORDER BY
                    CASE WHEN sort_column = 'name' AND sort_direction = 'asc' THEN c.display_name END asc nulls last,
                    CASE WHEN sort_column = 'name' AND sort_direction = 'desc' THEN c.display_name END desc nulls last,
                    CASE WHEN sort_column = 'email' AND sort_direction = 'asc' THEN c.email END asc nulls last,
                    CASE WHEN sort_column = 'email' AND sort_direction = 'desc' THEN c.email END desc nulls last,
                    CASE WHEN sort_column = 'company' AND sort_direction = 'asc' THEN c.company END asc nulls last,
                    CASE WHEN sort_column = 'company' AND sort_direction = 'desc' THEN c.company END desc nulls last,
                    CASE WHEN sort_column = 'location' AND sort_direction = 'asc' THEN c.primary_city END asc nulls last,
                    CASE WHEN sort_column = 'location' AND sort_direction = 'desc' THEN c.primary_city END desc nulls last,
                    CASE WHEN sort_column = 'type' AND sort_direction = 'asc' THEN c.type END asc nulls last,
                    CASE WHEN sort_column = 'type' AND sort_direction = 'desc' THEN c.type END desc nulls last,
                    CASE WHEN sort_column = 'display_name' AND sort_direction = 'asc' THEN c.display_name END asc nulls last,
                    CASE WHEN sort_column = 'display_name' AND sort_direction = 'desc' THEN c.display_name END desc nulls last
                LIMIT page_size
                OFFSET page_offset;
            END;
            $$
        """)
        print("  Created search_contacts")

        # keyword_search_artworks (with pagination)
        cur.execute("""
            CREATE OR REPLACE FUNCTION keyword_search_artworks(
                search_term text,
                match_count int DEFAULT 20,
                match_offset int DEFAULT 0,
                filter_status text DEFAULT null,
                filter_min_price numeric DEFAULT null,
                filter_max_price numeric DEFAULT null,
                filter_medium text DEFAULT null,
                filter_artist_id text DEFAULT null
            )
            RETURNS TABLE (
                artwork_id text,
                title text,
                year text,
                medium text,
                dimensions text,
                price numeric,
                price_currency text,
                status text,
                primary_image_url text,
                artist_names text,
                similarity float,
                ai_description text,
                style_tags text[],
                subject_tags text[],
                total_count bigint
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    a.id as artwork_id,
                    a.title,
                    a.year,
                    a.medium,
                    a.dimensions,
                    a.price,
                    a.price_currency,
                    a.status,
                    a.primary_image_url,
                    (SELECT string_agg(aa.display_name, ', ') FROM artwork_artists aa WHERE aa.artwork_id = a.id) as artist_names,
                    1.0::float as similarity,
                    ae.ai_description,
                    ae.style_tags,
                    ae.subject_tags,
                    COUNT(*) OVER() as total_count
                FROM artworks a
                LEFT JOIN artworks_extended ae ON ae.artwork_id = a.id
                WHERE
                    (
                        a.title ILIKE '%' || search_term || '%'
                        OR a.catalog_number ILIKE '%' || search_term || '%'
                        OR EXISTS (
                            SELECT 1 FROM artwork_artists aa
                            WHERE aa.artwork_id = a.id
                            AND aa.display_name ILIKE '%' || search_term || '%'
                        )
                    )
                    AND (filter_status IS NULL OR a.status = filter_status)
                    AND (filter_min_price IS NULL OR a.price >= filter_min_price)
                    AND (filter_max_price IS NULL OR a.price <= filter_max_price)
                    AND (filter_medium IS NULL OR a.medium ILIKE '%' || filter_medium || '%')
                    AND (filter_artist_id IS NULL OR filter_artist_id = ANY(a.artist_ids))
                ORDER BY
                    CASE
                        WHEN a.title ILIKE search_term THEN 0
                        WHEN a.title ILIKE search_term || '%' THEN 1
                        WHEN a.title ILIKE '%' || search_term || '%' THEN 2
                        ELSE 3
                    END,
                    a.title
                LIMIT match_count
                OFFSET match_offset;
            END;
            $$
        """)
        print("  Created keyword_search_artworks")

        # search_artworks (with pagination)
        cur.execute("""
            CREATE OR REPLACE FUNCTION search_artworks(
                query_embedding vector(768),
                embedding_col text DEFAULT 'clip_embedding',
                match_count int DEFAULT 20,
                match_offset int DEFAULT 0,
                filter_status text DEFAULT null,
                filter_min_price numeric DEFAULT null,
                filter_max_price numeric DEFAULT null,
                filter_medium text DEFAULT null,
                filter_artist_id text DEFAULT null
            )
            RETURNS TABLE (
                artwork_id text,
                title text,
                year text,
                medium text,
                dimensions text,
                price numeric,
                price_currency text,
                status text,
                primary_image_url text,
                artist_names text,
                similarity float,
                ai_description text,
                style_tags text[],
                subject_tags text[]
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    a.id as artwork_id,
                    a.title,
                    a.year,
                    a.medium,
                    a.dimensions,
                    a.price,
                    a.price_currency,
                    a.status,
                    a.primary_image_url,
                    (SELECT string_agg(aa.display_name, ', ') FROM artwork_artists aa WHERE aa.artwork_id = a.id) as artist_names,
                    1 - (
                        CASE
                            WHEN embedding_col = 'description_embedding' THEN
                                (ae.description_embedding <=> query_embedding)
                            ELSE
                                (ae.clip_embedding <=> query_embedding)
                        END
                    ) as similarity,
                    ae.ai_description,
                    ae.style_tags,
                    ae.subject_tags
                FROM artworks a
                JOIN artworks_extended ae ON ae.artwork_id = a.id
                WHERE
                    CASE
                        WHEN embedding_col = 'description_embedding' THEN ae.description_embedding IS NOT NULL
                        ELSE ae.clip_embedding IS NOT NULL
                    END
                    AND (filter_status IS NULL OR a.status = filter_status)
                    AND (filter_min_price IS NULL OR a.price >= filter_min_price)
                    AND (filter_max_price IS NULL OR a.price <= filter_max_price)
                    AND (filter_medium IS NULL OR a.medium ILIKE '%' || filter_medium || '%')
                    AND (filter_artist_id IS NULL OR filter_artist_id = ANY(a.artist_ids))
                ORDER BY similarity DESC
                LIMIT match_count
                OFFSET match_offset;
            END;
            $$
        """)
        print("  Created search_artworks")

        # =====================================================================
        # STEP 9: Verification
        # =====================================================================
        print("\n=== STEP 9: Verification ===")

        # Check row counts match expected values
        expected = {
            "artists": counts_before["artists"],  # no deletions
            "artworks": counts_before["artworks"] - len(unmatched_artworks),
            "contacts": counts_before["contacts"] - len(unmatched_contacts),
            "artwork_artists": None,  # may have changed due to artwork deletions
            "artists_extended": counts_before["artists_extended"],
            "artworks_extended": None,  # may have changed
            "contacts_extended": None,  # may have changed
        }

        all_ok = True
        for table in ["artists", "artworks", "contacts", "artwork_artists",
                       "artists_extended", "artworks_extended", "contacts_extended"]:
            cur.execute(f"SELECT count(*) FROM {table}")
            count = cur.fetchone()[0]
            exp = expected.get(table)
            status = "OK" if exp is None or count == exp else f"MISMATCH (expected {exp})"
            if exp is not None and count != exp:
                all_ok = False
            print(f"  {table}: {count} {status}")

        # Check no NULL IDs
        for table, col in [("artists", "id"), ("artworks", "id"), ("contacts", "id")]:
            cur.execute(f"SELECT count(*) FROM {table} WHERE {col} IS NULL")
            null_count = cur.fetchone()[0]
            if null_count > 0:
                all_ok = False
                print(f"  ERROR: {null_count} NULL {col} in {table}")

        # Check no old numeric IDs remain (new IDs should all contain letters)
        for table, col in [("artists", "id"), ("artworks", "id"), ("contacts", "id")]:
            cur.execute(f"SELECT count(*) FROM {table} WHERE {col} ~ '^[0-9]+$'")
            numeric_count = cur.fetchone()[0]
            if numeric_count > 0:
                all_ok = False
                print(f"  ERROR: {numeric_count} still-numeric {col} in {table}")

        # Check FK integrity
        cur.execute("""
            SELECT count(*) FROM artwork_artists aa
            WHERE NOT EXISTS (SELECT 1 FROM artworks a WHERE a.id = aa.artwork_id)
        """)
        orphaned = cur.fetchone()[0]
        if orphaned > 0:
            all_ok = False
            print(f"  ERROR: {orphaned} orphaned artwork_artists.artwork_id")

        cur.execute("""
            SELECT count(*) FROM artwork_artists aa
            WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.id = aa.artist_id)
        """)
        orphaned = cur.fetchone()[0]
        if orphaned > 0:
            all_ok = False
            print(f"  ERROR: {orphaned} orphaned artwork_artists.artist_id")

        cur.execute("""
            SELECT count(*) FROM artworks_extended ae
            WHERE NOT EXISTS (SELECT 1 FROM artworks a WHERE a.id = ae.artwork_id)
        """)
        orphaned = cur.fetchone()[0]
        if orphaned > 0:
            all_ok = False
            print(f"  ERROR: {orphaned} orphaned artworks_extended.artwork_id")

        cur.execute("""
            SELECT count(*) FROM artists_extended ae
            WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.id = ae.artist_id)
        """)
        orphaned = cur.fetchone()[0]
        if orphaned > 0:
            all_ok = False
            print(f"  ERROR: {orphaned} orphaned artists_extended.artist_id")

        cur.execute("""
            SELECT count(*) FROM contacts_extended ce
            WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = ce.contact_id)
        """)
        orphaned = cur.fetchone()[0]
        if orphaned > 0:
            all_ok = False
            print(f"  ERROR: {orphaned} orphaned contacts_extended.contact_id")

        # Check sample IDs look correct
        cur.execute("SELECT id FROM artists LIMIT 3")
        print(f"  Sample artist IDs: {[r[0] for r in cur.fetchall()]}")
        cur.execute("SELECT id FROM artworks LIMIT 3")
        print(f"  Sample artwork IDs: {[r[0] for r in cur.fetchall()]}")
        cur.execute("SELECT id FROM contacts LIMIT 3")
        print(f"  Sample contact IDs: {[r[0] for r in cur.fetchall()]}")

        if not all_ok:
            print("\n*** VERIFICATION FAILED — ROLLING BACK ***")
            conn.rollback()
            sys.exit(1)

        # =====================================================================
        # STEP 10: Commit or dry-run
        # =====================================================================
        if "--commit" in sys.argv:
            print("\n=== COMMITTING ===")
            conn.commit()
            print("Migration committed successfully!")
        else:
            print("\n=== DRY RUN — ROLLING BACK ===")
            print("Run with --commit to apply changes")
            conn.rollback()

    except Exception as e:
        print(f"\n*** ERROR: {e} ***")
        print("Rolling back all changes")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
