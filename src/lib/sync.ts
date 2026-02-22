import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInventory,
  fetchInventoryItem,
  fetchArtists,
  fetchArtist,
  fetchContacts,
  fetchContact,
  fetchAllPages,
  type InventoryItem,
  type ArtistListItem,
  type ContactItem,
} from "@/lib/arternal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncMode = "full" | "incremental";

export interface SyncOptions {
  mode: SyncMode;
  /** For full sync resume: start from this offset */
  resumeOffset?: number;
  /** For incremental sync: only process records updated after this ISO timestamp */
  updatedSince?: string;
  onProgress?: OnProgress;
}

export interface SyncResult {
  entity: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** Last offset processed — used for resume on failure */
  lastOffset: number;
}

export interface SyncProgress {
  phase: "fetching" | "upserting" | "detailing" | "done";
  fetched?: number;
  processed: number;
  total: number;
  created: number;
  updated: number;
  skipped?: number;
}

export type OnProgress = (progress: SyncProgress) => void;

// ---------------------------------------------------------------------------
// Detail-fetching helper with concurrency
// ---------------------------------------------------------------------------

async function fetchDetailsBatch<T>(
  ids: number[],
  fetcher: (id: string) => Promise<{ data: T }>,
  concurrency: number,
  onBatchDone: (done: number) => void,
  errors: string[],
  entityLabel: string,
): Promise<Map<number, T>> {
  const results = new Map<number, T>();
  let done = 0;

  async function fetchWithRetry(id: number, retries = 6): Promise<{ id: number; data: T }> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetcher(String(id));
        return { id, data: resp.data };
      } catch (e) {
        const msg = String(e);
        if (msg.includes("429") || msg.includes("RATE_LIMIT") || msg.includes("Too many")) {
          // Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s
          const delay = 5000 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw new Error(`${entityLabel} ${id}: max retries exceeded`);
  }

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchWithRetry(id)),
    );

    for (const res of settled) {
      if (res.status === "fulfilled") {
        results.set(res.value.id, res.value.data);
      } else {
        errors.push(`${entityLabel} detail: ${res.reason}`);
      }
      done++;
    }

    onBatchDone(done);

    // Rate-limit: ~1 req/sec to stay under 1000 req/15min API limit
    if (i + concurrency < ids.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// syncArtworks
// ---------------------------------------------------------------------------

export async function syncArtworks(opts?: SyncOptions): Promise<SyncResult> {
  const onProgress = opts?.onProgress;
  const isIncremental = opts?.mode === "incremental";
  const updatedSince = opts?.updatedSince;
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "artworks",
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    lastOffset: 0,
  };

  // Fetch artworks from Arternal
  onProgress?.({ phase: "fetching", processed: 0, total: 0, created: 0, updated: 0 });

  let stopFetching = false;
  const items = await fetchAllPages<InventoryItem>(
    fetchInventory,
    { type: "inventory" },
    100,
    {
      sort: "updated_at",
      order: isIncremental ? "desc" : "asc",
      startOffset: opts?.resumeOffset,
      onPage: isIncremental && updatedSince
        ? (page) => {
            // For incremental: stop when we hit items older than cutoff
            const cutoff = new Date(updatedSince).getTime();
            const allOld = page.every(
              (item) => new Date(item.updated_at).getTime() <= cutoff,
            );
            if (allOld) stopFetching = true;
            return !stopFetching;
          }
        : undefined,
    },
  );

  // For incremental sync, filter out items not updated since cutoff
  const itemsToProcess = isIncremental && updatedSince
    ? items.filter(
        (item) => new Date(item.updated_at).getTime() > new Date(updatedSince).getTime(),
      )
    : items;

  // Fetch existing artwork IDs for created vs updated tracking
  const { data: existingRows } = await supabase
    .from("artworks")
    .select("id");
  const existingIds = new Set(
    (existingRows ?? []).map((r: { id: number }) => r.id),
  );

  const total = itemsToProcess.length;
  result.skipped = items.length - total;
  onProgress?.({ phase: "upserting", processed: 0, total, created: 0, updated: 0, skipped: result.skipped });

  for (const item of itemsToProcess) {
    try {
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

      if (existingIds.has(item.id)) {
        result.updated++;
      } else {
        result.created++;
      }
      result.processed++;
      result.lastOffset = result.processed + (opts?.resumeOffset ?? 0);

      if (result.processed % 10 === 0 || result.processed === total) {
        onProgress?.({ phase: "upserting", processed: result.processed, total, created: result.created, updated: result.updated, skipped: result.skipped });
      }

      // Upsert artwork_artists junction rows
      for (const artist of item.artists) {
        const { error: junctionError } = await supabase
          .from("artwork_artists")
          .upsert(
            { artwork_id: item.id, artist_id: artist.id, display_name: artist.display_name },
            { onConflict: "artwork_id,artist_id" },
          );
        if (junctionError) {
          result.errors.push(`artwork_artists ${item.id}/${artist.id}: ${junctionError.message}`);
        }
      }

      // Ensure an artworks_extended row exists
      const { error: extError } = await supabase
        .from("artworks_extended")
        .upsert({ artwork_id: item.id }, { onConflict: "artwork_id", ignoreDuplicates: true });
      if (extError) {
        result.errors.push(`artworks_extended ${item.id}: ${extError.message}`);
      }
    } catch (e) {
      result.errors.push(`artwork ${item.id}: ${String(e)}`);
    }
  }

  // Detail sync: fetch images for each artwork
  // Include items just synced + any with stale/missing detail (null or older than synced_at)
  const processedIds = new Set(itemsToProcess.map((i) => i.id));
  const { data: missingDetailRows } = await supabase
    .from("artworks")
    .select("id")
    .is("detail_synced_at", null)
    .limit(10000);
  const missingIds = (missingDetailRows ?? []).map((r: { id: number }) => r.id);
  const detailIds = [...new Set([...processedIds, ...missingIds])];

  if (detailIds.length > 0) {
    onProgress?.({ phase: "detailing", processed: 0, total: detailIds.length, created: result.created, updated: result.updated });

    const details = await fetchDetailsBatch(
      detailIds,
      fetchInventoryItem,
      2,
      (done) => {
        if (done % 10 === 0 || done === detailIds.length) {
          onProgress?.({ phase: "detailing", processed: done, total: detailIds.length, created: result.created, updated: result.updated });
        }
      },
      result.errors,
      "artwork",
    );

    for (const [id, detail] of details) {
      const { error } = await supabase
        .from("artworks")
        .update({ images: detail.images ?? [], detail_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (error) result.errors.push(`artwork images ${id}: ${error.message}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncArtists
// ---------------------------------------------------------------------------

export async function syncArtists(opts?: SyncOptions): Promise<SyncResult> {
  const onProgress = opts?.onProgress;
  const isIncremental = opts?.mode === "incremental";
  const updatedSince = opts?.updatedSince;
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "artists",
    processed: 0, created: 0, updated: 0, skipped: 0, errors: [], lastOffset: 0,
  };

  onProgress?.({ phase: "fetching", processed: 0, total: 0, created: 0, updated: 0 });

  let stopFetching = false;
  const items = await fetchAllPages<ArtistListItem>(fetchArtists, {}, 100, {
    sort: "updated_at",
    order: isIncremental ? "desc" : "asc",
    startOffset: opts?.resumeOffset,
    onPage: isIncremental && updatedSince
      ? (page) => {
          const cutoff = new Date(updatedSince).getTime();
          if (page.every((i) => new Date(i.updated_at).getTime() <= cutoff)) stopFetching = true;
          return !stopFetching;
        }
      : undefined,
  });

  const itemsToProcess = isIncremental && updatedSince
    ? items.filter((i) => new Date(i.updated_at).getTime() > new Date(updatedSince).getTime())
    : items;

  const { data: existingRows } = await supabase.from("artists").select("id");
  const existingIds = new Set((existingRows ?? []).map((r: { id: number }) => r.id));

  const total = itemsToProcess.length;
  result.skipped = items.length - total;
  onProgress?.({ phase: "upserting", processed: 0, total, created: 0, updated: 0, skipped: result.skipped });

  for (const item of itemsToProcess) {
    try {
      const { error } = await supabase.from("artists").upsert(
        {
          id: item.id, first_name: item.first_name, last_name: item.last_name,
          alias: item.alias, display_name: item.display_name,
          birth_year: item.birth_year != null ? String(item.birth_year) : null,
          death_year: item.death_year != null ? String(item.death_year) : null,
          bio: item.bio, country: item.country, life_dates: item.life_dates,
          work_count: item.work_count, catalog_count: item.catalog_count,
          arternal_created_at: item.created_at, arternal_updated_at: item.updated_at,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) { result.errors.push(`artist ${item.id}: ${error.message}`); continue; }

      if (existingIds.has(item.id)) { result.updated++; } else { result.created++; }
      result.processed++;
      result.lastOffset = result.processed + (opts?.resumeOffset ?? 0);

      if (result.processed % 10 === 0 || result.processed === total) {
        onProgress?.({ phase: "upserting", processed: result.processed, total, created: result.created, updated: result.updated, skipped: result.skipped });
      }

      const { error: extError } = await supabase
        .from("artists_extended")
        .upsert({ artist_id: item.id }, { onConflict: "artist_id", ignoreDuplicates: true });
      if (extError) { result.errors.push(`artists_extended ${item.id}: ${extError.message}`); }
    } catch (e) {
      result.errors.push(`artist ${item.id}: ${String(e)}`);
    }
  }

  // Detail sync: fetch statistics for each artist
  // Include items just synced + any with stale/missing detail (null or older than synced_at)
  const processedArtistIds = new Set(itemsToProcess.map((i) => i.id));
  const { data: missingArtistDetailRows } = await supabase
    .from("artists")
    .select("id")
    .is("detail_synced_at", null)
    .limit(10000);
  const missingArtistIds = (missingArtistDetailRows ?? []).map((r: { id: number }) => r.id);
  const artistDetailIds = [...new Set([...processedArtistIds, ...missingArtistIds])];

  if (artistDetailIds.length > 0) {
    onProgress?.({ phase: "detailing", processed: 0, total: artistDetailIds.length, created: result.created, updated: result.updated });

    const details = await fetchDetailsBatch(
      artistDetailIds,
      fetchArtist,
      2,
      (done) => {
        if (done % 10 === 0 || done === artistDetailIds.length) {
          onProgress?.({ phase: "detailing", processed: done, total: artistDetailIds.length, created: result.created, updated: result.updated });
        }
      },
      result.errors,
      "artist",
    );

    for (const [id, detail] of details) {
      const { error } = await supabase
        .from("artists")
        .update({ statistics: detail.statistics ?? null, detail_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (error) result.errors.push(`artist statistics ${id}: ${error.message}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncContacts
// ---------------------------------------------------------------------------

export async function syncContacts(opts?: SyncOptions): Promise<SyncResult> {
  const onProgress = opts?.onProgress;
  const isIncremental = opts?.mode === "incremental";
  const updatedSince = opts?.updatedSince;
  const supabase = createAdminClient();
  const result: SyncResult = {
    entity: "contacts",
    processed: 0, created: 0, updated: 0, skipped: 0, errors: [], lastOffset: 0,
  };

  onProgress?.({ phase: "fetching", processed: 0, total: 0, created: 0, updated: 0 });

  let stopFetching = false;
  const items = await fetchAllPages<ContactItem>(fetchContacts, {}, 100, {
    sort: "updated_at",
    order: isIncremental ? "desc" : "asc",
    startOffset: opts?.resumeOffset,
    onPage: isIncremental && updatedSince
      ? (page) => {
          const cutoff = new Date(updatedSince).getTime();
          if (page.every((i) => new Date(i.updated_at).getTime() <= cutoff)) stopFetching = true;
          return !stopFetching;
        }
      : undefined,
  });

  const itemsToProcess = isIncremental && updatedSince
    ? items.filter((i) => new Date(i.updated_at).getTime() > new Date(updatedSince).getTime())
    : items;

  const { data: existingRows } = await supabase.from("contacts").select("id");
  const existingIds = new Set((existingRows ?? []).map((r: { id: number }) => r.id));

  const total = itemsToProcess.length;
  result.skipped = items.length - total;
  onProgress?.({ phase: "upserting", processed: 0, total, created: 0, updated: 0, skipped: result.skipped });

  for (const item of itemsToProcess) {
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
          primary_address_formatted: item.primary_address?.formatted ?? null,
          arternal_created_at: item.created_at,
          arternal_updated_at: item.updated_at,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) { result.errors.push(`contact ${item.id}: ${error.message}`); continue; }

      if (existingIds.has(item.id)) { result.updated++; } else { result.created++; }
      result.processed++;
      result.lastOffset = result.processed + (opts?.resumeOffset ?? 0);

      if (result.processed % 10 === 0 || result.processed === total) {
        onProgress?.({ phase: "upserting", processed: result.processed, total, created: result.created, updated: result.updated, skipped: result.skipped });
      }

      const { error: extError } = await supabase
        .from("contacts_extended")
        .upsert(
          { contact_id: item.id },
          { onConflict: "contact_id", ignoreDuplicates: true },
        );

      if (extError) {
        result.errors.push(`contacts_extended ${item.id}: ${extError.message}`);
      }
    } catch (e) {
      result.errors.push(`contact ${item.id}: ${String(e)}`);
    }
  }

  // Detail sync: fetch tags, notes, transactions, activities
  // Include items just synced + any with stale/missing detail (null or older than synced_at)
  const processedContactIds = new Set(itemsToProcess.map((i) => i.id));
  const { data: missingContactDetailRows } = await supabase
    .from("contacts")
    .select("id")
    .is("detail_synced_at", null)
    .limit(10000);
  const missingContactIds = (missingContactDetailRows ?? []).map((r: { id: number }) => r.id);
  const contactDetailIds = [...new Set([...processedContactIds, ...missingContactIds])];

  if (contactDetailIds.length > 0) {
    onProgress?.({ phase: "detailing", processed: 0, total: contactDetailIds.length, created: result.created, updated: result.updated });

    const details = await fetchDetailsBatch(
      contactDetailIds,
      fetchContact,
      2,
      (done) => {
        if (done % 10 === 0 || done === contactDetailIds.length) {
          onProgress?.({ phase: "detailing", processed: done, total: contactDetailIds.length, created: result.created, updated: result.updated });
        }
      },
      result.errors,
      "contact",
    );

    for (const [id, detail] of details) {
      const { error } = await supabase
        .from("contacts")
        .update({
          tags: detail.tags ?? [],
          notes: detail.notes ?? [],
          recent_transactions: detail.recent_transactions ?? [],
          recent_activities: detail.recent_activities ?? [],
          detail_synced_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) result.errors.push(`contact detail ${id}: ${error.message}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

export async function syncAll(
  mode: SyncMode = "full",
  onProgress?: (entity: string, progress: SyncProgress) => void,
  updatedSince?: string,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const makeOpts = (entity: string): SyncOptions => ({
    mode,
    updatedSince,
    onProgress: onProgress ? (p) => onProgress(entity, p) : undefined,
  });
  results.push(await syncArtworks(makeOpts("artworks")));
  results.push(await syncArtists(makeOpts("artists")));
  results.push(await syncContacts(makeOpts("contacts")));
  return results;
}
