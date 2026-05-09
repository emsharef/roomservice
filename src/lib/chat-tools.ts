import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchContactLists,
  fetchContactListMembers,
  fetchAllPages,
  createContactList,
  deleteContactList,
  addContactsToList,
  removeContactsFromList,
  type ContactUpdateRequest,
} from "@/lib/arternal";
import { updateContactAndSync } from "@/lib/contacts";

// ---------------------------------------------------------------------------
// Tool definitions (Claude tool_use format)
// ---------------------------------------------------------------------------

export const CHAT_TOOLS = [
  {
    name: "search_artworks",
    description:
      "Search artworks in the gallery inventory. Use this to find artworks by text query, artist name, medium, price range, status, or style/subject/mood tags. Returns up to 20 results with key metadata.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by title, catalog number, or artist name. The query is matched against each field individually — do not combine title and artist name in one query. To filter by artist, use the artist_name param." },
        artist_name: { type: "string", description: "Filter by artist name (partial match)" },
        medium: { type: "string", description: "Filter by medium (e.g., 'oil on canvas', 'bronze')" },
        min_price: { type: "number", description: "Minimum price in USD" },
        max_price: { type: "number", description: "Maximum price in USD" },
        min_year: { type: "number", description: "Minimum year (e.g., 2020)" },
        max_year: { type: "number", description: "Maximum year (e.g., 2025)" },
        status: { type: "string", enum: ["available", "sold", "hold", "nfs"], description: "Filter by availability status" },
        style_tags: { type: "array", items: { type: "string" }, description: "Filter by style tags (e.g., 'abstract', 'figurative')" },
        subject_tags: { type: "array", items: { type: "string" }, description: "Filter by subject tags (e.g., 'landscape', 'portrait')" },
        mood_tags: { type: "array", items: { type: "string" }, description: "Filter by mood tags (e.g., 'contemplative', 'vibrant')" },
        limit: { type: "number", description: "Max results to return (default 10, max 20)" },
      },
      required: [],
    },
  },
  {
    name: "search_contacts",
    description:
      "Search contacts and collectors in the CRM. Use this to find people by name, company, location, tags, art preferences, or contact list membership. Use list_contact_lists first to discover available lists, then pass a list_id here to filter by list. Returns contact info plus enriched collector profile data.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by name or company" },
        type: { type: "string", description: "Contact type filter" },
        location: { type: "string", description: "Filter by city, state, or country" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by CRM tags" },
        style_preferences: { type: "array", items: { type: "string" }, description: "Filter by collector style preferences (e.g., 'abstract', 'figurative')" },
        subject_preferences: { type: "array", items: { type: "string" }, description: "Filter by collector subject preferences" },
        list_id: { type: "string", description: "Filter by Arternal contact list ID. Use list_contact_lists tool first to find available list IDs." },
        limit: { type: "number", description: "Max results (default 10, max 20)" },
      },
      required: [],
    },
  },
  {
    name: "search_artists",
    description:
      "Search artists represented by the gallery. Use this to find artists by name, country, or the style/subject tags of their works.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by artist name" },
        country: { type: "string", description: "Filter by country" },
        style_tags: { type: "array", items: { type: "string" }, description: "Filter by style tags from their works" },
        limit: { type: "number", description: "Max results (default 10, max 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_record",
    description:
      "Fetch full detail for a specific artwork, artist, or contact by ID. Use this when you need complete information about a specific record — enrichment data, related records, transaction history, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["artwork", "artist", "contact"], description: "Record type" },
        id: { type: "string", description: "Record ID" },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "find_matches",
    description:
      "Find cross-entity matches based on taste/style overlap. E.g., find collectors who would like a specific artist, or artworks that match a collector's preferences. Uses tag overlap and preference matching.",
    input_schema: {
      type: "object" as const,
      properties: {
        source_type: { type: "string", enum: ["artist", "artwork", "contact"], description: "Type of the source record" },
        source_id: { type: "string", description: "ID of the source record" },
        target_type: { type: "string", enum: ["artist", "artwork", "contact"], description: "Type of records to match against" },
        limit: { type: "number", description: "Max matches (default 10)" },
      },
      required: ["source_type", "source_id", "target_type"],
    },
  },
  {
    name: "find_similar_artworks",
    description:
      "Find artworks visually or conceptually similar to a given artwork using AI embeddings. Use 'clip' for visual similarity (similar looking) or 'description' for conceptual similarity (similar themes/meaning).",
    input_schema: {
      type: "object" as const,
      properties: {
        artwork_id: { type: "string", description: "Source artwork ID" },
        embedding_type: { type: "string", enum: ["clip", "description"], description: "Type of similarity: 'clip' for visual, 'description' for conceptual" },
        status: { type: "string", enum: ["available", "sold", "hold", "nfs"], description: "Filter results by status" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["artwork_id"],
    },
  },
  {
    name: "get_stats",
    description:
      "Get aggregate statistics about gallery data. Use for questions like 'how many available works do we have?', 'what price range?', 'breakdown by medium'.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity: { type: "string", enum: ["artworks", "artists", "contacts"], description: "Which entity to get stats for" },
        group_by: { type: "string", enum: ["status", "medium", "country", "type"], description: "Optional grouping dimension" },
      },
      required: ["entity"],
    },
  },
  {
    name: "search_prospects",
    description:
      "Search prospective collectors from research batches. Prospects are people the gallery has researched as potential collectors — they may not yet be CRM contacts. Search by name, company, location, art preferences, or engagement level. Use this when users ask about prospects, leads, or potential collectors.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by name or company" },
        location: { type: "string", description: "Filter by location" },
        style_preferences: { type: "array", items: { type: "string" }, description: "Filter by art style preferences (e.g., 'abstract', 'figurative')" },
        subject_preferences: { type: "array", items: { type: "string" }, description: "Filter by subject preferences" },
        engagement_level: { type: "string", enum: ["active_collector", "casual_buyer", "institutional", "unknown"], description: "Filter by collector engagement level" },
        batch_name: { type: "string", description: "Filter by research batch name" },
        limit: { type: "number", description: "Max results (default 10, max 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_prospect",
    description:
      "Fetch full detail for a specific prospect by ID, including their research brief, art world connections, collection profile, and sources. Use this when you need the complete research profile for a prospect.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Prospect UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_contact_lists",
    description:
      "List available contact lists from the CRM. Returns list names, IDs, and member counts. Use this to discover which lists exist before filtering contacts by list membership with search_contacts.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Optional: filter lists by name" },
      },
      required: [],
    },
  },
  {
    name: "update_contact",
    description:
      "Update a contact in Arternal. This is a real write to the CRM — only use after the user has explicitly asked you to make a change. Tags and roles are additive: anything passed is added to the existing list and cannot be removed via this tool. To clear a regular field, pass an empty string. Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Contact ID (required)" },
        first_name: { type: "string", description: "Max 100 chars" },
        last_name: { type: "string", description: "Max 100 chars" },
        email: { type: "string", description: "Valid email or empty string to clear" },
        phone: { type: "string", description: "Max 50 chars" },
        website: { type: "string", description: "Valid URL" },
        company: { type: "string", description: "Max 255 chars" },
        type: { type: "string", enum: ["person", "institution", "venue"], description: "Contact type" },
        primary_street: { type: "string", description: "Max 255 chars" },
        primary_city: { type: "string", description: "Max 100 chars" },
        primary_state: { type: "string", description: "Max 100 chars" },
        primary_zip: { type: "string", description: "Max 20 chars" },
        primary_country: { type: "string", description: "Max 100 chars" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add (additive — existing tags preserved, cannot remove)" },
        roles: { type: "array", items: { type: "string" }, description: "Roles to add (additive — existing roles preserved, cannot remove)" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_contact_list",
    description:
      "Create a new contact list in Arternal. This is a real write to the CRM. Only call after the user has asked for it.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "List name (required, max 255 chars)" },
        description: { type: "string", description: "Optional description, max 1000 chars" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_contact_list",
    description:
      "Delete a contact list in Arternal (soft delete). The contacts on the list are NOT deleted, only the list itself. DESTRUCTIVE: you MUST double-check with the user before calling — quote the list name and ID and wait for explicit confirmation in the chat. Do not call this tool on the same turn the user first mentioned deletion; ask, wait for a 'yes', then call.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "Contact list ID (required). Use list_contact_lists first to find it." },
      },
      required: ["list_id"],
    },
  },
  {
    name: "add_contacts_to_list",
    description:
      "Add one or more contacts to a contact list. Idempotent — adding a contact that's already on the list is a no-op. Use list_contact_lists to find the list ID and search_contacts to find contact IDs.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "Contact list ID (required)" },
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of contact IDs to add (required, at least 1)",
        },
      },
      required: ["list_id", "contact_ids"],
    },
  },
  {
    name: "remove_contacts_from_list",
    description:
      "Remove one or more contacts from a contact list. The contacts themselves remain in the CRM, only their membership in this list is removed. Use list_contact_lists to find the list ID and search_contacts (with list_id filter) to find member IDs. DESTRUCTIVE: you MUST double-check with the user before calling — state the list name and how many contacts (and which, if a small set) will be removed, and wait for explicit confirmation in the chat. Do not call this tool on the same turn the user first mentioned removal; ask, wait for a 'yes', then call.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "Contact list ID (required)" },
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of contact IDs to remove (required, at least 1)",
        },
      },
      required: ["list_id", "contact_ids"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const admin = createAdminClient();

  switch (name) {
    case "search_artworks":
      return executeSearchArtworks(admin, input);
    case "search_contacts":
      return executeSearchContacts(admin, input);
    case "search_artists":
      return executeSearchArtists(admin, input);
    case "get_record":
      return executeGetRecord(admin, input);
    case "find_matches":
      return executeFindMatches(admin, input);
    case "find_similar_artworks":
      return executeFindSimilarArtworks(admin, input);
    case "get_stats":
      return executeGetStats(admin, input);
    case "search_prospects":
      return executeSearchProspects(admin, input);
    case "get_prospect":
      return executeGetProspect(admin, input);
    case "list_contact_lists":
      return executeListContactLists(input);
    case "update_contact":
      return executeUpdateContact(admin, input);
    case "create_contact_list":
      return executeCreateContactList(input);
    case "delete_contact_list":
      return executeDeleteContactList(input);
    case "add_contacts_to_list":
      return executeAddContactsToList(input);
    case "remove_contacts_from_list":
      return executeRemoveContactsFromList(input);
    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function executeSearchArtworks(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const limit = Math.min(Number(input.limit) || 10, 20);

  // Use keyword_search_artworks RPC if there's a text query
  if (input.query && typeof input.query === "string" && input.query.trim()) {
    const { data, error } = await admin.rpc("keyword_search_artworks", {
      search_term: input.query,
      match_count: limit,
      match_offset: 0,
      filter_status: (input.status as string) || null,
      filter_min_price: (input.min_price as number) || null,
      filter_max_price: (input.max_price as number) || null,
      filter_medium: (input.medium as string) || null,
      filter_artist_id: null,
    });

    if (error) return { result: { error: error.message }, summary: "Search failed" };

    let results = (data || []).map(formatArtworkResult);
    if (input.min_year) results = results.filter((r: any) => r.year && parseInt(r.year, 10) >= Number(input.min_year));
    if (input.max_year) results = results.filter((r: any) => r.year && parseInt(r.year, 10) <= Number(input.max_year));
    return {
      result: { count: results.length, total: data?.[0]?.total_count || results.length, artworks: results },
      summary: `Found ${results.length} artworks matching "${input.query}"`,
    };
  }

  // Otherwise, use filter-based search via search_inventory RPC
  const { data, error } = await admin.rpc("search_inventory", {
    filter_title: null,
    filter_artist: (input.artist_name as string) || null,
    filter_catalog: null,
    filter_medium: (input.medium as string) || null,
    filter_year: null,
    filter_status: (input.status as string) || null,
    sort_column: "title",
    sort_direction: "asc",
    page_size: limit,
    page_offset: 0,
  });

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  let results = (data || []).map(formatArtworkResult);

  // Apply price and year filters client-side (RPC doesn't have these params)
  if (input.min_price) results = results.filter((r: any) => r.price >= Number(input.min_price));
  if (input.max_price) results = results.filter((r: any) => r.price <= Number(input.max_price));
  if (input.min_year) results = results.filter((r: any) => r.year && parseInt(r.year, 10) >= Number(input.min_year));
  if (input.max_year) results = results.filter((r: any) => r.year && parseInt(r.year, 10) <= Number(input.max_year));

  // If tag filters specified, query artworks_extended and filter
  if (input.style_tags || input.subject_tags || input.mood_tags) {
    const artworkIds = results.map((r: any) => r.id);
    if (artworkIds.length > 0) {
      const { data: extended } = await admin
        .from("artworks_extended")
        .select("artwork_id, style_tags, subject_tags, mood_tags")
        .in("artwork_id", artworkIds);

      if (extended) {
        const extMap = new Map(extended.map((e) => [e.artwork_id, e]));
        results = results.filter((r: any) => {
          const ext = extMap.get(r.id);
          if (!ext) return false;
          if (input.style_tags && Array.isArray(input.style_tags)) {
            if (!input.style_tags.some((t: string) => ext.style_tags?.includes(t))) return false;
          }
          if (input.subject_tags && Array.isArray(input.subject_tags)) {
            if (!input.subject_tags.some((t: string) => ext.subject_tags?.includes(t))) return false;
          }
          if (input.mood_tags && Array.isArray(input.mood_tags)) {
            if (!input.mood_tags.some((t: string) => ext.mood_tags?.includes(t))) return false;
          }
          return true;
        });
      }
    }
  }

  return {
    result: { count: results.length, artworks: results },
    summary: `Found ${results.length} artworks`,
  };
}

function artworkDisplayTitle(row: any): string {
  const parts: string[] = [];
  if (row.artist_names) parts.push(row.artist_names);
  const titlePart = row.title || "Untitled";
  if (row.year) {
    parts.push(`${titlePart}, ${row.year}`);
  } else {
    parts.push(titlePart);
  }
  return parts.join(" — ");
}

function formatArtworkResult(row: any) {
  const id = row.id || row.artwork_id;
  return {
    id,
    title: row.title,
    display_title: artworkDisplayTitle(row),
    artist_names: row.artist_names || null,
    year: row.year,
    medium: row.medium,
    dimensions: row.dimensions,
    price: row.price,
    price_currency: row.price_currency,
    status: row.status || row.work_status,
    primary_image_url: row.primary_image_url,
    link: `/inventory/${id}`,
  };
}

async function executeSearchContacts(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const limit = Math.min(Number(input.limit) || 10, 20);
  const hasPreferenceFilter = (input.style_preferences && Array.isArray(input.style_preferences)) ||
    (input.subject_preferences && Array.isArray(input.subject_preferences));

  // If filtering by preferences, start from contacts_extended to avoid missing matches
  if (hasPreferenceFilter) {
    let query = admin
      .from("contacts_extended")
      .select("contact_id, style_preferences, subject_preferences, mood_preferences, engagement_level")
      .not("style_preferences", "eq", "{}");

    // Use overlaps filter for array columns
    if (input.style_preferences && Array.isArray(input.style_preferences)) {
      query = query.overlaps("style_preferences", input.style_preferences as string[]);
    }
    if (input.subject_preferences && Array.isArray(input.subject_preferences)) {
      query = query.overlaps("subject_preferences", input.subject_preferences as string[]);
    }

    const { data: extended, error: extError } = await query.limit(100);
    if (extError) return { result: { error: extError.message }, summary: "Search failed" };
    if (!extended || extended.length === 0) return { result: { count: 0, contacts: [] }, summary: "Found 0 contacts" };

    // Fetch contact details for matches
    const matchIds = extended.map((e) => e.contact_id);
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, first_name, last_name, display_name, email, company, type, tags, primary_city, primary_state, primary_country")
      .in("id", matchIds);

    const contactMap = new Map((contacts || []).map((c) => [c.id, c]));
    let results = extended.map((ext) => {
      const c = contactMap.get(ext.contact_id);
      return {
        id: ext.contact_id,
        display_name: c?.display_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unknown",
        email: c?.email,
        company: c?.company,
        location: [c?.primary_city, c?.primary_state, c?.primary_country].filter(Boolean).join(", "),
        type: c?.type,
        tags: c?.tags || [],
        style_preferences: ext.style_preferences || [],
        subject_preferences: ext.subject_preferences || [],
        mood_preferences: ext.mood_preferences || [],
        engagement_level: ext.engagement_level || null,
        link: `/contacts/${ext.contact_id}`,
      };
    });

    // Apply name/location filters if also specified
    if (input.query && typeof input.query === "string") {
      const q = input.query.toLowerCase();
      results = results.filter((c: any) => c.display_name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q));
    }
    if (input.location && typeof input.location === "string") {
      const loc = (input.location as string).toLowerCase();
      results = results.filter((c: any) => c.location.toLowerCase().includes(loc));
    }

    results = results.slice(0, limit);
    return {
      result: { count: results.length, contacts: results },
      summary: `Found ${results.length} contacts with matching preferences`,
    };
  }

  // If filtering by list, fetch member IDs from Arternal
  let filterContactIds: string[] | null = null;
  if (input.list_id && typeof input.list_id === "string") {
    try {
      const members = await fetchAllPages(
        (params) => fetchContactListMembers(input.list_id as string, params),
        {},
        100,
      );
      filterContactIds = members.map((m) => m.id);
      if (filterContactIds.length === 0) {
        return { result: { count: 0, contacts: [] }, summary: "Contact list is empty" };
      }
    } catch (e) {
      return { result: { error: `Failed to fetch contact list: ${e}` }, summary: "Failed to fetch contact list" };
    }
  }

  // Standard search via RPC (name, location, type filters)
  const { data, error } = await admin.rpc("search_contacts", {
    filter_name: (input.query as string) || null,
    filter_email: null,
    filter_company: null,
    filter_location: (input.location as string) || null,
    filter_type: (input.type as string) || null,
    filter_contact_ids: filterContactIds,
    sort_column: "last_name",
    sort_direction: "asc",
    page_size: limit,
    page_offset: 0,
  });

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  const contactIds = (data || []).map((c: any) => c.id);
  let enrichments: Record<string, any> = {};

  if (contactIds.length > 0) {
    const { data: extended } = await admin
      .from("contacts_extended")
      .select("contact_id, style_preferences, subject_preferences, mood_preferences, engagement_level")
      .in("contact_id", contactIds);

    if (extended) {
      for (const e of extended) {
        enrichments[e.contact_id] = e;
      }
    }
  }

  const results = (data || []).map((c: any) => {
    const ext = enrichments[c.id];
    return {
      id: c.id,
      display_name: c.display_name || [c.first_name, c.last_name].filter(Boolean).join(" "),
      email: c.email,
      company: c.company,
      location: [c.primary_city, c.primary_state, c.primary_country].filter(Boolean).join(", "),
      type: c.type,
      tags: c.tags || [],
      style_preferences: ext?.style_preferences || [],
      subject_preferences: ext?.subject_preferences || [],
      mood_preferences: ext?.mood_preferences || [],
      engagement_level: ext?.engagement_level || null,
      link: `/contacts/${c.id}`,
    };
  });

  return {
    result: { count: results.length, contacts: results },
    summary: `Found ${results.length} contacts`,
  };
}

async function executeSearchArtists(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const limit = Math.min(Number(input.limit) || 10, 20);

  const { data, error } = await admin.rpc("search_artists", {
    filter_name: (input.query as string) || null,
    filter_country: (input.country as string) || null,
    filter_life_dates: null,
    sort_column: "last_name",
    sort_direction: "asc",
    page_size: limit,
    page_offset: 0,
  });

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  const artistIds = (data || []).map((a: any) => a.id);
  let enrichments: Record<string, any> = {};

  if (artistIds.length > 0) {
    const { data: extended } = await admin
      .from("artists_extended")
      .select("artist_id, formatted_bio, market_context")
      .in("artist_id", artistIds);

    if (extended) {
      for (const e of extended) {
        enrichments[e.artist_id] = e;
      }
    }
  }

  const results = (data || []).map((a: any) => {
    const ext = enrichments[a.id];
    return {
      id: a.id,
      display_name: a.display_name || [a.first_name, a.last_name].filter(Boolean).join(" "),
      country: a.country,
      life_dates: a.life_dates,
      bio: (ext?.formatted_bio || a.bio || "").substring(0, 300),
      work_count: a.work_count,
      market_context: ext?.market_context || null,
      link: `/artists/${a.id}`,
    };
  });

  return {
    result: { count: results.length, artists: results },
    summary: `Found ${results.length} artists`,
  };
}

async function executeGetRecord(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const { type, id } = input;

  switch (type) {
    case "artwork": {
      const { data: artwork } = await admin
        .from("artworks")
        .select("*")
        .eq("id", id)
        .single();
      if (!artwork) return { result: { error: "Artwork not found" }, summary: "Not found" };

      const { data: extended } = await admin
        .from("artworks_extended")
        .select("ai_description, style_tags, subject_tags, mood_tags, color_palette")
        .eq("artwork_id", id)
        .single();

      const { data: artistLinks } = await admin
        .from("artwork_artists")
        .select("artist_id, display_name")
        .eq("artwork_id", id);

      const artistNames = (artistLinks || []).map((a: any) => a.display_name).join(", ");
      return {
        result: {
          ...artwork,
          display_title: artworkDisplayTitle({ title: artwork.title, artist_names: artistNames, year: artwork.year }),
          ai_analysis: extended || null,
          artists: artistLinks || [],
          link: `/inventory/${id}`,
        },
        summary: `Fetched artwork: ${artworkDisplayTitle({ title: artwork.title, artist_names: artistNames, year: artwork.year })}`,
      };
    }
    case "artist": {
      const { data: artist } = await admin
        .from("artists")
        .select("*")
        .eq("id", id)
        .single();
      if (!artist) return { result: { error: "Artist not found" }, summary: "Not found" };

      const { data: extended } = await admin
        .from("artists_extended")
        .select("formatted_bio, market_context, enrichment_brief")
        .eq("artist_id", id)
        .single();

      // Get their available works (summary)
      const { data: works } = await admin
        .from("artworks")
        .select("id, title, year, medium, price, status, primary_image_url")
        .contains("artist_ids", [id])
        .order("year", { ascending: false })
        .limit(20);

      return {
        result: {
          ...artist,
          enrichment: extended || null,
          works: works || [],
          link: `/artists/${id}`,
        },
        summary: `Fetched artist: ${artist.display_name || artist.last_name} (ID ${id})`,
      };
    }
    case "contact": {
      const { data: contact } = await admin
        .from("contacts")
        .select("*")
        .eq("id", id)
        .single();
      if (!contact) return { result: { error: "Contact not found" }, summary: "Not found" };

      const { data: extended } = await admin
        .from("contacts_extended")
        .select("collector_brief, inferred_preferences")
        .eq("contact_id", id)
        .single();

      return {
        result: {
          ...contact,
          enrichment: extended || null,
          link: `/contacts/${id}`,
        },
        summary: `Fetched contact: ${contact.display_name || contact.last_name} (ID ${id})`,
      };
    }
    default:
      return { result: { error: `Unknown type: ${type}` }, summary: "Invalid type" };
  }
}

async function executeFindMatches(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const { source_type, source_id, target_type } = input;
  const limit = Math.min(Number(input.limit) || 10, 20);

  // Get source tags
  let sourceTags: { style: string[]; subject: string[]; mood: string[] } = { style: [], subject: [], mood: [] };

  if (source_type === "artwork") {
    const { data } = await admin
      .from("artworks_extended")
      .select("style_tags, subject_tags, mood_tags")
      .eq("artwork_id", source_id)
      .single();
    if (data) {
      sourceTags = { style: data.style_tags || [], subject: data.subject_tags || [], mood: data.mood_tags || [] };
    }
  } else if (source_type === "artist") {
    // Aggregate tags from artist's works
    const { data: works } = await admin
      .from("artworks")
      .select("id")
      .contains("artist_ids", [source_id]);
    if (works && works.length > 0) {
      const { data: extended } = await admin
        .from("artworks_extended")
        .select("style_tags, subject_tags, mood_tags")
        .in("artwork_id", works.map((w) => w.id));
      if (extended) {
        const allStyle = new Set<string>();
        const allSubject = new Set<string>();
        const allMood = new Set<string>();
        for (const e of extended) {
          (e.style_tags || []).forEach((t: string) => allStyle.add(t));
          (e.subject_tags || []).forEach((t: string) => allSubject.add(t));
          (e.mood_tags || []).forEach((t: string) => allMood.add(t));
        }
        sourceTags = { style: [...allStyle], subject: [...allSubject], mood: [...allMood] };
      }
    }
  } else if (source_type === "contact") {
    const { data } = await admin
      .from("contacts_extended")
      .select("style_preferences, subject_preferences, mood_preferences")
      .eq("contact_id", source_id)
      .single();
    if (data) {
      sourceTags = {
        style: data.style_preferences || [],
        subject: data.subject_preferences || [],
        mood: data.mood_preferences || [],
      };
    }
  }

  if (sourceTags.style.length === 0 && sourceTags.subject.length === 0 && sourceTags.mood.length === 0) {
    return { result: { matches: [], note: "No tags found for source record to match against" }, summary: "No tags to match" };
  }

  // Match against targets
  if (target_type === "contact") {
    const { data: contacts } = await admin
      .from("contacts_extended")
      .select("contact_id, style_preferences, subject_preferences, mood_preferences")
      .not("style_preferences", "eq", "{}");

    if (!contacts) return { result: { matches: [] }, summary: "No enriched contacts found" };

    const scored = contacts.map((c) => {
      const styleOverlap = (c.style_preferences || []).filter((t: string) => sourceTags.style.includes(t));
      const subjectOverlap = (c.subject_preferences || []).filter((t: string) => sourceTags.subject.includes(t));
      const moodOverlap = (c.mood_preferences || []).filter((t: string) => sourceTags.mood.includes(t));
      const score = styleOverlap.length * 3 + subjectOverlap.length * 2 + moodOverlap.length;
      return { contact_id: c.contact_id, score, matching_tags: { style: styleOverlap, subject: subjectOverlap, mood: moodOverlap } };
    }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

    // Fetch contact details
    if (scored.length === 0) return { result: { matches: [] }, summary: "No matching contacts" };

    const { data: contactDetails } = await admin
      .from("contacts")
      .select("id, first_name, last_name, display_name, email, company, primary_city, primary_state")
      .in("id", scored.map((s) => s.contact_id));

    const detailMap = new Map((contactDetails || []).map((c) => [c.id, c]));
    const matches = scored.map((s) => {
      const c = detailMap.get(s.contact_id);
      return {
        id: s.contact_id,
        display_name: c?.display_name || [c?.first_name, c?.last_name].filter(Boolean).join(" "),
        email: c?.email,
        company: c?.company,
        location: [c?.primary_city, c?.primary_state].filter(Boolean).join(", "),
        score: s.score,
        matching_tags: s.matching_tags,
        link: `/contacts/${s.contact_id}`,
      };
    });

    return {
      result: { count: matches.length, matches },
      summary: `Found ${matches.length} matching contacts`,
    };
  }

  if (target_type === "artwork") {
    const { data: artworks } = await admin
      .from("artworks_extended")
      .select("artwork_id, style_tags, subject_tags, mood_tags")
      .not("style_tags", "eq", "{}");

    if (!artworks) return { result: { matches: [] }, summary: "No analyzed artworks found" };

    const scored = artworks.map((a) => {
      const styleOverlap = (a.style_tags || []).filter((t: string) => sourceTags.style.includes(t));
      const subjectOverlap = (a.subject_tags || []).filter((t: string) => sourceTags.subject.includes(t));
      const moodOverlap = (a.mood_tags || []).filter((t: string) => sourceTags.mood.includes(t));
      const score = styleOverlap.length * 3 + subjectOverlap.length * 2 + moodOverlap.length;
      return { artwork_id: a.artwork_id, score, matching_tags: { style: styleOverlap, subject: subjectOverlap, mood: moodOverlap } };
    }).filter((a) => a.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

    if (scored.length === 0) return { result: { matches: [] }, summary: "No matching artworks" };

    const { data: artworkDetails } = await admin
      .from("artworks")
      .select("id, title, year, medium, price, status, primary_image_url")
      .in("id", scored.map((s) => s.artwork_id));

    const detailMap = new Map((artworkDetails || []).map((a) => [a.id, a]));

    // Get artist names
    const { data: artistLinks } = await admin
      .from("artwork_artists")
      .select("artwork_id, display_name")
      .in("artwork_id", scored.map((s) => s.artwork_id));
    const artistMap = new Map<string, string[]>();
    for (const link of artistLinks || []) {
      if (!artistMap.has(link.artwork_id)) artistMap.set(link.artwork_id, []);
      artistMap.get(link.artwork_id)!.push(link.display_name);
    }

    const matches = scored.map((s) => {
      const a = detailMap.get(s.artwork_id);
      const artist_names = artistMap.get(s.artwork_id)?.join(", ") || null;
      return {
        id: s.artwork_id,
        title: a?.title,
        display_title: artworkDisplayTitle({ title: a?.title, artist_names, year: a?.year }),
        artist_names,
        year: a?.year,
        medium: a?.medium,
        price: a?.price,
        status: a?.status,
        score: s.score,
        matching_tags: s.matching_tags,
        link: `/inventory/${s.artwork_id}`,
      };
    });

    return {
      result: { count: matches.length, matches },
      summary: `Found ${matches.length} matching artworks`,
    };
  }

  return { result: { error: `Matching to ${target_type} not yet supported` }, summary: "Unsupported match type" };
}

async function executeFindSimilarArtworks(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const artworkId = input.artwork_id as string;
  const embeddingType = (input.embedding_type as string) || "clip";
  const embeddingCol = embeddingType === "description" ? "description_embedding" : "clip_embedding";
  const limit = Math.min(Number(input.limit) || 10, 20);

  // Get source embedding
  const { data: source } = await admin
    .from("artworks_extended")
    .select(embeddingCol)
    .eq("artwork_id", artworkId)
    .single();

  if (!source || !(source as any)[embeddingCol]) {
    return { result: { error: "Source artwork has no embedding" }, summary: "No embedding found" };
  }

  const { data, error } = await admin.rpc("search_artworks", {
    query_embedding: (source as any)[embeddingCol],
    embedding_col: embeddingCol,
    match_count: limit + 1, // +1 to exclude self
    match_offset: 0,
    filter_status: (input.status as string) || null,
    filter_min_price: null,
    filter_max_price: null,
    filter_medium: null,
    filter_artist_id: null,
  });

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  const results = (data || [])
    .filter((r: any) => (r.id || r.artwork_id) !== artworkId)
    .slice(0, limit)
    .map((r: any) => {
      const rid = r.id || r.artwork_id;
      return {
        id: rid,
        title: r.title,
        display_title: artworkDisplayTitle(r),
        artist_names: r.artist_names,
        year: r.year,
        medium: r.medium,
        price: r.price,
        status: r.status,
        similarity: r.similarity,
        primary_image_url: r.primary_image_url,
        link: `/inventory/${rid}`,
      };
    });

  return {
    result: { count: results.length, similar_artworks: results },
    summary: `Found ${results.length} similar artworks`,
  };
}

async function executeGetStats(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const entity = input.entity as string;
  const groupBy = input.group_by as string | undefined;

  const table = entity === "artworks" ? "artworks" : entity === "artists" ? "artists" : "contacts";

  if (!groupBy) {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true });

    if (entity === "artworks") {
      // Also get price range
      const { data: priceData } = await admin
        .from("artworks")
        .select("price")
        .not("price", "is", null)
        .order("price", { ascending: true });

      const prices = (priceData || []).map((p: any) => p.price).filter(Boolean);
      return {
        result: {
          total: count,
          price_range: prices.length > 0 ? { min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)] } : null,
        },
        summary: `${count} total ${entity}`,
      };
    }

    return { result: { total: count }, summary: `${count} total ${entity}` };
  }

  // Grouped stats
  if (entity === "artworks" && groupBy === "status") {
    const { data } = await admin.from("artworks").select("status");
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const s = row.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    }
    return { result: { breakdown: counts }, summary: `Artwork status breakdown` };
  }

  if (entity === "artworks" && groupBy === "medium") {
    const { data } = await admin.from("artworks").select("medium");
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const m = row.medium || "unknown";
      counts[m] = (counts[m] || 0) + 1;
    }
    // Sort by count desc, take top 20
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 20);
    return { result: { breakdown: Object.fromEntries(sorted) }, summary: `Top ${sorted.length} mediums` };
  }

  if (entity === "artists" && groupBy === "country") {
    const { data } = await admin.from("artists").select("country");
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const c = row.country || "unknown";
      counts[c] = (counts[c] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 20);
    return { result: { breakdown: Object.fromEntries(sorted) }, summary: `Artists by country` };
  }

  if (entity === "contacts" && groupBy === "type") {
    const { data } = await admin.from("contacts").select("type");
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const t = row.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return { result: { breakdown: counts }, summary: `Contacts by type` };
  }

  return { result: { error: `Unsupported group_by "${groupBy}" for ${entity}` }, summary: "Unsupported grouping" };
}

async function executeSearchProspects(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const limit = Math.min(Number(input.limit) || 10, 20);
  const hasPreferenceFilter = (input.style_preferences && Array.isArray(input.style_preferences)) ||
    (input.subject_preferences && Array.isArray(input.subject_preferences));

  let query = admin
    .from("prospects")
    .select("id, batch_id, display_name, first_name, last_name, email, phone, company, title, location, photo_url, linkedin, instagram, research_summary, confidence, style_preferences, subject_preferences, mood_preferences, known_artists, engagement_level, board_memberships, collection_mentions, status")
    .eq("status", "done");

  // Name/company search
  if (input.query && typeof input.query === "string") {
    const q = input.query.trim();
    query = query.or(`display_name.ilike.%${q}%,company.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  }

  // Location filter
  if (input.location && typeof input.location === "string") {
    query = query.ilike("location", `%${input.location}%`);
  }

  // Engagement level filter
  if (input.engagement_level && typeof input.engagement_level === "string") {
    query = query.eq("engagement_level", input.engagement_level);
  }

  // Preference filters using overlaps
  if (input.style_preferences && Array.isArray(input.style_preferences)) {
    query = query.overlaps("style_preferences", input.style_preferences as string[]);
  }
  if (input.subject_preferences && Array.isArray(input.subject_preferences)) {
    query = query.overlaps("subject_preferences", input.subject_preferences as string[]);
  }

  const { data, error } = await query.order("last_name", { ascending: true }).limit(limit);

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  // If batch_name filter, resolve batch IDs first
  let results = data || [];
  if (input.batch_name && typeof input.batch_name === "string") {
    const { data: batches } = await admin
      .from("prospect_batches")
      .select("id")
      .ilike("name", `%${input.batch_name}%`);
    const batchIds = new Set((batches || []).map((b) => b.id));
    results = results.filter((p) => batchIds.has(p.batch_id));
  }

  // Get batch names for context
  const batchIds = [...new Set(results.map((p) => p.batch_id))];
  let batchNames: Record<string, string> = {};
  if (batchIds.length > 0) {
    const { data: batches } = await admin
      .from("prospect_batches")
      .select("id, name")
      .in("id", batchIds);
    if (batches) {
      for (const b of batches) batchNames[b.id] = b.name;
    }
  }

  const formatted = results.map((p) => ({
    id: p.id,
    display_name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name,
    email: p.email,
    phone: p.phone,
    company: p.company,
    title: p.title,
    location: p.location,
    linkedin: p.linkedin,
    instagram: p.instagram,
    research_summary: p.research_summary,
    confidence: p.confidence,
    style_preferences: p.style_preferences || [],
    subject_preferences: p.subject_preferences || [],
    mood_preferences: p.mood_preferences || [],
    known_artists: p.known_artists || [],
    engagement_level: p.engagement_level,
    board_memberships: p.board_memberships || [],
    collection_mentions: p.collection_mentions || [],
    batch_name: batchNames[p.batch_id] || null,
    link: `/tools/prospects/${p.batch_id}#p-${p.id}`,
  }));

  return {
    result: { count: formatted.length, prospects: formatted },
    summary: `Found ${formatted.length} prospects${hasPreferenceFilter ? " with matching preferences" : ""}`,
  };
}

async function executeGetProspect(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const id = input.id as string;

  const { data: prospect, error } = await admin
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !prospect) return { result: { error: "Prospect not found" }, summary: "Not found" };

  // Get batch name
  const { data: batch } = await admin
    .from("prospect_batches")
    .select("name")
    .eq("id", prospect.batch_id)
    .single();

  return {
    result: {
      ...prospect,
      batch_name: batch?.name || null,
      link: `/tools/prospects/${prospect.batch_id}#p-${prospect.id}`,
    },
    summary: `Fetched prospect: ${prospect.display_name || prospect.input_name}`,
  };
}

async function executeListContactLists(
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  try {
    const response = await fetchContactLists({ limit: "100", sort: "name", order: "asc" });

    let lists = response.data.filter(
      (list) => !list.live && list.name.toLowerCase() !== "selection cart"
    );

    if (input.search && typeof input.search === "string") {
      const q = input.search.toLowerCase();
      lists = lists.filter((l) => l.name.toLowerCase().includes(q));
    }

    const results = lists.map((l) => ({
      id: l.id,
      name: l.name,
      contact_count: l.contact_count,
    }));

    return {
      result: { count: results.length, lists: results },
      summary: `Found ${results.length} contact lists`,
    };
  } catch (e) {
    return { result: { error: `Failed to fetch contact lists: ${e}` }, summary: "Failed to fetch contact lists" };
  }
}

async function executeUpdateContact(
  admin: SupabaseAdmin,
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const id = typeof input.id === "string" ? input.id : null;
  if (!id) {
    return { result: { error: "id is required" }, summary: "Missing contact id" };
  }

  // Build the update payload from the input, only including fields that were passed.
  const allowed: (keyof ContactUpdateRequest)[] = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "website",
    "company",
    "type",
    "primary_street",
    "primary_city",
    "primary_state",
    "primary_zip",
    "primary_country",
    "tags",
    "roles",
  ];
  const payload: ContactUpdateRequest = {};
  for (const key of allowed) {
    if (key in input) {
      // Type narrowing for the union type
      (payload as Record<string, unknown>)[key] = input[key];
    }
  }

  const result = await updateContactAndSync(id, payload);
  if (!result.ok) {
    return { result: { error: result.error }, summary: `Update failed: ${result.error}` };
  }

  // Return the updated contact for context
  const { data: contact } = await admin
    .from("contacts")
    .select("id, display_name, first_name, last_name, email, phone, company, type, primary_address_formatted, tags, roles")
    .eq("id", id)
    .single();

  return {
    result: { success: true, contact: contact ? { ...contact, link: `/contacts/${id}` } : null },
    summary: `Updated contact: ${contact?.display_name ?? id}`,
  };
}

async function executeCreateContactList(
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { result: { error: "name is required" }, summary: "Missing list name" };
  }
  if (name.length > 255) {
    return { result: { error: "name exceeds max length of 255" }, summary: "Name too long" };
  }
  const description = typeof input.description === "string" ? input.description : undefined;
  if (description && description.length > 1000) {
    return { result: { error: "description exceeds max length of 1000" }, summary: "Description too long" };
  }

  try {
    const created = await createContactList({ name, description });
    return {
      result: { success: true, id: created.id, name },
      summary: `Created list "${name}" (${created.id})`,
    };
  } catch (e) {
    return { result: { error: String(e) }, summary: `Failed to create list: ${e}` };
  }
}

async function executeDeleteContactList(
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const listId = typeof input.list_id === "string" ? input.list_id : null;
  if (!listId) {
    return { result: { error: "list_id is required" }, summary: "Missing list_id" };
  }

  try {
    await deleteContactList(listId);
    return { result: { success: true }, summary: `Deleted list ${listId}` };
  } catch (e) {
    return { result: { error: String(e) }, summary: `Failed to delete list: ${e}` };
  }
}

function parseContactIdsInput(input: Record<string, unknown>): string[] | string {
  const raw = input.contact_ids;
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((id) => typeof id === "string")) {
    return "contact_ids must be a non-empty array of strings";
  }
  return raw as string[];
}

async function executeAddContactsToList(
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const listId = typeof input.list_id === "string" ? input.list_id : null;
  if (!listId) {
    return { result: { error: "list_id is required" }, summary: "Missing list_id" };
  }
  const ids = parseContactIdsInput(input);
  if (typeof ids === "string") {
    return { result: { error: ids }, summary: ids };
  }

  try {
    await addContactsToList(listId, ids);
    return {
      result: { success: true, count: ids.length },
      summary: `Added ${ids.length} contact${ids.length === 1 ? "" : "s"} to list ${listId}`,
    };
  } catch (e) {
    return { result: { error: String(e) }, summary: `Failed to add to list: ${e}` };
  }
}

async function executeRemoveContactsFromList(
  input: Record<string, unknown>,
): Promise<{ result: unknown; summary: string }> {
  const listId = typeof input.list_id === "string" ? input.list_id : null;
  if (!listId) {
    return { result: { error: "list_id is required" }, summary: "Missing list_id" };
  }
  const ids = parseContactIdsInput(input);
  if (typeof ids === "string") {
    return { result: { error: ids }, summary: ids };
  }

  try {
    await removeContactsFromList(listId, ids);
    return {
      result: { success: true, count: ids.length },
      summary: `Removed ${ids.length} contact${ids.length === 1 ? "" : "s"} from list ${listId}`,
    };
  } catch (e) {
    return { result: { error: String(e) }, summary: `Failed to remove from list: ${e}` };
  }
}
