import { createAdminClient } from "@/lib/supabase/admin";

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
        query: { type: "string", description: "Free text search across title, catalog number, artist name" },
        artist_name: { type: "string", description: "Filter by artist name (partial match)" },
        medium: { type: "string", description: "Filter by medium (e.g., 'oil on canvas', 'bronze')" },
        min_price: { type: "number", description: "Minimum price in USD" },
        max_price: { type: "number", description: "Maximum price in USD" },
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
      "Search contacts and collectors in the CRM. Use this to find people by name, company, location, tags, or art preferences. Returns contact info plus enriched collector profile data.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by name or company" },
        type: { type: "string", description: "Contact type filter" },
        location: { type: "string", description: "Filter by city, state, or country" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by CRM tags" },
        style_preferences: { type: "array", items: { type: "string" }, description: "Filter by collector style preferences (e.g., 'abstract', 'figurative')" },
        subject_preferences: { type: "array", items: { type: "string" }, description: "Filter by collector subject preferences" },
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
        id: { type: "number", description: "Record ID" },
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
        source_id: { type: "number", description: "ID of the source record" },
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
        artwork_id: { type: "number", description: "Source artwork ID" },
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

    const results = (data || []).map(formatArtworkResult);
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

  // Apply price filters client-side if needed (RPC doesn't have price params)
  if (input.min_price) results = results.filter((r: any) => r.price >= Number(input.min_price));
  if (input.max_price) results = results.filter((r: any) => r.price <= Number(input.max_price));

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
  return {
    id: row.id,
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
    link: `/inventory/${row.id}`,
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

  // Standard search via RPC (name, location, type filters)
  const { data, error } = await admin.rpc("search_contacts", {
    filter_name: (input.query as string) || null,
    filter_email: null,
    filter_company: null,
    filter_location: (input.location as string) || null,
    filter_type: (input.type as string) || null,
    sort_column: "last_name",
    sort_direction: "asc",
    page_size: limit,
    page_offset: 0,
  });

  if (error) return { result: { error: error.message }, summary: "Search failed" };

  const contactIds = (data || []).map((c: any) => c.id);
  let enrichments: Record<number, any> = {};

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
  let enrichments: Record<number, any> = {};

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
        .contains("artist_ids", [Number(id)])
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
      .contains("artist_ids", [Number(source_id)]);
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
    const artistMap = new Map<number, string[]>();
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
  const artworkId = Number(input.artwork_id);
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
    .filter((r: any) => r.id !== artworkId)
    .slice(0, limit)
    .map((r: any) => ({
      id: r.id,
      title: r.title,
      display_title: artworkDisplayTitle(r),
      artist_names: r.artist_names,
      year: r.year,
      medium: r.medium,
      price: r.price,
      status: r.status,
      similarity: r.similarity,
      primary_image_url: r.primary_image_url,
      link: `/inventory/${r.id}`,
    }));

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
