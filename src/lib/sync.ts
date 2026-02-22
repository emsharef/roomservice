import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInventory,
  fetchArtists,
  fetchContacts,
  fetchAllPages,
  type InventoryItem,
  type ArtistListItem,
  type ContactItem,
} from "@/lib/arternal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  entity: string;
  processed: number;
  created: number;
  updated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// syncArtworks
// ---------------------------------------------------------------------------

export async function syncArtworks(): Promise<SyncResult> {
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "artworks",
    processed: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  // Fetch all artworks from Arternal
  const items = await fetchAllPages<InventoryItem>(
    fetchInventory,
    { type: "inventory" },
    100,
  );

  // Fetch existing artwork IDs for created vs updated tracking
  const { data: existingRows } = await supabase
    .from("artworks")
    .select("id");
  const existingIds = new Set(
    (existingRows ?? []).map((r: { id: number }) => r.id),
  );

  for (const item of items) {
    try {
      // Upsert the artwork
      const { error } = await supabase.from("artworks").upsert(
        {
          id: item.id,
          catalog_number: item.catalog_number,
          title: item.title,
          year: item.year,
          medium: item.medium,
          dimensions: item.dimensions,
          edition: item.edition,
          price: item.price,
          price_currency: item.price_currency,
          work_status: item.work_status,
          status: item.status,
          type: item.type,
          height: item.height,
          width: item.width,
          depth: item.depth,
          primary_image_url: item.primary_image_url,
          url: item.url,
          artist_ids: item.artists.map((a) => a.id),
          arternal_created_at: item.created_at,
          arternal_updated_at: item.updated_at,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        result.errors.push(`artwork ${item.id}: ${error.message}`);
        continue;
      }

      // Track created vs updated
      if (existingIds.has(item.id)) {
        result.updated++;
      } else {
        result.created++;
      }
      result.processed++;

      // Upsert artwork_artists junction rows
      for (const artist of item.artists) {
        const { error: junctionError } = await supabase
          .from("artwork_artists")
          .upsert(
            {
              artwork_id: item.id,
              artist_id: artist.id,
              display_name: artist.display_name,
            },
            { onConflict: "artwork_id,artist_id" },
          );

        if (junctionError) {
          result.errors.push(
            `artwork_artists ${item.id}/${artist.id}: ${junctionError.message}`,
          );
        }
      }

      // Ensure an artworks_extended row exists (don't overwrite existing data)
      const { error: extError } = await supabase
        .from("artworks_extended")
        .upsert(
          { artwork_id: item.id },
          { onConflict: "artwork_id", ignoreDuplicates: true },
        );

      if (extError) {
        result.errors.push(
          `artworks_extended ${item.id}: ${extError.message}`,
        );
      }
    } catch (e) {
      result.errors.push(`artwork ${item.id}: ${String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncArtists
// ---------------------------------------------------------------------------

export async function syncArtists(): Promise<SyncResult> {
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "artists",
    processed: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  // Fetch all artists from Arternal
  const items = await fetchAllPages<ArtistListItem>(fetchArtists, {}, 100);

  // Fetch existing artist IDs for created vs updated tracking
  const { data: existingRows } = await supabase
    .from("artists")
    .select("id");
  const existingIds = new Set(
    (existingRows ?? []).map((r: { id: number }) => r.id),
  );

  for (const item of items) {
    try {
      const { error } = await supabase.from("artists").upsert(
        {
          id: item.id,
          first_name: item.first_name,
          last_name: item.last_name,
          alias: item.alias,
          display_name: item.display_name,
          birth_year: item.birth_year != null ? String(item.birth_year) : null,
          death_year: item.death_year != null ? String(item.death_year) : null,
          bio: item.bio,
          country: item.country,
          life_dates: item.life_dates,
          work_count: item.work_count,
          catalog_count: item.catalog_count,
          arternal_created_at: item.created_at,
          arternal_updated_at: item.updated_at,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        result.errors.push(`artist ${item.id}: ${error.message}`);
        continue;
      }

      if (existingIds.has(item.id)) {
        result.updated++;
      } else {
        result.created++;
      }
      result.processed++;

      // Ensure an artists_extended row exists (don't overwrite existing data)
      const { error: extError } = await supabase
        .from("artists_extended")
        .upsert(
          { artist_id: item.id },
          { onConflict: "artist_id", ignoreDuplicates: true },
        );

      if (extError) {
        result.errors.push(
          `artists_extended ${item.id}: ${extError.message}`,
        );
      }
    } catch (e) {
      result.errors.push(`artist ${item.id}: ${String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncContacts
// ---------------------------------------------------------------------------

export async function syncContacts(): Promise<SyncResult> {
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "contacts",
    processed: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  // Fetch all contacts from Arternal
  const items = await fetchAllPages<ContactItem>(fetchContacts, {}, 100);

  // Fetch existing contact IDs for created vs updated tracking
  const { data: existingRows } = await supabase
    .from("contacts")
    .select("id");
  const existingIds = new Set(
    (existingRows ?? []).map((r: { id: number }) => r.id),
  );

  for (const item of items) {
    try {
      const { error } = await supabase.from("contacts").upsert(
        {
          id: item.id,
          first_name: item.first_name,
          last_name: item.last_name,
          display_name: item.display_name,
          email: item.email,
          phone: item.phone,
          phone_mobile: item.phone_mobile,
          type: item.type,
          website: item.website,
          company: item.company,
          primary_street: item.primary_address?.street ?? null,
          primary_city: item.primary_city,
          primary_state: item.primary_state,
          primary_zip: item.primary_address?.zip ?? null,
          primary_country: item.primary_country,
          primary_address_formatted:
            item.primary_address?.formatted ?? null,
          tags: [], // List endpoint doesn't return tags; enriched later
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        result.errors.push(`contact ${item.id}: ${error.message}`);
        continue;
      }

      if (existingIds.has(item.id)) {
        result.updated++;
      } else {
        result.created++;
      }
      result.processed++;

      // Ensure a contacts_extended row exists (don't overwrite existing data)
      const { error: extError } = await supabase
        .from("contacts_extended")
        .upsert(
          { contact_id: item.id },
          { onConflict: "contact_id", ignoreDuplicates: true },
        );

      if (extError) {
        result.errors.push(
          `contacts_extended ${item.id}: ${extError.message}`,
        );
      }
    } catch (e) {
      result.errors.push(`contact ${item.id}: ${String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

export async function syncAll(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  results.push(await syncArtworks());
  results.push(await syncArtists());
  results.push(await syncContacts());
  return results;
}
