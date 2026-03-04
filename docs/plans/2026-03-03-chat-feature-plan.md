# Chat Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a conversational AI chat interface that lets gallery staff query Room Service data in natural language using Claude with tool use.

**Architecture:** Next.js API route runs an agentic tool-use loop — Claude receives conversation + 7 tool definitions, decides which to call, server executes against Supabase, streams results + final response to client via SSE. Conversations persisted in two new DB tables.

**Tech Stack:** Next.js 15, Anthropic SDK (claude-sonnet-4-6 + claude-haiku-4-5), Supabase (PostgreSQL), SSE streaming, React 19, Tailwind CSS 4.

---

### Task 1: Create database tables

**Files:**
- Reference: `docs/plans/2026-03-03-chat-feature-design.md`

**Step 1: Run SQL migration**

Connect to Supabase SQL editor (or `psql $SUPABASE_DB_URL`) and run:

```sql
CREATE TABLE chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  created_by uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES chat_conversations(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool_call', 'tool_result')),
  content text NOT NULL,
  tool_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(created_by, updated_at DESC);
```

**Step 2: Verify**

Run: `psql $SUPABASE_DB_URL -c "\d chat_conversations"` and `\d chat_messages` — confirm columns and types match.

**Step 3: Commit** (nothing to commit — DB-only change)

---

### Task 2: Create chat tools library

**Files:**
- Create: `src/lib/chat-tools.ts`
- Reference: `src/lib/search.ts` (for search patterns)
- Reference: `src/lib/supabase/admin.ts` (for DB access)

This file defines the 7 tool schemas for Claude and an `executeTool()` function that runs them against Supabase.

**Step 1: Create `src/lib/chat-tools.ts`**

```typescript
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

function formatArtworkResult(row: any) {
  return {
    id: row.id,
    title: row.title,
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

  // Fetch enrichment data for matching contacts
  if (contactIds.length > 0) {
    const { data: extended } = await admin
      .from("contacts_extended")
      .select("contact_id, collector_brief, inferred_preferences")
      .in("contact_id", contactIds);

    if (extended) {
      for (const e of extended) {
        enrichments[e.contact_id] = e;
      }
    }
  }

  let results = (data || []).map((c: any) => {
    const ext = enrichments[c.id];
    const prefs = ext?.inferred_preferences || {};
    return {
      id: c.id,
      display_name: c.display_name || [c.first_name, c.last_name].filter(Boolean).join(" "),
      email: c.email,
      company: c.company,
      location: [c.primary_city, c.primary_state, c.primary_country].filter(Boolean).join(", "),
      type: c.type,
      tags: c.tags || [],
      style_preferences: prefs.style_preferences || [],
      subject_preferences: prefs.subject_preferences || [],
      mood_preferences: prefs.mood_preferences || [],
      engagement_level: prefs.engagement_level || null,
      link: `/contacts/${c.id}`,
    };
  });

  // Filter by preference tags if specified
  if (input.style_preferences && Array.isArray(input.style_preferences)) {
    results = results.filter((c: any) =>
      input.style_preferences!.some((t: string) => c.style_preferences.includes(t)),
    );
  }
  if (input.subject_preferences && Array.isArray(input.subject_preferences)) {
    results = results.filter((c: any) =>
      input.subject_preferences!.some((t: string) => c.subject_preferences.includes(t)),
    );
  }

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

      return {
        result: {
          ...artwork,
          ai_analysis: extended || null,
          artists: artistLinks || [],
          link: `/inventory/${id}`,
        },
        summary: `Fetched artwork: ${artwork.title || "Untitled"} (ID ${id})`,
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
      .select("inferred_preferences")
      .eq("contact_id", source_id)
      .single();
    if (data?.inferred_preferences) {
      const prefs = data.inferred_preferences;
      sourceTags = {
        style: prefs.style_preferences || [],
        subject: prefs.subject_preferences || [],
        mood: prefs.mood_preferences || [],
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
      .select("contact_id, inferred_preferences")
      .not("inferred_preferences", "is", null);

    if (!contacts) return { result: { matches: [] }, summary: "No enriched contacts found" };

    const scored = contacts.map((c) => {
      const prefs = c.inferred_preferences || {};
      const styleOverlap = (prefs.style_preferences || []).filter((t: string) => sourceTags.style.includes(t));
      const subjectOverlap = (prefs.subject_preferences || []).filter((t: string) => sourceTags.subject.includes(t));
      const moodOverlap = (prefs.mood_preferences || []).filter((t: string) => sourceTags.mood.includes(t));
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
      return {
        id: s.artwork_id,
        title: a?.title,
        artist_names: artistMap.get(s.artwork_id)?.join(", ") || null,
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

  if (!source || !source[embeddingCol]) {
    return { result: { error: "Source artwork has no embedding" }, summary: "No embedding found" };
  }

  const { data, error } = await admin.rpc("search_artworks", {
    query_embedding: source[embeddingCol],
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
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty` — should pass with no errors.

**Step 3: Commit**

```bash
git add src/lib/chat-tools.ts
git commit -m "Add chat tools library with 7 tool definitions and executors"
```

---

### Task 3: Create streaming chat API route

**Files:**
- Create: `src/app/api/chat/route.ts`
- Reference: `src/app/api/sync/route.ts` (SSE pattern)
- Reference: `src/lib/chat-tools.ts` (tools)

This is the core endpoint — the agentic tool-use loop with SSE streaming.

**Step 1: Create `src/app/api/chat/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, executeTool } from "@/lib/chat-tools";

export const maxDuration = 300;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Make Room Los Angeles, a contemporary art gallery. You help gallery staff research artworks, artists, and collectors using the gallery's CRM data.

Gallery overview:
- ~2,200 artworks in inventory across various mediums and price points
- ~240 represented artists
- ~4,000 contacts including collectors, curators, and art professionals

You have tools to search and query the gallery database. Use them to answer questions with specific data rather than general knowledge. When referencing records, always include links in the format [Name](/inventory/ID), [Name](/artists/ID), or [Name](/contacts/ID).

Be concise and gallery-professional. When presenting search results, summarize the key findings rather than listing every field. Highlight what's most relevant to the question asked.`;

// POST — send message and stream response
export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { conversationId, message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream closed
        }
      }

      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);

      try {
        // Get or create conversation
        let convId = conversationId;
        if (!convId) {
          const { data: conv, error: convError } = await admin
            .from("chat_conversations")
            .insert({ created_by: user.id })
            .select("id")
            .single();
          if (convError || !conv) throw new Error("Failed to create conversation");
          convId = conv.id;
        } else {
          // Update timestamp
          await admin
            .from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId);
        }

        send({ type: "conversation_id", conversationId: convId });

        // Save user message
        await admin.from("chat_messages").insert({
          conversation_id: convId,
          role: "user",
          content: message.trim(),
        });

        // Load conversation history (last 50 messages, user + assistant only for Claude)
        const { data: history } = await admin
          .from("chat_messages")
          .select("role, content, tool_data")
          .eq("conversation_id", convId)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true })
          .limit(50);

        // Build messages array for Claude
        const messages: Anthropic.MessageParam[] = (history || []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Agentic tool-use loop
        let loopMessages = [...messages];
        let maxLoops = 10;

        while (maxLoops-- > 0) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: CHAT_TOOLS,
            messages: loopMessages,
          });

          // Check for tool use
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          const textBlocks = response.content.filter(
            (b): b is Anthropic.TextBlock => b.type === "text",
          );

          if (toolUseBlocks.length > 0) {
            // Process tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const toolCall of toolUseBlocks) {
              send({ type: "status", text: `Using ${toolCall.name}...` });

              const { result, summary } = await executeTool(
                toolCall.name,
                toolCall.input as Record<string, unknown>,
              );

              // Save tool call + result to DB
              await admin.from("chat_messages").insert({
                conversation_id: convId,
                role: "tool_call",
                content: summary,
                tool_data: { name: toolCall.name, input: toolCall.input, result },
              });

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolCall.id,
                content: JSON.stringify(result),
              });

              send({ type: "tool_result", tool: toolCall.name, summary });
            }

            // Continue the loop with tool results
            loopMessages = [
              ...loopMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ];

            continue;
          }

          // Final text response — stream it
          const finalText = textBlocks.map((b) => b.text).join("\n");

          if (finalText) {
            // Save assistant message
            await admin.from("chat_messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: finalText,
            });

            send({ type: "assistant", content: finalText });
          }

          // Auto-title: if this is the first exchange (no title yet)
          const { data: conv } = await admin
            .from("chat_conversations")
            .select("title")
            .eq("id", convId)
            .single();

          if (!conv?.title) {
            try {
              const titleResponse = await anthropic.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 30,
                messages: [
                  {
                    role: "user",
                    content: `Summarize this conversation in 3-5 words as a short title (no quotes, no punctuation):\n\nUser: ${message}\nAssistant: ${finalText.substring(0, 200)}`,
                  },
                ],
              });
              const title = (titleResponse.content[0] as Anthropic.TextBlock)?.text?.trim();
              if (title) {
                await admin
                  .from("chat_conversations")
                  .update({ title })
                  .eq("id", convId);
                send({ type: "title", title });
              }
            } catch {
              // Non-critical — skip titling
            }
          }

          break; // Exit loop — we got a final response
        }

        clearInterval(heartbeat);
        send({ type: "done" });
        controller.close();
      } catch (e) {
        clearInterval(heartbeat);
        send({ type: "error", error: String(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// GET — list conversations for current user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();
  const { data: conversations, error } = await admin
    .from("chat_conversations")
    .select("id, title, updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ conversations: conversations || [] }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty` — should pass.

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "Add streaming chat API with agentic tool-use loop"
```

---

### Task 4: Create conversation detail/delete API route

**Files:**
- Create: `src/app/api/chat/[id]/route.ts`

**Step 1: Create `src/app/api/chat/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — load conversation messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: conversation } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch messages
  const { data: messages, error } = await admin
    .from("chat_messages")
    .select("id, role, content, tool_data, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation, messages: messages || [] });
}

// DELETE — delete conversation and messages (cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: conversation } = await admin
    .from("chat_conversations")
    .select("id")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Messages cascade-deleted via FK constraint
  await admin.from("chat_conversations").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty`

**Step 3: Commit**

```bash
git add src/app/api/chat/[id]/route.ts
git commit -m "Add conversation detail and delete API routes"
```

---

### Task 5: Create chat frontend — page layout and conversation list

**Files:**
- Create: `src/app/chat/layout.tsx`
- Create: `src/app/chat/page.tsx`

**Step 1: Create `src/app/chat/layout.tsx`**

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    redirect("/");
  }

  return <>{children}</>;
}
```

**Step 2: Create `src/app/chat/page.tsx`**

```typescript
import ChatPage from "./ChatPage";

export default function ChatRoute() {
  return <ChatPage />;
}
```

**Step 3: Verify**

Run: `npx tsc --noEmit --pretty`

**Step 4: Commit**

```bash
git add src/app/chat/layout.tsx src/app/chat/page.tsx
git commit -m "Add chat page route with auth layout"
```

---

### Task 6: Create chat frontend — ChatPage client component

**Files:**
- Create: `src/app/chat/ChatPage.tsx`

This is the main client component with sidebar (conversation list) + main chat area (messages + input). It manages conversation state, SSE streaming, and message rendering.

**Step 1: Create `src/app/chat/ChatPage.tsx`**

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  tool_data?: { name: string; input: unknown; result: unknown } | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Example queries
// ---------------------------------------------------------------------------

const EXAMPLES = [
  "Which available artworks would work for a show about nature and landscape?",
  "Find collectors who are interested in abstract art",
  "Tell me about the artists we represent from Mexico",
  "What's our price range for available works?",
];

// ---------------------------------------------------------------------------
// Markdown-lite renderer (bold, links, lists)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
  // Split into lines for list handling
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="ml-4 list-disc space-y-1">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^[-*]\s+(.+)/);
    const numListMatch = line.match(/^\d+\.\s+(.+)/);

    if (listMatch) {
      listItems.push(listMatch[1]);
    } else if (numListMatch) {
      listItems.push(numListMatch[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        elements.push(<br key={`br-${i}`} />);
      } else if (line.startsWith("### ")) {
        elements.push(
          <h4 key={`h-${i}`} className="mt-2 mb-1 font-semibold">
            {renderInline(line.slice(4))}
          </h4>,
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h3 key={`h-${i}`} className="mt-3 mb-1 text-base font-semibold">
            {renderInline(line.slice(3))}
          </h3>,
        );
      } else {
        elements.push(
          <p key={`p-${i}`}>{renderInline(line)}</p>,
        );
      }
    }
  }
  flushList();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Handle bold, links, and inline code
  const parts: React.ReactNode[] = [];
  // Regex: markdown links [text](url) or **bold** or `code`
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      // Link
      const href = match[2];
      const isInternal = href.startsWith("/");
      parts.push(
        isInternal ? (
          <Link
            key={match.index}
            href={href}
            className="text-blue-600 underline hover:text-blue-800"
          >
            {match[1]}
          </Link>
        ) : (
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {match[1]}
          </a>
        ),
      );
    } else if (match[3]) {
      // Bold
      parts.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4]) {
      // Code
      parts.push(
        <code key={match.index} className="rounded bg-gray-100 px-1 py-0.5 text-sm">
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatPage() {
  // Conversation list
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConvId]);

  async function fetchConversations() {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // ignore
    }
    setLoadingConvs(false);
  }

  async function loadConversation(convId: string) {
    setActiveConvId(convId);
    setMessages([]);
    setToolStatuses([]);

    try {
      const res = await fetch(`/api/chat/${convId}`);
      if (res.ok) {
        const data = await res.json();
        // Only show user + assistant messages, filter out tool_call/tool_result
        const visible = (data.messages || []).filter(
          (m: Message) => m.role === "user" || m.role === "assistant",
        );
        setMessages(visible);
      }
    } catch {
      // ignore
    }
  }

  function startNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setToolStatuses([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function deleteConversation(convId: string) {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/chat/${convId}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      startNewChat();
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setStreaming(true);
      setStatusText(null);
      setToolStatuses([]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConvId, message: text.trim() }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "conversation_id":
                  setActiveConvId(data.conversationId);
                  break;

                case "status":
                  setStatusText(data.text);
                  break;

                case "tool_result":
                  setToolStatuses((prev) => [...prev, data.summary]);
                  setStatusText(null);
                  break;

                case "assistant":
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.content },
                  ]);
                  setStatusText(null);
                  break;

                case "title":
                  // Update conversation title in sidebar
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === activeConvId || !activeConvId
                        ? { ...c, title: data.title }
                        : c,
                    ),
                  );
                  break;

                case "error":
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: `Error: ${data.error}` },
                  ]);
                  break;

                case "done":
                  break;
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        // Refresh conversations list (new conversation may have been created)
        fetchConversations();
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${String(e)}` },
        ]);
      }

      setStreaming(false);
      setStatusText(null);
    },
    [activeConvId, streaming],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ------ Render ------

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <div className="flex w-72 flex-col border-r border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Conversations</h2>
          <button
            onClick={startNewChat}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
          >
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-gray-100 ${
                  activeConvId === conv.id ? "bg-white shadow-sm" : ""
                }`}
                onClick={() => loadConversation(conv.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {conv.title || "Untitled"}
                  </p>
                  <p className="text-xs text-gray-400">{relativeTime(conv.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="ml-2 hidden rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 group-hover:block"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {messages.length === 0 && !activeConvId ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center px-8">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Room Service Chat</h1>
            <p className="mb-8 text-sm text-gray-500">
              Ask questions about artworks, artists, and collectors in your gallery.
            </p>
            <div className="grid max-w-2xl grid-cols-2 gap-3">
              {EXAMPLES.map((example, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(example);
                    sendMessage(example);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                  </div>
                </div>
              ))}

              {/* Tool status indicators */}
              {toolStatuses.length > 0 && (
                <div className="flex justify-start">
                  <div className="text-xs italic text-gray-400">
                    {toolStatuses.map((s, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Streaming status */}
              {streaming && statusText && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 text-xs italic text-gray-400">
                    <Spinner className="h-3 w-3" />
                    {statusText}
                  </div>
                </div>
              )}

              {/* Streaming indicator (no specific status) */}
              {streaming && !statusText && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-400">
                    <Spinner className="h-3.5 w-3.5" />
                    Thinking...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about artworks, artists, or collectors..."
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "120px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-xs text-gray-400">
            Cmd+Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty`

**Step 3: Verify visually**

Run: `npm run dev -- -p 3002` and navigate to `http://localhost:3002/chat`. Confirm:
- Sidebar shows "Conversations" header + "New Chat" button
- Empty state shows example query cards
- Clicking an example sends a message and streams a response

**Step 4: Commit**

```bash
git add src/app/chat/ChatPage.tsx
git commit -m "Add ChatPage client component with sidebar, streaming, markdown rendering"
```

---

### Task 7: Add Chat to navigation

**Files:**
- Modify: `src/components/Nav.tsx`

**Step 1: Add Chat link to navLinks array**

In `src/components/Nav.tsx`, find the `navLinks` array (around line 9) and add the Chat entry:

```typescript
const navLinks = [
  { href: "/inventory", label: "Inventory" },
  { href: "/artists", label: "Artists" },
  { href: "/contacts", label: "Contacts" },
  { href: "/search", label: "Discover" },
  { href: "/chat", label: "Chat" },
  { href: "/tools", label: "Tools" },
  { href: "/admin", label: "Admin" },
];
```

**Step 2: Verify**

Run: `npm run dev -- -p 3002` — confirm "Chat" appears in the top nav between "Discover" and "Tools".

**Step 3: Commit**

```bash
git add src/components/Nav.tsx
git commit -m "Add Chat to main navigation"
```

---

### Task 8: End-to-end test

No files to create — this is a manual verification task.

**Step 1: Create database tables** (if not done in Task 1)

**Step 2: Start dev server**

Run: `npm run dev -- -p 3002`

**Step 3: Test the full flow**

1. Navigate to `http://localhost:3002/chat`
2. Confirm empty state with example queries
3. Click "Which available artworks would work for a show about nature and landscape?"
4. Watch for: tool status messages, then streamed assistant response with artwork links
5. Confirm conversation appears in sidebar with auto-generated title
6. Send a follow-up message in the same conversation
7. Click "New Chat", send a different query
8. Switch between conversations — messages should persist
9. Delete a conversation

**Step 4: Test specific tool use**

- "How many available works do we have?" → should use get_stats
- "Tell me about [specific artist name]" → should use search_artists then get_record
- "Which collectors would like [artist name]'s work?" → should use find_matches
- "Find works similar to artwork ID 123" → should use find_similar_artworks

**Step 5: Commit** (if any fixes needed)

```bash
git add -A
git commit -m "Fix issues found during end-to-end testing"
```

---

## Files Summary

| File | Action |
|------|--------|
| Database | CREATE TABLE chat_conversations, chat_messages |
| `src/lib/chat-tools.ts` | Create — 7 tool definitions + executeTool() |
| `src/app/api/chat/route.ts` | Create — POST (streaming agentic loop) + GET (list conversations) |
| `src/app/api/chat/[id]/route.ts` | Create — GET (load messages) + DELETE |
| `src/app/chat/layout.tsx` | Create — Auth guard |
| `src/app/chat/page.tsx` | Create — Route entry |
| `src/app/chat/ChatPage.tsx` | Create — Client component (sidebar + chat thread + input + streaming) |
| `src/components/Nav.tsx` | Modify — Add Chat link |
