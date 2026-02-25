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
        styleTags.has(t.toLowerCase()),
      );
    enrichment.collection_profile.subject_preferences =
      (enrichment.collection_profile.subject_preferences ?? []).filter((t) =>
        subjectTags.has(t.toLowerCase()),
      );
    enrichment.collection_profile.mood_preferences =
      (enrichment.collection_profile.mood_preferences ?? []).filter((t) =>
        moodTags.has(t.toLowerCase()),
      );

    // Clean known_artists: strip anything after the name (parenthetical notes, etc.)
    enrichment.collection_profile.known_artists =
      (enrichment.collection_profile.known_artists ?? []).map((a) =>
        a.replace(/\s*\(.*\)$/, "").trim(),
      );
  }

  return enrichment;
}
