import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

const anthropic = new Anthropic();

const GALLERY_NAME = "Make Room Los Angeles";

// Canonical tag vocabularies — must match vision.ts artwork analysis tags
const STYLE_TAGS = [
  "abstract", "figurative", "expressionist", "surrealist", "painterly",
  "conceptual", "minimalist", "mixed-media", "photorealistic", "sculptural",
  "geometric", "assemblage", "organic", "atmospheric", "hyperrealist",
  "documentary", "impressionist", "narrative", "decorative", "lyrical abstraction",
  "realist", "textural", "pop art", "monochromatic", "gestural",
  "process-based", "collage", "installation", "digital", "folk art",
];

const SUBJECT_TAGS = [
  "figure", "nature", "still life", "portrait", "landscape",
  "interior", "body", "architectural", "floral", "botanical",
  "urban", "sculpture", "organic forms", "seascape", "symbolic",
  "pattern", "identity", "animal", "mythology", "domestic",
  "abstract form", "fashion", "nude", "celestial", "political",
  "narrative", "industrial", "food", "religious", "textile",
];

const MOOD_TAGS = [
  "contemplative", "mysterious", "intimate", "dramatic", "somber",
  "serene", "vibrant", "energetic", "unsettling", "melancholic",
  "dreamlike", "playful", "uncanny", "ethereal", "nostalgic",
  "meditative", "visceral", "vulnerable", "whimsical", "provocative",
  "intense", "hypnotic", "introspective", "otherworldly", "confrontational",
];

export interface CollectorEnrichment {
  summary: string;
  professional: {
    current_role: string;
    career_highlights: string[];
    industry: string;
  };
  art_world: {
    board_memberships: string[];
    collection_mentions: string[];
    art_events: string[];
    advisory_roles: string[];
  };
  philanthropy: {
    foundations: string[];
    board_seats: string[];
    notable_giving: string[];
  };
  social_presence: {
    linkedin: string;
    instagram: string;
    other: string[];
  };
  collection_profile: {
    known_artists: string[];
    style_preferences: string[];
    subject_preferences: string[];
    mood_preferences: string[];
    engagement_level:
      | "active_collector"
      | "casual_buyer"
      | "institutional"
      | "unknown";
  };
  sources: Array<{
    url: string;
    title: string;
    relevance: string;
  }>;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** Fetch the gallery's top artists by work count for prompt context */
async function getGalleryArtists(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: artists } = await admin
    .from("artists")
    .select("display_name")
    .order("work_count", { ascending: false })
    .limit(30);
  return artists?.map((a) => a.display_name).filter(Boolean) ?? [];
}

/** Build the enrichment prompt for a collector contact */
function buildPrompt(
  contact: {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    type: string | null;
    primary_city: string | null;
    primary_state: string | null;
    primary_country: string | null;
    primary_address_formatted: string | null;
    tags: string[] | null;
    notes: string[] | null;
    recent_transactions: Array<{
      title: string;
      total_price: string;
      status: string | null;
      created_at: string;
    }> | null;
  },
  galleryArtists: string[],
): string {
  const location = [
    contact.primary_city,
    contact.primary_state,
    contact.primary_country,
  ]
    .filter(Boolean)
    .join(", ") ||
    contact.primary_address_formatted ||
    "Unknown";

  const tags = contact.tags?.length ? contact.tags.join(", ") : "None";
  const notes = contact.notes?.length ? contact.notes.join("; ") : "None";

  const txSummary =
    contact.recent_transactions?.length
      ? contact.recent_transactions
          .map(
            (t) =>
              `${t.title} — $${(Number(t.total_price) / 100).toLocaleString()} (${new Date(t.created_at).toLocaleDateString()})`,
          )
          .join("\n  ")
      : "None";

  const invoiceCount =
    contact.recent_transactions?.filter(
      (t) =>
        t.title.toLowerCase().includes("invoice") ||
        /^M\d/.test(t.title) ||
        /^C1\d/.test(t.title) ||
        t.title.startsWith("PRM-"),
    ).length ?? 0;

  return `You are a research assistant for an art gallery called "${GALLERY_NAME}".
Your task is to research a collector/contact and compile a brief profile using ONLY publicly available information.

## Contact Information (from our CRM)
- **Name:** ${contact.display_name}
- **Location:** ${location}
- **Company/Role:** ${contact.company || "Unknown"}${contact.type ? ` (${contact.type})` : ""}
- **CRM tags:** ${tags}
- **CRM notes:** ${notes}
- **Purchase history:** ${invoiceCount} invoice(s)
  ${txSummary}

## Gallery Context
${GALLERY_NAME} represents these artists: ${galleryArtists.join(", ")}

## Research Instructions
Search for publicly available information about this person. Focus on:
1. **Professional background** — current role, career history, notable achievements
2. **Art world involvement** — board memberships (museums, art nonprofits), advisory roles, collection mentions, art fair appearances, auction activity
3. **Philanthropic activity** — foundations, major donations, nonprofit board seats
4. **Public visibility** — press mentions, social media presence, speaking engagements
5. **Collection interests** — any public mentions of what they collect, artists they support

**Privacy rules:**
- Only use publicly available information (news articles, LinkedIn, museum websites, etc.)
- Do not speculate about private wealth, net worth, or financial details beyond what is publicly reported
- Do not include private contact information found online
- If limited information is available, say so — do not fabricate

## Output Format
Return a JSON object with these fields:

{
  "summary": "2-3 sentence overview of this person relevant to the gallery relationship",
  "professional": {
    "current_role": "Their current title and company",
    "career_highlights": ["Notable career achievements or previous roles"],
    "industry": "Their primary industry"
  },
  "art_world": {
    "board_memberships": ["Museum or art org board seats — full institution name"],
    "collection_mentions": ["Any public mentions of their art collection"],
    "art_events": ["Known art fair attendance, exhibition openings, etc."],
    "advisory_roles": ["Art advisory or curatorial roles"]
  },
  "philanthropy": {
    "foundations": ["Personal or family foundations"],
    "board_seats": ["Non-art nonprofit boards"],
    "notable_giving": ["Publicly reported donations or campaigns"]
  },
  "social_presence": {
    "linkedin": "URL if found",
    "instagram": "Handle if found and relevant",
    "other": ["Other notable public profiles"]
  },
  "collection_profile": {
    "known_artists": ["Firstname Lastname"],
    "style_preferences": ["tag1", "tag2"],
    "subject_preferences": ["tag1", "tag2"],
    "mood_preferences": ["tag1", "tag2"],
    "engagement_level": "active_collector | casual_buyer | institutional | unknown"
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "What this source tells us" }
  ],
  "confidence": "high | medium | low",
  "notes": "Any caveats about the research quality or information gaps"
}

### IMPORTANT formatting rules for collection_profile:

**known_artists**: Each entry MUST be "Firstname Lastname" format only. No descriptions, no parenthetical notes, no gallery names, no prices. Just the artist's name.
  Good: ["Carrie Moyer", "Joshua Nathanson", "Maya Hayuk"]
  Bad: ["Carrie Moyer (acquired $65K work)", "Joshua Nathanson from Various Small Fires"]

**style_preferences**: MUST use tags from this list ONLY: ${STYLE_TAGS.join(", ")}
  Pick 3-8 tags that best describe the types of art this collector is drawn to, based on their known acquisitions and stated interests.

**subject_preferences**: MUST use tags from this list ONLY: ${SUBJECT_TAGS.join(", ")}
  Pick 2-6 tags that describe the subject matter this collector favors.

**mood_preferences**: MUST use tags from this list ONLY: ${MOOD_TAGS.join(", ")}
  Pick 2-5 tags that describe the mood/atmosphere of art this collector gravitates toward.

Return ONLY valid JSON, no other text.`;
}

/** Enrich a single collector contact via Claude with web search */
export async function enrichContact(
  contactId: number,
): Promise<CollectorEnrichment> {
  const admin = createAdminClient();

  // Fetch contact data
  const { data: contact, error } = await admin
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (error || !contact) {
    throw new Error(`Contact ${contactId} not found: ${error?.message}`);
  }

  // Fetch gallery artists for context
  const galleryArtists = await getGalleryArtists();

  // Build prompt
  const prompt = buildPrompt(contact, galleryArtists);

  // Call Claude with web search
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  // Extract the final text block (after tool use blocks)
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlocks[textBlocks.length - 1]?.text || "{}";

  // Extract JSON from response — Claude may include preamble text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in Claude response");
  }
  const jsonStr = jsonMatch[0];

  const enrichment: CollectorEnrichment = JSON.parse(jsonStr);

  // Validate/filter tags to canonical vocabularies
  const styleTags = new Set(STYLE_TAGS);
  const subjectTags = new Set(SUBJECT_TAGS);
  const moodTags = new Set(MOOD_TAGS);

  if (enrichment.collection_profile) {
    enrichment.collection_profile.style_preferences =
      (enrichment.collection_profile.style_preferences ?? []).filter((t) =>
        t && styleTags.has(t.toLowerCase()),
      );
    enrichment.collection_profile.subject_preferences =
      (enrichment.collection_profile.subject_preferences ?? []).filter((t) =>
        t && subjectTags.has(t.toLowerCase()),
      );
    enrichment.collection_profile.mood_preferences =
      (enrichment.collection_profile.mood_preferences ?? []).filter((t) =>
        t && moodTags.has(t.toLowerCase()),
      );

    // Clean known_artists: strip anything after the name (parenthetical notes, etc.)
    enrichment.collection_profile.known_artists =
      (enrichment.collection_profile.known_artists ?? []).map((a) =>
        a.replace(/\s*\(.*\)$/, "").trim(),
      );
  }

  return enrichment;
}

// ---------------------------------------------------------------------------
// Prospect Enrichment
// ---------------------------------------------------------------------------

export interface ProspectEnrichment {
  display_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  linkedin: string | null;
  instagram: string | null;
  other_socials: string[];
  summary: string;
  professional: {
    current_role: string;
    career_highlights: string[];
    industry: string;
  };
  art_world: {
    board_memberships: string[];
    collection_mentions: string[];
    art_events: string[];
    advisory_roles: string[];
    known_artists: string[];
  };
  philanthropy: {
    foundations: string[];
    notable_giving: string[];
  };
  collection_profile: {
    style_preferences: string[];
    subject_preferences: string[];
    mood_preferences: string[];
    engagement_level:
      | "active_collector"
      | "casual_buyer"
      | "institutional"
      | "unknown";
  };
  sources: Array<{ url: string; title: string; relevance: string }>;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** Build the enrichment prompt for a prospect */
function buildProspectPrompt(
  prospect: {
    input_name: string;
    company?: string | null;
    title?: string | null;
    location?: string | null;
  },
  batchName: string,
  galleryArtists: string[],
): string {
  const company = prospect.company || "Unknown";
  const title = prospect.title || "Unknown";
  const location = prospect.location || "Unknown";

  return `You are a research assistant for an art gallery called "${GALLERY_NAME}".
Your task is to research a prospective collector/contact and compile a detailed profile using ONLY publicly available information.

## Person to Research
- **Name:** ${prospect.input_name}
- **Company:** ${company}
- **Title:** ${title}
- **Location:** ${location}
- **Context:** This person is from a prospect list named "${batchName}"

## Gallery Context
${GALLERY_NAME} represents these artists: ${galleryArtists.join(", ")}

## Research Instructions
Search for publicly available information about this person. Focus on:

1. **Contact information** — email address, phone number, LinkedIn profile URL, Instagram handle, personal/professional website, any other social media profiles
2. **Photo** — find a headshot or profile photo URL (from LinkedIn, company page, press articles, conference speaker pages)
3. **Professional background** — current role and company, career highlights, industry
4. **Art world connections** — museum/art nonprofit board memberships, collection mentions in press, art fair/exhibition attendance, advisory or curatorial roles, artists they are known to collect or support
5. **Philanthropic activity** — personal or family foundations, notable giving or campaigns
6. **Collecting taste** — based on any public mentions of their collection, gallery relationships, auction activity, or art interests, infer their preferences

**Critical — source grounding and inline citations:**
- ONLY write about things you found in your web search results. Do not draw on background knowledge to fill gaps.
- Every claim must be traceable to a specific source you found. If you didn't find it in a source, don't include it.
- **Use numbered inline citations** like [1], [2], [3] in text fields (summary, professional.current_role, etc.). These numbers MUST correspond to the position (1-based) in YOUR "sources" array in the JSON output.
- **CRITICAL**: The highest citation number [N] in ANY text field must NOT exceed the total number of entries in your sources array. If your sources array has 8 entries, the highest citation allowed is [8]. Every source you cite MUST appear in the sources array. Double-check this before outputting.

**Privacy rules:**
- Only use publicly available information (news articles, LinkedIn, museum websites, company pages, etc.)
- Do not speculate about private wealth, net worth, or financial details beyond what is publicly reported
- Do not fabricate information — if limited information is available, say so

## Output Format
Return a JSON object matching this structure:

{
  "display_name": "Full display name as found in research",
  "first_name": "First name",
  "last_name": "Last name",
  "title": "Current job title or null",
  "company": "Current company or null",
  "location": "City, State/Country or null",
  "email": "Email address if publicly available, or null",
  "phone": "Phone number if publicly available, or null",
  "website": "Personal or professional website URL, or null",
  "photo_url": "Direct URL to an actual image file (.jpg/.png) of a headshot or profile photo — NOT a search page or gallery page. Must load in an <img> tag. null if none found.",
  "linkedin": "Full LinkedIn profile URL, or null",
  "instagram": "Instagram handle (without @), or null",
  "other_socials": ["Twitter/X URL", "Facebook URL", "other profile URLs"],
  "summary": "2-3 sentence overview of this person relevant to the gallery relationship, with inline citations [1][2]",
  "professional": {
    "current_role": "Their current title and company, with inline citation [N]",
    "career_highlights": ["Notable career achievements or previous roles"],
    "industry": "Their primary industry"
  },
  "art_world": {
    "board_memberships": ["Museum or art org board seats — full institution name"],
    "collection_mentions": ["Any public mentions of their art collection"],
    "art_events": ["Known art fair attendance, exhibition openings, etc."],
    "advisory_roles": ["Art advisory or curatorial roles"],
    "known_artists": ["Firstname Lastname"]
  },
  "philanthropy": {
    "foundations": ["Personal or family foundations"],
    "notable_giving": ["Publicly reported donations or campaigns"]
  },
  "collection_profile": {
    "style_preferences": ["tag1", "tag2"],
    "subject_preferences": ["tag1", "tag2"],
    "mood_preferences": ["tag1", "tag2"],
    "engagement_level": "active_collector | casual_buyer | institutional | unknown"
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "What this source tells us" }
  ],
  "confidence": "high | medium | low",
  "notes": "Any caveats about the research quality or information gaps"
}

### IMPORTANT formatting rules:

**known_artists**: Each entry MUST be "Firstname Lastname" format only. No descriptions, no parenthetical notes, no gallery names, no prices. Just the artist's name.
  Good: ["Carrie Moyer", "Joshua Nathanson", "Maya Hayuk"]
  Bad: ["Carrie Moyer (acquired $65K work)", "Joshua Nathanson from Various Small Fires"]

**style_preferences**: MUST use tags from this list ONLY: ${STYLE_TAGS.join(", ")}
  Pick 3-8 tags that best describe the types of art this person is drawn to, based on their known acquisitions and stated interests.

**subject_preferences**: MUST use tags from this list ONLY: ${SUBJECT_TAGS.join(", ")}
  Pick 2-6 tags that describe the subject matter this person favors.

**mood_preferences**: MUST use tags from this list ONLY: ${MOOD_TAGS.join(", ")}
  Pick 2-5 tags that describe the mood/atmosphere of art this person gravitates toward.

Return ONLY valid JSON, no other text.`;
}

/** Enrich a single prospect via Claude with web search */
export async function enrichProspect(
  prospectId: string,
): Promise<ProspectEnrichment> {
  const admin = createAdminClient();

  // Fetch prospect data
  const { data: prospect, error } = await admin
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .single();

  if (error || !prospect) {
    throw new Error(`Prospect ${prospectId} not found: ${error?.message}`);
  }

  // Fetch batch name for context
  const { data: batch, error: batchError } = await admin
    .from("prospect_batches")
    .select("name")
    .eq("id", prospect.batch_id)
    .single();

  if (batchError || !batch) {
    throw new Error(`Batch ${prospect.batch_id} not found: ${batchError?.message}`);
  }

  // Fetch gallery artists for context
  const galleryArtists = await getGalleryArtists();

  // Build prompt
  const prompt = buildProspectPrompt(prospect, batch.name, galleryArtists);

  // Call Claude with web search
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 15 }],
    messages: [{ role: "user", content: prompt }],
  });

  // Extract the final text block (after tool use blocks)
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlocks[textBlocks.length - 1]?.text || "{}";

  // Extract JSON from response — Claude may include preamble text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in Claude response");
  }
  const jsonStr = jsonMatch[0];

  const enrichment: ProspectEnrichment = JSON.parse(jsonStr);

  // Strip orphaned citations (where [N] exceeds sources array length)
  const sourceCount = enrichment.sources?.length ?? 0;
  const stripOrphanedCitations = (val: string | undefined | null): string | undefined | null => {
    if (!val || sourceCount === 0) return val;
    return val.replace(/\[(\d+)\]/g, (match, num) => {
      return parseInt(num, 10) <= sourceCount ? match : "";
    });
  };
  enrichment.summary = (stripOrphanedCitations(enrichment.summary) as string) ?? enrichment.summary;
  if (enrichment.professional) {
    enrichment.professional.current_role =
      (stripOrphanedCitations(enrichment.professional.current_role) as string) ?? enrichment.professional.current_role;
  }

  // Validate/filter tags to canonical vocabularies
  const styleTagSet = new Set(STYLE_TAGS);
  const subjectTagSet = new Set(SUBJECT_TAGS);
  const moodTagSet = new Set(MOOD_TAGS);

  if (enrichment.collection_profile) {
    enrichment.collection_profile.style_preferences =
      (enrichment.collection_profile.style_preferences ?? []).filter((t) =>
        t && styleTagSet.has(t.toLowerCase()),
      );
    enrichment.collection_profile.subject_preferences =
      (enrichment.collection_profile.subject_preferences ?? []).filter((t) =>
        t && subjectTagSet.has(t.toLowerCase()),
      );
    enrichment.collection_profile.mood_preferences =
      (enrichment.collection_profile.mood_preferences ?? []).filter((t) =>
        t && moodTagSet.has(t.toLowerCase()),
      );
  }

  // Clean known_artists: strip anything after the name (parenthetical notes, etc.)
  if (enrichment.art_world) {
    enrichment.art_world.known_artists =
      (enrichment.art_world.known_artists ?? []).map((a) =>
        a.replace(/\s*\(.*\)$/, "").trim(),
      );
  }

  // If no photo_url or it doesn't look like a direct image, try the two-step approach
  if (!enrichment.photo_url || !looksLikeImageUrl(enrichment.photo_url)) {
    const name = enrichment.display_name || prospect.input_name;
    // Keep context short to avoid biasing search toward one specific role
    const context = enrichment.company || "";
    const photo = await findPersonPhoto(name, context);
    if (photo) {
      enrichment.photo_url = photo;
    }
  }

  return enrichment;
}

// ---------------------------------------------------------------------------
// Photo finder — two-step approach
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

function looksLikeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return IMAGE_EXTENSIONS.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Find a person's photo via two steps:
 * 1. Web search to find multiple candidate pages that may have their headshot
 * 2. Try each page: fetch the HTML and use Claude to extract the actual <img src> URL
 * 3. Verify the URL returns image content
 */
async function findPersonPhoto(name: string, context: string): Promise<string | null> {
  try {
    // Step 1: Find candidate pages with their photo
    const searchResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305" as any, name: "web_search", max_uses: 5 }],
      messages: [{
        role: "user",
        content: `Find webpages that have a profile photo or headshot of ${name}${context ? ` (${context})` : ""}.

Look for: institutional "about" or "team" pages, conference speaker bios, university/museum staff pages, press releases with author photos, Wikipedia, news articles with headshots.

Return ONLY JSON with up to 3 candidate page URLs, ordered by most likely to have a usable photo:
{"pages": ["https://best-page", "https://second-page", "https://third-page"]}
Return {"pages": []} if no suitable pages found.`,
      }],
    });

    // Extract the page URLs from the response
    const textBlocks = searchResponse.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const searchText = textBlocks[textBlocks.length - 1]?.text || "{}";
    const pagesMatch = searchText.match(/\{[\s\S]*\}/);
    if (!pagesMatch) return null;

    const { pages } = JSON.parse(pagesMatch[0]);
    if (!pages || !Array.isArray(pages) || pages.length === 0) return null;

    const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Step 2: Try each candidate page
    for (const pageUrl of pages.slice(0, 3)) {
      try {
        const res = await fetch(pageUrl, {
          headers: { "User-Agent": BROWSER_UA, "Accept": "text/html" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        if (html.length < 1000) continue; // Too small, probably error page
        const truncated = html.length > 50_000 ? html.substring(0, 50_000) : html;

        const extractResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `Extract the profile photo URL for ${name} from this HTML.

Look for <img> tags with src attributes related to their name, "headshot", "portrait", "profile", "staff", "author", "speaker", or similar. Also check <meta property="og:image">.

Rules:
- URL must end in .jpg, .jpeg, .png, .webp, or .gif
- Convert relative URLs to absolute using base: ${pageUrl}
- Skip tiny icons, logos, or decorative images (look for images that are at least ~100px)
- Prefer the largest/most prominent person photo

Return ONLY JSON: {"photo_url": "https://direct-url.jpg"} or {"photo_url": null}

HTML:
${truncated}`,
          }],
        });

        const extractText = extractResponse.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        )?.text || "{}";
        const extractMatch = extractText.match(/\{[\s\S]*\}/);
        if (!extractMatch) continue;

        const { photo_url } = JSON.parse(extractMatch[0]);
        if (!photo_url || !looksLikeImageUrl(photo_url)) continue;

        // Verify the URL returns an actual image
        const check = await fetch(photo_url, {
          method: "HEAD",
          headers: { "User-Agent": BROWSER_UA },
          signal: AbortSignal.timeout(5_000),
        });
        if (!check.ok) continue;
        const contentType = check.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) continue;

        return photo_url; // Found a verified photo!
      } catch {
        continue; // Try next page
      }
    }

    return null; // None of the candidate pages yielded a photo
  } catch {
    return null; // Don't let photo finding break the enrichment
  }
}

// ---------------------------------------------------------------------------
// Artist Enrichment
// ---------------------------------------------------------------------------

export interface ArtistEnrichment {
  summary: string;
  formatted_bio: string;
  birth_year: number | null;
  death_year: number | null;
  country: string | null;
  artistic_practice: {
    philosophy: string;
    process: string;
    themes: string[];
    evolution: string;
    primary_mediums: string[];
    style_tags: string[];
    subject_tags: string[];
    mood_tags: string[];
    influences: string[];
  };
  career: {
    education: string[];
    solo_exhibitions: string[];
    group_exhibitions: string[];
    awards_grants: string[];
    residencies: string[];
  };
  market: {
    gallery_representation: string[];
    auction_results: string[];
    price_range: string;
    market_trajectory: string;
  };
  collections: {
    museum_collections: string[];
    notable_private_collections: string[];
  };
  related_artists: string[];
  social_presence: { website: string; instagram: string; other: string[] };
  sources: Array<{ url: string; title: string; relevance: string }>;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** Build the enrichment prompt for an artist */
function buildArtistPrompt(
  artist: {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    country: string | null;
    life_dates: string | null;
    birth_year: string | null;
    death_year: string | null;
    work_count: number | null;
  },
  priceRange: { min: number | null; max: number | null },
  artworkTags: { style: string[]; subject: string[]; mood: string[] },
): string {
  const lifeDates = artist.life_dates || [artist.birth_year, artist.death_year].filter(Boolean).join(" – ") || "Unknown";
  const country = artist.country || "Unknown";
  const bio = artist.bio || "None available";

  const priceStr =
    priceRange.min !== null && priceRange.max !== null
      ? `$${priceRange.min.toLocaleString()} – $${priceRange.max.toLocaleString()}`
      : priceRange.min !== null
        ? `From $${priceRange.min.toLocaleString()}`
        : "Unknown";

  const artworkStyleTags = artworkTags.style.length > 0 ? artworkTags.style.join(", ") : "None analyzed yet";
  const artworkSubjectTags = artworkTags.subject.length > 0 ? artworkTags.subject.join(", ") : "None analyzed yet";
  const artworkMoodTags = artworkTags.mood.length > 0 ? artworkTags.mood.join(", ") : "None analyzed yet";

  return `You are a research assistant for an art gallery called "${GALLERY_NAME}".
Your task is to research an artist and compile a comprehensive profile using publicly available information.

## Artist Information (from our CRM)
- **Name:** ${artist.display_name}
- **Country:** ${country}
- **Life dates:** ${lifeDates}
- **Bio from CRM:** ${bio}
- **Works in inventory:** ${artist.work_count ?? 0}
- **Price range in inventory:** ${priceStr}

## Existing Vision Analysis Tags (from AI analysis of their works in our inventory)
- **Style tags:** ${artworkStyleTags}
- **Subject tags:** ${artworkSubjectTags}
- **Mood tags:** ${artworkMoodTags}

## Research Instructions
Search for publicly available information about this artist. Prioritize understanding the artist as a thinker and maker, not just listing CV facts.

Focus on:
1. **Artistic practice** — artist statements, interviews, studio visit write-ups, critical essays, exhibition catalog texts. How do they describe their own intentions and process? What ideas, questions, or concerns motivate the practice? How has the work developed across different bodies of work / periods?
2. **Career** — education, significant exhibitions (solo and group), awards, grants, residencies
3. **Market context** — gallery representation, auction results, price trends, market trajectory
4. **Collections** — museum collections, notable private collections
5. **Related artists** — comparable artists for collector cross-referencing

**Critical — source grounding and inline citations:**
- ONLY write about things you found in your web search results. Do not draw on background knowledge to fill gaps.
- Every claim in the formatted_bio, philosophy, process, and evolution fields must be traceable to a specific source you found. If you didn't find it in a source, don't include it.
- **Use numbered inline citations** like [1], [2], [3] in the text fields. These numbers MUST correspond to the position (1-based) in YOUR "sources" array in the JSON output. So [1] means the first item in your sources array, [2] means the second, etc.
- **IMPORTANT**: First compile your full sources list, then write the text using citation numbers that match that list. Do NOT use numbers from the web search result indices — only from your own output sources array. If you cite [5], there must be a 5th entry in your sources array.
- **CRITICAL**: The highest citation number [N] in ANY text field must NOT exceed the total number of entries in your sources array. If your sources array has 15 entries, the highest citation allowed is [15]. Every source you cite MUST appear in the sources array. Double-check this before outputting.
- Use citations liberally throughout formatted_bio, philosophy, process, and evolution. Every paragraph should have at least one citation. Every direct quote or paraphrase of the artist's words must have a citation.
- If you can only find limited information about a topic (e.g., no interviews about process), say so explicitly rather than writing plausible-sounding filler. A shorter, well-sourced section is far more valuable than a longer speculative one.
- Do not fabricate — if information is limited, say so
- Write the formatted_bio as a gallery-quality narrative biography (3-5 paragraphs), not a list of facts. Ground it in sourced information with inline citations.
- The artistic_practice section is the most important — go deep on philosophy, process, and themes, but only based on what you actually found
- For birth_year, death_year, and country: extract these from your research if found. Use integer years (e.g. 1985), null if unknown. Country should be where the artist is primarily based (e.g. "United States", "United Kingdom", "Italy"). Use null if not found.

## Output Format
Return a JSON object with these fields:

{
  "summary": "2-3 sentence overview of this artist and their significance",
  "formatted_bio": "Gallery-quality narrative biography with inline citations [1][2]. 3-5 paragraphs, third person, present tense for living artists.",
  "birth_year": 1985,
  "death_year": null,
  "country": "United States",
  "artistic_practice": {
    "philosophy": "The artist's creative vision and conceptual framework, with inline citations [N]. Ground in their own words from interviews or statements.",
    "process": "How they work — materials, techniques, studio practice, with inline citations [N]. Based on interviews, studio visits, or exhibition texts.",
    "themes": ["Recurring themes and concerns across their body of work"],
    "evolution": "How the work has developed over time — key phases or shifts, with inline citations [N]",
    "primary_mediums": ["painting", "sculpture", etc.],
    "style_tags": ["tag1", "tag2"],
    "subject_tags": ["tag1", "tag2"],
    "mood_tags": ["tag1", "tag2"],
    "influences": ["Artists, movements, thinkers that inform their work"]
  },
  "career": {
    "education": ["Degree, Institution, Year"],
    "solo_exhibitions": ["Exhibition Title, Venue, Year"],
    "group_exhibitions": ["Exhibition Title, Venue, Year"],
    "awards_grants": ["Award Name, Year"],
    "residencies": ["Residency Name, Year"]
  },
  "market": {
    "gallery_representation": ["Gallery Name, City"],
    "auction_results": ["Brief description of notable auction results"],
    "price_range": "Typical price range for their work",
    "market_trajectory": "rising | mid-career | established | blue-chip | emerging"
  },
  "collections": {
    "museum_collections": ["Museum Name, City"],
    "notable_private_collections": ["Collection name if publicly known"]
  },
  "related_artists": ["Firstname Lastname"],
  "social_presence": {
    "website": "URL if found",
    "instagram": "Handle if found",
    "other": ["Other notable profiles"]
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "What this source tells us" }
  ],
  "confidence": "high | medium | low",
  "notes": "Any caveats about the research quality or information gaps"
}

### IMPORTANT formatting rules:

**style_tags**: MUST use tags from this list ONLY: ${STYLE_TAGS.join(", ")}
  Pick 3-8 tags that best describe this artist's style. Consider both the existing vision analysis tags above and your research findings.

**subject_tags**: MUST use tags from this list ONLY: ${SUBJECT_TAGS.join(", ")}
  Pick 2-6 tags that describe the subject matter in this artist's work.

**mood_tags**: MUST use tags from this list ONLY: ${MOOD_TAGS.join(", ")}
  Pick 2-5 tags that describe the mood/atmosphere of this artist's work.

**related_artists**: Each entry MUST be "Firstname Lastname" format only. No descriptions or notes.

Return ONLY valid JSON, no other text.`;
}

/** Enrich a single artist via Claude with web search */
export async function enrichArtist(
  artistId: number,
): Promise<ArtistEnrichment> {
  const admin = createAdminClient();

  // Fetch artist data
  const { data: artist, error } = await admin
    .from("artists")
    .select("*")
    .eq("id", artistId)
    .single();

  if (error || !artist) {
    throw new Error(`Artist ${artistId} not found: ${error?.message}`);
  }

  // Fetch price range from artworks
  const { data: priceData } = await admin
    .from("artworks")
    .select("price")
    .contains("artist_ids", [artistId])
    .not("price", "is", null);

  const prices = (priceData ?? []).map((p) => p.price as number).filter((p) => p > 0);
  const priceRange = {
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
  };

  // Fetch aggregate vision analysis tags from artworks_extended
  const { data: artworkIds } = await admin
    .from("artworks")
    .select("id")
    .contains("artist_ids", [artistId]);

  let artworkTags = { style: [] as string[], subject: [] as string[], mood: [] as string[] };

  if (artworkIds && artworkIds.length > 0) {
    const ids = artworkIds.map((a) => a.id);
    const { data: extRows } = await admin
      .from("artworks_extended")
      .select("style_tags, subject_tags, mood_tags")
      .in("artwork_id", ids)
      .not("vision_analyzed_at", "is", null);

    if (extRows && extRows.length > 0) {
      // Aggregate and count tags, take top ones
      const countTags = (rows: typeof extRows, field: "style_tags" | "subject_tags" | "mood_tags") => {
        const counts = new Map<string, number>();
        for (const row of rows) {
          const tags = (row[field] as string[] | null) ?? [];
          for (const tag of tags) {
            if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag]) => tag);
      };

      artworkTags = {
        style: countTags(extRows, "style_tags"),
        subject: countTags(extRows, "subject_tags"),
        mood: countTags(extRows, "mood_tags"),
      };
    }
  }

  // Build prompt
  const prompt = buildArtistPrompt(artist, priceRange, artworkTags);

  // Call Claude with web search
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
    messages: [{ role: "user", content: prompt }],
  });

  // Extract the final text block
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlocks[textBlocks.length - 1]?.text || "{}";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in Claude response");
  }
  const jsonStr = jsonMatch[0];

  const enrichment: ArtistEnrichment = JSON.parse(jsonStr);

  // Strip orphaned citations (where [N] exceeds sources array length)
  const sourceCount = enrichment.sources?.length ?? 0;
  const stripOrphanedCitations = (text: string | undefined): string | undefined => {
    if (!text || sourceCount === 0) return text;
    return text.replace(/\[(\d+)\]/g, (match, num) => {
      return parseInt(num, 10) <= sourceCount ? match : "";
    });
  };
  enrichment.formatted_bio = stripOrphanedCitations(enrichment.formatted_bio) ?? enrichment.formatted_bio;
  if (enrichment.artistic_practice) {
    enrichment.artistic_practice.philosophy = stripOrphanedCitations(enrichment.artistic_practice.philosophy) ?? enrichment.artistic_practice.philosophy;
    enrichment.artistic_practice.process = stripOrphanedCitations(enrichment.artistic_practice.process) ?? enrichment.artistic_practice.process;
    enrichment.artistic_practice.evolution = stripOrphanedCitations(enrichment.artistic_practice.evolution) ?? enrichment.artistic_practice.evolution;
  }

  // Validate/filter tags to canonical vocabularies
  const styleTagSet = new Set(STYLE_TAGS);
  const subjectTagSet = new Set(SUBJECT_TAGS);
  const moodTagSet = new Set(MOOD_TAGS);

  if (enrichment.artistic_practice) {
    enrichment.artistic_practice.style_tags =
      (enrichment.artistic_practice.style_tags ?? []).filter((t) =>
        t && styleTagSet.has(t.toLowerCase()),
      );
    enrichment.artistic_practice.subject_tags =
      (enrichment.artistic_practice.subject_tags ?? []).filter((t) =>
        t && subjectTagSet.has(t.toLowerCase()),
      );
    enrichment.artistic_practice.mood_tags =
      (enrichment.artistic_practice.mood_tags ?? []).filter((t) =>
        t && moodTagSet.has(t.toLowerCase()),
      );
  }

  return enrichment;
}
