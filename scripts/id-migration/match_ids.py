#!/usr/bin/env python3
"""
Match Supabase records (old bigint IDs) to Arternal records (new string IDs)
using multi-field matching. Outputs mapping CSVs and reports unmatched records.
"""

import csv
import json
import sys
from collections import defaultdict


def normalize(val):
    """Normalize a value for comparison: lowercase, strip whitespace/CR, treat None/empty as None."""
    if val is None:
        return None
    s = str(val).strip().replace('\r', '').replace('\n', '').lower()
    return s if s else None


def score_match(fields_a, fields_b, field_names):
    """
    Score how well two records match across multiple fields.
    Returns (matched_count, compared_count, matched_fields, mismatched_fields).
    Only counts fields where both sides have non-null values.
    """
    matched = []
    mismatched = []
    for name in field_names:
        va = normalize(fields_a.get(name))
        vb = normalize(fields_b.get(name))
        if va is None or vb is None:
            continue  # skip if either side is null
        if va == vb:
            matched.append(name)
        else:
            mismatched.append(name)
    compared = len(matched) + len(mismatched)
    return len(matched), compared, matched, mismatched


def score_match_exact(fields_a, fields_b, field_names):
    """
    Score with exact (case-sensitive) comparison. Used as tiebreaker.
    Returns number of exact matches.
    """
    count = 0
    for name in field_names:
        va = fields_a.get(name)
        vb = fields_b.get(name)
        if va is None or vb is None:
            continue
        va_s = str(va).strip()
        vb_s = str(vb).strip()
        if va_s and vb_s and va_s == vb_s:
            count += 1
    return count


def find_best_match(supabase_rec, arternal_records, field_names, index_field=None, index_map=None, used_ids=None):
    """
    Find the best matching Arternal record for a Supabase record.
    Uses index_field/index_map to narrow candidates if provided.
    Skips Arternal records whose id is in used_ids.
    Returns (best_arternal_rec, matched_count, compared_count, matched_fields, mismatched_fields)
    or None if no match found.
    """
    # Narrow candidates using index if available
    if index_field and index_map:
        key = normalize(supabase_rec.get(index_field))
        if key and key in index_map:
            candidates = index_map[key]
        else:
            candidates = arternal_records
    else:
        candidates = arternal_records

    best = None
    best_score = (-1, -1, -1)  # (matched_count, -mismatches, exact_matches)

    for art_rec in candidates:
        if used_ids and art_rec["id"] in used_ids:
            continue
        matched, compared, matched_fields, mismatched_fields = score_match(
            supabase_rec, art_rec, field_names
        )
        exact = score_match_exact(supabase_rec, art_rec, field_names)
        # Better match = more matched fields, fewer mismatches, more exact matches
        score = (matched, -len(mismatched_fields), exact)
        if score > best_score:
            best_score = score
            best = (art_rec, matched, compared, matched_fields, mismatched_fields)

    return best


def build_index(records, field_name):
    """Build a lookup index: normalized field value -> list of records."""
    idx = defaultdict(list)
    for rec in records:
        key = normalize(rec.get(field_name))
        if key:
            idx[key].append(rec)
    return idx


def load_supabase_csv(path):
    """Load Supabase CSV export into list of dicts."""
    records = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert empty strings to None
            records.append({k: (v if v else None) for k, v in row.items()})
    return records


def match_artists():
    print("=" * 60)
    print("ARTISTS")
    print("=" * 60)

    supabase = load_supabase_csv("scripts/id-migration/supabase_artists.csv")
    arternal = json.load(open("scripts/id-migration/arternal_artists.json"))

    match_fields = ["display_name", "first_name", "last_name", "country", "bio", "birth_year", "death_year", "life_dates"]

    # Index by display_name for fast lookup
    art_index = build_index(arternal, "display_name")

    mapping = []
    unmatched = []
    ambiguous = []
    used_ids = set()

    for sup in supabase:
        result = find_best_match(sup, arternal, match_fields, "display_name", art_index, used_ids)
        if result is None or result[1] == 0:
            unmatched.append(sup)
            continue

        art_rec, matched, compared, matched_fields, mismatched_fields = result

        if matched >= 2 and len(mismatched_fields) <= 1:
            mapping.append({
                "old_id": sup["id"],
                "new_id": art_rec["id"],
                "display_name": sup.get("display_name"),
                "matched_fields": ",".join(matched_fields),
                "matched_count": matched,
                "mismatched_fields": ",".join(mismatched_fields),
            })
            used_ids.add(art_rec["id"])
        else:
            ambiguous.append({
                "old_id": sup["id"],
                "display_name": sup.get("display_name"),
                "best_new_id": art_rec["id"],
                "best_display_name": art_rec.get("display_name"),
                "matched": matched,
                "compared": compared,
                "matched_fields": ",".join(matched_fields),
                "mismatched_fields": ",".join(mismatched_fields),
            })

    print(f"  Total Supabase: {len(supabase)}")
    print(f"  Total Arternal: {len(arternal)}")
    print(f"  Matched:        {len(mapping)}")
    print(f"  Ambiguous:      {len(ambiguous)}")
    print(f"  Unmatched:      {len(unmatched)}")

    if ambiguous:
        print("\n  Ambiguous matches:")
        for a in ambiguous:
            print(f"    old={a['old_id']} '{a['display_name']}' -> new={a['best_new_id']} '{a['best_display_name']}' "
                  f"matched={a['matched']}/{a['compared']} on [{a['matched_fields']}] mismatched=[{a['mismatched_fields']}]")

    if unmatched:
        print("\n  Unmatched Supabase records:")
        for u in unmatched:
            print(f"    old={u['id']} '{u.get('display_name')}'")

    write_mapping("scripts/id-migration/mapping_artists.csv", mapping)
    return mapping


def match_artworks():
    print("\n" + "=" * 60)
    print("ARTWORKS")
    print("=" * 60)

    supabase = load_supabase_csv("scripts/id-migration/supabase_artworks.csv")
    arternal = json.load(open("scripts/id-migration/arternal_artworks_inventory.json"))

    match_fields = ["catalog_number", "title", "year", "medium", "dimensions", "edition", "price", "price_currency", "status", "type", "primary_image_url"]

    # Index by catalog_number for fast lookup
    art_index = build_index(arternal, "catalog_number")

    mapping = []
    unmatched = []
    ambiguous = []
    used_ids = set()

    for sup in supabase:
        result = find_best_match(sup, arternal, match_fields, "catalog_number", art_index, used_ids)
        if result is None or result[1] == 0:
            unmatched.append(sup)
            continue

        art_rec, matched, compared, matched_fields, mismatched_fields = result

        # Require at least one "meaningful" field match (not just status+type)
        meaningful_fields = {"catalog_number", "title", "year", "medium", "dimensions", "edition", "price", "primary_image_url"}
        has_meaningful = any(f in meaningful_fields for f in matched_fields)

        if matched >= 2 and has_meaningful:
            mapping.append({
                "old_id": sup["id"],
                "new_id": art_rec["id"],
                "catalog_number": sup.get("catalog_number"),
                "title": sup.get("title"),
                "matched_fields": ",".join(matched_fields),
                "matched_count": matched,
                "mismatched_fields": ",".join(mismatched_fields),
            })
            used_ids.add(art_rec["id"])
        else:
            ambiguous.append({
                "old_id": sup["id"],
                "catalog_number": sup.get("catalog_number"),
                "title": sup.get("title"),
                "best_new_id": art_rec["id"],
                "best_title": art_rec.get("title"),
                "matched": matched,
                "compared": compared,
                "matched_fields": ",".join(matched_fields),
                "mismatched_fields": ",".join(mismatched_fields),
            })

    # For artworks without catalog_number, try matching against full list by title+year+medium
    if unmatched:
        remaining = []
        title_index = build_index(arternal, "title")
        for sup in unmatched:
            result = find_best_match(sup, arternal, match_fields, "title", title_index, used_ids)
            if result and result[1] >= 2 and any(f in meaningful_fields for f in result[3]):
                art_rec, matched, compared, matched_fields, mismatched_fields = result
                mapping.append({
                    "old_id": sup["id"],
                    "new_id": art_rec["id"],
                    "catalog_number": sup.get("catalog_number"),
                    "title": sup.get("title"),
                    "matched_fields": ",".join(matched_fields),
                    "matched_count": matched,
                    "mismatched_fields": ",".join(mismatched_fields),
                })
                used_ids.add(art_rec["id"])
            else:
                remaining.append(sup)
        unmatched = remaining

    print(f"  Total Supabase: {len(supabase)}")
    print(f"  Total Arternal: {len(arternal)}")
    print(f"  Matched:        {len(mapping)}")
    print(f"  Ambiguous:      {len(ambiguous)}")
    print(f"  Unmatched:      {len(unmatched)}")

    if ambiguous:
        print("\n  Ambiguous matches:")
        for a in ambiguous[:20]:
            print(f"    old={a['old_id']} cat={a['catalog_number']} '{a['title']}' -> new={a['best_new_id']} '{a['best_title']}' "
                  f"matched={a['matched']}/{a['compared']} on [{a['matched_fields']}] mismatched=[{a['mismatched_fields']}]")
        if len(ambiguous) > 20:
            print(f"    ... and {len(ambiguous) - 20} more")

    if unmatched:
        print(f"\n  Unmatched Supabase records ({len(unmatched)}):")
        for u in unmatched[:20]:
            print(f"    old={u['id']} cat={u.get('catalog_number')} '{u.get('title')}'")
        if len(unmatched) > 20:
            print(f"    ... and {len(unmatched) - 20} more")

    write_mapping("scripts/id-migration/mapping_artworks.csv", mapping)
    return mapping


def match_contacts():
    print("\n" + "=" * 60)
    print("CONTACTS")
    print("=" * 60)

    supabase = load_supabase_csv("scripts/id-migration/supabase_contacts.csv")
    arternal = json.load(open("scripts/id-migration/arternal_contacts.json"))

    match_fields = ["first_name", "last_name", "display_name", "email", "phone", "phone_mobile", "company", "type", "website", "primary_street", "primary_city", "primary_state", "primary_zip", "primary_country"]

    # Index by email for fast lookup (most contacts have email)
    email_index = build_index(arternal, "email")
    # Fallback index by display_name
    name_index = build_index(arternal, "display_name")

    mapping = []
    unmatched = []
    ambiguous = []
    used_ids = set()

    for sup in supabase:
        # Try email index first, then name index
        result = None
        if normalize(sup.get("email")):
            result = find_best_match(sup, arternal, match_fields, "email", email_index, used_ids)
        if (result is None or result[1] < 2) and normalize(sup.get("display_name")):
            result2 = find_best_match(sup, arternal, match_fields, "display_name", name_index, used_ids)
            if result2 and (result is None or result2[1] > result[1]):
                result = result2

        if result is None or result[1] == 0:
            unmatched.append(sup)
            continue

        art_rec, matched, compared, matched_fields, mismatched_fields = result

        if matched >= 2 and (len(mismatched_fields) <= 1 or any(f in matched_fields for f in ["email", "display_name"])):
            mapping.append({
                "old_id": sup["id"],
                "new_id": art_rec["id"],
                "display_name": sup.get("display_name"),
                "email": sup.get("email"),
                "matched_fields": ",".join(matched_fields),
                "matched_count": matched,
                "mismatched_fields": ",".join(mismatched_fields),
            })
            used_ids.add(art_rec["id"])
        else:
            ambiguous.append({
                "old_id": sup["id"],
                "display_name": sup.get("display_name"),
                "email": sup.get("email"),
                "best_new_id": art_rec["id"],
                "best_display_name": art_rec.get("display_name"),
                "matched": matched,
                "compared": compared,
                "matched_fields": ",".join(matched_fields),
                "mismatched_fields": ",".join(mismatched_fields),
            })

    print(f"  Total Supabase: {len(supabase)}")
    print(f"  Total Arternal: {len(arternal)}")
    print(f"  Matched:        {len(mapping)}")
    print(f"  Ambiguous:      {len(ambiguous)}")
    print(f"  Unmatched:      {len(unmatched)}")

    if ambiguous:
        print(f"\n  Ambiguous matches ({len(ambiguous)}):")
        for a in ambiguous[:20]:
            print(f"    old={a['old_id']} '{a['display_name']}' <{a['email']}> -> new={a['best_new_id']} '{a['best_display_name']}' "
                  f"matched={a['matched']}/{a['compared']} on [{a['matched_fields']}] mismatched=[{a['mismatched_fields']}]")
        if len(ambiguous) > 20:
            print(f"    ... and {len(ambiguous) - 20} more")

    if unmatched:
        print(f"\n  Unmatched Supabase records ({len(unmatched)}):")
        for u in unmatched[:20]:
            print(f"    old={u['id']} '{u.get('display_name')}' <{u.get('email')}>")
        if len(unmatched) > 20:
            print(f"    ... and {len(unmatched) - 20} more")

    write_mapping("scripts/id-migration/mapping_contacts.csv", mapping)
    return mapping


def write_mapping(path, mapping):
    if not mapping:
        print(f"  No mapping to write to {path}")
        return
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=mapping[0].keys())
        writer.writeheader()
        writer.writerows(mapping)
    print(f"  Mapping written to {path}")


def check_duplicates(mapping, entity):
    """Check for duplicate new_ids in the mapping (two old IDs mapping to the same new ID)."""
    new_id_counts = defaultdict(list)
    for m in mapping:
        new_id_counts[m["new_id"]].append(m["old_id"])
    dupes = {k: v for k, v in new_id_counts.items() if len(v) > 1}
    if dupes:
        print(f"\n  WARNING: {len(dupes)} duplicate new_id mappings in {entity}:")
        for new_id, old_ids in list(dupes.items())[:10]:
            print(f"    new_id={new_id} <- old_ids={old_ids}")
    else:
        print(f"\n  No duplicate mappings in {entity}")


if __name__ == "__main__":
    artist_mapping = match_artists()
    check_duplicates(artist_mapping, "artists")

    artwork_mapping = match_artworks()
    check_duplicates(artwork_mapping, "artworks")

    contact_mapping = match_contacts()
    check_duplicates(contact_mapping, "contacts")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Artists:  {len(artist_mapping)} mapped")
    print(f"  Artworks: {len(artwork_mapping)} mapped")
    print(f"  Contacts: {len(contact_mapping)} mapped")
