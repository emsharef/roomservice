import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInventory,
  fetchArtists,
  fetchContacts,
  type InventoryItem,
  type ArtistListItem,
  type ContactItem,
} from "@/lib/arternal";

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    entity,
    offset = 0,
    limit = 100,
    sort = "updated_at",
    order = "asc",
  } = body as {
    entity?: string;
    offset?: number;
    limit?: number;
    sort?: string;
    order?: string;
  };

  if (!entity || !["artworks", "artists", "contacts"].includes(entity)) {
    return NextResponse.json(
      { error: "Invalid entity type" },
      { status: 400 }
    );
  }

  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
    sort,
    order,
  };

  try {
    if (entity === "artworks") {
      const result = await fetchInventory(params);
      return await upsertArtworks(admin, result.data, result.pagination, offset, limit);
    } else if (entity === "artists") {
      const result = await fetchArtists(params);
      return await upsertArtists(admin, result.data, result.pagination, offset, limit);
    } else {
      const result = await fetchContacts(params);
      return await upsertContacts(admin, result.data, result.pagination, offset, limit);
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function upsertArtworks(
  admin: ReturnType<typeof createAdminClient>,
  items: InventoryItem[],
  pagination: { total: string; has_more: boolean },
  offset: number,
  limit: number
) {
  const { data: existingRows } = await admin
    .from("artworks")
    .select("id")
    .in("id", items.map((i) => i.id));
  const existingIds = new Set((existingRows ?? []).map((r: { id: number }) => r.id));

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    const { error } = await admin.from("artworks").upsert(
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
      { onConflict: "id" }
    );

    if (error) {
      errors.push(`artwork ${item.id}: ${error.message}`);
      continue;
    }

    if (existingIds.has(item.id)) {
      updated++;
    } else {
      created++;
    }

    // Upsert artwork_artists junction
    for (const artist of item.artists) {
      await admin.from("artwork_artists").upsert(
        { artwork_id: item.id, artist_id: artist.id, display_name: artist.display_name },
        { onConflict: "artwork_id,artist_id" }
      );
    }

    // Ensure artworks_extended row exists
    await admin
      .from("artworks_extended")
      .upsert({ artwork_id: item.id }, { onConflict: "artwork_id", ignoreDuplicates: true });
  }

  return NextResponse.json({
    processed: items.length,
    created,
    updated,
    total: parseInt(pagination.total, 10),
    hasMore: pagination.has_more,
    nextOffset: offset + limit,
    errors,
  });
}

async function upsertArtists(
  admin: ReturnType<typeof createAdminClient>,
  items: ArtistListItem[],
  pagination: { total: string; has_more: boolean },
  offset: number,
  limit: number
) {
  const { data: existingRows } = await admin
    .from("artists")
    .select("id")
    .in("id", items.map((i) => i.id));
  const existingIds = new Set((existingRows ?? []).map((r: { id: number }) => r.id));

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    const { error } = await admin.from("artists").upsert(
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
      { onConflict: "id" }
    );

    if (error) {
      errors.push(`artist ${item.id}: ${error.message}`);
      continue;
    }

    if (existingIds.has(item.id)) {
      updated++;
    } else {
      created++;
    }

    await admin
      .from("artists_extended")
      .upsert({ artist_id: item.id }, { onConflict: "artist_id", ignoreDuplicates: true });
  }

  return NextResponse.json({
    processed: items.length,
    created,
    updated,
    total: parseInt(pagination.total, 10),
    hasMore: pagination.has_more,
    nextOffset: offset + limit,
    errors,
  });
}

async function upsertContacts(
  admin: ReturnType<typeof createAdminClient>,
  items: ContactItem[],
  pagination: { total: string; has_more: boolean },
  offset: number,
  limit: number
) {
  const { data: existingRows } = await admin
    .from("contacts")
    .select("id")
    .in("id", items.map((i) => i.id));
  const existingIds = new Set((existingRows ?? []).map((r: { id: number }) => r.id));

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    const { error } = await admin.from("contacts").upsert(
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
      { onConflict: "id" }
    );

    if (error) {
      errors.push(`contact ${item.id}: ${error.message}`);
      continue;
    }

    if (existingIds.has(item.id)) {
      updated++;
    } else {
      created++;
    }

    await admin
      .from("contacts_extended")
      .upsert({ contact_id: item.id }, { onConflict: "contact_id", ignoreDuplicates: true });
  }

  return NextResponse.json({
    processed: items.length,
    created,
    updated,
    total: parseInt(pagination.total, 10),
    hasMore: pagination.has_more,
    nextOffset: offset + limit,
    errors,
  });
}
